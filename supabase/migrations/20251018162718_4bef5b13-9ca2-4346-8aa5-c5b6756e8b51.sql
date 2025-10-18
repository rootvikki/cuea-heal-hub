-- Add SMS notification tracking table
CREATE TABLE public.sms_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  notification_type TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add M-Pesa transaction tracking table
CREATE TABLE public.mpesa_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_request_id TEXT,
  checkout_request_id TEXT,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  mpesa_receipt_number TEXT,
  transaction_date TIMESTAMP WITH TIME ZONE,
  invoice_id UUID REFERENCES public.invoices(id),
  status TEXT NOT NULL DEFAULT 'pending',
  result_code TEXT,
  result_desc TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add critical alerts table
CREATE TABLE public.critical_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  patient_id UUID REFERENCES public.patients(id),
  reference_id UUID,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add appointment reminders table
CREATE TABLE public.appointment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id),
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for SMS notifications
CREATE POLICY "Staff can view SMS notifications"
ON public.sms_notifications FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin') OR 
  has_role(auth.uid(), 'receptionist')
);

CREATE POLICY "System can insert SMS notifications"
ON public.sms_notifications FOR INSERT
WITH CHECK (true);

-- RLS Policies for M-Pesa transactions
CREATE POLICY "Finance can view M-Pesa transactions"
ON public.mpesa_transactions FOR SELECT
USING (
  has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "System can manage M-Pesa transactions"
ON public.mpesa_transactions FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for critical alerts
CREATE POLICY "Staff can view critical alerts"
ON public.critical_alerts FOR SELECT
USING (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'lab_technician')
);

CREATE POLICY "Staff can create critical alerts"
ON public.critical_alerts FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'lab_technician') OR
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Staff can acknowledge alerts"
ON public.critical_alerts FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- RLS Policies for appointment reminders
CREATE POLICY "Staff can manage appointment reminders"
ON public.appointment_reminders FOR ALL
USING (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  has_role(auth.uid(), 'receptionist') OR 
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'super_admin')
);

-- Create trigger for M-Pesa transactions updated_at
CREATE TRIGGER update_mpesa_transactions_updated_at
BEFORE UPDATE ON public.mpesa_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_sms_notifications_status ON public.sms_notifications(status);
CREATE INDEX idx_mpesa_transactions_status ON public.mpesa_transactions(status);
CREATE INDEX idx_critical_alerts_severity ON public.critical_alerts(severity);
CREATE INDEX idx_critical_alerts_acknowledged ON public.critical_alerts(acknowledged);
CREATE INDEX idx_appointment_reminders_sent ON public.appointment_reminders(sent);