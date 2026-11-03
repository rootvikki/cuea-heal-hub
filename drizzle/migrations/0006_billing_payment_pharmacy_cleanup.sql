-- 1. Payment modes: mpesa / school_fees / payroll / insurance
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'payroll';

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_payment_mode_check;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_preferred_payment_mode_check;

UPDATE public.tickets t SET payment_mode = CASE WHEN p.patient_type = 'cuea_student' THEN 'school_fees' ELSE 'mpesa' END
FROM public.patients p WHERE p.id = t.patient_id AND t.payment_mode = 'mpesa_school_fees';
UPDATE public.tickets SET payment_mode = 'mpesa' WHERE payment_mode IS NULL OR payment_mode NOT IN ('mpesa','school_fees','payroll','insurance');

UPDATE public.patients SET preferred_payment_mode = CASE WHEN patient_type = 'cuea_student' THEN 'school_fees' ELSE 'mpesa' END
WHERE preferred_payment_mode = 'mpesa_school_fees';
UPDATE public.patients SET preferred_payment_mode = 'mpesa' WHERE preferred_payment_mode IS NULL OR preferred_payment_mode NOT IN ('mpesa','school_fees','payroll','insurance');

ALTER TABLE public.tickets ALTER COLUMN payment_mode SET DEFAULT 'mpesa';
ALTER TABLE public.patients ALTER COLUMN preferred_payment_mode SET DEFAULT 'mpesa';
ALTER TABLE public.tickets ADD CONSTRAINT tickets_payment_mode_check CHECK (payment_mode IN ('mpesa','school_fees','payroll','insurance'));
ALTER TABLE public.patients ADD CONSTRAINT patients_preferred_payment_mode_check CHECK (preferred_payment_mode IN ('mpesa','school_fees','payroll','insurance'));

-- 2. Gender stored only as 'Male' / 'Female'
CREATE OR REPLACE FUNCTION public.normalize_profile_gender()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.gender IS NOT NULL THEN
    IF lower(btrim(NEW.gender)) IN ('male','m') THEN NEW.gender := 'Male';
    ELSIF lower(btrim(NEW.gender)) IN ('female','f') THEN NEW.gender := 'Female';
    ELSIF btrim(NEW.gender) = '' THEN NEW.gender := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS normalize_profile_gender ON public.profiles;
CREATE TRIGGER normalize_profile_gender BEFORE INSERT OR UPDATE OF gender ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_gender();
UPDATE public.profiles SET gender = 'Male' WHERE gender IS NOT NULL AND lower(btrim(gender)) IN ('male','m') AND gender <> 'Male';
UPDATE public.profiles SET gender = 'Female' WHERE gender IS NOT NULL AND lower(btrim(gender)) IN ('female','f') AND gender <> 'Female';

-- 3. Reception is the billing desk
CREATE POLICY "Reception billing desk reads invoices" ON public.invoices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk creates invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk updates invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk reads invoice items" ON public.invoice_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk adds invoice items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk reads payments" ON public.payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk records payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk updates payments" ON public.payments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role));
CREATE POLICY "Reception billing desk reads charges" ON public.service_charges FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role));
CREATE POLICY "Reception billing desk adds charges" ON public.service_charges FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role));
CREATE POLICY "Reception billing desk updates charges" ON public.service_charges FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'receptionist'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'receptionist'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role));

-- 4. Pharmacy owns drug prices and stock; finance reads only
DROP POLICY IF EXISTS "Pharmacists update inventory" ON public.pharmacy_inventory;
CREATE POLICY "Pharmacists update inventory" ON public.pharmacy_inventory FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'pharmacist'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'pharmacist'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Finance reads pharmacy inventory" ON public.pharmacy_inventory FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'finance_officer'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role) OR public.has_role(auth.uid(), 'accountant'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Finance reads stock transactions" ON public.pharmacy_stock_transactions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'finance_officer'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role) OR public.has_role(auth.uid(), 'accountant'::app_role));

CREATE OR REPLACE FUNCTION public.guard_inventory_price()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF (NEW.unit_price IS DISTINCT FROM OLD.unit_price OR NEW.insurance_price IS DISTINCT FROM OLD.insurance_price)
     AND auth.uid() IS NOT NULL
     AND NOT (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only pharmacy or admin staff can change drug prices';
  END IF;
  RETURN NEW;
END $function$;