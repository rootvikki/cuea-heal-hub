CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  reference_id uuid,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Staff create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, read, created_at DESC);

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS received_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS dispensing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS collected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS collected_by uuid REFERENCES public.staff(id);

ALTER TABLE public.prescriptions
  ADD CONSTRAINT prescriptions_status_check
  CHECK (status IN ('sent','received','reviewed','dispensing','dispensed','collected'));

UPDATE public.prescriptions SET status = 'dispensed' WHERE dispensed = true AND status = 'sent';

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.prescriptions REPLICA IDENTITY FULL;
ALTER TABLE public.lab_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescriptions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;