-- Fix the RLS policy to allow super_admin to view all patients
DROP POLICY IF EXISTS "Staff can view all patients" ON public.patients;

CREATE POLICY "Staff can view all patients"
ON public.patients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer', 'super_admin')
  )
);