-- Specimen rejection on lab orders
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS rejected_by uuid;

-- Critical value alerts: who acknowledged and what they did
ALTER TABLE public.critical_alerts ADD COLUMN IF NOT EXISTS acknowledged_note text;
ALTER TABLE public.critical_alerts ADD COLUMN IF NOT EXISTS lab_order_id uuid REFERENCES public.lab_orders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS critical_alerts_open_idx ON public.critical_alerts (acknowledged, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.critical_alerts TO authenticated;
GRANT ALL ON public.critical_alerts TO service_role;

DROP POLICY IF EXISTS "Staff can view critical alerts" ON public.critical_alerts;
CREATE POLICY "Staff can view critical alerts" ON public.critical_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer') OR public.has_role(auth.uid(),'nurse')
    OR public.has_role(auth.uid(),'lab_technician') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Staff can acknowledge alerts" ON public.critical_alerts;
CREATE POLICY "Staff can acknowledge alerts" ON public.critical_alerts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer') OR public.has_role(auth.uid(),'nurse')
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer') OR public.has_role(auth.uid(),'nurse')
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Doctors, clinical officers and nurses read the per-parameter results they act on
DROP POLICY IF EXISTS "Clinical staff can view result fields" ON public.lab_result_fields;
CREATE POLICY "Clinical staff can view result fields" ON public.lab_result_fields FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'lab_technician') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer')
    OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='critical_alerts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.critical_alerts;
  END IF;
END $$;