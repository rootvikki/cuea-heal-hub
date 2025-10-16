-- Create a function to get all users with their roles (admin only)
CREATE OR REPLACE FUNCTION public.get_all_users_with_roles()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  roles TEXT[],
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    au.id as user_id,
    au.email,
    p.full_name,
    p.phone,
    ARRAY_AGG(ur.role::TEXT) as roles,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
  WHERE has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin')
  GROUP BY au.id, au.email, p.full_name, p.phone, au.created_at
  ORDER BY au.created_at DESC;
$$;

-- Add policy to allow super admins to insert roles
CREATE POLICY "Super Admin can insert any role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));