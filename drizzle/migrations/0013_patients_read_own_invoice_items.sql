-- Patients see the lines of their own bills (so their printed receipt lists what was charged).
CREATE POLICY "Patients can view own invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i JOIN public.patients p ON p.id = i.patient_id
    WHERE i.id = invoice_items.invoice_id AND p.user_id = auth.uid()
  ));
-- Accountants already read bills; let them read the bill lines too.
CREATE POLICY "Accountants read invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'accountant'::app_role));