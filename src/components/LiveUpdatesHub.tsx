import { useUser } from "@/contexts/UserContext";
import { useLiveUpdatesHub } from "@/lib/liveUpdates";
import { useCacheReset } from "@/lib/cacheReset";

/** One shared live-updates connection for the whole signed-in app. */
export function LiveUpdatesHub() {
  const { user } = useUser();
  useLiveUpdatesHub(!!user);
  useCacheReset(!!user);
  return null;
}
