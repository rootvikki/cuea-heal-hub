
-- Create system_settings table for non-secret configuration
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admin/super_admin can read/write
CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Seed default M-Pesa environment
INSERT INTO public.system_settings (key, value) VALUES
  ('mpesa_environment', 'sandbox'),
  ('mpesa_consumer_key', ''),
  ('mpesa_consumer_secret', ''),
  ('mpesa_shortcode', ''),
  ('mpesa_passkey', '');
