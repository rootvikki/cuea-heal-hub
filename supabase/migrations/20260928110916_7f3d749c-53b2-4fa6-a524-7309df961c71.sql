ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS quantity_dispensed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS substituted_with text, ADD COLUMN IF NOT EXISTS substitution_reason text;
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.prescriptions'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
    EXECUTE format('ALTER TABLE public.prescriptions DROP CONSTRAINT %I', c);
  END LOOP; END $$;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_status_check CHECK (status IN ('sent','received','reviewed','dispensing','partially_dispensed','dispensed','collected'));
UPDATE public.prescriptions SET quantity_dispensed = quantity WHERE dispensed = true AND quantity_dispensed = 0;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS received_by uuid;

CREATE TABLE public.pharmacy_replenishment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.pharmacy_inventory(id) ON DELETE SET NULL,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  medication_name text NOT NULL,
  quantity_requested integer NOT NULL CHECK (quantity_requested > 0),
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','urgent')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','ordered','received','cancelled')),
  requested_by uuid, approved_by uuid, received_qty integer, notes text,
  approved_at timestamptz, ordered_at timestamptz, received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pharmacy_replenishment_requests TO authenticated;
GRANT ALL ON public.pharmacy_replenishment_requests TO service_role;
ALTER TABLE public.pharmacy_replenishment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pharmacy and finance view replenishment" ON public.pharmacy_replenishment_requests FOR SELECT TO authenticated
USING (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_officer'));
CREATE POLICY "Pharmacy creates replenishment" ON public.pharmacy_replenishment_requests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
CREATE POLICY "Pharmacy updates replenishment" ON public.pharmacy_replenishment_requests FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'))
WITH CHECK (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
CREATE TRIGGER update_replenishment_updated_at BEFORE UPDATE ON public.pharmacy_replenishment_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();