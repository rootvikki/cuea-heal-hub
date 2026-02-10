
-- Add payroll_number to staff table
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS payroll_number TEXT;

-- Enhance audit_logs with staff tracking
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS staff_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS payroll_number TEXT;

-- Update RLS for audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);
