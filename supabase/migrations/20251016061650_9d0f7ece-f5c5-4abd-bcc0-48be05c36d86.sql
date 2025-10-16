-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, full_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_metadata->>'full_name', ''),
    COALESCE(NEW.raw_user_metadata->>'phone', ''),
    'Kenya'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add some initial lab tests to catalog
INSERT INTO lab_tests_catalog (test_name, test_code, description, normal_range, unit, price) VALUES
  ('Complete Blood Count', 'CBC', 'Comprehensive blood test', '4.5-11.0', '10^9/L', 1500.00),
  ('Blood Glucose', 'GLU', 'Fasting blood sugar', '70-100', 'mg/dL', 500.00),
  ('Lipid Profile', 'LIPID', 'Cholesterol and triglycerides', 'Total: <200', 'mg/dL', 2000.00),
  ('Liver Function Test', 'LFT', 'Liver enzymes', 'ALT: 7-56', 'U/L', 1800.00),
  ('Kidney Function Test', 'KFT', 'Creatinine and urea', 'Creat: 0.6-1.2', 'mg/dL', 1500.00),
  ('Urinalysis', 'UA', 'Urine examination', 'pH: 4.5-8.0', '', 800.00),
  ('Malaria Test', 'MALA', 'Blood smear for malaria', 'Negative', '', 600.00),
  ('HIV Test', 'HIV', 'HIV antibody test', 'Negative', '', 1000.00)
ON CONFLICT (test_name) DO NOTHING;