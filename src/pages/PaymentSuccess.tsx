import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [verifying, setVerifying] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      const token = searchParams.get("token");
      const payerId = searchParams.get("PayerID");

      if (!token || !payerId || !user) {
        toast.error("Invalid payment parameters");
        navigate("/upgrade");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-paypal-payment", {
          body: { orderId: token },
        });

        if (error) throw error;

        if (data.success) {
          setCredits(data.credits);
          await refreshProfile(); // Refresh user profile to update credits
          toast.success(`Successfully purchased ${data.credits} credits!`);
        } else {
          throw new Error("Payment verification failed");
        }
      } catch (error) {
        console.error("Payment verification error:", error);
        toast.error("Payment verification failed. Please contact support.");
        navigate("/upgrade");
      } finally {
        setVerifying(false);
      }
    };

    verifyPayment();
  }, [searchParams, user, navigate, refreshProfile]);

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <h2 className="text-xl font-semibold text-center mb-2">
              Verifying Payment
            </h2>
            <p className="text-muted-foreground text-center">
              Please wait while we confirm your payment...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-semibold text-green-600">
            Payment Successful!
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6 text-center">
          {credits && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-lg font-medium">
                {credits} credits added to your account
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Your credits never expire and can be used anytime
              </p>
            </div>
          )}
          
          <div className="space-y-3">
            <Button 
              onClick={() => navigate("/")}
              className="w-full"
            >
              Start Summarizing
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate("/history")}
              className="w-full"
            >
              View History
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;