-- Users may not change their own personal details; staff (reception / records / admins) change them for others.
-- Admins and super admins keep control, including over their own record.
CREATE OR REPLACE FUNCTION public.block_self_personal_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _allowed text[];
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;
  IF has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  -- System bookkeeping a user may still trigger on their own record (password-change flag, login time)
  _allowed := CASE TG_TABLE_NAME WHEN 'profiles' THEN ARRAY['must_change_password', 'last_login_at', 'updated_at'] ELSE ARRAY['updated_at'] END;
  IF (to_jsonb(NEW) - _allowed) IS DISTINCT FROM (to_jsonb(OLD) - _allowed) THEN
    RAISE EXCEPTION 'You cannot change your own personal details. Please ask the administrator or reception to update them.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS block_self_personal_edit ON public.profiles;
CREATE TRIGGER block_self_personal_edit BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_self_personal_edit();

DROP TRIGGER IF EXISTS block_self_personal_edit ON public.patients;
CREATE TRIGGER block_self_personal_edit BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.block_self_personal_edit();