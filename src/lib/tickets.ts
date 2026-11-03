import { supabase } from "@/integrations/supabase/client";

/**
 * Next queue ticket number for today (e.g. T-00001). Numbers restart at 00001
 * every day (Nairobi time); the prefix is set in Settings → System Config.
 * The first ticket of the day also clears triage left over from previous days.
 */
export async function nextTicketNumber(): Promise<string> {
  const { data, error } = await supabase.rpc("next_ticket_number");
  if (error || !data) throw new Error(`Could not get a ticket number: ${error?.message || "no number returned"}`);
  return data as string;
}
