import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const { email } = await request.json();
    const origin = request.headers.get("origin");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      billing_address_collection: "required",
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Livepoll Verification & Annual Access",
              description: "Verifies your identity and unlocks voting for one year.",
            },
            unit_amount: 499,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/index.html?verified=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/index.html?verified=cancelled`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
