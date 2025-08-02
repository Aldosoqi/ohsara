import { Crown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Upgrade = () => {
  const plans = [
    {
      name: "Free",
      price: "$0",
      description: "Get started with basic summarization",
      features: [
        "5 summaries per month",
        "Basic key points extraction",
        "Standard processing speed",
        "Email support"
      ],
      buttonText: "Current Plan",
      isPro: false
    },
    {
      name: "Pro",
      price: "$9.99",
      description: "Unlock advanced features and unlimited access",
      features: [
        "Unlimited summaries",
        "Advanced AI analysis",
        "Interactive chat with summaries",
        "Export to PDF/Markdown",
        "Priority processing",
        "Priority support"
      ],
      buttonText: "Upgrade to Pro",
      isPro: true
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
          {plans.map((plan) => (
            <Card 
              key={plan.name} 
              className={`relative ${plan.isPro ? 'border-primary border-2' : 'border-border'}`}
            >
              {plan.isPro && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </div>
                </div>
              )}
              
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-semibold">{plan.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <CardDescription className="mt-2">{plan.description}</CardDescription>
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
                
                <Button 
                  className={`w-full h-12 ${
                    plan.isPro 
                      ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                  }`}
                  disabled={!plan.isPro}
                >
                  {plan.isPro && <Crown className="h-4 w-4 mr-2" />}
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