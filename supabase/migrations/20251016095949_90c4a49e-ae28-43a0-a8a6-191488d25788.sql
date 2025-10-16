-- Fix RLS policy for user_roles to allow admins to create roles for other users
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Super Admin and Admin can manage all roles" ON public.user_roles;

-- Create new policies that properly allow admin/super_admin to insert roles for ANY user
CREATE POLICY "Admin can insert user roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin can update user roles" 
ON public.user_roles 
FOR UPDATE 
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin can delete user roles" 
ON public.user_roles 
FOR DELETE 
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admin can view all user roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (
  auth.uid() = user_id OR
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);