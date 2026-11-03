/**
 * Kenyan phone number validation.
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, +2541XXXXXXXX, 2547XXXXXXXX
 * Still used for M-Pesa, which only works with Kenyan (Safaricom) numbers.
 */
export function isValidKenyanPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(?:\+?254|0)[17]\d{8}$/.test(cleaned);
}

/**
 * International phone validation.
 * Accepts Kenyan local numbers (07…/01…) or any number in international
 * format: "+" then the country code and number, 8–15 digits in total (E.164).
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (isValidKenyanPhone(cleaned)) return true;
  if (/^(?:\+|00)254/.test(cleaned)) return false; // Kenyan numbers must be complete
  return /^(?:\+|00)[1-9]\d{7,14}$/.test(cleaned);
}

/** Normalises a phone number to "+<country><number>". Kenyan local numbers become +254…. */
export function normalizePhone(phone: string): string {
  const cleaned = (phone || "").replace(/[\s\-()]/g, "");
  if (!cleaned) return "";
  if (/^0[17]\d{8}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  if (/^254[17]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  return cleaned;
}

/** M-Pesa wants 2547XXXXXXXX / 2541XXXXXXXX. Returns null for non-Kenyan numbers. */
export function toMpesaPhone(phone: string): string | null {
  const n = normalizePhone(phone);
  return /^\+254[17]\d{8}$/.test(n) ? n.slice(1) : null;
}

/**
 * Basic email validation
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Name validation: 2-100 chars, letters/spaces/hyphens/apostrophes only
 */
export function isValidName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[a-zA-Z\s\-'.]+$/.test(trimmed);
}

/**
 * National ID: 6-10 digits or alphanumeric passport
 */
export function isValidNationalId(id: string): boolean {
  if (!id) return false;
  return /^[A-Za-z0-9]{6,12}$/.test(id.trim());
}

/**
 * Password: min 8 chars, at least one letter and one number
 */
export function isValidPassword(password: string): boolean {
  if (!password) return false;
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

/**
 * Generic length check
 */
export function isWithinLength(value: string, max: number): boolean {
  return value.length <= max;
}

/**
 * Validate form fields and return errors
 */
export interface ValidationError {
  field: string;
  message: string;
}

export function validatePatientForm(data: {
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isValidName(data.fullName)) {
    errors.push({ field: "fullName", message: "Name must be 2-100 characters, letters only" });
  }
  if (!isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Invalid email address" });
  }
  if (!isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Invalid phone number — use 07XXXXXXXX or the international format, e.g. +256 712 345678" });
  }
  if (data.nationalId && !isValidNationalId(data.nationalId)) {
    errors.push({ field: "nationalId", message: "Invalid National ID / Passport number" });
  }
  if (data.nextOfKinName && !isValidName(data.nextOfKinName)) {
    errors.push({ field: "nextOfKinName", message: "Next of kin name must be 2-100 characters" });
  }
  if (data.nextOfKinPhone && !isValidPhone(data.nextOfKinPhone)) {
    errors.push({ field: "nextOfKinPhone", message: "Invalid next of kin phone number" });
  }

  return errors;
}

export function validateStaffForm(data: {
  email: string;
  fullName: string;
  phone: string;
  payrollNumber: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isValidName(data.fullName)) {
    errors.push({ field: "fullName", message: "Name must be 2-100 characters, letters only" });
  }
  if (!isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Invalid email address" });
  }
  if (data.phone && !isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Invalid phone number — use 07XXXXXXXX or the international format" });
  }
  if (!data.payrollNumber || data.payrollNumber.trim().length < 2) {
    errors.push({ field: "payrollNumber", message: "Payroll number is required" });
  }

  return errors;
}
