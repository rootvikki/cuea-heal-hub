-- Payments and stock issues are written in one locked step on the server, so two desks
-- (or an M-Pesa confirmation arriving while staff type a code) can never overwrite each other.

-- 1. Record a payment against a bill and update the bill's paid amount, balance and status.
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  _invoice_id uuid, _amount numeric, _method text, _reference text DEFAULT NULL,
  _paid_at timestamptz DEFAULT NULL, _received_by uuid DEFAULT NULL)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices;
  _service boolean := COALESCE(auth.role(), '') = 'service_role';
  _ref text := NULLIF(btrim(COALESCE(_reference, '')), '');
  _paid numeric;
  _bal numeric;
BEGIN
  IF NOT _service AND NOT (public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'cashier')
       OR public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'accountant')
       OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Only the billing desk can record payments';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF inv.status IN ('cancelled', 'refunded') THEN RAISE EXCEPTION 'This bill is %, so it cannot take payments', inv.status; END IF;

  -- The same M-Pesa code can only pay once.
  IF _method = 'mpesa' AND _ref IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.payments WHERE transaction_ref = _ref AND status = 'completed') THEN
      RAISE EXCEPTION 'M-Pesa code % has already been recorded — this payment is already on the system', _ref;
    END IF;
    IF NOT _service AND EXISTS (SELECT 1 FROM public.mpesa_transactions WHERE mpesa_receipt_number = _ref AND status = 'completed') THEN
      RAISE EXCEPTION 'M-Pesa code % has already been recorded — this payment is already on the system', _ref;
    END IF;
  END IF;

  INSERT INTO public.payments (invoice_id, patient_id, amount, payment_method, transaction_ref, status, paid_at, received_by)
  VALUES (_invoice_id, inv.patient_id, _amount, _method::public.payment_method, _ref, 'completed',
          COALESCE(_paid_at, now()), CASE WHEN _service THEN _received_by ELSE auth.uid() END);

  _paid := COALESCE(inv.amount_paid, 0) + _amount;
  _bal := GREATEST(COALESCE(inv.net_amount, 0) - _paid, 0);
  UPDATE public.invoices
     SET amount_paid = _paid, balance = _bal,
         status = CASE WHEN _bal <= 0 THEN 'paid'::public.payment_status ELSE 'partial'::public.payment_status END,
         updated_at = now()
   WHERE id = _invoice_id
   RETURNING * INTO inv;
  RETURN inv;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text, timestamptz, uuid) TO authenticated, service_role;

-- Payment rows are only written through record_invoice_payment (and the M-Pesa functions, which use the service key).
DROP POLICY IF EXISTS "Reception billing desk updates payments" ON public.payments;

-- 2. Take dispensed stock off the shelf without overwriting a count another pharmacist just changed.
CREATE OR REPLACE FUNCTION public.pharmacy_issue_stock(
  _inventory_id uuid, _qty integer, _issued_to text DEFAULT NULL, _unit_price numeric DEFAULT NULL)
RETURNS public.pharmacy_inventory
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _row public.pharmacy_inventory; _staff uuid; _have integer;
BEGIN
  IF NOT (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only pharmacy staff can dispense stock';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Enter the quantity to give'; END IF;

  UPDATE public.pharmacy_inventory
     SET quantity = quantity - _qty, updated_at = now()
   WHERE id = _inventory_id AND quantity >= _qty
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    SELECT quantity INTO _have FROM public.pharmacy_inventory WHERE id = _inventory_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Drug not found in inventory'; END IF;
    RAISE EXCEPTION 'Only % left in stock', COALESCE(_have, 0);
  END IF;

  SELECT id INTO _staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.pharmacy_stock_transactions
    (inventory_id, transaction_date, issued_to, expiry_date, unit_price, qty_received, qty_issued, balance, recorded_by)
  VALUES (_inventory_id, (now() AT TIME ZONE 'Africa/Nairobi')::date, _issued_to, _row.expiry_date,
          COALESCE(_unit_price, _row.unit_price), 0, _qty, _row.quantity, _staff);
  RETURN _row;
END $$;

GRANT EXECUTE ON FUNCTION public.pharmacy_issue_stock(uuid, integer, text, numeric) TO authenticated;
