export type PublicPage = "HOME" | "BROWSE" | "TUTOR" | "CATEGORY" | "SIGN_IN" | "SIGN_UP";
export function publicPage(path: string): PublicPage | undefined {
  if (path === "/") return "HOME";
  if (path === "/tutors") return "BROWSE";
  if (path === "/auth/signin") return "SIGN_IN";
  if (path === "/auth/signup") return "SIGN_UP";
  if (/^\/tutors\/[a-f0-9-]{36}$/.test(path) || /^\/teachers\/[^/]+$/.test(path)) return "TUTOR";
  if (/^\/learn\/[a-z0-9-]+\/[a-z0-9-]+$/.test(path)) return "CATEGORY";
  return undefined;
}
export function trafficObservation(path: string, storage: Storage, at: number) {
  const page = publicPage(path);
  if (!page) return;
  let session: { id: string; last: number } | undefined;
  try {
    const value = JSON.parse(storage.getItem("tm-public-visit") || "null");
    if (
      value &&
      /^[a-f0-9-]{36}$/.test(value.id) &&
      Number.isFinite(value.last) &&
      value.last <= at &&
      at - value.last < 30 * 60000
    )
      session = value;
  } catch {
    /* Corrupt storage starts a new anonymous tab visit. */
  }
  session = { id: session?.id || crypto.randomUUID(), last: at };
  storage.setItem("tm-public-visit", JSON.stringify(session));
  return { event_id: crypto.randomUUID(), session_id: session.id, page };
}
