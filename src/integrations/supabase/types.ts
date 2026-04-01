export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admissions: {
        Row: {
          admission_type: string
          admitted_at: string
          admitted_by: string
          attending_doctor_id: string | null
          bed_id: string | null
          created_at: string
          diagnosis_on_admission: string[] | null
          diagnosis_on_discharge: string[] | null
          discharge_summary: string | null
          discharge_type: string | null
          discharged_at: string | null
          discharged_by: string | null
          encounter_id: string | null
          expected_discharge_date: string | null
          id: string
          notes: string | null
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admission_type?: string
          admitted_at?: string
          admitted_by: string
          attending_doctor_id?: string | null
          bed_id?: string | null
          created_at?: string
          diagnosis_on_admission?: string[] | null
          diagnosis_on_discharge?: string[] | null
          discharge_summary?: string | null
          discharge_type?: string | null
          discharged_at?: string | null
          discharged_by?: string | null
          encounter_id?: string | null
          expected_discharge_date?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admission_type?: string
          admitted_at?: string
          admitted_by?: string
          attending_doctor_id?: string | null
          bed_id?: string | null
          created_at?: string
          diagnosis_on_admission?: string[] | null
          diagnosis_on_discharge?: string[] | null
          discharge_summary?: string | null
          discharge_type?: string | null
          discharged_at?: string | null
          discharged_by?: string | null
          encounter_id?: string | null
          expected_discharge_date?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admissions_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          reminder_time: string
          sent: boolean | null
          sent_at: string | null
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          reminder_time: string
          sent?: boolean | null
          sent_at?: string | null
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          reminder_time?: string
          sent?: boolean | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          created_at: string | null
          department_id: string
          doctor_id: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          updated_at: string | null
        }
        Insert: {
          appointment_date: string
          created_at?: string | null
          department_id: string
          doctor_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Update: {
          appointment_date?: string
          created_at?: string | null
          department_id?: string
          doctor_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          module: string
          payroll_number: string | null
          staff_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          module: string
          payroll_number?: string | null
          staff_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          module?: string
          payroll_number?: string | null
          staff_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      beds: {
        Row: {
          bed_number: string
          bed_type: string | null
          created_at: string
          current_admission_id: string | null
          current_patient_id: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          ward_id: string
        }
        Insert: {
          bed_number: string
          bed_type?: string | null
          created_at?: string
          current_admission_id?: string | null
          current_patient_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          ward_id: string
        }
        Update: {
          bed_number?: string
          bed_type?: string | null
          created_at?: string
          current_admission_id?: string | null
          current_patient_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          ward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      counters: {
        Row: {
          created_at: string
          current_value: number
          id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
        }
        Relationships: []
      }
      critical_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          message: string
          patient_id: string | null
          reference_id: string | null
          severity: string
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message: string
          patient_id?: string | null
          reference_id?: string | null
          severity: string
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          patient_id?: string | null
          reference_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "critical_alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      dental_procedures: {
        Row: {
          created_at: string
          dentist_id: string
          encounter_id: string | null
          id: string
          next_visit: string | null
          notes: string | null
          patient_id: string
          price: number | null
          procedure_name: string
          ticket_id: string | null
          tooth_number: string | null
        }
        Insert: {
          created_at?: string
          dentist_id: string
          encounter_id?: string | null
          id?: string
          next_visit?: string | null
          notes?: string | null
          patient_id: string
          price?: number | null
          procedure_name: string
          ticket_id?: string | null
          tooth_number?: string | null
        }
        Update: {
          created_at?: string
          dentist_id?: string
          encounter_id?: string | null
          id?: string
          next_visit?: string | null
          notes?: string | null
          patient_id?: string
          price?: number | null
          procedure_name?: string
          ticket_id?: string | null
          tooth_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dental_procedures_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dental_procedures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dental_procedures_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string | null
          email_type: string
          error_message: string | null
          id: string
          recipient_email: string
          reference_id: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          recipient_email: string
          reference_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          reference_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      email_otp_tokens: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          otp_code: string
          user_id: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          otp_code: string
          user_id: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          user_id?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      encounters: {
        Row: {
          assessment: string | null
          chief_complaint: string | null
          created_at: string | null
          department_id: string
          diagnosis: string[] | null
          doctor_id: string
          encounter_date: string | null
          encounter_type: string | null
          follow_up_date: string | null
          id: string
          notes: string | null
          objective: string | null
          patient_id: string
          plan: string | null
          subjective: string | null
          ticket_id: string | null
          updated_at: string | null
        }
        Insert: {
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string | null
          department_id: string
          diagnosis?: string[] | null
          doctor_id: string
          encounter_date?: string | null
          encounter_type?: string | null
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          objective?: string | null
          patient_id: string
          plan?: string | null
          subjective?: string | null
          ticket_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string | null
          department_id?: string
          diagnosis?: string[] | null
          doctor_id?: string
          encounter_date?: string | null
          encounter_type?: string | null
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          objective?: string | null
          patient_id?: string
          plan?: string | null
          subjective?: string | null
          ticket_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encounters_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      imaging_catalog: {
        Row: {
          active: boolean | null
          body_part: string | null
          created_at: string
          description: string | null
          id: string
          modality: string
          name: string
          preparation_instructions: string | null
          price: number
          turnaround_hours: number | null
        }
        Insert: {
          active?: boolean | null
          body_part?: string | null
          created_at?: string
          description?: string | null
          id?: string
          modality: string
          name: string
          preparation_instructions?: string | null
          price?: number
          turnaround_hours?: number | null
        }
        Update: {
          active?: boolean | null
          body_part?: string | null
          created_at?: string
          description?: string | null
          id?: string
          modality?: string
          name?: string
          preparation_instructions?: string | null
          price?: number
          turnaround_hours?: number | null
        }
        Relationships: []
      }
      imaging_orders: {
        Row: {
          clinical_indication: string | null
          created_at: string
          encounter_id: string
          findings: string | null
          id: string
          images_url: string[] | null
          imaging_id: string
          impression: string | null
          ordered_by: string
          patient_id: string
          performed_at: string | null
          performed_by: string | null
          priority: string | null
          reported_at: string | null
          reported_by: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clinical_indication?: string | null
          created_at?: string
          encounter_id: string
          findings?: string | null
          id?: string
          images_url?: string[] | null
          imaging_id: string
          impression?: string | null
          ordered_by: string
          patient_id: string
          performed_at?: string | null
          performed_by?: string | null
          priority?: string | null
          reported_at?: string | null
          reported_by?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clinical_indication?: string | null
          created_at?: string
          encounter_id?: string
          findings?: string | null
          id?: string
          images_url?: string[] | null
          imaging_id?: string
          impression?: string | null
          ordered_by?: string
          patient_id?: string
          performed_at?: string | null
          performed_by?: string | null
          priority?: string | null
          reported_at?: string | null
          reported_by?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imaging_orders_imaging_id_fkey"
            columns: ["imaging_id"]
            isOneToOne: false
            referencedRelation: "imaging_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          amount_approved: number | null
          amount_claimed: number
          claim_number: string
          created_at: string
          documents_url: string[] | null
          id: string
          invoice_id: string
          member_number: string | null
          notes: string | null
          paid_at: string | null
          patient_id: string
          patient_liability: number | null
          policy_number: string | null
          pre_auth_number: string | null
          provider_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount_approved?: number | null
          amount_claimed: number
          claim_number: string
          created_at?: string
          documents_url?: string[] | null
          id?: string
          invoice_id: string
          member_number?: string | null
          notes?: string | null
          paid_at?: string | null
          patient_id: string
          patient_liability?: number | null
          policy_number?: string | null
          pre_auth_number?: string | null
          provider_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount_approved?: number | null
          amount_claimed?: number
          claim_number?: string
          created_at?: string
          documents_url?: string[] | null
          id?: string
          invoice_id?: string
          member_number?: string | null
          notes?: string | null
          paid_at?: string | null
          patient_id?: string
          patient_liability?: number | null
          policy_number?: string | null
          pre_auth_number?: string | null
          provider_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_providers: {
        Row: {
          active: boolean | null
          address: string | null
          code: string | null
          contact_email: string | null
          contact_phone: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          discount_percentage: number | null
          id: string
          name: string
          payment_terms_days: number | null
          provider_type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          discount_percentage?: number | null
          id?: string
          name: string
          payment_terms_days?: number | null
          provider_type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          address?: string | null
          code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          discount_percentage?: number | null
          id?: string
          name?: string
          payment_terms_days?: number | null
          provider_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          invoice_id: string
          quantity: number | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          invoice_id: string
          quantity?: number | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number | null
          balance: number | null
          created_at: string | null
          discount: number | null
          encounter_id: string | null
          id: string
          invoice_number: string
          net_amount: number
          patient_id: string
          status: Database["public"]["Enums"]["payment_status"] | null
          tax: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          balance?: number | null
          created_at?: string | null
          discount?: number | null
          encounter_id?: string | null
          id?: string
          invoice_number: string
          net_amount?: number
          patient_id: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          tax?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          balance?: number | null
          created_at?: string | null
          discount?: number | null
          encounter_id?: string | null
          id?: string
          invoice_number?: string
          net_amount?: number
          patient_id?: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          tax?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          created_at: string | null
          doctor_id: string
          encounter_id: string
          flag: string | null
          id: string
          patient_id: string
          result_entered_at: string | null
          result_entered_by: string | null
          result_notes: string | null
          result_value: string | null
          sample_collected_at: string | null
          status: string | null
          test_id: string
        }
        Insert: {
          created_at?: string | null
          doctor_id: string
          encounter_id: string
          flag?: string | null
          id?: string
          patient_id: string
          result_entered_at?: string | null
          result_entered_by?: string | null
          result_notes?: string | null
          result_value?: string | null
          sample_collected_at?: string | null
          status?: string | null
          test_id: string
        }
        Update: {
          created_at?: string | null
          doctor_id?: string
          encounter_id?: string
          flag?: string | null
          id?: string
          patient_id?: string
          result_entered_at?: string | null
          result_entered_by?: string | null
          result_notes?: string | null
          result_value?: string | null
          sample_collected_at?: string | null
          status?: string | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_result_entered_by_fkey"
            columns: ["result_entered_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_result_fields: {
        Row: {
          created_at: string
          field_name: string
          field_value: string | null
          flag: string | null
          id: string
          lab_order_id: string
          reference_range: string | null
          sort_order: number | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          field_name: string
          field_value?: string | null
          flag?: string | null
          id?: string
          lab_order_id: string
          reference_range?: string | null
          sort_order?: number | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          field_name?: string
          field_value?: string | null
          flag?: string | null
          id?: string
          lab_order_id?: string
          reference_range?: string | null
          sort_order?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_result_fields_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_tests_catalog: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          gender_specific_ranges: Json | null
          id: string
          normal_range: string | null
          price: number
          result_fields: Json | null
          test_code: string | null
          test_name: string
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          gender_specific_ranges?: Json | null
          id?: string
          normal_range?: string | null
          price: number
          result_fields?: Json | null
          test_code?: string | null
          test_name: string
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          gender_specific_ranges?: Json | null
          id?: string
          normal_range?: string | null
          price?: number
          result_fields?: Json | null
          test_code?: string | null
          test_name?: string
          unit?: string | null
        }
        Relationships: []
      }
      mpesa_transactions: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          merchant_request_id: string | null
          mpesa_receipt_number: string | null
          phone_number: string
          result_code: string | null
          result_desc: string | null
          status: string
          transaction_date: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          phone_number: string
          result_code?: string | null
          result_desc?: string | null
          status?: string
          transaction_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          phone_number?: string
          result_code?: string | null
          result_desc?: string | null
          status?: string
          transaction_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      nursing_notes: {
        Row: {
          admission_id: string
          content: string
          created_at: string
          id: string
          note_type: string
          nurse_id: string
          patient_id: string
          shift: string | null
          vitals_recorded: boolean | null
        }
        Insert: {
          admission_id: string
          content: string
          created_at?: string
          id?: string
          note_type?: string
          nurse_id: string
          patient_id: string
          shift?: string | null
          vitals_recorded?: boolean | null
        }
        Update: {
          admission_id?: string
          content?: string
          created_at?: string
          id?: string
          note_type?: string
          nurse_id?: string
          patient_id?: string
          shift?: string | null
          vitals_recorded?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "nursing_notes_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
        ]
      }
      nursing_procedures: {
        Row: {
          created_at: string
          encounter_id: string | null
          id: string
          notes: string | null
          nurse_id: string
          patient_id: string
          price: number | null
          procedure_type: string
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          encounter_id?: string | null
          id?: string
          notes?: string | null
          nurse_id: string
          patient_id: string
          price?: number | null
          procedure_type: string
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          encounter_id?: string | null
          id?: string
          notes?: string | null
          nurse_id?: string
          patient_id?: string
          price?: number | null
          procedure_type?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nursing_procedures_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_procedures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursing_procedures_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_feedback: {
        Row: {
          comments: string | null
          created_at: string
          id: string
          patient_id: string
          ratings: Json
          visit_reason: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          id?: string
          patient_id: string
          ratings?: Json
          visit_reason: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          id?: string
          patient_id?: string
          ratings?: Json
          visit_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_feedback_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          admission_number: string | null
          allergies: string[] | null
          blood_type: string | null
          chronic_conditions: string[] | null
          created_at: string | null
          email: string | null
          id: string
          insurance_number: string | null
          insurance_provider: string | null
          national_id: string | null
          nationality: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          next_of_kin_relationship: string | null
          patient_id: string
          patient_type: Database["public"]["Enums"]["patient_type"] | null
          payroll_number: string | null
          photo_url: string | null
          postal_address: string | null
          updated_at: string | null
          user_id: string
          visit_reason: Database["public"]["Enums"]["visit_reason"] | null
        }
        Insert: {
          admission_number?: string | null
          allergies?: string[] | null
          blood_type?: string | null
          chronic_conditions?: string[] | null
          created_at?: string | null
          email?: string | null
          id?: string
          insurance_number?: string | null
          insurance_provider?: string | null
          national_id?: string | null
          nationality?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          patient_id: string
          patient_type?: Database["public"]["Enums"]["patient_type"] | null
          payroll_number?: string | null
          photo_url?: string | null
          postal_address?: string | null
          updated_at?: string | null
          user_id: string
          visit_reason?: Database["public"]["Enums"]["visit_reason"] | null
        }
        Update: {
          admission_number?: string | null
          allergies?: string[] | null
          blood_type?: string | null
          chronic_conditions?: string[] | null
          created_at?: string | null
          email?: string | null
          id?: string
          insurance_number?: string | null
          insurance_provider?: string | null
          national_id?: string | null
          nationality?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          patient_id?: string
          patient_type?: Database["public"]["Enums"]["patient_type"] | null
          payroll_number?: string | null
          photo_url?: string | null
          postal_address?: string | null
          updated_at?: string | null
          user_id?: string
          visit_reason?: Database["public"]["Enums"]["visit_reason"] | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_profile_fk"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          paid_at: string | null
          patient_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: string | null
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          paid_at?: string | null
          patient_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status?: string | null
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          paid_at?: string | null
          patient_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: string | null
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_inventory: {
        Row: {
          average_monthly_consumption: number | null
          batch_number: string | null
          category: string | null
          created_at: string | null
          drug_name: string
          expiry_date: string | null
          generic_name: string | null
          id: string
          maximum_stock: number | null
          minimum_stock: number | null
          package: string | null
          quantity: number
          reorder_level: number | null
          strength_size: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          average_monthly_consumption?: number | null
          batch_number?: string | null
          category?: string | null
          created_at?: string | null
          drug_name: string
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          package?: string | null
          quantity?: number
          reorder_level?: number | null
          strength_size?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          average_monthly_consumption?: number | null
          batch_number?: string | null
          category?: string | null
          created_at?: string | null
          drug_name?: string
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          package?: string | null
          quantity?: number
          reorder_level?: number | null
          strength_size?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      pharmacy_stock_transactions: {
        Row: {
          balance: number | null
          created_at: string
          expiry_date: string | null
          id: string
          inventory_id: string
          invoice_ref: string | null
          issued_to: string | null
          qty_issued: number | null
          qty_received: number | null
          received_from: string | null
          recorded_by: string | null
          transaction_date: string
          unit_price: number | null
        }
        Insert: {
          balance?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_id: string
          invoice_ref?: string | null
          issued_to?: string | null
          qty_issued?: number | null
          qty_received?: number | null
          received_from?: string | null
          recorded_by?: string | null
          transaction_date?: string
          unit_price?: number | null
        }
        Update: {
          balance?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_id?: string
          invoice_ref?: string | null
          issued_to?: string | null
          qty_issued?: number | null
          qty_received?: number | null
          received_from?: string | null
          recorded_by?: string | null
          transaction_date?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_stock_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_authorizations: {
        Row: {
          approved_amount: number | null
          auth_number: string | null
          created_at: string
          estimated_cost: number | null
          id: string
          member_number: string
          notes: string | null
          patient_id: string
          provider_id: string
          requested_at: string
          requested_by: string
          service_type: string
          status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          approved_amount?: number | null
          auth_number?: string | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          member_number: string
          notes?: string | null
          patient_id: string
          provider_id: string
          requested_at?: string
          requested_by: string
          service_type: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          approved_amount?: number | null
          auth_number?: string | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          member_number?: string
          notes?: string | null
          patient_id?: string
          provider_id?: string
          requested_at?: string
          requested_by?: string
          service_type?: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_authorizations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string | null
          dispensed: boolean | null
          dispensed_at: string | null
          dispensed_by: string | null
          doctor_id: string
          dosage: string
          duration: string
          encounter_id: string
          frequency: string
          id: string
          instructions: string | null
          medication_name: string
          patient_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          dispensed?: boolean | null
          dispensed_at?: string | null
          dispensed_by?: string | null
          doctor_id: string
          dosage: string
          duration: string
          encounter_id: string
          frequency: string
          id?: string
          instructions?: string | null
          medication_name: string
          patient_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          dispensed?: boolean | null
          dispensed_at?: string | null
          dispensed_by?: string | null
          doctor_id?: string
          dosage?: string
          duration?: string
          encounter_id?: string
          frequency?: string
          id?: string
          instructions?: string | null
          medication_name?: string
          patient_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_dispensed_by_fkey"
            columns: ["dispensed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          id: string
          last_login_at: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          last_login_at?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          last_login_at?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          doctor_name: string
          encounter_id: string | null
          id: string
          patient_id: string
          reasons_for_referral: string
          referral_date: string
          referred_by: string
          treatment_given: string | null
        }
        Insert: {
          created_at?: string
          doctor_name: string
          encounter_id?: string | null
          id?: string
          patient_id: string
          reasons_for_referral: string
          referral_date?: string
          referred_by: string
          treatment_given?: string | null
        }
        Update: {
          created_at?: string
          doctor_name?: string
          encounter_id?: string | null
          id?: string
          patient_id?: string
          reasons_for_referral?: string
          referral_date?: string
          referred_by?: string
          treatment_given?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      service_charges: {
        Row: {
          amount: number
          billing_stage: string | null
          created_at: string
          description: string
          encounter_id: string | null
          id: string
          patient_id: string
          service_type: string
          ticket_id: string | null
        }
        Insert: {
          amount?: number
          billing_stage?: string | null
          created_at?: string
          description: string
          encounter_id?: string | null
          id?: string
          patient_id: string
          service_type: string
          ticket_id?: string | null
        }
        Update: {
          amount?: number
          billing_stage?: string | null
          created_at?: string
          description?: string
          encounter_id?: string | null
          id?: string
          patient_id?: string
          service_type?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_charges_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charges_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charges_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          notification_type: string
          recipient_phone: string
          reference_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          notification_type: string
          recipient_phone: string
          reference_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          notification_type?: string
          recipient_phone?: string
          reference_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string | null
          department_id: string | null
          id: string
          license_number: string | null
          payroll_number: string | null
          specialization: string | null
          staff_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          license_number?: string | null
          payroll_number?: string | null
          specialization?: string | null
          staff_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          license_number?: string | null
          payroll_number?: string | null
          specialization?: string | null
          staff_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_applications: {
        Row: {
          created_at: string
          desired_role: string
          email: string
          full_name: string
          id: string
          license_number: string | null
          national_id: string | null
          notes: string | null
          phone: string
          preferred_shift: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialization: string | null
          status: string
          years_of_experience: number | null
        }
        Insert: {
          created_at?: string
          desired_role: string
          email: string
          full_name: string
          id?: string
          license_number?: string | null
          national_id?: string | null
          notes?: string | null
          phone: string
          preferred_shift?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialization?: string | null
          status?: string
          years_of_experience?: number | null
        }
        Update: {
          created_at?: string
          desired_role?: string
          email?: string
          full_name?: string
          id?: string
          license_number?: string | null
          national_id?: string | null
          notes?: string | null
          phone?: string
          preferred_shift?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialization?: string | null
          status?: string
          years_of_experience?: number | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          stage: string
          ticket_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          stage: string
          ticket_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          stage?: string
          ticket_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string | null
          department_id: string
          id: string
          patient_id: string
          priority: number | null
          status: Database["public"]["Enums"]["ticket_status"] | null
          ticket_number: string
          updated_at: string | null
          workflow_stage: string | null
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string | null
          department_id: string
          id?: string
          patient_id: string
          priority?: number | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_number: string
          updated_at?: string | null
          workflow_stage?: string | null
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string | null
          department_id?: string
          id?: string
          patient_id?: string
          priority?: number | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_number?: string
          updated_at?: string | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vitals: {
        Row: {
          allergies_noted: string | null
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          bmi: number | null
          created_at: string | null
          encounter_id: string | null
          height: number | null
          id: string
          oxygen_saturation: number | null
          patient_id: string
          presenting_complaint: string | null
          pulse_rate: number | null
          recorded_at: string | null
          recorded_by: string | null
          respiratory_rate: number | null
          temperature: number | null
          weight: number | null
        }
        Insert: {
          allergies_noted?: string | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          bmi?: number | null
          created_at?: string | null
          encounter_id?: string | null
          height?: number | null
          id?: string
          oxygen_saturation?: number | null
          patient_id: string
          presenting_complaint?: string | null
          pulse_rate?: number | null
          recorded_at?: string | null
          recorded_by?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Update: {
          allergies_noted?: string | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          bmi?: number | null
          created_at?: string | null
          encounter_id?: string | null
          height?: number | null
          id?: string
          oxygen_saturation?: number | null
          patient_id?: string
          presenting_complaint?: string | null
          pulse_rate?: number | null
          recorded_at?: string | null
          recorded_by?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      wards: {
        Row: {
          active: boolean | null
          created_at: string
          department_id: string | null
          description: string | null
          floor_number: number | null
          id: string
          name: string
          total_beds: number
          updated_at: string
          ward_type: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          floor_number?: number | null
          id?: string
          name: string
          total_beds?: number
          updated_at?: string
          ward_type?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          floor_number?: number | null
          id?: string
          name?: string
          total_beds?: number
          updated_at?: string
          ward_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wards_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_all_users_with_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          payroll_number: string
          phone: string
          roles: string[]
          user_id: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_opd_number: { Args: never; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "doctor"
        | "nurse"
        | "receptionist"
        | "lab_technician"
        | "pharmacist"
        | "finance_officer"
        | "patient"
        | "super_admin"
        | "system_admin"
        | "radiologist"
        | "cashier"
        | "accountant"
        | "hr_admin"
        | "auditor"
        | "clinical_officer"
        | "records_officer"
        | "ward_manager"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      patient_type: "cuea_staff" | "cuea_student" | "outsider"
      payment_method: "mpesa" | "card" | "cash" | "insurance" | "bank_transfer"
      payment_status: "pending" | "partial" | "paid" | "refunded" | "cancelled"
      ticket_status:
        | "checked_in"
        | "triage"
        | "waiting_for_doctor"
        | "in_consult"
        | "at_dental"
        | "order_placed_lab"
        | "order_placed_imaging"
        | "at_lab"
        | "at_imaging"
        | "at_pharmacy"
        | "at_billing"
        | "checked_out"
      visit_reason: "outpatient" | "dental"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "doctor",
        "nurse",
        "receptionist",
        "lab_technician",
        "pharmacist",
        "finance_officer",
        "patient",
        "super_admin",
        "system_admin",
        "radiologist",
        "cashier",
        "accountant",
        "hr_admin",
        "auditor",
        "clinical_officer",
        "records_officer",
        "ward_manager",
      ],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      patient_type: ["cuea_staff", "cuea_student", "outsider"],
      payment_method: ["mpesa", "card", "cash", "insurance", "bank_transfer"],
      payment_status: ["pending", "partial", "paid", "refunded", "cancelled"],
      ticket_status: [
        "checked_in",
        "triage",
        "waiting_for_doctor",
        "in_consult",
        "at_dental",
        "order_placed_lab",
        "order_placed_imaging",
        "at_lab",
        "at_imaging",
        "at_pharmacy",
        "at_billing",
        "checked_out",
      ],
      visit_reason: ["outpatient", "dental"],
    },
  },
} as const
