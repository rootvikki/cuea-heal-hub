-- Drop the existing policy that only allows certain roles to view profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Recreate with all staff roles included
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (auth.uid() = user_id)
  OR (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = ANY (ARRAY[
      'super_admin'::app_role,
      'admin'::app_role,
      'doctor'::app_role,
      'clinical_officer'::app_role,
      'nurse'::app_role,
      'receptionist'::app_role,
      'lab_technician'::app_role,
      'pharmacist'::app_role,
      'radiologist'::app_role,
      'finance_officer'::app_role,
      'cashier'::app_role,
      'accountant'::app_role,
      'hr_admin'::app_role,
      'ward_manager'::app_role,
      'records_officer'::app_role,
      'auditor'::app_role
    ])
  ))
);