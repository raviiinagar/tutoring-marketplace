import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type BetaFeature = "community" | "feedback";

/**
 * Which beta features to advertise. Both are assumed on until the public policy says
 * otherwise, so the header does not shift when the policy arrives; switching a flag off
 * on the API hides its links and announcements.
 */
export function useBetaFeatures(): Record<BetaFeature, boolean> {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = { enabled: mounted, retry: false, staleTime: 5 * 60_000 } as const;
  const community = useQuery({
    queryKey: ["beta-policy", "community"],
    queryFn: api.communityPolicy,
    ...options,
  });
  const feedback = useQuery({
    queryKey: ["beta-policy", "feedback"],
    queryFn: api.feedbackPolicy,
    ...options,
  });
  return {
    community: !(community.data?.ok && !community.data.data.enabled),
    feedback: !(feedback.data?.ok && !feedback.data.data.enabled),
  };
}
