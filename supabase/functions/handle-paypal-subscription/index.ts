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

    const { subscriptionID, userId, quantity = 1 } = await req.json();

    if (!subscriptionID) {
      throw new Error("Subscription ID is required");
    }

    // Get PayPal access token for verification
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

    // Verify subscription details with PayPal
    const subscriptionResponse = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionID}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    const subscriptionData = await subscriptionResponse.json();

    if (subscriptionData.status === "ACTIVE" || subscriptionData.status === "APPROVED") {
      // Use service role to bypass RLS for subscription management
      const supabaseService = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      // Add credits based on quantity (100 credits per pack)
      const creditsToAdd = 100 * quantity;
      
      await supabaseService.rpc("update_user_credits", {
        user_id_param: user.id,
        credit_amount: creditsToAdd,
        transaction_type_param: "subscription",
        description_param: `PayPal subscription activated: ${subscriptionID} (${quantity} packs)`,
        reference_id_param: null,
      });

      console.log(`Subscription ${subscriptionID} activated for user ${user.id} with ${creditsToAdd} credits (${quantity} packs)`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          subscriptionId: subscriptionID,
          credits: creditsToAdd,
          quantity: quantity
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      throw new Error(`Invalid subscription status: ${subscriptionData.status}`);
    }
  } catch (error) {
    console.error("PayPal subscription error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});