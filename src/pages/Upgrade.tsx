import { Check, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Upgrade = () => {
  const [creditPacks, setCreditPacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchCreditPacks();
  }, []);

  const fetchCreditPacks = async () => {
    try {
      const { data, error } = await supabase
        .from("credit_packs")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setCreditPacks(data || []);
    } catch (error) {
      console.error("Error fetching credit packs:", error);
      toast.error("Failed to load credit packs");
    }
  };

  const handlePurchase = async (packId: string) => {
    if (!user) {
      toast.error("Please sign in to purchase credits");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-paypal-payment", {
        body: { packId },
      });

      if (error) throw error;

      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        throw new Error("No approval URL received");
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("Failed to create payment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const freePlan = {
    name: "Try Ohsara for Free",
    price: "Free",
    description: "5 free summaries for all new users",
    features: [
      "Basic summarization",
      "History view"
    ],
    buttonText: "Current Plan",
    isFree: true
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold text-foreground mb-4">Choose Your Plan</h1>
          <p className="text-xl text-muted-foreground">
            Unlock the full potential of AI-powered video summarization
          </p>
        </div>

        <div className="grid gap-8 max-w-6xl mx-auto">
          {/* Free Plan */}
          <Card className="border-border">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl font-semibold">{freePlan.name}</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold text-foreground">{freePlan.price}</span>
              </div>
              <CardDescription className="mt-2">{freePlan.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {freePlan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                className="w-full h-12 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                disabled
              >
                {freePlan.buttonText}
              </Button>
            </CardContent>
          </Card>

          {/* Credit Packs */}
          {creditPacks.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {creditPacks.map((pack) => (
                <Card 
                  key={pack.id} 
                  className={`relative ${pack.popular ? 'border-primary border-2' : 'border-border'}`}
                >
                  {pack.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                        Popular
                      </span>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-6">
                    <CardTitle className="text-xl font-semibold">{pack.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-3xl font-bold text-foreground">
                        ${(pack.price_cents / 100).toFixed(2)}
                      </span>
                    </div>
                    <CardDescription className="mt-2">
                      {pack.credits_included} credits
                      {pack.savings_percentage > 0 && (
                        <span className="block text-primary font-medium">
                          Save {pack.savings_percentage}%
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-6">
                    {pack.description && (
                      <p className="text-sm text-muted-foreground text-center">
                        {pack.description}
                      </p>
                    )}
                    
                    {pack.features && pack.features.length > 0 && (
                      <ul className="space-y-2">
                        {pack.features.map((feature: string, index: number) => (
                          <li key={index} className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-sm text-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    
                    <Button 
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => handlePurchase(pack.id)}
                      disabled={loading}
                    >
                      {loading ? "Processing..." : "Purchase"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Upgrade;