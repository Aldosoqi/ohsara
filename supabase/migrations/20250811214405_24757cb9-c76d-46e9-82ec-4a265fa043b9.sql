-- Harden wrapper functions: set security definer and fixed search_path
CREATE OR REPLACE FUNCTION public.apply_user_credits(
  user_id_param uuid,
  credit_amount numeric,
  transaction_type_param text,
  description_param text DEFAULT NULL,
  reference_id_param uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.update_user_credits(
    user_id_param,
    credit_amount,
    transaction_type_param,
    description_param,
    reference_id_param
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  user_id_param uuid,
  credit_amount numeric,
  description_param text DEFAULT NULL,
  reference_id_param uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.update_user_credits(
    user_id_param,
    -ABS(credit_amount),
    'debit',
    description_param,
    reference_id_param
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_user_credits(
  user_id_param uuid,
  credit_amount numeric,
  description_param text DEFAULT NULL,
  reference_id_param uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.update_user_credits(
    user_id_param,
    ABS(credit_amount),
    'refund',
    description_param,
    reference_id_param
  );
END;
$$;