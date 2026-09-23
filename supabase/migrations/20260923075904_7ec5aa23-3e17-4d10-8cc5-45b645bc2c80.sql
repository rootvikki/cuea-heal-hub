CREATE OR REPLACE FUNCTION public.notify_roles(
  _roles public.app_role[],
  _title text,
  _message text,
  _category text DEFAULT 'general',
  _reference_id uuid DEFAULT NULL,
  _link text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, category, reference_id, link)
  SELECT DISTINCT ur.user_id, _title, _message, _category, _reference_id, _link
  FROM public.user_roles ur
  WHERE ur.role = ANY(_roles)
    AND ur.user_id <> auth.uid();

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_roles(public.app_role[], text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_roles(public.app_role[], text, text, text, uuid, text) TO authenticated;