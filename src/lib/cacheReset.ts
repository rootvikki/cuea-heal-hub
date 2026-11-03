import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Clear cache for everyone": a super admin bumps `system_settings.cache_version`.
 * Every open browser checks it (on load, on returning to the tab, and every minute);
 * when it changed, the browser wipes its stored data — form drafts, saved preferences,
 * cached lists, downloaded app files — keeps the sign-in, and reloads.
 */
export const CACHE_VERSION_KEY = "hims-cache-version";
const CHECK_MS = 60_000;

/** Sign-in sessions survive a cache clear so nobody is logged out mid-shift. */
export const isKeptKey = (k: string) => k === CACHE_VERSION_KEY || (k.startsWith("sb-") && k.includes("auth-token"));

/** What to do with the version the server reports: first visit just remembers it; a different one clears. */
export function cacheAction(stored: string | null, server: string | null): "none" | "remember" | "clear" {
  if (!server) return "none";
  if (!stored) return "remember";
  return stored === server ? "none" : "clear";
}

export async function clearThisBrowser(queryClient?: QueryClient) {
  Object.keys(localStorage).filter((k) => !isKeptKey(k)).forEach((k) => localStorage.removeItem(k));
  queryClient?.clear();
  try {
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
    if ("serviceWorker" in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  } catch { /* storage APIs may be blocked; local data is already cleared */ }
}

async function readServerVersion(): Promise<string | null> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "cache_version").maybeSingle();
  return data?.value ?? null;
}

/** Mount once in the signed-in app. */
export function useCacheReset(signedIn: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!signedIn) return;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const server = await readServerVersion();
        const action = cacheAction(localStorage.getItem(CACHE_VERSION_KEY), server);
        if (action === "remember") localStorage.setItem(CACHE_VERSION_KEY, server!);
        if (action === "clear") {
          await clearThisBrowser(queryClient);
          localStorage.setItem(CACHE_VERSION_KEY, server!);
          window.location.reload();
        }
      } finally { busy = false; }
    };
    void check();
    const t = setInterval(() => void check(), CHECK_MS);
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onFocus); };
  }, [signedIn, queryClient]);
}
