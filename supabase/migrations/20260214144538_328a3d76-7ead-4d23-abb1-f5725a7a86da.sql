
-- Drop existing encounters SELECT policy
DROP POLICY IF EXISTS "Doctors can view encounters" ON public.encounters;
DROP POLICY IF EXISTS "Staff can view encounters" ON public.encounters;

-- Create restrictive SELECT policy: only doctor, clinical_officer, admin, super_admin
CREATE POLICY "Doctors can view encounters"
ON public.encounters
FOR SELECT
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'clinical_officer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);
