ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS received_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS collected_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES public.staff(id);

UPDATE public.lab_orders
SET completed_at = result_entered_at
WHERE status = 'completed' AND completed_at IS NULL AND result_entered_at IS NOT NULL;

DROP POLICY IF EXISTS "Lab staff can update lab orders" ON public.lab_orders;
CREATE POLICY "Lab staff can update lab orders"
ON public.lab_orders
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'lab_technician')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'lab_technician')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);