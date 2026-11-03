-- Billing desk may change amounts on a confirmed bill until anything is paid on it.
CREATE OR REPLACE FUNCTION public.update_unpaid_bill(_invoice_id uuid, _lines jsonb)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices;
  line jsonb;
  total numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'cashier')
       OR public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Only the billing desk can change bill amounts';
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF inv.status = 'paid' OR COALESCE(inv.amount_paid, 0) > 0
     OR EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = _invoice_id AND p.status = 'completed') THEN
    RAISE EXCEPTION 'This bill already has a payment, so its amounts can no longer be changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mpesa_transactions m WHERE m.invoice_id = _invoice_id AND m.status = 'pending'
             AND m.created_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'An M-Pesa payment for this bill is still waiting. Try again once it finishes';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    IF (line->>'amount')::numeric < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
    UPDATE public.service_charges
       SET amount = (line->>'amount')::numeric,
           description = COALESCE(NULLIF(btrim(line->>'description'), ''), description)
     WHERE id = (line->>'id')::uuid AND invoice_id = _invoice_id;
  END LOOP;

  -- The bill lines always mirror the charges linked to the bill
  DELETE FROM public.invoice_items WHERE invoice_id = _invoice_id;
  INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total_price)
  SELECT _invoice_id, sc.description, 1, sc.amount, sc.amount
    FROM public.service_charges sc WHERE sc.invoice_id = _invoice_id ORDER BY sc.created_at;

  SELECT COALESCE(SUM(amount), 0) INTO total FROM public.service_charges WHERE invoice_id = _invoice_id;
  UPDATE public.invoices
     SET total_amount = total,
         net_amount = GREATEST(total - COALESCE(discount, 0) + COALESCE(tax, 0), 0),
         balance = GREATEST(total - COALESCE(discount, 0) + COALESCE(tax, 0), 0),
         updated_at = now()
   WHERE id = _invoice_id
   RETURNING * INTO inv;
  RETURN inv;
END;
$$;

REVOKE ALL ON FUNCTION public.update_unpaid_bill(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_unpaid_bill(uuid, jsonb) TO authenticated;

-- Billing desk may remove a charge that is not on a bill yet
CREATE POLICY "Reception billing desk removes unbilled charges"
ON public.service_charges FOR DELETE TO authenticated
USING ((public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'cashier')) AND invoice_id IS NULL);

-- CUEA students are never charged for triage or consultation, whichever screen (or old browser tab) adds the fee.
-- Only new charges are touched, so amounts the billing desk edits later stay final.
CREATE OR REPLACE FUNCTION public.waive_student_service_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_type IN ('triage', 'consultation')
     AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.patient_type = 'cuea_student') THEN
    NEW.amount := 0;
    IF NEW.description NOT ILIKE '%no charge%' THEN
      NEW.description := NEW.description || ' (no charge — CUEA student)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waive_student_service_fees ON public.service_charges;
CREATE TRIGGER waive_student_service_fees
BEFORE INSERT ON public.service_charges
FOR EACH ROW EXECUTE FUNCTION public.waive_student_service_fees();