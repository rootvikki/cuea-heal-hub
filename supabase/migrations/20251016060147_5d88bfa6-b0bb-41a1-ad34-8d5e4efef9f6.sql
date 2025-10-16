-- Create enum types for user roles
CREATE TYPE app_role AS ENUM ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer', 'patient');

CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');

CREATE TYPE ticket_status AS ENUM (
  'checked_in',
  'triage', 
  'waiting_for_doctor',
  'in_consult',
  'order_placed_lab',
  'order_placed_imaging',
  'at_lab',
  'at_imaging',
  'at_pharmacy',
  'at_billing',
  'checked_out'
);

CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'refunded', 'cancelled');

CREATE TYPE payment_method AS ENUM ('mpesa', 'card', 'cash', 'insurance', 'bank_transfer');

-- User roles table (separate from profiles for security)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Profiles table for additional user information
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Kenya',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients table (extends profiles for medical info)
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  patient_id TEXT UNIQUE NOT NULL, -- e.g., PAT-2025-0001
  insurance_provider TEXT,
  insurance_number TEXT,
  blood_type TEXT,
  allergies TEXT[],
  chronic_conditions TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff table (doctors, nurses, etc.)
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  staff_id TEXT UNIQUE NOT NULL,
  department_id UUID REFERENCES departments(id),
  specialization TEXT,
  license_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) NOT NULL,
  appointment_date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status appointment_status DEFAULT 'scheduled',
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patient tickets (queue management)
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) NOT NULL,
  status ticket_status DEFAULT 'checked_in',
  priority INTEGER DEFAULT 1, -- 1=normal, 2=high, 3=emergency
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clinical encounters (EMR/EHR)
CREATE TABLE encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL NOT NULL,
  department_id UUID REFERENCES departments(id) NOT NULL,
  encounter_date TIMESTAMPTZ DEFAULT NOW(),
  chief_complaint TEXT,
  subjective TEXT, -- S in SOAP
  objective TEXT, -- O in SOAP
  assessment TEXT, -- A in SOAP
  plan TEXT, -- P in SOAP
  diagnosis TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vitals
CREATE TABLE vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  temperature DECIMAL(4,1), -- Celsius
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  pulse_rate INTEGER,
  respiratory_rate INTEGER,
  oxygen_saturation DECIMAL(5,2),
  weight DECIMAL(5,2), -- kg
  height DECIMAL(5,2), -- cm
  bmi DECIMAL(4,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prescriptions
CREATE TABLE prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  instructions TEXT,
  dispensed BOOLEAN DEFAULT FALSE,
  dispensed_at TIMESTAMPTZ,
  dispensed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pharmacy inventory
CREATE TABLE pharmacy_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name TEXT NOT NULL,
  generic_name TEXT,
  batch_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2) NOT NULL,
  expiry_date DATE,
  reorder_level INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lab tests catalog
CREATE TABLE lab_tests_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL UNIQUE,
  test_code TEXT UNIQUE,
  description TEXT,
  normal_range TEXT,
  unit TEXT,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lab orders
CREATE TABLE lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID REFERENCES encounters(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL NOT NULL,
  test_id UUID REFERENCES lab_tests_catalog(id) NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, collected, in_progress, completed
  sample_collected_at TIMESTAMPTZ,
  result_value TEXT,
  result_notes TEXT,
  result_entered_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  result_entered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  status payment_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL,
  transaction_ref TEXT, -- MPesa code, card ref, etc.
  status TEXT DEFAULT 'pending', -- pending, completed, failed
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_tests_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id;
$$;

-- RLS Policies

-- Profiles: users can view their own, staff can view all
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Patients: can view own data, staff can view all
CREATE POLICY "Patients can view own data"
  ON patients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all patients"
  ON patients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer')
    )
  );

CREATE POLICY "Receptionist can insert patients"
  ON patients FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'receptionist') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Receptionist can update patients"
  ON patients FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'receptionist') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Departments: readable by all authenticated users
CREATE POLICY "Authenticated users can view departments"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage departments"
  ON departments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Appointments: patients see own, staff see all
CREATE POLICY "Patients can view own appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients 
      WHERE patients.id = appointments.patient_id 
      AND patients.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view all appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'doctor', 'nurse', 'receptionist')
    )
  );

