import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TicketStatus = 
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
  | "checked_out";

interface TransitionOptions {
  ticketId: string;
  patientId?: string;
  encounterId?: string;
}

export const useQueueTransition = () => {
  
  const getActiveTicket = async (patientId: string) => {
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("patient_id", patientId)
      .neq("status", "checked_out")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error("Error fetching ticket:", error);
      return null;
    }
    return data;
  };

  const updateTicketStatus = async (ticketId: string, status: TicketStatus, workflowStage?: string) => {
    const updateData: Record<string, unknown> = { 
      status,
      workflow_stage: workflowStage || status,
      updated_at: new Date().toISOString()
    };

    if (status === "checked_out") {
      updateData.checked_out_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("tickets")
      .update(updateData)
      .eq("id", ticketId);

    if (error) {
      console.error("Error updating ticket:", error);
      toast.error("Failed to update queue status");
      return false;
    }
    return true;
  };

  const onVitalsRecorded = async ({ ticketId }: TransitionOptions) => {
    const success = await updateTicketStatus(ticketId, "waiting_for_doctor");
    if (success) toast.success("Patient moved to doctor queue");
    return success;
  };

  const onConsultationStarted = async ({ ticketId }: TransitionOptions) => {
    const success = await updateTicketStatus(ticketId, "in_consult");
    if (success) toast.success("Consultation started");
    return success;
  };

  const onConsultationComplete = async ({ ticketId, encounterId }: TransitionOptions) => {
    if (!encounterId) return false;

    const [labOrders, imagingOrders, prescriptions] = await Promise.all([
      supabase.from("lab_orders").select("id").eq("encounter_id", encounterId).eq("status", "pending"),
      supabase.from("imaging_orders").select("id").eq("encounter_id", encounterId).eq("status", "pending"),
      supabase.from("prescriptions").select("id").eq("encounter_id", encounterId).eq("dispensed", false),
    ]);

    const hasLabOrders = (labOrders.data?.length || 0) > 0;
    const hasImagingOrders = (imagingOrders.data?.length || 0) > 0;
    const hasPrescriptions = (prescriptions.data?.length || 0) > 0;

    let nextStatus: TicketStatus;
    let message: string;

    if (hasLabOrders) {
      nextStatus = "at_lab";
      message = "Patient sent to laboratory";
    } else if (hasImagingOrders) {
      nextStatus = "at_imaging";
      message = "Patient sent to imaging";
    } else if (hasPrescriptions) {
      nextStatus = "at_pharmacy";
      message = "Patient sent to pharmacy";
    } else {
      nextStatus = "at_billing";
      message = "Patient sent to billing";
    }

    const success = await updateTicketStatus(ticketId, nextStatus);
    if (success) toast.success(message);
    return success;
  };

  const onLabComplete = async ({ ticketId, encounterId }: TransitionOptions, returnToDoctor = false) => {
    if (!encounterId) return false;

    if (returnToDoctor) {
      const success = await updateTicketStatus(ticketId, "waiting_for_doctor");
      if (success) toast.success("Patient returned to doctor for review");
      return success;
    }

    const [imagingOrders, prescriptions] = await Promise.all([
      supabase.from("imaging_orders").select("id").eq("encounter_id", encounterId).eq("status", "pending"),
      supabase.from("prescriptions").select("id").eq("encounter_id", encounterId).eq("dispensed", false),
    ]);

    const hasImagingOrders = (imagingOrders.data?.length || 0) > 0;
    const hasPrescriptions = (prescriptions.data?.length || 0) > 0;

    let nextStatus: TicketStatus;
    let message: string;

    if (hasImagingOrders) {
      nextStatus = "at_imaging";
      message = "Patient sent to imaging";
    } else if (hasPrescriptions) {
      nextStatus = "at_pharmacy";
      message = "Patient sent to pharmacy";
    } else {
      nextStatus = "at_billing";
      message = "Patient sent to billing";
    }

    const success = await updateTicketStatus(ticketId, nextStatus);
    if (success) toast.success(message);
    return success;
  };

  const onImagingComplete = async ({ ticketId, encounterId }: TransitionOptions, returnToDoctor = false) => {
    if (!encounterId) return false;

    if (returnToDoctor) {
      const success = await updateTicketStatus(ticketId, "waiting_for_doctor");
      if (success) toast.success("Patient returned to doctor for review");
      return success;
    }

    const { data: prescriptions } = await supabase
      .from("prescriptions").select("id").eq("encounter_id", encounterId).eq("dispensed", false);

    const hasPrescriptions = (prescriptions?.length || 0) > 0;

    let nextStatus: TicketStatus;
    let message: string;

    if (hasPrescriptions) {
      nextStatus = "at_pharmacy";
      message = "Patient sent to pharmacy";
    } else {
      nextStatus = "at_billing";
      message = "Patient sent to billing";
    }

    const success = await updateTicketStatus(ticketId, nextStatus);
    if (success) toast.success(message);
    return success;
  };

  const onPrescriptionDispensed = async ({ ticketId, encounterId }: TransitionOptions) => {
    if (!encounterId) return false;

    const { data: pendingRx } = await supabase
      .from("prescriptions").select("id").eq("encounter_id", encounterId).eq("dispensed", false);

    if ((pendingRx?.length || 0) === 0) {
      const success = await updateTicketStatus(ticketId, "at_billing");
      if (success) toast.success("Patient sent to billing");
      return success;
    }
    return true;
  };

  const onPaymentComplete = async ({ ticketId }: TransitionOptions) => {
    const success = await updateTicketStatus(ticketId, "checked_out");
    if (success) toast.success("Patient checked out");
    return success;
  };

  const getTicketByEncounter = async (encounterId: string) => {
    const { data, error } = await supabase
      .from("encounters").select("ticket_id").eq("id", encounterId).maybeSingle();
    if (error || !data?.ticket_id) return null;
    return data.ticket_id;
  };

  return {
    getActiveTicket,
    getTicketByEncounter,
    updateTicketStatus,
    onVitalsRecorded,
    onConsultationStarted,
    onConsultationComplete,
    onLabComplete,
    onImagingComplete,
    onPrescriptionDispensed,
    onPaymentComplete,
  };
};
