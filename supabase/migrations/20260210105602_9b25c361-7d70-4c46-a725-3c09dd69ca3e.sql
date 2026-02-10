
-- Drop and recreate get_all_users_with_roles with payroll_number
DROP FUNCTION IF EXISTS public.get_all_users_with_roles();

CREATE OR REPLACE FUNCTION public.get_all_users_with_roles()
RETURNS TABLE(user_id uuid, email text, full_name text, phone text, roles text[], created_at timestamp with time zone, payroll_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    au.id as user_id,
    au.email,
    p.full_name,
    p.phone,
    ARRAY_AGG(ur.role::TEXT) as roles,
    au.created_at,
    s.payroll_number
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
  LEFT JOIN public.staff s ON s.user_id = au.id
  WHERE has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin')
  GROUP BY au.id, au.email, p.full_name, p.phone, au.created_at, s.payroll_number
  ORDER BY au.created_at DESC;
$$;
