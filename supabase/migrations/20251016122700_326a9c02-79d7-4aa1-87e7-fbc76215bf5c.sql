-- Fix RLS policies across all tables to allow proper operations

-- INVOICES: Allow finance and admin to create/manage invoices
DROP POLICY IF EXISTS "Finance can manage invoices" ON public.invoices;

CREATE POLICY "Finance can manage invoices"
ON public.invoices
FOR ALL
USING (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- INVOICE ITEMS: Allow finance and admin to manage
DROP POLICY IF EXISTS "Finance can manage invoice items" ON public.invoice_items;

CREATE POLICY "Finance can manage invoice items"
ON public.invoice_items
FOR ALL
USING (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- PAYMENTS: Allow finance and admin to manage
DROP POLICY IF EXISTS "Finance can manage payments" ON public.payments;

CREATE POLICY "Finance can manage payments"
ON public.payments
FOR ALL
USING (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- ENCOUNTERS: Allow doctors and admin to manage
DROP POLICY IF EXISTS "Doctors can manage encounters" ON public.encounters;

CREATE POLICY "Doctors can manage encounters"
ON public.encounters
FOR ALL
USING (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- PRESCRIPTIONS: Allow doctors to create, pharmacists to update
DROP POLICY IF EXISTS "Doctors can manage prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Pharmacists can update prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Pharmacists can view and dispense prescriptions" ON public.prescriptions;

CREATE POLICY "Doctors can create prescriptions"
ON public.prescriptions
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Doctors can view prescriptions"
ON public.prescriptions
FOR SELECT
USING (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Staff can update prescriptions"
ON public.prescriptions
FOR UPDATE
USING (
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- LAB ORDERS: Allow doctors to create, lab techs to update
DROP POLICY IF EXISTS "Doctors can create lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Lab technicians can update lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Clinical staff can view lab orders" ON public.lab_orders;

CREATE POLICY "Doctors can create lab orders"
ON public.lab_orders
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Staff can view lab orders"
ON public.lab_orders
FOR SELECT
USING (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'lab_technician') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Lab staff can update lab orders"
ON public.lab_orders
FOR UPDATE
USING (
  has_role(auth.uid(), 'lab_technician') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'lab_technician') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- VITALS: Allow nurses and doctors to manage
DROP POLICY IF EXISTS "Nurses can manage vitals" ON public.vitals;

CREATE POLICY "Nurses can manage vitals"
ON public.vitals
FOR ALL
USING (
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- APPOINTMENTS: Fix policies to allow staff to create/manage
DROP POLICY IF EXISTS "Medical staff can create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Receptionist and admin can manage appointments" ON public.appointments;

CREATE POLICY "Staff can view all appointments"
ON public.appointments
FOR SELECT
USING (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Staff can manage appointments"
ON public.appointments
FOR ALL
USING (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- TICKETS: Allow staff to update tickets
DROP POLICY IF EXISTS "Staff can manage tickets" ON public.tickets;

CREATE POLICY "Staff can manage tickets"
ON public.tickets
FOR ALL
USING (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'lab_technician') OR 
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'lab_technician') OR 
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- DEPARTMENTS: Allow admin to manage
DROP POLICY IF EXISTS "Admin can manage departments" ON public.departments;

CREATE POLICY "Admin can manage departments"
ON public.departments
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- PHARMACY INVENTORY: Allow pharmacists to manage
DROP POLICY IF EXISTS "Pharmacists can manage inventory" ON public.pharmacy_inventory;

CREATE POLICY "Pharmacists can manage inventory"
ON public.pharmacy_inventory
FOR ALL
USING (
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'pharmacist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- LAB TESTS CATALOG: Allow admin to manage
DROP POLICY IF EXISTS "Admin can manage lab tests catalog" ON public.lab_tests_catalog;

CREATE POLICY "Admin can manage lab tests catalog"
ON public.lab_tests_catalog
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- STAFF: Allow admin to manage
DROP POLICY IF EXISTS "Admin can manage staff" ON public.staff;

CREATE POLICY "Admin can manage staff"
ON public.staff
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);