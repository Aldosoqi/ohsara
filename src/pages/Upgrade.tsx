import { Check, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

const Upgrade = () => {
  const [creditBlocks, setCreditBlocks] = useState(1);

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
      price: `$${10 * creditBlocks}`,
      description: `${100 * creditBlocks} summaries`,
      features: [
        "Export as TXT/PDF",
        "Save Summaries to Storage", 
        "AI Chat Interface for Follow-up Questions",
        "Credits Never Expire"
      ],
      buttonText: `Purchase ${100 * creditBlocks} Credits`,
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
                  {!plan.isFree && <span className="text-muted-foreground"> per {100 * creditBlocks} summaries</span>}
                </div>
                <CardDescription className="mt-2">{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {!plan.isFree && (
                  <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCreditBlocks(Math.max(1, creditBlocks - 1))}
                      disabled={creditBlocks <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-medium">
                      {creditBlocks} × 100 credits
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCreditBlocks(creditBlocks + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className={`w-full h-12 ${
                    !plan.isFree 
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                  }`}
                  disabled={plan.isFree}
                >
                  {plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Upgrade;