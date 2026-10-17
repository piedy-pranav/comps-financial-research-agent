import { NextResponse } from "next/server";

// STUB. Owner: Step 3 (Hans and Pranav).
// Should: verify the Stripe signature with STRIPE_WEBHOOK_SECRET (reject if invalid),
// and on checkout.session.completed set that user's profile to plan = 'pro' and
// pro_since = now() using the admin client. Must be safe to receive twice.
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet" }, { status: 501 });
}
