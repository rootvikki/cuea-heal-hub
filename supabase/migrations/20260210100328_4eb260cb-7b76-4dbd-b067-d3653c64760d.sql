
-- Phase 1.1: Patient type enum and patients table enhancements
CREATE TYPE public.patient_type AS ENUM ('cuea_staff', 'cuea_student', 'outsider');
CREATE TYPE public.visit_reason AS ENUM ('outpatient', 'dental');

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS patient_type public.patient_type DEFAULT 'outsider',
  ADD COLUMN IF NOT EXISTS payroll_number TEXT,
  ADD COLUMN IF NOT EXISTS admission_number TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Kenyan',
  ADD COLUMN IF NOT EXISTS postal_address TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS next_of_kin_name TEXT,
  ADD COLUMN IF NOT EXISTS next_of_kin_relationship TEXT,
  ADD COLUMN IF NOT EXISTS next_of_kin_phone TEXT,
  ADD COLUMN IF NOT EXISTS visit_reason public.visit_reason DEFAULT 'outpatient';

-- Phase 1.3: Vitals enhancements
ALTER TABLE public.vitals
  ADD COLUMN IF NOT EXISTS allergies_noted TEXT,
  ADD COLUMN IF NOT EXISTS presenting_complaint TEXT;

-- Phase 1.4: Nursing procedures table
CREATE TABLE public.nursing_procedures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encounter_id UUID REFERENCES public.encounters(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  ticket_id UUID REFERENCES public.tickets(id),
  nurse_id UUID NOT NULL,
  procedure_type TEXT NOT NULL,
  notes TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nursing_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view nursing procedures" ON public.nursing_procedures FOR SELECT USING (true);
CREATE POLICY "Staff can insert nursing procedures" ON public.nursing_procedures FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can update nursing procedures" ON public.nursing_procedures FOR UPDATE USING (true);

-- Phase 1.5: Dental procedures table
CREATE TABLE public.dental_procedures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encounter_id UUID REFERENCES public.encounters(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  ticket_id UUID REFERENCES public.tickets(id),
  dentist_id UUID NOT NULL,
  procedure_name TEXT NOT NULL,
  tooth_number TEXT,
  notes TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  next_visit DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dental_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view dental procedures" ON public.dental_procedures FOR SELECT USING (true);
CREATE POLICY "Staff can insert dental procedures" ON public.dental_procedures FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can update dental procedures" ON public.dental_procedures FOR UPDATE USING (true);

-- Phase 1.6: Referrals table
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  encounter_id UUID REFERENCES public.encounters(id),
  referred_by UUID NOT NULL,
  reasons_for_referral TEXT NOT NULL,
  treatment_given TEXT,
  doctor_name TEXT NOT NULL,
  referral_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view referrals" ON public.referrals FOR SELECT USING (true);
CREATE POLICY "Staff can insert referrals" ON public.referrals FOR INSERT WITH CHECK (true);

-- Phase 1.7: Lab enhancements
CREATE TABLE public.lab_result_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lab_order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  unit TEXT,
  reference_range TEXT,
  flag TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lab_result_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view lab result fields" ON public.lab_result_fields FOR SELECT USING (true);
CREATE POLICY "Staff can insert lab result fields" ON public.lab_result_fields FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can update lab result fields" ON public.lab_result_fields FOR UPDATE USING (true);

ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS flag TEXT;
ALTER TABLE public.lab_tests_catalog ADD COLUMN IF NOT EXISTS gender_specific_ranges JSONB;
ALTER TABLE public.lab_tests_catalog ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.lab_tests_catalog ADD COLUMN IF NOT EXISTS result_fields JSONB;

-- Phase 1.8: Pharmacy inventory enhancements
ALTER TABLE public.pharmacy_inventory
  ADD COLUMN IF NOT EXISTS strength_size TEXT,
  ADD COLUMN IF NOT EXISTS package TEXT,
  ADD COLUMN IF NOT EXISTS minimum_stock INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maximum_stock INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_monthly_consumption NUMERIC(10,2) DEFAULT 0;

CREATE TABLE public.pharmacy_stock_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES public.pharmacy_inventory(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_from TEXT,
  issued_to TEXT,
  invoice_ref TEXT,
  expiry_date DATE,
  unit_price NUMERIC(10,2),
  qty_received INT DEFAULT 0,
  qty_issued INT DEFAULT 0,
  balance INT DEFAULT 0,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pharmacy_stock_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view stock transactions" ON public.pharmacy_stock_transactions FOR SELECT USING (true);
CREATE POLICY "Staff can insert stock transactions" ON public.pharmacy_stock_transactions FOR INSERT WITH CHECK (true);

-- Phase 1.9: Service charges table
CREATE TABLE public.service_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  encounter_id UUID REFERENCES public.encounters(id),
  ticket_id UUID REFERENCES public.tickets(id),
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_stage TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view service charges" ON public.service_charges FOR SELECT USING (true);
CREATE POLICY "Staff can insert service charges" ON public.service_charges FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff can update service charges" ON public.service_charges FOR UPDATE USING (true);
CREATE POLICY "Staff can delete service charges" ON public.service_charges FOR DELETE USING (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.nursing_procedures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_charges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dental_procedures;
