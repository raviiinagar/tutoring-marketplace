import { Button } from "@/components/ui/button";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  describeFailure,
  type User,
  type AccountSession,
  type NotificationPreferenceView,
} from "@/lib/api";
import { AuthShell, Field, Notice, useSingleFlight } from "@/components/account/ui";
import {
  Bell,
  Check,
  Database,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  MapPin,
  ShieldCheck,
  ShieldUser,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AccountPhotoCard } from "./account-photo-card";
import { RoleChooser } from "./role-chooser";
import { accountSessionKey } from "@/lib/session";
import { siteFeatures } from "@/lib/site-visibility";

/** OpenStreetMap embed around a city (about 10 km across) with a marker at its centre. */
function osmEmbed({ latitude, longitude }: { latitude: number; longitude: number }) {
  const box = [longitude - 0.06, latitude - 0.05, longitude + 0.06, latitude + 0.05]
    .map((n) => n.toFixed(4))
    .join(",");
  return (
    "https://www.openstreetmap.org/export/embed.html?bbox=" +
    encodeURIComponent(box) +
    "&layer=mapnik&marker=" +
    encodeURIComponent(latitude.toFixed(4) + "," + longitude.toFixed(4))
  );
}

export function AccountSettings() {
  const navigate = useNavigate();
  const hash = useLocation({ select: (location) => location.hash });
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [signOutError, setSignOutError] = useState<string>();
  const signOut = useSingleFlight();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [securityError, setSecurityError] = useState<string>();
  const security = useSingleFlight();
  const [hasStaff, setHasStaff] = useState(false);
  const [name, setName] = useState("");
  const [profileNotice, setProfileNotice] = useState<string>();
  const [profileError, setProfileError] = useState<string>();
  const profileSave = useSingleFlight();
  const [preferences, setPreferences] = useState<NotificationPreferenceView>();
  const [preferenceError, setPreferenceError] = useState<string>();
  const [preferenceNotice, setPreferenceNotice] = useState<string>();
  const preferenceSave = useSingleFlight();
  const preferenceDirty = useRef(false),
    preferenceEpoch = useRef(0);

  const [identityVerified, setIdentityVerified] = useState<boolean>();
  const [city, setCity] = useState<string | null>();
  const [cityMap, setCityMap] = useState<{ latitude: number; longitude: number } | null>(null);
  const generation = useRef(0),
    active = useRef(true),
    actor = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    const attempt = ++generation.current;
    const preferenceAttempt = preferenceEpoch.current;
    setLoadError(undefined);
    const res = await api.me();
    if (!active.current || attempt !== generation.current) return;
    if (res.ok) {
      if (actor.current !== res.data.user.id) {
        setSessions([]);
        setHasStaff(false);
        setSecurityError(undefined);
        setSignOutError(undefined);
        setName(res.data.user.display_name);
        setProfileNotice(undefined);
        setProfileError(undefined);
        setPreferences(undefined);
        setPreferenceError(undefined);
        setPreferenceNotice(undefined);
        preferenceDirty.current = false;

        setIdentityVerified(undefined);
        setCity(undefined);
      }
      actor.current = res.data.user.id;
      setUser(res.data.user);
      queryClient.setQueryData(accountSessionKey, res);
      const isTutor = res.data.user.roles.includes("TUTOR");
      const [staff, listed, notifications, tutor, presence] = await Promise.all([
        api.staffAccess(),
        api.sessions(),
        api.notificationPreferences(),
        isTutor ? api.tutor() : Promise.resolve(undefined),
        isTutor ? api.tutorPresence() : Promise.resolve(undefined),
      ]);
      if (!active.current || attempt !== generation.current) return;
      setHasStaff(staff.ok);
      if (listed.ok) setSessions(listed.data.sessions);
      else if (listed.error.kind === "http" && listed.error.status === 401)
        navigate({ to: "/auth/signin", replace: true });
      else setSecurityError(describeFailure(listed.error));
      if (notifications.ok) {
        if (preferenceAttempt === preferenceEpoch.current && !preferenceDirty.current)
          setPreferences(notifications.data);
      } else setPreferenceError(describeFailure(notifications.error));

      if (tutor?.ok) setIdentityVerified(tutor.data.profile?.identity_verified === true);
      if (presence?.ok) {
        const place = presence.data.presence.location;
        setCity(place ? [place.city, place.state].filter(Boolean).join(", ") : null);
        setCityMap(place ? (presence.data.presence.coordinates ?? null) : null);
      }
    } else if (res.error.kind === "http" && res.error.status === 401) {
      setUser(null);
      setSessions([]);
      setHasStaff(false);
      actor.current = undefined;
      queryClient.setQueryData(accountSessionKey, res);
      navigate({ to: "/auth/signin", replace: true });
    } else {
      setUser(null);
      setSessions([]);
      setHasStaff(false);
      actor.current = undefined;
      setLoadError(describeFailure(res.error));
    }
  }, [navigate, queryClient]);

  useEffect(() => {
    active.current = true;
    void load();
    window.addEventListener("focus", load);
    return () => {
      active.current = false;
      generation.current++;
      window.removeEventListener("focus", load);
    };
  }, [load]);
  useEffect(() => {
    if (!user?.id || hash !== "roles") return;
    const frame = requestAnimationFrame(() => {
      const roles = document.getElementById("roles");
      if (!roles) return;
      roles.scrollIntoView({ block: "center" });
      roles.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [user?.id, hash]);

  const chooseRoles = (roles: User["roles"]) =>
    security.run(async () => {
      if (!user) return;
      setSecurityError(undefined);
      const previous = user;
      setUser({ ...user, roles, roles_chosen: true });
      const result = await api.changeRoles(roles);
      if (!active.current || actor.current !== previous.id) return;
      if (result.ok) {
        setUser(result.data.user);
        queryClient.setQueryData(accountSessionKey, result);
      } else {
        setUser(previous);
        if (result.error.kind === "http" && result.error.status === 401)
          navigate({ to: "/auth/signin", replace: true });
        else setSecurityError(describeFailure(result.error));
      }
    });
  const revoke = (id?: string) =>
    security.run(async () => {
      const forAccount = actor.current;
      setSecurityError(undefined);
      const result = id ? await api.revokeSession(id) : await api.revokeOthers();
      if (!active.current || actor.current !== forAccount) return;
      if (result.ok) await load();
      else if (result.error.kind === "http" && result.error.status === 401)
        navigate({ to: "/auth/signin", replace: true });
      else setSecurityError(describeFailure(result.error));
    });

  const onSignOut = () =>
    signOut.run(async () => {
      setSignOutError(undefined);
      const res = await api.signOut();
      if (res.ok) {
        await queryClient.cancelQueries({ queryKey: accountSessionKey });
        queryClient.setQueryData(accountSessionKey, {
          ok: false,
          error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Please sign in." },
        });
        setUser(null);
        navigate({ to: "/auth/signin", replace: true });
      } else setSignOutError(describeFailure(res.error));
    });

  const saveName = () =>
    profileSave.run(async () => {
      const forAccount = actor.current;
      setProfileError(undefined);
      setProfileNotice(undefined);
      const result = await api.updateAccountProfile(name.trim());
      if (!active.current || actor.current !== forAccount) return;
      if (result.ok) {
        setUser(result.data.user);
        setName(result.data.user.display_name);
        queryClient.setQueryData(accountSessionKey, result);
        setProfileNotice("General information saved.");
      } else if (result.error.kind === "http" && result.error.status === 401) {
        void navigate({ to: "/auth/signin", replace: true });
      } else setProfileError(describeFailure(result.error));
    });
  const savePreferences = () =>
    preferenceSave.run(async () => {
      if (!preferences) return;
      const forAccount = actor.current;
      preferenceEpoch.current++;
      setPreferenceError(undefined);
      setPreferenceNotice(undefined);
      const result = await api.saveNotificationPreferences(preferences.preferences);
      if (!active.current || actor.current !== forAccount) return;
      if (result.ok) {
        setPreferences(result.data);
        preferenceDirty.current = false;
        setPreferenceNotice("Notification preferences saved.");
      } else if (result.error.kind === "http" && result.error.status === 401) {
        void navigate({ to: "/auth/signin", replace: true });
      } else setPreferenceError(describeFailure(result.error));
    });

  if (!user)
    return (
      <AuthShell title="Your account">
        {loadError ? (
          <div className="space-y-5">
            <Notice tone="error">{loadError}</Notice>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground">
            Loading your account…
          </p>
        )}
      </AuthShell>
    );

  const tutor = user.roles.includes("TUTOR");
  const card = "acc-card min-w-0";
  return (
    <AuthShell reference dashboard title="My Account">
      <div className="acc-page">
        <div className="mb-6">
          <RoleChooser
            user={user}
            busy={security.loading}
            onChoose={(roles) => void chooseRoles(roles)}
          />
          {securityError && !user.roles_chosen && <Notice tone="error">{securityError}</Notice>}
        </div>
        <nav aria-label="Account sections" className="mb-7 flex gap-8 text-sm font-semibold">
          <a
            href="#profile"
            aria-current="page"
            className="inline-flex min-h-11 items-center border-b-2 border-foreground"
          >
            My Profile
          </a>
          <Link
            to="/payments/history"
            className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground"
          >
            My Receipts
          </Link>
        </nav>
        <div id="profile" className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 space-y-6">
            <section className={card} aria-labelledby="general-information-title">
              <h2 id="general-information-title" className="mb-7 text-center text-base font-bold">
                General Information
              </h2>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveName();
                }}
              >
                <Field
                  label="Account name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  autoComplete="name"
                  disabled={profileSave.loading}
                />
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs text-muted-foreground">Email address</p>
                  <p className="break-all text-sm font-medium">{user.email}</p>
                  <p
                    className={
                      "mt-2 flex items-center gap-2 text-xs " +
                      (user.email_verified ? "text-emerald-700" : "text-muted-foreground")
                    }
                  >
                    {user.email_verified && <Check aria-hidden className="size-4" />}
                    {user.email_verified ? "Email verified" : "Email not verified"}
                  </p>
                </div>
                {profileError && <Notice tone="error">{profileError}</Notice>}
                {profileNotice && <Notice tone="success">{profileNotice}</Notice>}
                <Button
                  type="submit"
                  className="min-h-12 w-full rounded-full"
                  disabled={
                    profileSave.loading ||
                    name.trim().length < 2 ||
                    name.trim() === user.display_name
                  }
                >
                  {profileSave.loading ? "Saving..." : "Save general information"}
                </Button>
              </form>
            </section>
            <section className={card} aria-labelledby="notification-title">
              <h2
                id="notification-title"
                className="mb-6 flex items-center justify-center gap-2 text-base font-bold"
              >
                Notifications <Bell aria-hidden className="size-4" />
              </h2>
              <h3 className="mb-3 text-xs font-bold tracking-wide">EMAIL</h3>
              {preferences ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void savePreferences();
                  }}
                >
                  {(
                    [
                      ["enquiry_email", "Class requests"],
                      ["chat_email", "New messages"],
                      ["availability_email", "Tutor availability"],
                      ["marketing_email", "News and offers"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg bg-[#f7f7f7] px-4 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="size-5 accent-[#ff6268]"
                        checked={preferences.preferences[key]}
                        disabled={preferenceSave.loading}
                        onChange={(event) => {
                          preferenceDirty.current = true;
                          setPreferences({
                            ...preferences,
                            preferences: {
                              ...preferences.preferences,
                              [key]: event.target.checked,
                            },
                          });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                  <p className="py-2 text-xs leading-relaxed text-muted-foreground">
                    {preferences.policy.notice}
                  </p>
                  {preferenceError && <Notice tone="error">{preferenceError}</Notice>}
                  {preferenceNotice && <Notice tone="success">{preferenceNotice}</Notice>}
                  <Button
                    type="submit"
                    className="w-full rounded-full"
                    disabled={preferenceSave.loading}
                  >
                    {preferenceSave.loading ? "Saving..." : "Save notification preferences"}
                  </Button>
                </form>
              ) : preferenceError ? (
                <div className="space-y-3">
                  <Notice tone="error">{preferenceError}</Notice>
                  <Button variant="outline" onClick={() => void load()}>
                    Retry notification settings
                  </Button>
                </div>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading notification settings...
                </p>
              )}
              <Link
                to="/notifications"
                className="mt-5 inline-flex min-h-10 items-center text-sm underline underline-offset-4"
              >
                View notification history
              </Link>
            </section>
          </div>
          <div className="min-w-0 space-y-6">
            {tutor && city !== undefined && (
              <section className={card} aria-labelledby="city-title">
                <h2 id="city-title" className="acc-title">
                  <MapPin aria-hidden className="size-[18px]" />
                  Your city
                </h2>
                <p className="acc-city">{city || "No city added yet"}</p>
                {city && cityMap && (
                  <iframe
                    className="acc-map"
                    title={"Map of " + city}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={osmEmbed(cityMap)}
                  />
                )}
                <p className="acc-muted">
                  Only your city is shown to learners, never your address.
                </p>
                <Link to="/tutor" className="acc-link">
                  {city ? "Change city" : "Add your city"}
                </Link>
              </section>
            )}
            {/* Identity verification is a Tutor option, so Learners do not see it (ADR0021). */}
            {tutor && (
              <section className={card} aria-labelledby="identification-title">
                <h2 id="identification-title" className="text-center text-base font-bold">
                  Identification
                </h2>
                <div
                  aria-hidden
                  className="mx-auto my-7 flex size-32 items-center justify-center rounded-full bg-[#f7f7f7]"
                >
                  <ShieldCheck className="size-12 text-[#ff6268]" />
                </div>
                <p className="text-center text-sm leading-relaxed text-muted-foreground">
                  Identity verification is optional. Email verification and identity review are
                  separate.
                </p>
                {tutor && identityVerified !== undefined && (
                  <p className="mt-4 text-center text-sm font-semibold">
                    {identityVerified ? "Identity reviewed" : "Identity not verified"}
                  </p>
                )}
                <Button asChild variant="outline" className="mt-6 w-full rounded-full">
                  <Link to="/tutor">Manage optional identity verification</Link>
                </Button>
              </section>
            )}
          </div>
          <div className="min-w-0 space-y-6">
            <AccountPhotoCard user={user} className={card} />
            {hasStaff && (
              <section className="acc-admin" aria-labelledby="admin-title">
                <h2 id="admin-title">
                  <ShieldUser aria-hidden className="size-5" />
                  Admin
                </h2>
                <p>You have staff access. Manage Tutors, ads, payments and support.</p>
                <Link to="/staff">Open admin dashboard</Link>
              </section>
            )}
          </div>
        </div>
        {securityError && (
          <div className="mt-5">
            <Notice tone="error">{securityError}</Notice>
          </div>
        )}
        {signOutError && (
          <div className="mt-5">
            <Notice tone="error">{signOutError}</Notice>
          </div>
        )}
        <footer className="acc-foot" aria-label="More account options">
          <Link to="/privacy" className="acc-foot-link">
            <Database aria-hidden className="size-4" />
            Your data and privacy
          </Link>
          <details id="security" className="acc-fold scroll-mt-28">
            <summary>
              <LockKeyhole aria-hidden className="size-4" />
              Security and sessions
            </summary>
            <div>
              <Link to="/auth/forgot-password" className="acc-link">
                Reset password
              </Link>
              <h3 className="acc-sub">Active sessions</h3>
              <ul className="space-y-3">
                {sessions.map((session) => (
                  <li key={session.id} className="acc-session">
                    <p className="text-sm font-medium">
                      {session.current ? "This session" : "Other session"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Signed in {new Date(session.created_at).toLocaleString()}. Expires{" "}
                      {new Date(session.expires_at).toLocaleString()}.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      disabled={security.loading}
                      onClick={() => void revoke(session.id)}
                    >
                      {session.current ? "Sign out this session" : "Revoke session"}
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={security.loading || !sessions.some((session) => !session.current)}
                onClick={() => void revoke()}
              >
                Sign out other sessions
              </Button>
            </div>
          </details>
          <details className="acc-fold">
            <summary>
              <LifeBuoy aria-hidden className="size-4" />
              Help and support
            </summary>
            <div className="acc-help">
              <Link to="/support">Support and appeals</Link>
              <Link to="/feedback">Beta feedback and suggestions</Link>
              {siteFeatures.community && <Link to="/community">Community chat</Link>}
              <Link to="/safety">Safety and reports</Link>
              <Link to="/reviews">My reviews</Link>
            </div>
          </details>
          <button
            type="button"
            className="acc-signout"
            onClick={onSignOut}
            disabled={signOut.loading}
          >
            <LogOut aria-hidden className="size-4" />
            {signOut.loading ? "Signing out..." : "Sign out"}
          </button>
        </footer>
      </div>
    </AuthShell>
  );
}
