CREATE POLICY "Reception can update patient profiles" ON public.profiles FOR UPDATE TO authenticated
USING ((has_role(auth.uid(),'receptionist') OR has_role(auth.uid(),'records_officer') OR has_role(auth.uid(),'super_admin'))
  AND EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id = profiles.user_id))
WITH CHECK ((has_role(auth.uid(),'receptionist') OR has_role(auth.uid(),'records_officer') OR has_role(auth.uid(),'super_admin'))
  AND EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id = profiles.user_id));
CREATE POLICY "Super admin and records can update patients" ON public.patients FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'records_officer'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'records_officer'));