-- Add foreign key from patients to profiles
ALTER TABLE patients ADD CONSTRAINT patients_profile_fk 
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;