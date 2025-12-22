-- Add new roles to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'clinical_officer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'records_officer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'ward_manager';

-- Update profiles table with additional columns for user management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Create email_otp_tokens table for OTP verification
CREATE TABLE IF NOT EXISTS public.email_otp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on email_otp_tokens
ALTER TABLE public.email_otp_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: System can manage OTP tokens (for edge functions)
CREATE POLICY "System can manage OTP tokens"
ON public.email_otp_tokens
FOR ALL
USING (true)
WITH CHECK (true);

-- Create email_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  email_type text NOT NULL,
  subject text,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  reference_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Policy: System can insert email logs
CREATE POLICY "System can insert email logs"
ON public.email_logs
FOR INSERT
WITH CHECK (true);

-- Policy: Admins can view email logs
CREATE POLICY "Admins can view email logs"
ON public.email_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create index for faster OTP lookups
CREATE INDEX IF NOT EXISTS idx_email_otp_tokens_email_expires ON public.email_otp_tokens(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_email_otp_tokens_user_id ON public.email_otp_tokens(user_id);

-- Create index for email logs
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON public.email_logs(email_type);

-- Update handle_new_user function to also store email in profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert profile with email
  INSERT INTO public.profiles (user_id, full_name, phone, country, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'Kenya',
    NEW.email
  );
  
  -- Assign patient role by default if no other role is assigned
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'patient')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Function to update last_login_at
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = now()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;