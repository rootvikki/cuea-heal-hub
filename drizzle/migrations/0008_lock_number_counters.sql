-- Ticket and OPD counters may only be changed by the numbering functions (which run as the table owner).
DROP POLICY IF EXISTS "System can manage counters" ON public.counters;
DROP POLICY IF EXISTS "Staff can read counters" ON public.counters;
CREATE POLICY "Staff can read counters" ON public.counters FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.counters FROM anon, authenticated;
GRANT SELECT ON public.counters TO authenticated;
GRANT ALL ON public.counters TO service_role;
REVOKE EXECUTE ON FUNCTION public.next_opd_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_ticket_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_opd_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_ticket_number() TO authenticated, service_role;