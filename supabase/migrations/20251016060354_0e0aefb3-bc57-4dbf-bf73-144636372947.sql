-- Fix search path for existing functions
ALTER FUNCTION public.has_role(_user_id UUID, _role app_role) SET search_path = public;
ALTER FUNCTION public.get_user_roles(_user_id UUID) SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;