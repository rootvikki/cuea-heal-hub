-- Create a sequence counter table for OPD numbers
CREATE TABLE IF NOT EXISTS public.counters (
  id text PRIMARY KEY,
  current_value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Initialize OPD counter with current max patient count
INSERT INTO public.counters (id, current_value)
SELECT 'opd_number', COALESCE(MAX(
  CASE 
    WHEN patient_id ~ '^OPD-\d{4}-\d+$' 
    THEN CAST(split_part(patient_id, '-', 3) AS bigint) 
    ELSE 0 
  END
), 0)
FROM public.patients
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can manage counters
CREATE POLICY "Service role manages counters"
ON public.counters
FOR ALL
USING (false)
WITH CHECK (false);

-- System-level insert/update for edge functions
CREATE POLICY "System can manage counters"
ON public.counters
FOR ALL
USING (true)
WITH CHECK (true);

-- Create atomic increment function
CREATE OR REPLACE FUNCTION public.next_opd_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
  year_prefix text;
BEGIN
  year_prefix := EXTRACT(YEAR FROM now())::text;
  
  UPDATE public.counters
  SET current_value = current_value + 1
  WHERE id = 'opd_number'
  RETURNING current_value INTO next_val;
  
  IF next_val IS NULL THEN
    INSERT INTO public.counters (id, current_value) VALUES ('opd_number', 1)
    ON CONFLICT (id) DO UPDATE SET current_value = counters.current_value + 1
    RETURNING current_value INTO next_val;
  END IF;
  
  RETURN 'OPD-' || year_prefix || '-' || LPAD(next_val::text, 4, '0');
END;
$$;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_tickets_patient_id ON public.tickets(patient_id);
CREATE INDEX IF NOT EXISTS idx_tickets_workflow_stage ON public.tickets(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_tickets_status_workflow ON public.tickets(status, workflow_stage);
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON public.encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_ticket_id ON public.encounters(ticket_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_encounter_id ON public.lab_orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON public.lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON public.prescriptions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_service_charges_ticket_id ON public.service_charges(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_charges_patient_id ON public.service_charges(patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_encounter_id ON public.imaging_orders(encounter_id);
