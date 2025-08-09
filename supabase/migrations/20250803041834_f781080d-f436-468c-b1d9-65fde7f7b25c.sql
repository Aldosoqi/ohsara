-- Fix the security warning by setting proper search_path for the function
CREATE OR REPLACE FUNCTION public.update_user_credits(
  user_id_param UUID,
  credit_amount INTEGER,
  transaction_type_param TEXT,
  description_param TEXT DEFAULT NULL,
  reference_id_param UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits
  SELECT credits INTO current_credits 
  FROM public.profiles 
  WHERE user_id = user_id_param;
  
  -- Check if user exists
  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if user has enough credits for negative transactions
  IF credit_amount < 0 AND current_credits + credit_amount < 0 THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;
  
  -- Update credits
  UPDATE public.profiles 
  SET credits = credits + credit_amount,
      updated_at = now()
  WHERE user_id = user_id_param;
  
  -- Record transaction
  INSERT INTO public.credit_transactions (
    user_id, 
    amount, 
    transaction_type, 
    description, 
    reference_id
  ) VALUES (
    user_id_param, 
    credit_amount, 
    transaction_type_param, 
    description_param, 
    reference_id_param
  );
  
  RETURN TRUE;
END;
$$;