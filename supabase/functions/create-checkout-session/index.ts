/**
 * create-checkout-session Edge Function
 * Creates a Stripe Checkout session and returns the redirect URL.
 * Called from UpgradePage.jsx when the user clicks "Subscribe".
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
})

Deno.serve(async (req) => {
  // Allow CORS so the browser can call this from the React app
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const { priceId, userId, email, successUrl, cancelUrl } = await req.json()

  // Validate price ID before hitting Stripe
  if (!priceId || typeof priceId !== 'string' || !priceId.startsWith('price_')) {
    return new Response(JSON.stringify({ error: 'Invalid or missing price_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    // Look up existing Stripe customer ID to avoid creating duplicates
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    let customerId = user?.stripe_customer_id

    // Create a Stripe customer if one doesn't exist yet
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id
    }

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // We handle trials in Supabase — do NOT use Stripe trial periods here
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,  // Passed back to us in the webhook so we know which user to update
      },
      // Allow updating payment method during checkout
      billing_address_collection: 'auto',
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed'
    console.error('create-checkout-session error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
