ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS formulation text, ADD COLUMN IF NOT EXISTS strength text;
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS formulation text;

CREATE TABLE public.procedure_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  encounter_id uuid REFERENCES public.encounters(id),
  ticket_id uuid REFERENCES public.tickets(id),
  procedure_type text NOT NULL,
  procedure_label text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'ordered',
  ordered_by uuid,
  performed_by uuid,
  performed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.procedure_orders TO authenticated;
GRANT ALL ON public.procedure_orders TO service_role;
ALTER TABLE public.procedure_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinical staff view procedure orders" ON public.procedure_orders FOR SELECT TO authenticated
USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'clinical_officer') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
CREATE POLICY "Doctors order procedures" ON public.procedure_orders FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'clinical_officer') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
CREATE POLICY "Nurses update procedure orders" ON public.procedure_orders FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'clinical_officer') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));

CREATE POLICY "Front desk and nurses create encounters" ON public.encounters FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'receptionist'));
CREATE POLICY "Front desk and nurses view encounters" ON public.encounters FOR SELECT TO authenticated
USING (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'receptionist'));
CREATE POLICY "Front desk and nurses create lab orders" ON public.lab_orders FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'receptionist'));
CREATE POLICY "Front desk and nurses create prescriptions" ON public.prescriptions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'receptionist'));
CREATE POLICY "Clinical officers create admissions" ON public.admissions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'clinical_officer'));

CREATE POLICY "Pharmacists insert inventory" ON public.pharmacy_inventory FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
CREATE POLICY "Pharmacists update inventory" ON public.pharmacy_inventory FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'finance_officer') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));

-- Only pharmacy admins/finance may change selling prices
CREATE OR REPLACE FUNCTION public.guard_inventory_price()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.unit_price IS DISTINCT FROM OLD.unit_price
     AND auth.uid() IS NOT NULL
     AND NOT (has_role(auth.uid(),'finance_officer') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only finance or admin staff can change selling prices';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_inventory_price BEFORE UPDATE ON public.pharmacy_inventory
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_price();