ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS doctor_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS doctor_reviewed_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS doctor_review_comments text;

CREATE OR REPLACE FUNCTION public.sign_off_lab_order(_order_id uuid, _comments text)
RETURNS public.lab_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _staff_id uuid;
  _row public.lab_orders;
BEGIN
  IF NOT (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'clinical_officer')
       OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only doctors can sign off lab results';
  END IF;
  SELECT id INTO _staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
  IF _staff_id IS NULL THEN RAISE EXCEPTION 'Your account is not linked to a staff record'; END IF;

  UPDATE public.lab_orders
     SET doctor_reviewed_at = now(), doctor_reviewed_by = _staff_id,
         doctor_review_comments = NULLIF(trim(coalesce(_comments,'')), '')
   WHERE id = _order_id AND status = 'completed'
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN RAISE EXCEPTION 'Results must be completed before sign-off'; END IF;

  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'LAB_RESULT_SIGNED_OFF', 'laboratory', jsonb_build_object('lab_order_id', _order_id));
  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sign_off_lab_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_off_lab_order(uuid, text) TO authenticated;