import { supabase } from "@/integrations/supabase/client";

export interface NotificationPayload {
  title: string;
  message: string;
  category?: string;
  referenceId?: string | null;
  link?: string | null;
}

/** Send an in-app notification to one specific user (by auth user id). */
export const notifyUser = async (userId: string | null | undefined, payload: NotificationPayload) => {
  if (!userId) return;
  await supabase.from("notifications").insert({
    user_id: userId,
    title: payload.title,
    message: payload.message,
    category: payload.category || "general",
    reference_id: payload.referenceId || null,
    link: payload.link || null,
  });
};

/** Send an in-app notification to every user holding any of the given roles. */
export const notifyRoles = async (roles: string[], payload: NotificationPayload) => {
  await supabase.rpc("notify_roles", {
    _roles: roles as any,
    _title: payload.title,
    _message: payload.message,
    _category: payload.category || "general",
    _reference_id: payload.referenceId || null,
    _link: payload.link || null,
  });
};

/** Resolve the auth user id behind a staff record (e.g. the ordering doctor). */
export const authUserIdForStaff = async (staffId: string | null | undefined) => {
  if (!staffId) return null;
  const { data } = await supabase.from("staff").select("user_id").eq("id", staffId).maybeSingle();
  return data?.user_id ?? null;
};
