-- Ensure fractional credits are supported
BEGIN;

-- Make profile credits numeric (for 0.5 deductions)
ALTER TABLE public.profiles 
  ALTER COLUMN credits TYPE numeric USING credits::numeric;

-- Make transaction amounts numeric as well
ALTER TABLE public.credit_transactions 
  ALTER COLUMN amount TYPE numeric USING amount::numeric;

-- Drop legacy integer overload of update_user_credits to avoid ambiguity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_user_credits'
      AND p.proargtypes::text = (
        SELECT oidvectortypes(p2.proargtypes)
        FROM pg_proc p2
        JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
        WHERE n2.nspname = 'public'
          AND p2.proname = 'update_user_credits'
          AND oidvectortypes(p2.proargtypes) = 'uuid, integer, text, text, uuid'
        LIMIT 1
      )
  ) THEN
    DROP FUNCTION public.update_user_credits(uuid, integer, text, text, uuid);
  END IF;
END $$;

-- Recreate numeric version to ensure latest definition
CREATE OR REPLACE FUNCTION public.update_user_credits(
  user_id_param uuid,
  credit_amount numeric,
  transaction_type_param text,
  description_param text DEFAULT NULL::text,
  reference_id_param uuid DEFAULT NULL::uuid
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  current_credits numeric;
BEGIN
  SELECT credits INTO current_credits
  FROM public.profiles
  WHERE user_id = user_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found with ID: %', user_id_param;
  END IF;

  IF credit_amount < 0 AND current_credits + credit_amount < 0 THEN
    RAISE EXCEPTION 'Insufficient credits for user ID: %', user_id_param;
  END IF;

  UPDATE public.profiles
  SET credits = credits + credit_amount,
      updated_at = NOW()
  WHERE user_id = user_id_param;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    reference_id,
    created_at
  ) VALUES (
    user_id_param,
    credit_amount,
    transaction_type_param,
    description_param,
    reference_id_param,
    NOW()
  );

  RETURN TRUE;
END;
$$;

COMMIT;