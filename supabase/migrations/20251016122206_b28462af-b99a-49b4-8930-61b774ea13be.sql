-- Add assigned_to column to tickets table (if not exists)
-- This allows assigning tickets to specific staff members

-- Add ticket_comments table for stage-specific comments
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stage TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on ticket_comments
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- Staff can view all comments
CREATE POLICY "Staff can view all comments"
ON public.ticket_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer', 'super_admin')
  )
);

-- Staff can create comments
CREATE POLICY "Staff can create comments"
ON public.ticket_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer', 'super_admin')
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_ticket_comments_updated_at
BEFORE UPDATE ON public.ticket_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();