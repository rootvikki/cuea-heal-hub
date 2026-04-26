
CREATE TABLE IF NOT EXISTS public.suspicious_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  detected_domain TEXT,
  signup_metadata JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suspicious_signups_status ON public.suspicious_signups(status);
CREATE INDEX IF NOT EXISTS idx_suspicious_signups_email ON public.suspicious_signups(email);

ALTER TABLE public.suspicious_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view suspicious signups"
ON public.suspicious_signups
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance_officer'::app_role));

CREATE POLICY "Admins can update suspicious signups"
ON public.suspicious_signups
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "System can insert suspicious signups"
ON public.suspicious_signups
FOR INSERT
TO public
WITH CHECK (true);

CREATE TRIGGER update_suspicious_signups_updated_at
BEFORE UPDATE ON public.suspicious_signups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
