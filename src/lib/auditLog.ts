import { supabase } from "@/integrations/supabase/client";

interface AuditLogParams {
  action: string;
  module: string;
  details?: Record<string, any>;
}

export async function logAuditEvent({ action, module, details }: AuditLogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get staff info for payroll_number
    let staffId: string | null = null;
    let payrollNumber: string | null = null;

    const { data: staffData } = await supabase
      .from("staff")
      .select("staff_id, payroll_number")
      .eq("user_id", user.id)
      .maybeSingle();

    if (staffData) {
      staffId = staffData.staff_id;
      payrollNumber = staffData.payroll_number;
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action,
      module,
      staff_id: staffId,
      payroll_number: payrollNumber,
      details: details || null,
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
}
