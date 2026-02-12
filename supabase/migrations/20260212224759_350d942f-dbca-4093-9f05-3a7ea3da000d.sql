
-- =============================================
-- Phase 1: Fix overly permissive RLS policies
-- =============================================

-- 1. service_charges: restrict to clinical staff + finance
DROP POLICY IF EXISTS "Staff can insert service charges" ON public.service_charges;
DROP POLICY IF EXISTS "Staff can view service charges" ON public.service_charges;
DROP POLICY IF EXISTS "Staff can update service charges" ON public.service_charges;
DROP POLICY IF EXISTS "Staff can delete service charges" ON public.service_charges;
DROP POLICY IF EXISTS "Staff can insert service charges " ON public.service_charges;
DROP POLICY IF EXISTS "Staff can view service charges " ON public.service_charges;
DROP POLICY IF EXISTS "Staff can update service charges " ON public.service_charges;
DROP POLICY IF EXISTS "Staff can delete service charges " ON public.service_charges;

CREATE POLICY "Clinical staff can insert service charges"
ON public.service_charges FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'lab_technician'::app_role) OR
  has_role(auth.uid(), 'radiologist'::app_role) OR
  has_role(auth.uid(), 'pharmacist'::app_role) OR
  has_role(auth.uid(), 'finance_officer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Staff can view service charges"
ON public.service_charges FOR SELECT
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'lab_technician'::app_role) OR
  has_role(auth.uid(), 'radiologist'::app_role) OR
  has_role(auth.uid(), 'pharmacist'::app_role) OR
  has_role(auth.uid(), 'finance_officer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Finance can update service charges"
ON public.service_charges FOR UPDATE
USING (
  has_role(auth.uid(), 'finance_officer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Admin can delete service charges"
ON public.service_charges FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 2. nursing_procedures: restrict to nurses, doctors, admin
DROP POLICY IF EXISTS "Staff can insert nursing procedures" ON public.nursing_procedures;
DROP POLICY IF EXISTS "Staff can update nursing procedures" ON public.nursing_procedures;
DROP POLICY IF EXISTS "Staff can view nursing procedures" ON public.nursing_procedures;
DROP POLICY IF EXISTS "Staff can insert nursing procedures " ON public.nursing_procedures;
DROP POLICY IF EXISTS "Staff can update nursing procedures " ON public.nursing_procedures;
DROP POLICY IF EXISTS "Staff can view nursing procedures " ON public.nursing_procedures;

CREATE POLICY "Nurses can insert nursing procedures"
ON public.nursing_procedures FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Nurses can update nursing procedures"
ON public.nursing_procedures FOR UPDATE
USING (
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Clinical staff can view nursing procedures"
ON public.nursing_procedures FOR SELECT
USING (
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 3. dental_procedures: restrict to doctors/dentists and admin
DROP POLICY IF EXISTS "Staff can insert dental procedures" ON public.dental_procedures;
DROP POLICY IF EXISTS "Staff can update dental procedures" ON public.dental_procedures;
DROP POLICY IF EXISTS "Staff can view dental procedures" ON public.dental_procedures;
DROP POLICY IF EXISTS "Staff can insert dental procedures " ON public.dental_procedures;
DROP POLICY IF EXISTS "Staff can update dental procedures " ON public.dental_procedures;
DROP POLICY IF EXISTS "Staff can view dental procedures " ON public.dental_procedures;

CREATE POLICY "Dentists can insert dental procedures"
ON public.dental_procedures FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Dentists can update dental procedures"
ON public.dental_procedures FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Clinical staff can view dental procedures"
ON public.dental_procedures FOR SELECT
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 4. lab_result_fields: restrict to lab techs, doctors, admin + add DELETE
DROP POLICY IF EXISTS "Staff can insert lab result fields" ON public.lab_result_fields;
DROP POLICY IF EXISTS "Staff can update lab result fields" ON public.lab_result_fields;
DROP POLICY IF EXISTS "Staff can view lab result fields" ON public.lab_result_fields;
DROP POLICY IF EXISTS "Staff can insert lab result fields " ON public.lab_result_fields;
DROP POLICY IF EXISTS "Staff can update lab result fields " ON public.lab_result_fields;
DROP POLICY IF EXISTS "Staff can view lab result fields " ON public.lab_result_fields;

CREATE POLICY "Lab staff can insert result fields"
ON public.lab_result_fields FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'lab_technician'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Lab staff can update result fields"
ON public.lab_result_fields FOR UPDATE
USING (
  has_role(auth.uid(), 'lab_technician'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Lab staff can delete result fields"
ON public.lab_result_fields FOR DELETE
USING (
  has_role(auth.uid(), 'lab_technician'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Clinical staff can view result fields"
ON public.lab_result_fields FOR SELECT
USING (
  has_role(auth.uid(), 'lab_technician'::app_role) OR
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 5. referrals: restrict to doctors and admin
DROP POLICY IF EXISTS "Staff can insert referrals" ON public.referrals;
DROP POLICY IF EXISTS "Staff can view referrals" ON public.referrals;
DROP POLICY IF EXISTS "Staff can insert referrals " ON public.referrals;
DROP POLICY IF EXISTS "Staff can view referrals " ON public.referrals;

CREATE POLICY "Doctors can insert referrals"
ON public.referrals FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Clinical staff can view referrals"
ON public.referrals FOR SELECT
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR
  has_role(auth.uid(), 'nurse'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 6. pharmacy_stock_transactions: restrict to pharmacists and admin
DROP POLICY IF EXISTS "Staff can insert stock transactions" ON public.pharmacy_stock_transactions;
DROP POLICY IF EXISTS "Staff can view stock transactions" ON public.pharmacy_stock_transactions;
DROP POLICY IF EXISTS "Staff can insert stock transactions " ON public.pharmacy_stock_transactions;
DROP POLICY IF EXISTS "Staff can view stock transactions " ON public.pharmacy_stock_transactions;

CREATE POLICY "Pharmacists can insert stock transactions"
ON public.pharmacy_stock_transactions FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'pharmacist'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Pharmacy staff can view stock transactions"
ON public.pharmacy_stock_transactions FOR SELECT
USING (
  has_role(auth.uid(), 'pharmacist'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- 7. email_otp_tokens: restrict to token owner only (system access via service role)
DROP POLICY IF EXISTS "System can manage OTP tokens" ON public.email_otp_tokens;
DROP POLICY IF EXISTS "System can manage OTP tokens " ON public.email_otp_tokens;

CREATE POLICY "Users can view own OTP tokens"
ON public.email_otp_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert OTP tokens"
ON public.email_otp_tokens FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update OTP tokens"
ON public.email_otp_tokens FOR UPDATE
USING (true);

-- 8. mpesa_transactions: fix the overly permissive ALL policy
DROP POLICY IF EXISTS "System can manage M-Pesa transactions" ON public.mpesa_transactions;
DROP POLICY IF EXISTS "System can manage M-Pesa transactions " ON public.mpesa_transactions;

CREATE POLICY "System can insert M-Pesa transactions"
ON public.mpesa_transactions FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update M-Pesa transactions"
ON public.mpesa_transactions FOR UPDATE
USING (true);

-- 9. Add performance indexes on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_tickets_patient_id ON public.tickets(patient_id);
CREATE INDEX IF NOT EXISTS idx_tickets_workflow_stage ON public.tickets(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_tickets_status_workflow ON public.tickets(status, workflow_stage);
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON public.encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_ticket_id ON public.encounters(ticket_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_encounter_id ON public.lab_orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON public.lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON public.prescriptions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_service_charges_ticket_id ON public.service_charges(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_charges_patient_id ON public.service_charges(patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_encounter_id ON public.imaging_orders(encounter_id);
