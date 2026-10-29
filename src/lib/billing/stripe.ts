import Stripe from 'stripe';
let s: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  return (s ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}
export const priceForPlan = (plan: string) => process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
export function planForPrice(priceId: string | undefined): string | null {
  if (!priceId) return null;
  for (const p of ['starter', 'pro']) if (priceForPlan(p) === priceId) return p;
  return null;
}
