ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'mpesa_school_fees';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS preferred_payment_mode text NOT NULL DEFAULT 'mpesa_school_fees';
DO $$ BEGIN
  ALTER TABLE public.tickets ADD CONSTRAINT tickets_payment_mode_check CHECK (payment_mode IN ('mpesa_school_fees', 'insurance'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.patients ADD CONSTRAINT patients_preferred_payment_mode_check CHECK (preferred_payment_mode IN ('mpesa_school_fees', 'insurance'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'school_fees';
ALTER TABLE public.lab_tests_catalog ADD COLUMN IF NOT EXISTS insurance_price numeric;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS insurance_price numeric;
ALTER TABLE public.imaging_catalog ADD COLUMN IF NOT EXISTS insurance_price numeric;
ALTER TABLE public.service_charges ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_charges_ticket ON public.service_charges(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_charges_invoice ON public.service_charges(invoice_id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS pharmacy_decision text,
  ADD COLUMN IF NOT EXISTS planned_qty integer,
  ADD COLUMN IF NOT EXISTS alternative_inventory_id uuid REFERENCES public.pharmacy_inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS pharmacy_notes text,
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_pharmacy_decision_check
    CHECK (pharmacy_decision IS NULL OR pharmacy_decision IN ('dispense', 'not_available', 'alternative'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.prescriptions'::regclass AND contype = 'c'
             AND conname <> 'prescriptions_pharmacy_decision_check'
             AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
    EXECUTE format('ALTER TABLE public.prescriptions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_status_check CHECK (
  status IN ('sent','received','reviewed','billed','dispensing','partially_dispensed','dispensed','not_dispensed','collected'));
DROP POLICY IF EXISTS "Front desk can create direct encounters" ON public.encounters;
CREATE POLICY "Front desk can create direct encounters" ON public.encounters FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'lab_technician'));
DROP POLICY IF EXISTS "Stations can read visit encounters" ON public.encounters;
CREATE POLICY "Stations can read visit encounters" ON public.encounters FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'lab_technician')
      OR public.has_role(auth.uid(),'pharmacist') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'finance_officer'));
DROP POLICY IF EXISTS "Front desk can create direct lab orders" ON public.lab_orders;
CREATE POLICY "Front desk can create direct lab orders" ON public.lab_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'nurse'));
DROP POLICY IF EXISTS "Front desk can create direct prescriptions" ON public.prescriptions;
CREATE POLICY "Front desk can create direct prescriptions" ON public.prescriptions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'nurse'));
DROP POLICY IF EXISTS "Stations can read admissions for reports" ON public.admissions;
CREATE POLICY "Stations can read admissions for reports" ON public.admissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'lab_technician'));
DROP POLICY IF EXISTS "Triage can read lab orders" ON public.lab_orders;
CREATE POLICY "Triage can read lab orders" ON public.lab_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'nurse'));
DROP POLICY IF EXISTS "Billing can read prescriptions" ON public.prescriptions;
CREATE POLICY "Billing can read prescriptions" ON public.prescriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'finance_officer') OR public.has_role(auth.uid(),'accountant'));
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mpesa_transactions;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DROP POLICY IF EXISTS "Finance can read M-Pesa transactions" ON public.mpesa_transactions;
CREATE POLICY "Finance can read M-Pesa transactions" ON public.mpesa_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance_officer') OR public.has_role(auth.uid(),'cashier') OR public.has_role(auth.uid(),'accountant')
      OR public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));