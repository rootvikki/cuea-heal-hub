UPDATE public.tickets
SET status = 'triage', workflow_stage = 'triage'
WHERE ticket_number = 'T-327016'
  AND status = 'checked_in'
  AND workflow_stage = 'checked_in';

CREATE OR REPLACE FUNCTION public.manage_triage_claim(_ticket_id uuid, _action text)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _staff_id uuid;
  _ticket public.tickets;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'clinical_officer') OR
    public.has_role(auth.uid(), 'doctor') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only authorized clinical staff can manage triage claims';
  END IF;

  SELECT id INTO _staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
  IF _staff_id IS NULL THEN RAISE EXCEPTION 'Your account is not linked to a staff record'; END IF;

  IF _action = 'claim' THEN
    UPDATE public.tickets
    SET assigned_to = _staff_id,
        claimed_at = now(),
        status = 'triage_in_progress',
        workflow_stage = 'triage_in_progress'
    WHERE id = _ticket_id
      AND status IN ('checked_in', 'triage')
      AND workflow_stage IN ('checked_in', 'triage')
      AND assigned_to IS NULL
    RETURNING * INTO _ticket;

    IF _ticket.id IS NULL THEN
      RAISE EXCEPTION 'This patient is no longer awaiting triage or has already been claimed';
    END IF;

    INSERT INTO public.audit_logs (user_id, action, module, details)
    VALUES (auth.uid(), 'TRIAGE_CLAIMED', 'triage', jsonb_build_object('ticket_id', _ticket_id));
  ELSIF _action = 'release' THEN
    UPDATE public.tickets
    SET assigned_to = NULL,
        claimed_at = NULL,
        status = 'triage',
        workflow_stage = 'triage'
    WHERE id = _ticket_id
      AND status = 'triage_in_progress'
      AND workflow_stage = 'triage_in_progress'
      AND (assigned_to = _staff_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
    RETURNING * INTO _ticket;

    IF _ticket.id IS NULL THEN
      RAISE EXCEPTION 'This triage claim cannot be released by your account';
    END IF;

    INSERT INTO public.audit_logs (user_id, action, module, details)
    VALUES (auth.uid(), 'TRIAGE_RELEASED', 'triage', jsonb_build_object('ticket_id', _ticket_id));
  ELSE
    RAISE EXCEPTION 'Unsupported triage claim action';
  END IF;

  RETURN _ticket;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_triage_claim(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_triage_claim(uuid, text) TO authenticated;