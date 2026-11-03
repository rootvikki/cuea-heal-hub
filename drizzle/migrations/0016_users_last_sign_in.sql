CREATE OR REPLACE FUNCTION public.get_users_last_sign_in()
RETURNS TABLE(user_id uuid, last_sign_in_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT au.id, au.last_sign_in_at
  FROM auth.users au
  WHERE public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.get_users_last_sign_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_users_last_sign_in() TO authenticated;