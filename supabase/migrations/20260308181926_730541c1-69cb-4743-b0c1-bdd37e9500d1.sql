
ALTER TABLE pharmacy_inventory ADD COLUMN IF NOT EXISTS category text;

CREATE TABLE IF NOT EXISTS patient_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  visit_reason text NOT NULL,
  ratings jsonb NOT NULL DEFAULT '{}',
  comments text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patient_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can insert own feedback" ON patient_feedback
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM patients WHERE patients.id = patient_feedback.patient_id AND patients.user_id = auth.uid()
  ));

CREATE POLICY "Patients can view own feedback" ON patient_feedback
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM patients WHERE patients.id = patient_feedback.patient_id AND patients.user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all feedback" ON patient_feedback
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));
