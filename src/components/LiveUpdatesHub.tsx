import { useUser } from "@/contexts/UserContext";
import { useLiveUpdatesHub } from "@/lib/liveUpdates";

/** One shared live-updates connection for the whole signed-in app. */
export function LiveUpdatesHub() {
  const { user } = useUser();
  useLiveUpdatesHub(!!user);
  return null;
}
