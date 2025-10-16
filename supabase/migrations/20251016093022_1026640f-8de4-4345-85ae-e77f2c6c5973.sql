-- Clean up all existing data
TRUNCATE TABLE public.user_roles CASCADE;
TRUNCATE TABLE public.audit_logs CASCADE;
TRUNCATE TABLE public.patients CASCADE;
TRUNCATE TABLE public.appointments CASCADE;
TRUNCATE TABLE public.tickets CASCADE;
TRUNCATE TABLE public.prescriptions CASCADE;
TRUNCATE TABLE public.lab_orders CASCADE;
TRUNCATE TABLE public.invoices CASCADE;
TRUNCATE TABLE public.invoice_items CASCADE;
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.encounters CASCADE;
TRUNCATE TABLE public.vitals CASCADE;
TRUNCATE TABLE public.pharmacy_inventory CASCADE;
TRUNCATE TABLE public.profiles CASCADE;
TRUNCATE TABLE public.staff CASCADE;

-- Update app_role enum to include all roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'radiologist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

-- Ensure RLS policies are strict for user creation
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Super Admin and Admin can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR 
  has_role(auth.uid(), 'admin')
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin') OR 
  has_role(auth.uid(), 'admin')
);

-- Ensure only admin/super_admin can create users via CreateUserDialog
-- This is enforced by checking the user's role before allowing user creation