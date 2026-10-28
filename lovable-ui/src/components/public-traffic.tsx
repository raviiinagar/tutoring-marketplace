import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { apiBaseUrl } from "@/lib/api";
import { trafficObservation } from "@/lib/traffic";
export function PublicTraffic() {
  const router = useRouter();
  const lastPath = useRef("");
  useEffect(() => {
    if (
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    )
      return;
    const observe = () => {
      const path = router.state.location.pathname;
      if (path === lastPath.current) return;
      lastPath.current = path;
      try {
        const body = trafficObservation(path, sessionStorage, Date.now());
        if (!body) return;
        void fetch(apiBaseUrl() + "/v1/public/traffic", {
          method: "POST",
          credentials: "omit",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {});
      } catch {
        /* Browsing still works when anonymous measurement is unavailable. */
      }
    };
    observe();
    const unsubscribe = router.subscribe("onResolved", observe);
    return unsubscribe;
  }, [router]);
  return null;
}
