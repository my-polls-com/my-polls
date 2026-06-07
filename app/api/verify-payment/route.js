import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zxriuxcysldyamgrsweh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cml1eGN5c2xkeWFtZ3Jzd2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjI2NTAsImV4cCI6MjA5NTI5ODY1MH0.mcFGkGblW0fcsaDVIFVIdtxlx0zKR2hdTd8_JEXkuPg";

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Helper: refund a payment intent, then return an error response
  async function rejectAndRefund(paymentIntentId, message, status) {
    try {
      if (paymentIntentId) {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      }
    } catch (e) {
      console.error("refund failed:", e.message);
    }
    return Response.json({ error: message, refunded: true }, { status });
  }

  try {
    const { session_id, email } = await request.json();
    if (!session_id) {
      return Response.json({ error: "Missing session_id" }, { status: 400 });
    }

    // Expand the charge so we can read AVS results and card details
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent.payment_method", "payment_intent.latest_charge"],
    });

    const pi = session.payment_intent;
    const piId = pi?.id;

    if (session.payment_status !== "paid") {
      return Response.json({ error: "Payment not completed." }, { status: 402 });
    }

    const pm = pi?.payment_method;
    const card = pm?.card;
    const charge = pi?.latest_charge;
    const checks = charge?.payment_method_details?.card?.checks;

    if (!card || !charge) {
      return await rejectAndRefund(piId, "Could not read card details.", 400);
    }

    // Reject prepaid
    if (card.funding === "prepaid") {
      return await rejectAndRefund(piId, "Prepaid cards are not accepted. Your payment has been refunded.", 403);
    }
    // Reject non-US
    if (card.country && card.country !== "US") {
      return await rejectAndRefund(piId, "Only US-issued cards are accepted. Your payment has been refunded.", 403);
    }

    // Strict AVS: the billing ZIP must match the bank's records
    const zipCheck = checks?.address_postal_code_check;
    if (zipCheck !== "pass") {
      return await rejectAndRefund(piId, "We couldn't verify your billing ZIP code with your bank. Please use a card whose billing address matches what you entered. Your payment has been refunded.", 422);
    }

    const fingerprint = card.fingerprint;
    const zip = charge.billing_details?.address?.postal_code || null;

    // Layer 1: one card = one account
    if (fingerprint) {
      const { data: existing } = await supabase
        .from("users")
        .select("email")
        .eq("card_fingerprint", fingerprint)
        .maybeSingle();
      if (existing && existing.email !== (email || "").toLowerCase()) {
        return await rejectAndRefund(piId, "This card has already been used to verify another account. Your payment has been refunded.", 409);
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
