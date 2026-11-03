CREATE POLICY "Admitting staff update beds" ON public.beds
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'doctor'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role) OR public.has_role(auth.uid(), 'ward_manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'doctor'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role) OR public.has_role(auth.uid(), 'ward_manager'::app_role));