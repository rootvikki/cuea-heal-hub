
-- Add clinical_officer to vitals RLS policy
DROP POLICY IF EXISTS "Nurses can manage vitals" ON public.vitals;
CREATE POLICY "Nurses can manage vitals" ON public.vitals
FOR ALL
USING (
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Add clinical_officer to encounters table RLS (check existing policies first, add to relevant ones)
-- For INSERT on encounters, add clinical_officer alongside doctor
DROP POLICY IF EXISTS "Doctors can create encounters" ON public.encounters;
CREATE POLICY "Doctors can create encounters" ON public.encounters
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- For SELECT on encounters, add clinical_officer
DROP POLICY IF EXISTS "Doctors can view encounters" ON public.encounters;
CREATE POLICY "Doctors can view encounters" ON public.encounters
FOR SELECT
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- For UPDATE on encounters
DROP POLICY IF EXISTS "Doctors can update encounters" ON public.encounters;
CREATE POLICY "Doctors can update encounters" ON public.encounters
FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);
