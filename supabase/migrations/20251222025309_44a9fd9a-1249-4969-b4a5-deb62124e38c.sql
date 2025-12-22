-- =====================================================
-- PHASE 1: IMAGING/RADIOLOGY MODULE
-- =====================================================

-- Imaging catalog (X-Ray, Ultrasound, CT, MRI, etc.)
CREATE TABLE public.imaging_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modality TEXT NOT NULL, -- X-Ray, Ultrasound, CT, MRI, etc.
  name TEXT NOT NULL,
  description TEXT,
  body_part TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  preparation_instructions TEXT,
  turnaround_hours INTEGER DEFAULT 24,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Imaging orders
CREATE TABLE public.imaging_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  imaging_id UUID NOT NULL REFERENCES public.imaging_catalog(id),
  ordered_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, scheduled, in_progress, completed, cancelled
  priority TEXT DEFAULT 'routine', -- stat, urgent, routine
  clinical_indication TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  performed_by UUID,
  performed_at TIMESTAMP WITH TIME ZONE,
  images_url TEXT[], -- Array of storage URLs
  findings TEXT,
  impression TEXT,
  reported_by UUID,
  reported_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on imaging tables
ALTER TABLE public.imaging_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imaging_orders ENABLE ROW LEVEL SECURITY;

-- Imaging catalog policies
CREATE POLICY "Staff can view imaging catalog" ON public.imaging_catalog
FOR SELECT USING (EXISTS (
  SELECT 1 FROM user_roles WHERE user_id = auth.uid()
));

CREATE POLICY "Admin can manage imaging catalog" ON public.imaging_catalog
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- Imaging orders policies
CREATE POLICY "Doctors can create imaging orders" ON public.imaging_orders
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Staff can view imaging orders" ON public.imaging_orders
FOR SELECT USING (
  has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'radiologist') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Radiologists can update imaging orders" ON public.imaging_orders
FOR UPDATE USING (
  has_role(auth.uid(), 'radiologist') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'radiologist') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- =====================================================
-- PHASE 2: INPATIENT/ADT MODULE
-- =====================================================

-- Wards
CREATE TABLE public.wards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  ward_type TEXT NOT NULL DEFAULT 'general', -- general, icu, maternity, pediatric, surgical, private
  total_beds INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  floor_number INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Beds
CREATE TABLE public.beds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ward_id UUID NOT NULL REFERENCES public.wards(id),
  bed_number TEXT NOT NULL,
  bed_type TEXT DEFAULT 'standard', -- standard, electric, icu, crib
  status TEXT NOT NULL DEFAULT 'available', -- available, occupied, maintenance, reserved
  current_patient_id UUID,
  current_admission_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ward_id, bed_number)
);

-- Admissions
CREATE TABLE public.admissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  bed_id UUID REFERENCES public.beds(id),
  encounter_id UUID,
  admission_type TEXT NOT NULL DEFAULT 'elective', -- emergency, elective, transfer
  admitted_by UUID NOT NULL,
  admitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expected_discharge_date DATE,
  discharged_at TIMESTAMP WITH TIME ZONE,
  discharged_by UUID,
  discharge_type TEXT, -- normal, against_advice, transfer, deceased
  discharge_summary TEXT,
  diagnosis_on_admission TEXT[],
  diagnosis_on_discharge TEXT[],
  status TEXT NOT NULL DEFAULT 'admitted', -- admitted, discharged, transferred
  attending_doctor_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Nursing notes for inpatients
CREATE TABLE public.nursing_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admission_id UUID NOT NULL REFERENCES public.admissions(id),
  patient_id UUID NOT NULL,
  nurse_id UUID NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'progress', -- admission, progress, medication, procedure, discharge
  shift TEXT, -- morning, afternoon, night
  content TEXT NOT NULL,
  vitals_recorded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on inpatient tables
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursing_notes ENABLE ROW LEVEL SECURITY;

