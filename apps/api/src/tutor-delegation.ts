import type { PoolClient } from "pg";
import type { AuthService } from "./auth.js";
import { requireSafetyClear } from "./safety-permissions.js";

/**
 * Staff acting for a Tutor under ADR0018 (assisted onboarding).
 *
 * Only AssistedOnboardingService creates one. Its resolve() runs inside the
 * caller's transaction and must authorize the staff session, lock the claimed
 * request and check the Tutor's recorded consent, then return the Tutor. Owner
 * services treat the result exactly like the Tutor's own session, so every
 * existing validation, scan, safety and publication rule still applies.
 */
export interface TutorDelegation {
  readonly kind: "TUTOR_DELEGATION";
  resolve(client: PoolClient): Promise<{ user: Record<string, any>; staffId: string }>;
}

/** The Tutor's own session token, or a staff delegation. */
export type TutorActor = string | undefined | TutorDelegation;

export function isDelegation(actor: TutorActor): actor is TutorDelegation {
  return typeof actor === "object" && actor !== null && actor.kind === "TUTOR_DELEGATION";
}

/** Resolves the Tutor an owner action applies to. */
export async function actingTutor(auth: AuthService, client: PoolClient, actor: TutorActor) {
  if (!isDelegation(actor)) {
    const context = await auth.authenticated(client, actor);
    return { user: context.user, assistedBy: undefined as string | undefined };
  }
  const { user, staffId } = await actor.resolve(client);
  await requireSafetyClear(client, "ACCOUNT", user.id);
  return { user, assistedBy: staffId as string | undefined };
}
