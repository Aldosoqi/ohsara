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

    const { orderId } = await req.json();

    // Get PayPal access token
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    const baseUrl = "https://api-m.sandbox.paypal.com";

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

    // Capture the payment
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    const captureData = await captureResponse.json();

    if (captureData.status === "COMPLETED") {
      // Payment successful, update purchase and add credits
      const supabaseService = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      // Get the purchase record
      const { data: purchase } = await supabaseService
        .from("credit_pack_purchases")
        .select("*, credit_packs(*)")
        .eq("stripe_payment_intent_id", orderId)
        .eq("user_id", user.id)
        .single();

      if (purchase) {
        // Update purchase status
        await supabaseService
          .from("credit_pack_purchases")
          .update({
            status: "completed",
            purchase_completed_at: new Date().toISOString(),
          })
          .eq("id", purchase.id);

        // Add credits using the database function
        await supabaseService.rpc("update_user_credits", {
          user_id_param: user.id,
          credit_amount: purchase.credits_purchased,
          transaction_type_param: "purchase",
          description_param: `Credit pack purchase: ${purchase.credit_packs.name}`,
          reference_id_param: purchase.id,
        });

        return new Response(
          JSON.stringify({ success: true, credits: purchase.credits_purchased }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
    }

    throw new Error("Payment verification failed");
  } catch (error) {
    console.error("PayPal verification error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});