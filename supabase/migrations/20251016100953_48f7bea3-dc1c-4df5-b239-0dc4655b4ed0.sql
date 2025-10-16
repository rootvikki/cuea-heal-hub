-- Fix appointments RLS policies to allow staff to create appointments
DROP POLICY IF EXISTS "Receptionist can manage appointments" ON public.appointments;

-- Allow receptionists and admins to manage all appointments
CREATE POLICY "Receptionist and admin can manage appointments" 
ON public.appointments 
FOR ALL
USING (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'super_admin')
);

-- Allow doctors and nurses to create appointments
CREATE POLICY "Medical staff can create appointments" 
ON public.appointments 
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'super_admin')
);