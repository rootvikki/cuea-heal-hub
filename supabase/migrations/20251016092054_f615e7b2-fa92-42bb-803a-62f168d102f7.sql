-- Clean up all test data
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

-- Update the handle_new_user trigger to NOT create patient records by default
-- Only create profile, not patient
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert profile, no patient record by default
  INSERT INTO public.profiles (user_id, full_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'Kenya'
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fix RLS policy for user_roles to allow service role and admins
DROP POLICY IF EXISTS "Super Admin can insert any role" ON public.user_roles;

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR 
  has_role(auth.uid(), 'admin') OR
  auth.uid() = user_id
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin') OR 
  has_role(auth.uid(), 'admin')
);

-- Update profiles RLS to allow staff to view other profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin', 'doctor', 'nurse', 'receptionist')
  )
);