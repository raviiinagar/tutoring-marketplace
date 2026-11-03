import { PaymentCheckout } from "./payment-checkout";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  api,
  describeFailure,
  type PublicOffer,
  type LearnerProfile,
  type RequestAccess,
  type ContactRequest,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { RequestDeadline } from "./request-deadline";
import { enquiryTarget, enquiryTextError } from "@/lib/enquiry";

export function ContactRequestForm({
  listing,
  initialRequest,
}: {
  listing: PublicOffer;
  initialRequest?: ContactRequest;
}) {
  const [signedIn, setSignedIn] = useState(false),
    [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<LearnerProfile[]>([]),
    [access, setAccess] = useState<RequestAccess>();
  const [learner, setLearner] = useState(""),
    [goals, setGoals] = useState(""),
    [times, setTimes] = useState("");
  const [error, setError] = useState<string>(),
    [fieldErrors, setFieldErrors] = useState<{
      learner?: string | undefined;
      goals?: string | undefined;
      times?: string | undefined;
    }>({});
  const fieldId = useId();
  const [sent, setSent] = useState<ContactRequest>(),
    [reviewing, setReviewing] = useState(false);
  const key = useRef<string | undefined>(undefined),
    account = useRef<string | undefined>(undefined),
    firstAccount = useRef<string | undefined>(undefined);
  const draft = useRef({ learner, goals, times });
  draft.current = { learner, goals, times };
  const reload = useRef<() => Promise<void>>(async () => {}),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    resultPanel = useRef<HTMLDivElement>(null);
  const { loading, run } = useSingleFlight();
  useEffect(() => {
    let active = true,
      generation = 0;
    const reset = () => {
      setProfiles([]);
      setAccess(undefined);
      setLearner("");
      setGoals("");
      setTimes("");
      setSent(undefined);
      setReviewing(false);
      setFieldErrors({});
      key.current = undefined;
    };
    const load = async () => {
      const version = ++generation;
      const me = await api.me();
      if (!active || version !== generation) return;
      if (!me.ok) {
        setAccess(undefined);
        if (me.error.kind === "http" && me.error.status === 401) {
          reset();
          account.current = undefined;
          setSignedIn(false);
          setError(undefined);
        } else setError(describeFailure(me.error));
        setReady(true);
        return;
      }
      const changed = account.current !== me.data.user.id;
      if (changed) {
        reset();
        setReady(false);
      }
      account.current = me.data.user.id;
      firstAccount.current ??= me.data.user.id;
      setSignedIn(true);
      const [learners, covered] = await Promise.all([api.learners(), api.requestAccess()]);
      if (!active || version !== generation) return;
      setError(undefined);
      if (learners.ok) {
        const usable = learners.data.profiles.filter((p) => p.usable);
        setProfiles(usable);
        const selected = !changed && usable.find((p) => p.id === draft.current.learner);
        if (!selected) {
          const previous = firstAccount.current === me.data.user.id ? initialRequest : undefined;
          const chosen = previous ? usable.find((p) => p.id === previous.learner_id) : usable[0];
          setLearner(chosen?.id || "");
          setGoals(chosen ? previous?.learning_requirements || chosen.learning_requirements : "");
          setTimes(chosen ? previous?.preferred_times || "" : "");
          setReviewing(false);
          key.current = undefined;
        }
      } else {
        setProfiles([]);
        setError(describeFailure(learners.error));
      }
      if (covered.ok) setAccess(covered.data);
      else {
        setAccess(undefined);
        setError(describeFailure(covered.error));
      }
      setReady(true);
    };
    reload.current = load;
    void load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [listing.id, initialRequest]);
  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
  }, [reviewing]);
  useEffect(() => {
    if (sent) resultPanel.current?.focus();
  }, [sent]);
  const refreshAccess = useCallback(async () => {
    const forAccount = account.current;
    const result = await api.requestAccess();
    if (account.current !== forAccount) return;
    if (result.ok) {
      setAccess(result.data);
      setError(undefined);
    } else {
      setAccess(undefined);
      setError(describeFailure(result.error));
    }
  }, []);
  const validate = () => {
    const next = {
      learner: profiles.some((p) => p.id === learner)
        ? undefined
        : "Choose a usable Learner profile.",
      goals: enquiryTextError(goals, 20, 500),
      times: enquiryTextError(times, 5, 160),
    };
    setFieldErrors(next);
    return !Object.values(next).some(Boolean);
  };
  const review = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (validate()) setReviewing(true);
  };
  const submit = () => {
    if (!reviewing || !signedIn || !access?.can_request || !validate()) return;
    void run(async () => {
      const forAccount = account.current;
      setError(undefined);
      key.current ??= crypto.randomUUID();
      const result = await api.sendContactRequest({
        request_key: key.current,
        listing_id: listing.id,
        listing_revision: listing.revision,
        learner_id: learner,
        subject_id: listing.offer.subject_id,
        teaching_mode: listing.offer.teaching_mode,
        learning_requirements: goals.trim(),
        preferred_times: times.trim(),
      });
      if (account.current !== forAccount) return;
      if (result.ok) setSent(result.data.request);
      else {
        setError(describeFailure(result.error));
        if (
          result.error.kind === "http" &&
          ["ACCESS_REQUIRED", "PENDING_LIMIT"].includes(result.error.code)
        )
          await refreshAccess();
        if (result.error.kind === "http" && result.error.status < 500) key.current = undefined;
      }
    });
  };
  const selected = profiles.find((p) => p.id === learner);
  const target =
    enquiryTarget(listing.public_path?.slice("/teachers/".length)) ||
    enquiryTarget(listing.offer.subject_id.replace(/^subject-/, "") + "-" + listing.id);
  return (
    <section
      aria-label="Tutor enquiry"
      className="mt-8 min-w-0 rounded-3xl border bg-card p-5 sm:p-8"
    >
      <h2 className="text-2xl font-semibold">Contact {listing.tutor.display_name}</h2>
      <p className="mt-3 break-words text-sm font-medium">{listing.offer.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {listing.offer.teaching_mode === "IN_PERSON" ? "In person" : "Online"} · ₹
        {(listing.offer.rate_paise / 100).toLocaleString("en-IN")} /{" "}
        {listing.offer.rate_unit === "HOUR"
          ? "hour"
          : `lesson (${listing.offer.lesson_minutes} min)`}{" "}
        · Tuition paid directly to the Tutor
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Introduce your learning goals and availability. This is an enquiry, not a class booking.
        Keep personal contacts, links and sensitive documents out of your message.
      </p>
      {error && !reviewing && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void reload.current()}
          >
            Try again
          </Button>
        </div>
      )}
      {!ready ? (
        <p role="status" className="mt-5">
          Checking your request access…
        </p>
      ) : !signedIn ? (
        <div className="mt-5 rounded-2xl bg-amber-50 p-5">
          <p className="text-sm">
            Sign in to prepare your enquiry. Nothing is sent until you review it and select Send
            enquiry.
          </p>
          <Button className="mt-4 rounded-full" asChild>
            <Link to="/auth/signin" search={target ? { enquire: target } : {}}>
              Sign in to send an enquiry
            </Link>
          </Button>
        </div>
      ) : sent ? (
        <div ref={resultPanel} tabIndex={-1} className="mt-5 space-y-4 outline-none">
          <Notice tone="success">Enquiry submitted to {listing.tutor.display_name}.</Notice>
          <RequestDeadline request={sent} />
          <p className="text-sm text-muted-foreground">
            If the Tutor accepts, your Connection will let you discuss classes. No lesson is booked
            by sending this enquiry.
          </p>
          {sent.connection_id && (
            <Link
              to="/connections/$connectionId"
              params={{ connectionId: sent.connection_id }}
              className="link block"
            >
              Open your Connection
            </Link>
          )}
          <Link to="/requests" className="link block">
            View your Contact Requests
          </Link>
        </div>
      ) : (
        <>
          <ol aria-label="Enquiry progress" className="mt-6 flex flex-wrap gap-3 text-sm">
            <li
              aria-current={!reviewing ? "step" : undefined}
              className={!reviewing ? "font-semibold text-primary" : "text-muted-foreground"}
            >
              1. Write your message
            </li>
            <li
              aria-current={reviewing ? "step" : undefined}
              className={reviewing ? "font-semibold text-primary" : "text-muted-foreground"}
            >
              2. Review & send
            </li>
          </ol>
          {!profiles.length && (
            <div className="mt-5 space-y-3 rounded-2xl bg-secondary p-5">
              <p className="text-sm">
                Create a usable Learner profile first. For a child, use your Guardian-managed
                Learner profile.
              </p>
              <Link to="/learners" target="_blank" rel="noopener noreferrer" className="link block">
                Create or update your Learner profile (opens a new tab)
              </Link>
              <Button type="button" variant="outline" onClick={() => void reload.current()}>
                Check Learner profiles again
              </Button>
            </div>
          )}
          {!reviewing ? (
            <form noValidate className="mt-5 space-y-5" onSubmit={review}>
              <label className="block text-sm font-medium">
                Learner profile
                <select
                  aria-label="Learner profile"
                  aria-invalid={!!fieldErrors.learner}
                  aria-describedby={fieldErrors.learner ? fieldId + "-learner-error" : undefined}
                  className="input mt-2"
                  value={learner}
                  onChange={(e) => {
                    setLearner(e.target.value);
                    setGoals(
                      profiles.find((p) => p.id === e.target.value)?.learning_requirements || "",
                    );
                    setFieldErrors({});
                    key.current = undefined;
                  }}
                >
                  <option value="">Choose a usable Learner profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.alias} ({p.kind === "CHILD" ? "Guardian managed" : "Adult"})
                    </option>
                  ))}
                </select>
                {fieldErrors.learner && (
                  <span
                    id={fieldId + "-learner-error"}
                    className="mt-2 block text-sm text-destructive"
                  >
                    {fieldErrors.learner}
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium">
                Learning requirements
                <textarea
                  aria-label="Learning requirements"
                  aria-invalid={!!fieldErrors.goals}
                  aria-describedby={fieldId + "-goals-help"}
                  className="input mt-2 min-h-32"
                  minLength={20}
                  maxLength={500}
                  placeholder="Tell the Tutor your subject, level and what you would like help with."
                  value={goals}
                  onChange={(e) => {
                    setGoals(e.target.value);
                    setFieldErrors((v) => ({ ...v, goals: undefined }));
                    key.current = undefined;
                  }}
                />
                <span
                  id={fieldId + "-goals-help"}
                  className={`mt-2 block text-xs ${fieldErrors.goals ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {fieldErrors.goals || `${goals.trim().length}/500 characters · at least 20`}
                </span>
              </label>
              <label className="block text-sm font-medium">
                Preferred times
                <textarea
                  aria-label="Preferred times"
                  aria-invalid={!!fieldErrors.times}
                  aria-describedby={fieldId + "-times-help"}
                  className="input mt-2 min-h-20"
                  minLength={5}
                  maxLength={160}
                  placeholder="For example: Tuesday and Thursday evenings, IST"
                  value={times}
                  onChange={(e) => {
                    setTimes(e.target.value);
                    setFieldErrors((v) => ({ ...v, times: undefined }));
                    key.current = undefined;
                  }}
                />
                <span
                  id={fieldId + "-times-help"}
                  className={`mt-2 block text-xs ${fieldErrors.times ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {fieldErrors.times ||
                    `${times.trim().length}/160 characters · include your timezone`}
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Your draft stays on this page. Reviewing it does not send an enquiry or create a
                payment.
              </p>
              <Button className="rounded-full" type="submit" disabled={!profiles.length}>
                Review enquiry
              </Button>
            </form>
          ) : (
            <div className="mt-5 space-y-5">
              <h3 ref={reviewHeading} tabIndex={-1} className="text-xl font-semibold outline-none">
                Review your enquiry
              </h3>
              <dl className="space-y-4 rounded-2xl bg-secondary p-5 text-sm">
                <div>
                  <dt className="font-semibold">Learner</dt>
                  <dd className="mt-1">
                    {selected?.alias}
                    {selected?.kind === "CHILD" ? " · Guardian managed" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Learning requirements</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">{goals.trim()}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Preferred times</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">{times.trim()}</dd>
                </div>
              </dl>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setReviewing(false)}
              >
                Edit message
              </Button>
              <div className="space-y-3 border-t pt-5">
                <h3 className="text-lg font-semibold">Your enquiry access</h3>
                {access?.coverage?.test_only && (
                  <Notice tone="info">Test access only. No real money was charged.</Notice>
                )}
                {access?.coverage?.status === "MATCHING" && (
                  <Notice tone="info">
                    {access.coverage.source === "COUPON"
                      ? "Coupon redeemed. No payment required."
                      : access.coverage.source === "PAYMENT"
                        ? "Payment confirmed."
                        : "Access is ready."}{" "}
                    Your 30-day pass starts with the first eligible Tutor acceptance.
                  </Notice>
                )}
                {access?.coverage?.status === "ACTIVE" && (
                  <p className="text-sm font-semibold text-success">
                    Access Pass active until {new Date(access.coverage.expires_at).toLocaleString()}
                    .
                  </p>
                )}
                {!access ? (
                  <Notice tone="info">
                    Your access could not be confirmed. Check again before sending.
                  </Notice>
                ) : (
                  !access.can_request && (
                    <Notice tone="info">
                      {access.reason === "PENDING_LIMIT"
                        ? `You have reached the limit of ${access.pending_limit} pending enquiries. Wait for a response or expiry before sending another.`
                        : "An Access Pass or eligible coupon coverage is required to send. Your draft has not been sent."}
                    </Notice>
                  )
                )}
                <p className="text-sm text-muted-foreground">
                  {access?.pending_count ?? 0} of {access?.pending_limit ?? 5} pending enquiries.
                  Access Pass fees are separate from tuition.
                </p>
                {access && !access.coverage && access.reason === "ACCESS_REQUIRED" && selected && (
                  <PaymentCheckout
                    listing={listing}
                    learnerId={learner}
                    onAccessChange={refreshAccess}
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void refreshAccess()}
                >
                  Check access again
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Sending asks this Tutor to connect about your learning goals. It does not book a
                lesson, share private contact details or automatically renew your pass.
              </p>
              {error && <Notice tone="error">{error}</Notice>}
              <Button
                className="rounded-full"
                type="button"
                disabled={loading || !access?.can_request || !selected}
                onClick={submit}
              >
                {loading ? "Sending enquiry…" : "Send enquiry"}
              </Button>
            </div>
          )}
          <Link to="/requests" className="link mt-5 inline-block">
            My Contact Requests
          </Link>
        </>
      )}
    </section>
  );
}
