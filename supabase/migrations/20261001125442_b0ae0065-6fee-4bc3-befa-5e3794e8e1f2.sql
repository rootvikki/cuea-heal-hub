ALTER FUNCTION public.sign_off_lab_order(uuid, text) SECURITY INVOKER;

CREATE POLICY "Doctors can sign off completed lab orders"
ON public.lab_orders FOR UPDATE TO authenticated
USING (status = 'completed' AND (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer')))
WITH CHECK (status = 'completed' AND (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer')));

CREATE OR REPLACE FUNCTION public.guard_lab_order_doctor_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'lab_technician') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'doctor_reviewed_at' - 'doctor_reviewed_by' - 'doctor_review_comments')
     IS DISTINCT FROM (to_jsonb(OLD) - 'doctor_reviewed_at' - 'doctor_reviewed_by' - 'doctor_review_comments') THEN
    RAISE EXCEPTION 'Doctors can only record their review on lab results';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER guard_lab_order_doctor_update
BEFORE UPDATE ON public.lab_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_lab_order_doctor_update();