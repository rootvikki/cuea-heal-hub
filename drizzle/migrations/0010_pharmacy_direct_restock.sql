-- Pharmacy receives stock directly (no approval) and stock-count changes are recorded on the stock card.
CREATE OR REPLACE FUNCTION public.pharmacy_receive_stock(
  _inventory_id uuid, _qty integer, _received_from text DEFAULT NULL, _invoice_ref text DEFAULT NULL,
  _batch text DEFAULT NULL, _expiry date DEFAULT NULL, _request_id uuid DEFAULT NULL)
RETURNS public.pharmacy_inventory
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _row public.pharmacy_inventory; _staff uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only pharmacy staff can receive stock';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Enter the quantity received'; END IF;
  SELECT id INTO _staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.pharmacy_inventory
     SET quantity = quantity + _qty,
         batch_number = COALESCE(NULLIF(btrim(_batch), ''), batch_number),
         expiry_date = COALESCE(_expiry, expiry_date),
         updated_at = now()
   WHERE id = _inventory_id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Drug not found in inventory'; END IF;

  INSERT INTO public.pharmacy_stock_transactions
    (inventory_id, transaction_date, received_from, invoice_ref, expiry_date, unit_price, qty_received, qty_issued, balance, recorded_by)
  VALUES (_inventory_id, (now() AT TIME ZONE 'Africa/Nairobi')::date, COALESCE(NULLIF(btrim(_received_from), ''), 'Stock received'),
          NULLIF(btrim(_invoice_ref), ''), _row.expiry_date, _row.unit_price, _qty, 0, _row.quantity, _staff);

  IF _request_id IS NOT NULL THEN
    UPDATE public.pharmacy_replenishment_requests
       SET status = 'received', received_at = now(), received_qty = _qty, updated_at = now()
     WHERE id = _request_id AND status NOT IN ('received', 'cancelled');
  END IF;

  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'stock_received', 'pharmacy', jsonb_build_object(
    'inventory_id', _inventory_id, 'drug', _row.drug_name, 'qty', _qty, 'balance', _row.quantity,
    'received_from', _received_from, 'invoice_ref', _invoice_ref, 'batch', _batch, 'request_id', _request_id));
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.pharmacy_set_stock(_inventory_id uuid, _new_qty integer, _reason text DEFAULT NULL)
RETURNS public.pharmacy_inventory
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _old integer; _row public.pharmacy_inventory; _staff uuid; _diff integer; _label text;
BEGIN
  IF NOT (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only pharmacy staff can change stock levels';
  END IF;
  IF _new_qty IS NULL OR _new_qty < 0 THEN RAISE EXCEPTION 'Stock level cannot be negative'; END IF;
  SELECT quantity INTO _old FROM public.pharmacy_inventory WHERE id = _inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Drug not found in inventory'; END IF;
  _diff := _new_qty - COALESCE(_old, 0);
  IF _diff = 0 THEN SELECT * INTO _row FROM public.pharmacy_inventory WHERE id = _inventory_id; RETURN _row; END IF;
  SELECT id INTO _staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  UPDATE public.pharmacy_inventory SET quantity = _new_qty, updated_at = now() WHERE id = _inventory_id RETURNING * INTO _row;
  _label := 'Stock count adjustment' || COALESCE(': ' || NULLIF(btrim(_reason), ''), '');
  INSERT INTO public.pharmacy_stock_transactions
    (inventory_id, transaction_date, received_from, issued_to, expiry_date, unit_price, qty_received, qty_issued, balance, recorded_by)
  VALUES (_inventory_id, (now() AT TIME ZONE 'Africa/Nairobi')::date,
          CASE WHEN _diff > 0 THEN _label END, CASE WHEN _diff < 0 THEN _label END,
          _row.expiry_date, _row.unit_price, GREATEST(_diff, 0), GREATEST(-_diff, 0), _new_qty, _staff);

  INSERT INTO public.audit_logs (user_id, action, module, details)
  VALUES (auth.uid(), 'stock_adjusted', 'pharmacy', jsonb_build_object(
    'inventory_id', _inventory_id, 'drug', _row.drug_name, 'from', _old, 'to', _new_qty, 'reason', _reason));
  RETURN _row;
END $$;

GRANT EXECUTE ON FUNCTION public.pharmacy_receive_stock(uuid, integer, text, text, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_set_stock(uuid, integer, text) TO authenticated;