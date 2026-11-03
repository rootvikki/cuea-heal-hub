-- Everyone signed in may read the "clear cache" version so their browser knows when to clear itself.
DROP POLICY IF EXISTS "Staff read shared settings" ON public.system_settings;
CREATE POLICY "Staff read shared settings" ON public.system_settings
  FOR SELECT TO authenticated
  USING (key = ANY (ARRAY['live_updates'::text, 'ticket_prefix'::text, 'cache_version'::text]));