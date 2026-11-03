/**
 * "Log in as" tabs keep their own sign-in, separate from every other tab.
 *
 * This module must be imported before anything that creates the backend client
 * (it is the first import in main.tsx). In an isolated tab it swaps the browser's
 * shared storage for storage that belongs to this tab only, and stops the tab from
 * sharing sign-in changes with other tabs — so the admin's own tab stays signed in
 * as the admin while this tab is signed in as the chosen user.
 */

export const LOGIN_AS_PATH = "/login-as";
const FLAG = "hims_isolated_tab";
const PREFIX = "hims_tab:";

function readFlag(): boolean {
  try {
    if (window.location.pathname === LOGIN_AS_PATH) window.sessionStorage.setItem(FLAG, "1");
    return window.sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

/** Per-tab Storage backed by sessionStorage; supports Object.keys like the real thing. */
export function makeTabStorage(backing: Storage, prefix = PREFIX): Storage {
  const keys = () => {
    const out: string[] = [];
    for (let i = 0; i < backing.length; i++) {
      const k = backing.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  };
  const api = {
    getItem: (k: string) => backing.getItem(prefix + k),
    setItem: (k: string, v: string) => backing.setItem(prefix + k, String(v)),
    removeItem: (k: string) => backing.removeItem(prefix + k),
    clear: () => keys().forEach((k) => backing.removeItem(prefix + k)),
    key: (i: number) => keys()[i] ?? null,
    get length() {
      return keys().length;
    },
  };
  return new Proxy(api, {
    ownKeys: () => keys(),
    getOwnPropertyDescriptor: (_t, p) =>
      typeof p === "string" && keys().includes(p)
        ? { value: api.getItem(p), enumerable: true, configurable: true, writable: true }
        : undefined,
    get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : typeof p === "string" ? t.getItem(p) ?? undefined : undefined),
  }) as unknown as Storage;
}

export const isIsolatedTab = typeof window !== "undefined" && readFlag();

if (isIsolatedTab) {
  const tabStorage = makeTabStorage(window.sessionStorage);
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => tabStorage });

  // Sign-in changes are broadcast between tabs; give this tab a private channel name.
  const Native = window.BroadcastChannel;
  if (Native) {
    const tabId = Math.random().toString(36).slice(2);
    class TabOnlyChannel extends Native {
      constructor(name: string) {
        super(`tab-${tabId}:${name}`);
      }
    }
    window.BroadcastChannel = TabOnlyChannel;
  }
}

/** Sign out this tab only. A "Log in as" tab must never end the real user's other sessions. */
export async function signOutThisTab(signOut: (opts?: { scope?: "global" | "local" | "others" }) => Promise<unknown>) {
  if (!isIsolatedTab) {
    await signOut();
    return false;
  }
  await signOut({ scope: "local" });
  try {
    window.sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
  window.close();
  return true;
}
