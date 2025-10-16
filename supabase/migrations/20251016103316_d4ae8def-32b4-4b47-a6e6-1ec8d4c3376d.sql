-- Allow patients to create appointments for themselves
CREATE POLICY "Patients can create own appointments"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.patients
    WHERE patients.id = appointments.patient_id
    AND patients.user_id = auth.uid()
  )
);