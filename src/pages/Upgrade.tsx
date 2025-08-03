import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Upgrade = () => {
  const { user } = useAuth();
  const paypalContainerRef = useRef<HTMLDivElement>(null);

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
  }, [user]);

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
      createSubscription: function(data: any, actions: any) {
        if (!user) {
          toast.error('Please sign in to subscribe');
          return;
        }
        
        return actions.subscription.create({
          plan_id: 'P-75K99845G8875640KNCHOMJQ',
          quantity: 1
        });
      },
      onApprove: async function(data: any, actions: any) {
        try {
          const { error } = await supabase.functions.invoke('handle-paypal-subscription', {
            body: { 
              subscriptionID: data.subscriptionID,
              userId: user?.id 
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
      onError: function(err: any) {
        console.error('PayPal error:', err);
        toast.error('PayPal subscription failed. Please try again.');
      }
    }).render(paypalContainerRef.current);
  };

  const plans = [
    {
      name: "Try Ohsara for Free",
      price: "Free",
      description: "5 free summaries for all new users",
      features: [
        "Basic summarization",
        "History view"
      ],
      buttonText: "Current Plan",
      isFree: true
    },
    {
      name: "Pay For What You Use",
      price: "$10",
      description: "per 100 video summaries",
      features: [
        "100 video summaries per month",
        "Export as TXT/PDF",
        "Save Summaries to Storage", 
        "AI Chat Interface for Follow-up Questions",
        "Auto-renewal (cancel anytime)"
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

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={plan.name} 
              className={`relative ${!plan.isFree ? 'border-primary border-2' : 'border-border'}`}
            >
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-semibold">{plan.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  {!plan.isFree && <span className="text-muted-foreground"> {plan.description}</span>}
                </div>
                {plan.isFree && <CardDescription className="mt-2">{plan.description}</CardDescription>}
              </CardHeader>
              
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                {plan.isFree ? (
                  <Button 
                    className="w-full h-12 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                    disabled
                  >
                    {plan.buttonText}
                  </Button>
                ) : (
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
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Upgrade;