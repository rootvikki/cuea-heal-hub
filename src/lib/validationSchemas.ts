import { z } from "zod";

// Patient Registration Schema
export const patientRegistrationSchema = z.object({
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(100, "Name too long"),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number format"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  address: z.string().max(200, "Address too long").optional(),
  bloodType: z.string().optional(),
  insuranceProvider: z.string().max(100, "Provider name too long").optional(),
  insuranceNumber: z.string().max(50, "Insurance number too long").optional(),
  allergies: z.array(z.string()).optional(),
  chronicConditions: z.array(z.string()).optional(),
});

// Vitals Entry Schema
export const vitalsSchema = z.object({
  temperature: z.number().min(35, "Temperature too low").max(43, "Temperature too high").optional(),
  bloodPressureSystolic: z.number().min(70, "Systolic BP too low").max(250, "Systolic BP too high").optional(),
  bloodPressureDiastolic: z.number().min(40, "Diastolic BP too low").max(150, "Diastolic BP too high").optional(),
  pulseRate: z.number().min(40, "Pulse too low").max(200, "Pulse too high").optional(),
  respiratoryRate: z.number().min(8, "Respiratory rate too low").max(40, "Respiratory rate too high").optional(),
  oxygenSaturation: z.number().min(70, "O2 saturation too low").max(100, "O2 saturation too high").optional(),
  weight: z.number().min(1, "Weight must be positive").max(500, "Weight too high").optional(),
  height: z.number().min(30, "Height too low").max(300, "Height too high").optional(),
});

// Prescription Schema
export const prescriptionSchema = z.object({
  medication: z.string().min(1, "Medication name required"),
  dosage: z.string().min(1, "Dosage required"),
  frequency: z.string().min(1, "Frequency required"),
  duration: z.string().min(1, "Duration required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  instructions: z.string().max(500, "Instructions too long").optional(),
});

// Encounter/SOAP Notes Schema
export const encounterSchema = z.object({
  subjective: z.string().min(10, "Subjective notes must be at least 10 characters").max(2000, "Too long"),
  objective: z.string().max(2000, "Too long").optional(),
  assessment: z.string().max(2000, "Too long").optional(),
  plan: z.string().max(2000, "Too long").optional(),
});

// Lab Test Order Schema
export const labOrderSchema = z.object({
  testIds: z.array(z.string()).min(1, "At least one test must be selected"),
});

// Payment Schema
export const paymentSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "mpesa", "card", "insurance"]),
  transactionRef: z.string().optional(),
});

// Ticket Check-in Schema
export const ticketSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID"),
  departmentId: z.string().uuid("Invalid department ID"),
  priority: z.number().min(1).max(3),
  appointmentId: z.string().uuid().optional(),
});

// Staff Assignment Schema
export const staffSchema = z.object({
  departmentId: z.string().uuid("Invalid department ID").optional(),
  specialization: z.string().max(100, "Specialization too long").optional(),
  licenseNumber: z.string().max(50, "License number too long").optional(),
});

// Appointment Schema
export const appointmentSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID"),
  doctorId: z.string().uuid("Invalid doctor ID").optional(),
  departmentId: z.string().uuid("Invalid department ID"),
  appointmentDate: z.string().refine((date) => {
    const appointmentDate = new Date(date);
    const now = new Date();
    return appointmentDate > now;
  }, "Appointment must be in the future"),
  duration: z.number().min(15, "Duration must be at least 15 minutes").max(240, "Duration too long"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(500, "Reason too long"),
});

export type PatientRegistration = z.infer<typeof patientRegistrationSchema>;
export type Vitals = z.infer<typeof vitalsSchema>;
export type Prescription = z.infer<typeof prescriptionSchema>;
export type Encounter = z.infer<typeof encounterSchema>;
export type LabOrder = z.infer<typeof labOrderSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type StaffAssignment = z.infer<typeof staffSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
