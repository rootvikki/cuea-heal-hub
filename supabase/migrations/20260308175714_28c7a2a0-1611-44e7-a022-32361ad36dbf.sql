UPDATE public.profiles
SET full_name = 'Morgan Admin',
    phone = '',
    email = 'morgan@cuea.edu'
WHERE user_id = 'ab223b80-b5d0-4789-a308-32732d6809c9'
  AND (full_name IS NULL OR full_name = '');