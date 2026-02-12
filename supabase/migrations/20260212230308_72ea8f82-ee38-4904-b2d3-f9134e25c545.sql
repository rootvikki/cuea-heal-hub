
-- Fix remaining overly permissive RLS policies (retry without duplicate)

-- 1. email_otp_tokens: restrict INSERT/UPDATE
DROP POLICY IF EXISTS "No direct OTP insert" ON public.email_otp_tokens;
DROP POLICY IF EXISTS "No direct OTP update" ON public.email_otp_tokens;

CREATE POLICY "No direct OTP insert" ON public.email_otp_tokens
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "No direct OTP update" ON public.email_otp_tokens
  FOR UPDATE TO authenticated USING (false);

-- 2. email_logs: INSERT already dropped, add insert policy only
DROP POLICY IF EXISTS "No direct email log insert" ON public.email_logs;

CREATE POLICY "No direct email log insert" ON public.email_logs
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3. mpesa_transactions: already handled by previous migration
DROP POLICY IF EXISTS "Finance can insert M-Pesa transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "Finance can update M-Pesa transactions" ON public.mpesa_transactions;

CREATE POLICY "Finance can insert M-Pesa transactions" ON public.mpesa_transactions
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'finance_officer'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Finance can update M-Pesa transactions" ON public.mpesa_transactions
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'finance_officer'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 4. sms_notifications
DROP POLICY IF EXISTS "Staff can insert SMS notifications" ON public.sms_notifications;

CREATE POLICY "Staff can insert SMS notifications" ON public.sms_notifications
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'receptionist'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 5. audit_logs duplicate already dropped

-- 6. lab_result_fields DELETE policy
DROP POLICY IF EXISTS "Lab staff can delete lab result fields" ON public.lab_result_fields;

CREATE POLICY "Lab staff can delete lab result fields" ON public.lab_result_fields
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'lab_technician'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );
