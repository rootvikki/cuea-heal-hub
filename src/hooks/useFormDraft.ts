import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Autosaves a form to this browser while it is being filled, and restores it
 * if the form is closed, the page reloads or the user is pulled away.
 * Drafts are kept per signed-in user, expire after 24 hours, and are wiped on sign-out.
 */
const PREFIX = "hims-draft:";
const MAX_AGE_MS = 24 * 3600 * 1000;

let currentUserId: string | null = null;
void supabase.auth.getSession().then(({ data }) => { currentUserId = data.session?.user.id ?? null; });
supabase.auth.onAuthStateChange((_e, session) => { currentUserId = session?.user.id ?? null; });

const storageKey = (key: string) => `${PREFIX}${currentUserId ?? "anon"}:${key}`;

/** Removes every saved draft (call on sign-out — computers here are shared). */
export function clearAllDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}

export interface FormDraft {
  /** A saved draft was put back into the form. */
  restored: boolean;
  /** When the draft was last saved. */
  savedAt: Date | null;
  /** Forget the draft (after a successful submit). */
  clear: () => void;
  /** Forget the draft and put the form back to `reset`. */
  discard: () => void;
}

export function useFormDraft<T>(
  key: string | null,
  value: T,
  setValue: (v: T) => void,
  opts: { enabled?: boolean; isEmpty?: (v: T) => boolean; reset?: T } = {},
): FormDraft {
  const enabled = opts.enabled !== false && !!key;
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const loadedFor = useRef<string | null>(null);
  const skipNextSave = useRef(false);
  const isEmptyRef = useRef(opts.isEmpty);
  isEmptyRef.current = opts.isEmpty;

  // Load once per key
  useEffect(() => {
    if (!enabled || !key) { loadedFor.current = null; setRestored(false); setSavedAt(null); return; }
    setRestored(false); setSavedAt(null);
    try {
      const raw = localStorage.getItem(storageKey(key));
      if (raw) {
        const saved = JSON.parse(raw) as { at: number; value: T };
        if (Date.now() - saved.at < MAX_AGE_MS) {
          skipNextSave.current = true;
          setValue(saved.value);
          setRestored(true);
          setSavedAt(new Date(saved.at));
        } else {
          localStorage.removeItem(storageKey(key));
        }
      }
    } catch { /* corrupt draft — ignore */ }
    loadedFor.current = key;
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save (debounced) on every change
  useEffect(() => {
    if (!enabled || !key || loadedFor.current !== key) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    const t = setTimeout(() => {
      try {
        if (isEmptyRef.current?.(value)) { localStorage.removeItem(storageKey(key)); setSavedAt(null); return; }
        const at = Date.now();
        localStorage.setItem(storageKey(key), JSON.stringify({ at, value }));
        setSavedAt(new Date(at));
      } catch { /* storage full / unavailable */ }
    }, 600);
    return () => clearTimeout(t);
  }, [value, key, enabled]);

  const clear = useCallback(() => {
    if (!key) return;
    try { localStorage.removeItem(storageKey(key)); } catch { /* ignore */ }
    skipNextSave.current = true;
    setRestored(false); setSavedAt(null);
  }, [key]);

  const discard = useCallback(() => {
    clear();
    if (opts.reset !== undefined) setValue(opts.reset);
  }, [clear, opts.reset, setValue]);

  return { restored, savedAt, clear, discard };
}