-- Wards policies
CREATE POLICY "Staff can view wards" ON public.wards
FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage wards" ON public.wards
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- Beds policies
CREATE POLICY "Staff can view beds" ON public.beds
FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Nurses and admin can manage beds" ON public.beds
FOR ALL USING (
  has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- Admissions policies
CREATE POLICY "Staff can view admissions" ON public.admissions
FOR SELECT USING (
  has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse') OR 
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Doctors can create admissions" ON public.admissions
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Doctors can update admissions" ON public.admissions
FOR UPDATE USING (
  has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- Nursing notes policies
CREATE POLICY "Nurses can manage nursing notes" ON public.nursing_notes
FOR ALL USING (
  has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- =====================================================
-- PHASE 3: INSURANCE MODULE
-- =====================================================

-- Insurance providers
CREATE TABLE public.insurance_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  provider_type TEXT DEFAULT 'private', -- nhif, private, corporate
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  contract_start_date DATE,
  contract_end_date DATE,
  discount_percentage NUMERIC DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insurance claims
CREATE TABLE public.insurance_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_number TEXT NOT NULL UNIQUE,
  invoice_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  provider_id UUID NOT NULL REFERENCES public.insurance_providers(id),
  member_number TEXT,
  policy_number TEXT,
  pre_auth_number TEXT,
  amount_claimed NUMERIC NOT NULL,
  amount_approved NUMERIC,
  patient_liability NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, submitted, under_review, approved, partially_approved, rejected, paid
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  documents_url TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pre-authorizations
CREATE TABLE public.pre_authorizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  provider_id UUID NOT NULL REFERENCES public.insurance_providers(id),
  member_number TEXT NOT NULL,
  auth_number TEXT,
  service_type TEXT NOT NULL, -- consultation, admission, surgery, imaging, lab
  estimated_cost NUMERIC,
  approved_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, expired
  requested_by UUID NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on insurance tables
ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_authorizations ENABLE ROW LEVEL SECURITY;

-- Insurance providers policies
CREATE POLICY "Staff can view insurance providers" ON public.insurance_providers
FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage insurance providers" ON public.insurance_providers
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'finance_officer')
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'finance_officer')
);

-- Insurance claims policies
CREATE POLICY "Finance can manage claims" ON public.insurance_claims
FOR ALL USING (
  has_role(auth.uid(), 'finance_officer') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'finance_officer') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Staff can view claims" ON public.insurance_claims
FOR SELECT USING (
  has_role(auth.uid(), 'receptionist') OR has_role(auth.uid(), 'doctor') OR 
  has_role(auth.uid(), 'finance_officer') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- Pre-authorization policies
CREATE POLICY "Staff can manage pre-auths" ON public.pre_authorizations
FOR ALL USING (
  has_role(auth.uid(), 'receptionist') OR has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
) WITH CHECK (
  has_role(auth.uid(), 'receptionist') OR has_role(auth.uid(), 'finance_officer') OR 
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')
);

-- =====================================================
-- ADD RADIOLOGIST ROLE TO ENUM
-- =====================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'radiologist';

-- =====================================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- =====================================================

-- Add photo and national ID to patients
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS national_id TEXT;

-- Add follow-up date to encounters
ALTER TABLE public.encounters ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE public.encounters ADD COLUMN IF NOT EXISTS encounter_type TEXT DEFAULT 'outpatient'; -- outpatient, inpatient, emergency

-- =====================================================
-- SEED IMAGING CATALOG
-- =====================================================

INSERT INTO public.imaging_catalog (modality, name, body_part, price, preparation_instructions, turnaround_hours) VALUES
('X-Ray', 'Chest X-Ray (PA)', 'Chest', 1500, 'Remove jewelry and metal objects. Wear hospital gown.', 2),
('X-Ray', 'Chest X-Ray (AP/Lateral)', 'Chest', 2000, 'Remove jewelry and metal objects. Wear hospital gown.', 2),
('X-Ray', 'Abdominal X-Ray', 'Abdomen', 1500, 'No special preparation required.', 2),
('X-Ray', 'Spine X-Ray (Cervical)', 'Spine', 2000, 'Remove jewelry and necklaces.', 2),
('X-Ray', 'Spine X-Ray (Lumbar)', 'Spine', 2000, 'No special preparation required.', 2),
('X-Ray', 'Pelvis X-Ray', 'Pelvis', 1800, 'Empty bladder before examination.', 2),
('X-Ray', 'Limb X-Ray (Upper)', 'Extremity', 1500, 'Remove jewelry from the area.', 1),
('X-Ray', 'Limb X-Ray (Lower)', 'Extremity', 1500, 'No special preparation required.', 1),
('Ultrasound', 'Abdominal Ultrasound', 'Abdomen', 3000, 'Fasting for 6-8 hours before the exam.', 4),
('Ultrasound', 'Pelvic Ultrasound', 'Pelvis', 3000, 'Full bladder required. Drink 4-6 glasses of water 1 hour before.', 4),
('Ultrasound', 'Obstetric Ultrasound', 'Pelvis', 3500, 'Full bladder for early pregnancy. No preparation for later stages.', 4),
('Ultrasound', 'Thyroid Ultrasound', 'Neck', 2500, 'No special preparation required.', 4),
('Ultrasound', 'Breast Ultrasound', 'Chest', 3000, 'No special preparation required.', 4),
('Ultrasound', 'Doppler Ultrasound (Venous)', 'Extremity', 4000, 'No special preparation required.', 4),
('Ultrasound', 'Echocardiogram', 'Chest', 5000, 'No special preparation required.', 6),
('CT', 'CT Scan Head (Plain)', 'Head', 8000, 'Remove hairpins and jewelry.', 6),
('CT', 'CT Scan Head (Contrast)', 'Head', 12000, 'Fasting for 4 hours. Kidney function test required.', 8),
('CT', 'CT Scan Chest', 'Chest', 10000, 'Fasting for 4 hours if contrast required.', 8),
('CT', 'CT Scan Abdomen/Pelvis', 'Abdomen', 12000, 'Fasting for 6 hours. Drink oral contrast as directed.', 8),
('CT', 'CT Angiography', 'Vascular', 15000, 'Fasting for 4 hours. Kidney function test required.', 8),
('MRI', 'MRI Brain', 'Head', 15000, 'Remove all metal objects. Inform if you have implants.', 24),
('MRI', 'MRI Spine (Cervical)', 'Spine', 15000, 'Remove all metal objects. Inform if you have implants.', 24),
('MRI', 'MRI Spine (Lumbar)', 'Spine', 15000, 'Remove all metal objects. Inform if you have implants.', 24),
('MRI', 'MRI Knee', 'Extremity', 12000, 'Remove all metal objects.', 24),
('MRI', 'MRI Shoulder', 'Extremity', 12000, 'Remove all metal objects.', 24),
('MRI', 'MRI Abdomen', 'Abdomen', 18000, 'Fasting for 4 hours if contrast required.', 24);

-- =====================================================
-- SEED INITIAL WARDS AND BEDS
-- =====================================================

INSERT INTO public.wards (name, ward_type, total_beds, floor_number, description) VALUES
('General Ward A', 'general', 20, 1, 'Male General Ward'),
('General Ward B', 'general', 20, 1, 'Female General Ward'),
('Maternity Ward', 'maternity', 15, 2, 'Maternity and Post-natal Care'),
('Pediatric Ward', 'pediatric', 12, 2, 'Children Ward'),
('ICU', 'icu', 6, 3, 'Intensive Care Unit'),
('Private Ward', 'private', 10, 3, 'Private Rooms');

-- Create beds for General Ward A (example)
INSERT INTO public.beds (ward_id, bed_number, bed_type)
SELECT w.id, 'GWA-' || generate_series(1, 20), 'standard'
FROM public.wards w WHERE w.name = 'General Ward A';

-- Create beds for ICU
INSERT INTO public.beds (ward_id, bed_number, bed_type)
SELECT w.id, 'ICU-' || generate_series(1, 6), 'icu'
FROM public.wards w WHERE w.name = 'ICU';

-- =====================================================
-- SEED INSURANCE PROVIDERS
-- =====================================================

INSERT INTO public.insurance_providers (name, code, provider_type, contact_phone, discount_percentage) VALUES
('NHIF', 'NHIF', 'nhif', '+254800720601', 0),
('Jubilee Insurance', 'JUB', 'private', '+254709949000', 5),
('AAR Insurance', 'AAR', 'private', '+254709912222', 5),
('Madison Insurance', 'MAD', 'private', '+254203001000', 5),
('Britam Insurance', 'BRIT', 'private', '+254705100100', 5),
('CIC Insurance', 'CIC', 'private', '+254703099120', 5),
('Resolution Insurance', 'RES', 'private', '+254709836000', 5),
('UAP Old Mutual', 'UAP', 'private', '+254711065100', 5),
('APA Insurance', 'APA', 'private', '+254203648000', 5),
('GA Insurance', 'GA', 'private', '+254202714111', 5);

-- =====================================================
-- UPDATE TRIGGERS FOR NEW TABLES
-- =====================================================

CREATE TRIGGER update_imaging_orders_updated_at
BEFORE UPDATE ON public.imaging_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wards_updated_at
BEFORE UPDATE ON public.wards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_beds_updated_at
BEFORE UPDATE ON public.beds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admissions_updated_at
BEFORE UPDATE ON public.admissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_providers_updated_at
BEFORE UPDATE ON public.insurance_providers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_claims_updated_at
BEFORE UPDATE ON public.insurance_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pre_authorizations_updated_at
BEFORE UPDATE ON public.pre_authorizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();