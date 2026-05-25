/**
 * stripe-webhook Edge Function
 * Receives events from Stripe (checkout completed, subscription changed, payment failed, etc.)
 * and updates our Supabase database accordingly.
 * Also triggers Beehiiv tagging/untagging after subscription changes.
 *
 * IMPORTANT: You must register this function's URL as a webhook endpoint in your Stripe dashboard.
 * URL format: https://<your-project>.supabase.co/functions/v1/stripe-webhook
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// IMPORTANT: this function must be deployed with --no-verify-jwt so Supabase's
// API gateway does not reject Stripe's requests for missing an Authorization header.
// Auth is handled here by validating the stripe-signature header instead.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
}

Deno.serve(async (req) => {
  // Respond to CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })
  }

  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  // Validate the Stripe signature — this is the sole auth mechanism for this endpoint.
  // Returns 401 (not 400) so the error is clearly an auth failure, not a bad request.
  // constructEventAsync is required in Deno's SubtleCrypto context (synchronous constructEvent throws).
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature ?? '',
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed'
    console.error('Stripe webhook signature verification failed:', message)
    return new Response(`Unauthorized: ${message}`, { status: 401, headers: CORS_HEADERS })
  }

  console.log(`Stripe webhook received: ${event.type}`)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Error handling ${event.type}:`, message)
    // Return 200 anyway — we don't want Stripe to retry indefinitely
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})

// All live mode price IDs mapped to their subscription tier.
// Update this map when new prices are created in Stripe.
const PRICE_TIER_MAP: Record<string, 'essentials' | 'operations' | 'full_suite'> = {
  // Essentials
  'price_1TabK4GrTq9DDyvYS5OJAcCT': 'essentials', // $9.99/month
  'price_1TabKJGrTq9DDyvYUzeHwjvW': 'essentials', // $99.99/year
  // Operations
  'price_1Tb377GrTq9DDyvYa7DZ3JMy': 'operations', // $14.99/month
  'price_1Tb37mGrTq9DDyvYJ3xsG5lQ': 'operations', // $149.99/year
  // Full Suite
  'price_1Tb39PGrTq9DDyvY5zT7bIzn': 'full_suite', // $19.99/month
  'price_1Tb39hGrTq9DDyvY2FPEmWlX': 'full_suite', // $199.99/year
}

/**
 * Maps a Stripe price ID to one of our three subscription tiers.
 * Falls back to 'essentials' for any unrecognised price ID.
 */
function getTierFromPriceId(priceId: string): 'essentials' | 'operations' | 'full_suite' {
  return PRICE_TIER_MAP[priceId] ?? 'essentials'
}

/**
 * User completed checkout — activate their subscription.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  if (!userId) {
    console.error('checkout.session.completed: no userId in metadata')
    return
  }

  // Retrieve the subscription to find out which price (and therefore which tier) was purchased
  const subscriptionId = session.subscription as string
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = subscription.items.data[0]?.price.id ?? ''
  const tier = getTierFromPriceId(priceId)

  await supabase.from('users').update({
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: subscriptionId,
    subscription_status: 'active',
    subscription_tier: tier,
  }).eq('id', userId)

  // Add "Essentials App User" tag in Beehiiv — fails silently if API is down
  const { data: user } = await supabase.from('users').select('email').eq('id', userId).single()
  if (user?.email) {
    await addBeehiivTag(user.email, userId).catch((err) => {
      console.error('Beehiiv tag failed after checkout (non-fatal):', err.message)
    })
  }
}

/**
 * Subscription was changed — handles plan upgrades, downgrades, and payment method updates.
 * Always re-derives the tier from the current price so upgrades and downgrades are reflected immediately.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id ?? ''
  const tier = getTierFromPriceId(priceId)

  await supabase
    .from('users')
    .update({ subscription_status: subscription.status, subscription_tier: tier })
    .eq('stripe_subscription_id', subscription.id)
}

/**
 * Subscription was cancelled — remove tag in Beehiiv but keep newsletter subscription.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const { data: user } = await supabase
    .from('users')
    .select('id, email, beehiiv_subscription_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle()

  if (!user) return

  await supabase
    .from('users')
    .update({ subscription_status: 'cancelled' })
    .eq('id', user.id)

  // Remove the Beehiiv tag — but don't unsubscribe them from the newsletter
  if (user.beehiiv_subscription_id) {
    await removeBeehiivTag(user.beehiiv_subscription_id).catch((err) => {
      console.error('Beehiiv tag removal failed (non-fatal):', err.message)
    })
  }
}

/**
 * Payment failed — mark as past_due so the app shows a warning.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return

  await supabase
    .from('users')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_subscription_id', invoice.subscription as string)
}

// =============================================================================
// Beehiiv API helpers — all wrapped in try/catch so failures never crash the webhook
// =============================================================================

const BEEHIIV_BASE = 'https://api.beehiiv.com/v2'
const BEEHIIV_PUB_ID = 'pub_7d76bc37-6e66-42de-9b14-f18e889c791f'

/**
 * Subscribes the user to Beehiiv (if not already) and applies the "Essentials App User" tag.
 */
async function addBeehiivTag(email: string, userId: string) {
  const apiKey = Deno.env.get('BEEHIIV_API_KEY')
  if (!apiKey) throw new Error('BEEHIIV_API_KEY not set')

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // Create or update subscription in Beehiiv
  const subscribeRes = await fetch(
    `${BEEHIIV_BASE}/publications/${BEEHIIV_PUB_ID}/subscriptions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        reactivate_existing: false,
        send_welcome_email: false,
        utm_source: 'essentials_app',
        custom_fields: [{ name: 'essentials_user', value: 'true' }],
      }),
    }
  )

  const subscribeData = await subscribeRes.json()
  const beehiivSubId = subscribeData?.data?.id

  // Store the Beehiiv subscription ID for later (needed to remove tags on cancel)
  if (beehiivSubId) {
    await supabase.from('users').update({ beehiiv_subscription_id: beehiivSubId }).eq('id', userId)
  }

  // Apply the tag — requires a second API call
  if (beehiivSubId) {
    await fetch(
      `${BEEHIIV_BASE}/publications/${BEEHIIV_PUB_ID}/subscriptions/${beehiivSubId}/tags`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ tags: ['Essentials App User'] }),
      }
    )
  }
}

/**
 * Removes the "Essentials App User" tag from a Beehiiv subscriber.
 * Does NOT unsubscribe them from the newsletter.
 */
async function removeBeehiivTag(beehiivSubId: string) {
  const apiKey = Deno.env.get('BEEHIIV_API_KEY')
  if (!apiKey) throw new Error('BEEHIIV_API_KEY not set')

  await fetch(
    `${BEEHIIV_BASE}/publications/${BEEHIIV_PUB_ID}/subscriptions/${beehiivSubId}/tags`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags: ['Essentials App User'] }),
    }
  )
}