CREATE POLICY "Receptionist can manage appointments"
  ON appointments FOR ALL
  USING (
    public.has_role(auth.uid(), 'receptionist') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Tickets: similar to appointments
CREATE POLICY "Staff can view all tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'doctor', 'nurse', 'receptionist', 'lab_technician', 'pharmacist', 'finance_officer')
    )
  );

CREATE POLICY "Staff can manage tickets"
  ON tickets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'doctor', 'nurse', 'receptionist')
    )
  );

-- Encounters: doctors can create/view, patients can view own
CREATE POLICY "Doctors can manage encounters"
  ON encounters FOR ALL
  USING (
    public.has_role(auth.uid(), 'doctor') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Patients can view own encounters"
  ON encounters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients 
      WHERE patients.id = encounters.patient_id 
      AND patients.user_id = auth.uid()
    )
  );

-- Vitals: nurses can record, doctors/patients can view
CREATE POLICY "Nurses can manage vitals"
  ON vitals FOR ALL
  USING (
    public.has_role(auth.uid(), 'nurse') OR 
    public.has_role(auth.uid(), 'doctor') OR
    public.has_role(auth.uid(), 'admin')
  );

-- Prescriptions
CREATE POLICY "Doctors can manage prescriptions"
  ON prescriptions FOR ALL
  USING (
    public.has_role(auth.uid(), 'doctor') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Pharmacists can view and dispense prescriptions"
  ON prescriptions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'pharmacist') OR
    public.has_role(auth.uid(), 'doctor') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Pharmacists can update prescriptions"
  ON prescriptions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'pharmacist') OR
    public.has_role(auth.uid(), 'admin')
  );

-- Pharmacy inventory
CREATE POLICY "Staff can view pharmacy inventory"
  ON pharmacy_inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'pharmacist', 'doctor')
    )
  );

CREATE POLICY "Pharmacists can manage inventory"
  ON pharmacy_inventory FOR ALL
  USING (
    public.has_role(auth.uid(), 'pharmacist') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Lab tests catalog: readable by clinical staff
CREATE POLICY "Staff can view lab tests catalog"
  ON lab_tests_catalog FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'doctor', 'lab_technician')
    )
  );

CREATE POLICY "Admin can manage lab tests catalog"
  ON lab_tests_catalog FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Lab orders
CREATE POLICY "Doctors can create lab orders"
  ON lab_orders FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'doctor') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clinical staff can view lab orders"
  ON lab_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'doctor', 'lab_technician')
    )
  );

CREATE POLICY "Lab technicians can update lab orders"
  ON lab_orders FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'lab_technician') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Invoices
CREATE POLICY "Finance can manage invoices"
  ON invoices FOR ALL
  USING (
    public.has_role(auth.uid(), 'finance_officer') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Patients can view own invoices"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients 
      WHERE patients.id = invoices.patient_id 
      AND patients.user_id = auth.uid()
    )
  );

-- Invoice items
CREATE POLICY "Finance can manage invoice items"
  ON invoice_items FOR ALL
  USING (
    public.has_role(auth.uid(), 'finance_officer') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Payments
CREATE POLICY "Finance can manage payments"
  ON payments FOR ALL
  USING (
    public.has_role(auth.uid(), 'finance_officer') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Patients can view own payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patients 
      WHERE patients.id = payments.patient_id 
      AND patients.user_id = auth.uid()
    )
  );

-- User roles policies
CREATE POLICY "Admin can manage user roles"
  ON user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Staff table policies
CREATE POLICY "Staff can view own record"
  ON staff FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "All staff can view other staff"
  ON staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admin can manage staff"
  ON staff FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encounters_updated_at
    BEFORE UPDATE ON encounters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pharmacy_inventory_updated_at
    BEFORE UPDATE ON pharmacy_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some initial departments
INSERT INTO departments (name, description) VALUES
  ('General Medicine', 'General medical consultations and check-ups'),
  ('Pediatrics', 'Medical care for children and adolescents'),
  ('Dental', 'Dental care and oral health services'),
  ('Laboratory', 'Medical laboratory testing and diagnostics'),
  ('Pharmacy', 'Medication dispensing and pharmaceutical services'),
  ('Imaging', 'Radiology and medical imaging services')
ON CONFLICT DO NOTHING;