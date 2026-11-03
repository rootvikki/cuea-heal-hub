import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Instant updates: when anyone saves a change (stock, prices, bills, payments, orders,
 * patient details) every open screen refreshes straight away. One shared connection
 * per browser feeds all screens. Super admins can turn this off in Settings → System
 * Config; screens then refresh every minute instead.
 */
export const LIVE_TABLES = [
  "pharmacy_inventory", "pharmacy_stock_transactions", "pharmacy_replenishment_requests",
  "invoices", "payments", "service_charges", "procedure_orders", "patients",
] as const;
export type LiveTable = (typeof LIVE_TABLES)[number];

const EVENT = "hims-live-change";
export const FALLBACK_REFRESH_MS = 60_000;

/** Reads the "Instant updates" setting (on unless a super admin turned it off). */
export function useLiveUpdatesEnabled() {
  const { data } = useQuery({
    queryKey: ["system-setting", "live_updates"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("value").eq("key", "live_updates").maybeSingle();
      return data?.value !== "off";
    },
    staleTime: 60_000,
  });
  return data ?? true;
}

/** Mount once (inside the signed-in layout). Subscribes to all live tables and fans changes out. */
export function useLiveUpdatesHub(signedIn: boolean) {
  const enabled = useLiveUpdatesEnabled();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!signedIn) return;
    const fire = (table: string) => {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { table } }));
      // TanStack queries whose key mentions the table refresh too
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === "string" && k.includes(table)) });
    };
    if (!enabled) {
      const t = setInterval(() => LIVE_TABLES.forEach(fire), FALLBACK_REFRESH_MS);
      return () => clearInterval(t);
    }
    let channel = supabase.channel(`live-hub-${Math.random().toString(36).slice(2)}`);
    LIVE_TABLES.forEach((table) => {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => fire(table));
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [signedIn, enabled, queryClient]);
}

/** Calls `onChange` (debounced) whenever one of `tables` changes anywhere in the system. */
export function useLiveTable(tables: LiveTable[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(",");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: Event) => {
      const table = (e as CustomEvent<{ table: string }>).detail?.table;
      if (!key.split(",").includes(table)) return;
      clearTimeout(t);
      t = setTimeout(() => cb.current(), 300);
    };
    window.addEventListener(EVENT, handler);
    return () => { window.removeEventListener(EVENT, handler); clearTimeout(t); };
  }, [key]);
}
