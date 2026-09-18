ALTER TABLE public.encounters ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE public.prescriptions ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE public.lab_orders ALTER COLUMN doctor_id DROP NOT NULL;