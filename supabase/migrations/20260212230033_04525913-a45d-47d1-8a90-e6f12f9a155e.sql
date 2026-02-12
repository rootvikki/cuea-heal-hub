-- Add at_dental to ticket_status enum
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'at_dental' AFTER 'in_consult';