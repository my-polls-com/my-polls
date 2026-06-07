import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zxriuxcysldyamgrsweh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cml1eGN5c2xkeWFtZ3Jzd2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjI2NTAsImV4cCI6MjA5NTI5ODY1MH0.mcFGkGblW0fcsaDVIFVIdtxlx0zKR2hdTd8_JEXkuPg";

export async function POST(request) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { session_id, email } = await request.json();
    if (!session_id) {
      return Response.json({ error: "Missing session_id" }, { status: 400 });
    }

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

    if (card.funding === "prepaid") {
      return Response.json({ error: "Prepaid cards are not accepted." }, { status: 403 });
    }
    if (card.country && card.country !== "US") {
      return Response.json({ error: "Only US-issued cards are accepted." }, { status: 403 });
    }

    const fingerprint = card.fingerprint;
    const zip = billing.address?.postal_code || null;

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
