-- Allow fractional credits for chat messages
ALTER TABLE public.profiles
  ALTER COLUMN credits TYPE numeric(10,2) USING credits::numeric;

ALTER TABLE public.credit_transactions
  ALTER COLUMN amount TYPE numeric(10,2) USING amount::numeric;

CREATE OR REPLACE FUNCTION public.update_user_credits(
  user_id_param UUID,
  credit_amount NUMERIC,
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
  current_credits NUMERIC;
BEGIN
  SELECT credits INTO current_credits
  FROM public.profiles
  WHERE user_id = user_id_param;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF credit_amount < 0 AND current_credits + credit_amount < 0 THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE public.profiles
  SET credits = credits + credit_amount,
      updated_at = now()
  WHERE user_id = user_id_param;

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
