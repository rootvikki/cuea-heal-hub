-- Daily ticket numbering (restarts at 00001 each Nairobi day)
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS queue_date date;
UPDATE public.tickets SET queue_date = (COALESCE(checked_in_at, created_at, now()) AT TIME ZONE 'Africa/Nairobi')::date WHERE queue_date IS NULL;
ALTER TABLE public.tickets ALTER COLUMN queue_date SET DEFAULT ((now() AT TIME ZONE 'Africa/Nairobi')::date);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_queue_date_ticket_number_key ON public.tickets (queue_date, ticket_number);
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_ticket_number_key;
COMMENT ON COLUMN public.tickets.queue_date IS 'Nairobi calendar day of the visit; ticket numbers are unique per day';

-- Closes triage visits left open from previous days (internal helper)
CREATE OR REPLACE FUNCTION public.close_previous_day_triage()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.tickets
     SET status = 'checked_out', workflow_stage = 'checked_out', checked_out_at = now(),
         assigned_to = NULL, claimed_at = NULL, updated_at = now()
   WHERE status::text IN ('checked_in','triage','triage_in_progress')
     AND COALESCE(queue_date, (COALESCE(checked_in_at, created_at) AT TIME ZONE 'Africa/Nairobi')::date) < (now() AT TIME ZONE 'Africa/Nairobi')::date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_previous_day_triage() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_ticket_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  n bigint;
  pfx text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  INSERT INTO public.counters (id, current_value) VALUES ('ticket_' || to_char(d, 'YYYYMMDD'), 1)
  ON CONFLICT (id) DO UPDATE SET current_value = public.counters.current_value + 1
  RETURNING current_value INTO n;
  -- First ticket of the day: clear triage left over from previous days
  IF n = 1 THEN PERFORM public.close_previous_day_triage(); END IF;
  SELECT value INTO pfx FROM public.system_settings WHERE key = 'ticket_prefix';
  RETURN COALESCE(pfx, 'T-') || lpad(n::text, 5, '0');
END $$;
REVOKE ALL ON FUNCTION public.next_ticket_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_ticket_number() TO authenticated;

-- Manual "Clear old triage": closes previous-day triage, and returns patients
-- stuck "On triage" longer than _stuck_minutes to Awaiting Triage.
CREATE OR REPLACE FUNCTION public.clear_old_triage(_stuck_minutes integer DEFAULT 120)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE closed integer; released integer;
BEGIN
  IF NOT (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'clinical_officer') OR has_role(auth.uid(),'doctor')
          OR has_role(auth.uid(),'receptionist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Not allowed to clear the triage queue';
  END IF;
  closed := public.close_previous_day_triage();
  UPDATE public.tickets
     SET status = 'triage', workflow_stage = 'triage', assigned_to = NULL, claimed_at = NULL, updated_at = now()
   WHERE status::text = 'triage_in_progress'
     AND COALESCE(claimed_at, updated_at, created_at) < now() - make_interval(mins => GREATEST(_stuck_minutes, 15));
  GET DIAGNOSTICS released = ROW_COUNT;
  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'triage_queue_cleared', 'triage', jsonb_build_object('closed_previous_days', closed, 'released_stuck', released, 'stuck_minutes', _stuck_minutes));
  RETURN jsonb_build_object('closed', closed, 'released', released);
END $$;
REVOKE ALL ON FUNCTION public.clear_old_triage(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_old_triage(integer) TO authenticated;

-- Non-secret settings every signed-in user may read
CREATE POLICY "Staff read shared settings" ON public.system_settings FOR SELECT TO authenticated
USING (key IN ('live_updates', 'ticket_prefix'));

-- Live updates for inventory, billing and orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_stock_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_replenishment_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.procedure_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;