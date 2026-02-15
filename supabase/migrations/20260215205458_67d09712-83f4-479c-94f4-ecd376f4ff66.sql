
-- 1. DROP patient encounters SELECT policy (patients should NOT see diagnoses/sicknesses)
DROP POLICY IF EXISTS "Patients can view own encounters" ON public.encounters;

-- 2. Add clinical_officer to encounters ALL policy
DROP POLICY IF EXISTS "Doctors can manage encounters" ON public.encounters;
CREATE POLICY "Doctors can manage encounters" ON public.encounters
FOR ALL
USING (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Drop the now-redundant separate SELECT policy since ALL covers it
DROP POLICY IF EXISTS "Doctors can view encounters" ON public.encounters;

-- 3. Add radiologist and cashier to tickets policies
DROP POLICY IF EXISTS "Staff can manage tickets" ON public.tickets;
CREATE POLICY "Staff can manage tickets" ON public.tickets
FOR ALL
USING (
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR
  has_role(auth.uid(), 'lab_technician'::app_role) OR 
  has_role(auth.uid(), 'pharmacist'::app_role) OR 
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'radiologist'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  has_role(auth.uid(), 'nurse'::app_role) OR 
  has_role(auth.uid(), 'doctor'::app_role) OR 
  has_role(auth.uid(), 'clinical_officer'::app_role) OR
  has_role(auth.uid(), 'lab_technician'::app_role) OR 
  has_role(auth.uid(), 'pharmacist'::app_role) OR 
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'radiologist'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Staff can view all tickets" ON public.tickets;
CREATE POLICY "Staff can view all tickets" ON public.tickets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = ANY (ARRAY[
      'admin'::app_role, 'doctor'::app_role, 'clinical_officer'::app_role, 
      'nurse'::app_role, 'receptionist'::app_role, 'lab_technician'::app_role, 
      'pharmacist'::app_role, 'finance_officer'::app_role, 
      'radiologist'::app_role, 'cashier'::app_role, 'super_admin'::app_role
    ])
  )
);

-- 4. Add patient SELECT policy on prescriptions (own records only - medication info, no clinical notes)
CREATE POLICY "Patients can view own prescriptions" ON public.prescriptions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM patients
    WHERE patients.id = prescriptions.patient_id
    AND patients.user_id = auth.uid()
  )
);

-- 5. Add patient SELECT policy on lab_orders (own records only)
CREATE POLICY "Patients can view own lab orders" ON public.lab_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM patients
    WHERE patients.id = lab_orders.patient_id
    AND patients.user_id = auth.uid()
  )
);

-- 6. Add cashier to invoices and payments policies
DROP POLICY IF EXISTS "Finance can manage invoices" ON public.invoices;
CREATE POLICY "Finance can manage invoices" ON public.invoices
FOR ALL
USING (
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Finance can manage payments" ON public.payments;
CREATE POLICY "Finance can manage payments" ON public.payments
FOR ALL
USING (
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Also add cashier to invoice_items
DROP POLICY IF EXISTS "Finance can manage invoice items" ON public.invoice_items;
CREATE POLICY "Finance can manage invoice items" ON public.invoice_items
FOR ALL
USING (
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'finance_officer'::app_role) OR 
  has_role(auth.uid(), 'cashier'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_admin'::app_role)
);
