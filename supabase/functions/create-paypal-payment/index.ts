import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    
    if (!user) {
      throw new Error("User not authenticated");
    }

    const { packId } = await req.json();

    // Get credit pack details
    const { data: pack, error: packError } = await supabaseClient
      .from("credit_packs")
      .select("*")
      .eq("id", packId)
      .eq("is_active", true)
      .single();

    if (packError || !pack) {
      throw new Error("Credit pack not found");
    }

    // Get PayPal access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const baseUrl = "https://api-m.sandbox.paypal.com"; // Use sandbox for testing

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    // Create PayPal order
    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: (pack.price_cents / 100).toFixed(2),
            },
            description: `${pack.name} - ${pack.credits_included} credits`,
          },
        ],
        application_context: {
          return_url: `${req.headers.get("origin")}/payment-success`,
          cancel_url: `${req.headers.get("origin")}/upgrade`,
        },
      }),
    });

    const orderData = await orderResponse.json();

    if (!orderData.id) {
      throw new Error("Failed to create PayPal order");
    }

    // Store pending purchase
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    await supabaseService.from("credit_pack_purchases").insert({
      user_id: user.id,
      pack_id: packId,
      status: "pending",
      credits_purchased: pack.credits_included,
      stripe_payment_intent_id: orderData.id, // Using this field for PayPal order ID
    });

    const approvalUrl = orderData.links.find((link: any) => link.rel === "approve")?.href;

    return new Response(
      JSON.stringify({ approvalUrl, orderId: orderData.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("PayPal payment error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});