-- Allow users to insert their own patient record during registration
CREATE POLICY "Users can insert own patient record"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);