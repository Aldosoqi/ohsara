-- Update subscription_plans to be credit packs for "Pay For What You Use" model
-- First, clear existing plans
DELETE FROM public.subscription_plans;

-- Update the table structure for credit packs
ALTER TABLE public.subscription_plans 
RENAME TO credit_packs;

-- Update the column names to better reflect credit packs
ALTER TABLE public.credit_packs
DROP COLUMN IF EXISTS currency,
ADD COLUMN IF NOT EXISTS features TEXT[],
ADD COLUMN IF NOT EXISTS popular BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS savings_percentage INTEGER DEFAULT 0;

-- Insert new credit pack options for "Pay For What You Use"
INSERT INTO public.credit_packs (name, description, credits_included, price_cents, features, popular, savings_percentage, display_order) VALUES
('Starter Pack', 'Perfect for trying out the service', 10, 999, ARRAY['10 video summaries', 'Basic support', 'No expiration'], false, 0, 1),
('Popular Pack', 'Best value for regular users', 50, 3999, ARRAY['50 video summaries', 'Priority support', 'No expiration', 'Bulk savings'], true, 20, 2),
('Pro Pack', 'For power users and teams', 150, 9999, ARRAY['150 video summaries', 'Premium support', 'No expiration', 'Maximum savings'], false, 33, 3),
('Enterprise Pack', 'For businesses and heavy usage', 500, 29999, ARRAY['500 video summaries', 'Dedicated support', 'No expiration', 'Enterprise features'], false, 40, 4);

-- Update the user_subscriptions table to track credit pack purchases instead
ALTER TABLE public.user_subscriptions 
RENAME TO credit_pack_purchases;

-- Update the foreign key reference
ALTER TABLE public.credit_pack_purchases
DROP CONSTRAINT IF EXISTS user_subscriptions_plan_id_fkey,
ADD CONSTRAINT credit_pack_purchases_pack_id_fkey 
FOREIGN KEY (plan_id) REFERENCES public.credit_packs(id);

-- Rename column for clarity
ALTER TABLE public.credit_pack_purchases
RENAME COLUMN plan_id TO pack_id;

-- Update status values for credit pack purchases
ALTER TABLE public.credit_pack_purchases
DROP CONSTRAINT IF EXISTS user_subscriptions_status_check,
ADD CONSTRAINT credit_pack_purchases_status_check 
CHECK (status IN ('completed', 'pending', 'failed', 'refunded'));

-- Remove subscription-specific fields and add purchase-specific ones
ALTER TABLE public.credit_pack_purchases
DROP COLUMN IF EXISTS ends_at,
DROP COLUMN IF EXISTS stripe_subscription_id,
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS credits_purchased INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS purchase_completed_at TIMESTAMP WITH TIME ZONE;

-- Update RLS policies for credit pack purchases
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.credit_pack_purchases;
DROP POLICY IF EXISTS "Users can create their own subscriptions" ON public.credit_pack_purchases;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.credit_pack_purchases;

CREATE POLICY "Users can view their own credit pack purchases" 
ON public.credit_pack_purchases 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own credit pack purchases" 
ON public.credit_pack_purchases 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credit pack purchases" 
ON public.credit_pack_purchases 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Update trigger name
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON public.credit_pack_purchases;
CREATE TRIGGER update_credit_pack_purchases_updated_at
BEFORE UPDATE ON public.credit_pack_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update indexes
DROP INDEX IF EXISTS idx_user_subscriptions_user_id;
DROP INDEX IF EXISTS idx_user_subscriptions_status;
CREATE INDEX idx_credit_pack_purchases_user_id ON public.credit_pack_purchases(user_id);
CREATE INDEX idx_credit_pack_purchases_status ON public.credit_pack_purchases(status);

-- Update the credit management function to handle credit pack purchases
CREATE OR REPLACE FUNCTION public.purchase_credit_pack(
  user_id_param UUID,
  pack_id_param UUID,
  stripe_payment_intent_id_param TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack_credits INTEGER;
  pack_name TEXT;
  purchase_id UUID;
BEGIN
  -- Get credit pack details
  SELECT credits_included, name INTO pack_credits, pack_name
  FROM public.credit_packs 
  WHERE id = pack_id_param AND is_active = true;
  
  -- Check if pack exists
  IF pack_credits IS NULL THEN
    RAISE EXCEPTION 'Credit pack not found or inactive';
  END IF;
  
  -- Create purchase record
  INSERT INTO public.credit_pack_purchases (
    user_id, 
    pack_id, 
    status, 
    credits_purchased,
    stripe_payment_intent_id,
    purchase_completed_at
  ) VALUES (
    user_id_param, 
    pack_id_param, 
    'completed',
    pack_credits,
    stripe_payment_intent_id_param,
    now()
  ) RETURNING id INTO purchase_id;
  
  -- Add credits to user profile
  PERFORM public.update_user_credits(
    user_id_param,
    pack_credits,
    'purchase',
    'Credit pack purchase: ' || pack_name,
    purchase_id
  );
  
  RETURN purchase_id;
END;
$$;