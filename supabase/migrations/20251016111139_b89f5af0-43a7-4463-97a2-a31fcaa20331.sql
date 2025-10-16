-- Allow authenticated users to insert their own user roles during registration
-- This is needed for patient self-registration
DROP POLICY IF EXISTS "Admin can insert user roles" ON public.user_roles;

-- Allow admins to insert any roles
CREATE POLICY "Admin can insert user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = user_id  -- Users can insert their own roles
);

-- Allow admins to update any roles, users can update their own
DROP POLICY IF EXISTS "Admin can update user roles" ON public.user_roles;
CREATE POLICY "Users can manage own roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = user_id
);

-- Allow admins to delete any roles, users can delete their own
DROP POLICY IF EXISTS "Admin can delete user roles" ON public.user_roles;
CREATE POLICY "Users can delete own roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = user_id
);