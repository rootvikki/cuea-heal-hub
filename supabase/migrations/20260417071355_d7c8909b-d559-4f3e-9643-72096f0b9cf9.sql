INSERT INTO public.system_settings (key, value)
VALUES ('mpesa_environment', 'production')
ON CONFLICT (key) DO UPDATE SET value = 'production', updated_at = now();

UPDATE public.system_settings SET value = NULL
WHERE key IN ('mpesa_consumer_key', 'mpesa_consumer_secret', 'mpesa_shortcode', 'mpesa_passkey')
AND (value IS NULL OR value = '');