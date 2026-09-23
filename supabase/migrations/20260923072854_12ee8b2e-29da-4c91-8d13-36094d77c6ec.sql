-- 1. Backfill staff records for clinical users missing one
INSERT INTO public.staff (user_id, staff_id, department_id)
SELECT DISTINCT ur.user_id,
       'STF-' || UPPER(SUBSTRING(REPLACE(ur.user_id::text, '-', ''), 1, 6)),
       (SELECT id FROM public.departments WHERE name = 'General Medicine' LIMIT 1)
FROM public.user_roles ur
WHERE ur.role IN ('doctor','clinical_officer','nurse','lab_technician','pharmacist','radiologist','admin','super_admin','ward_manager','records_officer')
  AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = ur.user_id);

-- 2. Allow clinical officers to place lab orders
DROP POLICY IF EXISTS "Doctors can create lab orders" ON public.lab_orders;
CREATE POLICY "Doctors can create lab orders"
ON public.lab_orders FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'doctor') OR
  has_role(auth.uid(), 'clinical_officer') OR
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'super_admin')
);

DROP POLICY IF EXISTS "Staff can view lab orders" ON public.lab_orders;
CREATE POLICY "Staff can view lab orders"
ON public.lab_orders FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'doctor') OR
  has_role(auth.uid(), 'clinical_officer') OR
  has_role(auth.uid(), 'nurse') OR
  has_role(auth.uid(), 'lab_technician') OR
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'super_admin')
);