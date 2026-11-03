CREATE POLICY "Finance roles can view payments" ON public.payments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Finance roles can view invoices" ON public.invoices FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Finance roles can view patients" ON public.patients FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Finance roles can view tickets" ON public.tickets FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'accountant'));