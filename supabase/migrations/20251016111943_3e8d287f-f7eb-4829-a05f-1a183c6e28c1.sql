-- Add 'patient' to the app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'patient';

-- Update the handle_new_user function to assign patient role by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, full_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'Kenya'
  );
  
  -- Assign patient role by default if no other role is assigned
  -- This will be overridden if user is created with specific roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'patient')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- Update RLS policy for patients table to allow patients to view own data
DROP POLICY IF EXISTS "Patients can view own data" ON public.patients;
CREATE POLICY "Patients can view own data"
ON public.patients
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'patient'::app_role)
);

-- Update tickets RLS to allow patients to view their own tickets
DROP POLICY IF EXISTS "Patients can view own tickets" ON public.tickets;
CREATE POLICY "Patients can view own tickets"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM patients 
    WHERE patients.id = tickets.patient_id 
    AND patients.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer', 'super_admin')
  )
);

-- Allow patients to create their own tickets
DROP POLICY IF EXISTS "Patients can create own tickets" ON public.tickets;
CREATE POLICY "Patients can create own tickets"
ON public.tickets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM patients 
    WHERE patients.id = tickets.patient_id 
    AND patients.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);