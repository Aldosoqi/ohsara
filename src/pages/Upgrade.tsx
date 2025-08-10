import { Check, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Upgrade = () => {
  const { user } = useAuth();
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const [packQuantity, setPackQuantity] = useState(1);

  useEffect(() => {
    // Load PayPal SDK
    const script = document.createElement('script');
    script.src = 'https://www.paypal.com/sdk/js?client-id=ASm3KkIqz4gxwkq42fwYquq4pNqavwepg6Jp8RHNji9ugX0gU5jX1QqoJeCsAVRAthD_-wwn9Ina2bbu&vault=true&intent=subscription';
    script.onload = () => {
      initializePayPalButton();
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector('script[src*="paypal.com/sdk"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, [user, packQuantity]);

  const initializePayPalButton = () => {
    if (!window.paypal || !paypalContainerRef.current) return;

    // Clear any existing buttons
    paypalContainerRef.current.innerHTML = '';

    window.paypal.Buttons({
      style: {
        shape: 'rect',
        color: 'silver',
        layout: 'vertical',
        label: 'subscribe'
      },
      createSubscription: function(
        _data: unknown,
        actions: { subscription: { create: (params: { plan_id: string; quantity: number }) => Promise<string> } }
      ) {
        if (!user) {
          toast.error('Please sign in to subscribe');
          return;
        }
        
        return actions.subscription.create({
          plan_id: 'P-75K99845G8875640KNCHOMJQ',
          quantity: packQuantity
        });
      },
      onApprove: async function(data: { subscriptionID: string }) {
        try {
          const { error } = await supabase.functions.invoke('handle-paypal-subscription', {
            body: { 
              subscriptionID: data.subscriptionID,
              userId: user?.id,
              quantity: packQuantity
            }
          });

          if (error) throw error;

          toast.success('Subscription activated successfully!');
          // Optionally redirect or refresh user data
        } catch (error) {
          console.error('Subscription error:', error);
          toast.error('Failed to activate subscription. Please contact support.');
        }
      },
      onError: function(err: unknown) {
        console.error('PayPal error:', err);
        toast.error('PayPal subscription failed. Please try again.');
      }
    }).render(paypalContainerRef.current);
  };

  const plans = [
    {
      name: "Pay For What You Use",
      price: `$${10 * packQuantity}`,
      description: `per ${100 * packQuantity} Ohsara's monthly`,
      features: [
        `${100 * packQuantity} Ohsara's videos per month`,
        "Save each Ohsara to storage",
        "Smart responses",
        "Credit carry over"
      ],
      buttonText: "Subscribe Now",
      isFree: false
    }
  ];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold text-foreground mb-4">Choose Your Plan</h1>
          <p className="text-xl text-muted-foreground">
            Unlock the full potential of AI-powered video summarization
          </p>
        </div>

        <div className="flex justify-center max-w-lg mx-auto">
          {plans.map((plan, index) => (
            <Card
              key={plan.name}
              className="relative border-primary border-2 bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/20 shadow-lg shadow-primary/20"
            >
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-semibold">{plan.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground"> {plan.description}</span>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="flex items-center justify-center gap-4 p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border border-primary/30 dark:border-primary/70">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPackQuantity(Math.max(1, packQuantity - 1))}
                    disabled={packQuantity <= 1}
                    className="border-primary/50 hover:bg-primary/10 dark:hover:bg-primary/30"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-lg font-medium text-primary">
                    {packQuantity} × 100 videos
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPackQuantity(packQuantity + 1)}
                    className="border-primary/50 hover:bg-primary/10 dark:hover:bg-primary/30"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="space-y-4">
                  {!user && (
                    <p className="text-sm text-muted-foreground text-center">
                      Please sign in to subscribe
                    </p>
                  )}
                  <div ref={paypalContainerRef} className="min-h-[50px]">
                    {/* PayPal button will be rendered here */}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Upgrade;