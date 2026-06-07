import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Server-side Supabase client using the anon key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { session_id, email } = await request.json();
    if (!session_id) {
      return Response.json({ error: "Missing session_id" }, { status: 400 });
    }

    // Retrieve the checkout session, expanding the payment method details
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent.payment_method"],
    });

    if (session.payment_status !== "paid") {
      return Response.json({ error: "Payment not completed." }, { status: 402 });
    }

    const pm = session.payment_intent?.payment_method;
    const card = pm?.card;
    const billing = pm?.billing_details;

    if (!card || !billing) {
      return Response.json({ error: "Could not read card details." }, { status: 400 });
    }

    // ── Verification rules ─────────────────────────────────
    if (card.funding === "prepaid") {
      return Response.json({ error: "Prepaid cards are not accepted." }, { status: 403 });
    }
    if (card.country && card.country !== "US") {
      return Response.json({ error: "Only US-issued cards are accepted." }, { status: 403 });
    }

    const fingerprint = card.fingerprint;
    const zip = billing.address?.postal_code || null;

    // ── Layer 1: one card = one account ────────────────────
    if (fingerprint) {
      const { data: existing } = await supabase
        .from("users")
        .select("email")
        .eq("card_fingerprint", fingerprint)
        .maybeSingle();
      if (existing && existing.email !== (email || "").toLowerCase()) {
        return Response.json({ error: "This card has already been used to verify another account." }, { status: 409 });
      }
    }

    return Response.json({
      verified: true,
      zip,
      fingerprint,
      brand: card.brand,
      last4: card.last4,
      stripe_customer: session.customer || null,
    });
  } catch (err) {
    console.error("verify-payment error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
