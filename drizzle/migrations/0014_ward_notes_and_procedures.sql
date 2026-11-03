ALTER TABLE public.nursing_procedures ADD COLUMN IF NOT EXISTS admission_id uuid REFERENCES public.admissions(id);
CREATE INDEX IF NOT EXISTS nursing_procedures_admission_idx ON public.nursing_procedures(admission_id, created_at);
CREATE INDEX IF NOT EXISTS nursing_notes_admission_idx ON public.nursing_notes(admission_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.nursing_notes TO authenticated;
GRANT ALL ON public.nursing_notes TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.nursing_procedures TO authenticated;
GRANT ALL ON public.nursing_procedures TO service_role;

CREATE POLICY "Ward staff manage nursing notes" ON public.nursing_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ward_manager'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'ward_manager'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role));

CREATE POLICY "Ward staff view nursing procedures" ON public.nursing_procedures
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ward_manager'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role));

CREATE POLICY "Ward staff record nursing procedures" ON public.nursing_procedures
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ward_manager'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role));

CREATE POLICY "Ward staff view admissions" ON public.admissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ward_manager'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role));

CREATE POLICY "Ward staff add ward charges" ON public.service_charges
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ward_manager'::app_role) OR public.has_role(auth.uid(), 'clinical_officer'::app_role));