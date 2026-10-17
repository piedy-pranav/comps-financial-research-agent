import { NextResponse } from "next/server";

// STUB. Owner: Step 3 (Hans and Pranav).
// Should: require a logged-in user, refuse if they're already Pro, create a one-time
// Stripe Checkout session ($19, test mode) with the user's id in metadata, and
// return the session URL. Cancel/success URLs come from NEXT_PUBLIC_APP_URL.
export async function POST() {
  return NextResponse.json({ error: "Not implemented yet" }, { status: 501 });
}
