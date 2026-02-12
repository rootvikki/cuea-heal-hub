
-- Ensure profiles.status has a default of 'active'
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'active';

-- Update any null statuses to 'active'
UPDATE public.profiles SET status = 'active' WHERE status IS NULL;

-- RLS: super_admin and admin can update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS: super_admin and admin can view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
