/**
 * Stripe client loader.
 * loadStripe is called lazily so Stripe's script only loads when needed (checkout page).
 * This is the recommended pattern to avoid slowing down every page.
 */
import { loadStripe } from '@stripe/stripe-js'

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

// Cache the Stripe promise so we only initialize once
let stripePromise = null

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublishableKey)
  }
  return stripePromise
}
