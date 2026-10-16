import { PaymentCheckout } from "./payment-checkout";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
export function ContactRequestForm({
  listing,
  initialRequest,
}: {
  listing: PublicOffer;
  initialRequest?: ContactRequest;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<LearnerProfile[]>([]);
  const [access, setAccess] = useState<RequestAccess>();
  const [learner, setLearner] = useState("");
  const [goals, setGoals] = useState("");
  const [times, setTimes] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<ContactRequest>();
  const key = useRef<string | undefined>(undefined);
  const { loading, run } = useSingleFlight();
  useEffect(() => {
    let active = true;
    const load = async () => {
      const me = await api.me();
      if (!active) return;
      if (!me.ok) {
        if (me.error.kind === "http" && me.error.status === 401) {
          setReady(true);
          return;
        }
        setError(describeFailure(me.error));
        setReady(true);
        return;
      }
      setSignedIn(true);
      const [learners, covered] = await Promise.all([api.learners(), api.requestAccess()]);
      if (!active) return;
      if (learners.ok) {
        const usable = learners.data.profiles.filter((p) => p.usable);
        setProfiles(usable);
        const chosen = initialRequest
          ? usable.find((p) => p.id === initialRequest.learner_id)
          : usable[0];
        if (chosen) {
          setLearner(chosen.id);
          setGoals(initialRequest?.learning_requirements || chosen.learning_requirements);
          setTimes(initialRequest?.preferred_times || "");
        }
      } else setError(describeFailure(learners.error));
      if (covered.ok) setAccess(covered.data);
      else setError(describeFailure(covered.error));
      setReady(true);
    };
    void load();
    return () => {
      active = false;
    };
  }, [listing.id, initialRequest]);
  const refreshAccess = useCallback(async () => {
    const result = await api.requestAccess();
    if (result.ok) setAccess(result.data);
    else setError(describeFailure(result.error));
  }, []);
  useEffect(() => {
    const focus = () => void refreshAccess();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refreshAccess]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setError(undefined);
      key.current ??= crypto.randomUUID();
      const result = await api.sendContactRequest({
        request_key: key.current,
        listing_id: listing.id,
        listing_revision: listing.revision,
        learner_id: learner,
        subject_id: listing.offer.subject_id,
        teaching_mode: "ONLINE",
        learning_requirements: goals,
        preferred_times: times,
      });
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
  return (
    <section className="mt-8 rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Send a Contact Request</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Describe what you want to learn and when you are available. This is an enquiry; the Tutor
        has not accepted a lesson. Keep personal contacts, links and sensitive documents out of your
        message.
      </p>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!ready ? (
        <p role="status" className="mt-4">
          Checking your request access…
        </p>
      ) : !signedIn ? (
        <Link to="/auth/signin" className="link mt-4 inline-block">
          Sign in to send an enquiry
        </Link>
      ) : sent ? (
        <div className="mt-5 space-y-4">
          <Notice tone="success">
            Your Contact Request is {sent.status.toLowerCase()}. Response deadline:{" "}
            {new Date(sent.expires_at).toLocaleString()}.
          </Notice>
          <Link to="/requests" className="link">
            View your Contact Requests
          </Link>
        </div>
      ) : (
        <form className="mt-5 space-y-5" onSubmit={submit}>
          {access?.coverage?.test_only && (
            <Notice tone="info">Test access only. No real money was charged.</Notice>
          )}
          {!access?.can_request && (
            <Notice tone="info">
              {access?.reason === "PENDING_LIMIT"
                ? "You already have five pending enquiries. Wait for a response or expiry before sending another."
                : "An Access Pass is required to send an enquiry. Review checkout below."}
            </Notice>
          )}
          {access?.coverage?.status === "MATCHING" && (
            <Notice tone="info">
              Payment confirmed. Send your first enquiry; your 30-day pass starts with the first
              eligible Tutor acceptance.
            </Notice>
          )}
          {access?.coverage?.status === "ACTIVE" && (
            <p className="text-sm font-semibold text-success">
              Access Pass active until {new Date(access.coverage.expires_at).toLocaleString()}.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {access?.pending_count ?? 0} of {access?.pending_limit ?? 5} pending enquiries. Tuition
            stays payable directly to the Tutor.
          </p>
          <label className="block text-sm font-medium">
            Learner profile
            <select
              aria-label="Learner profile"
              className="input mt-2"
              required
              value={learner}
              onChange={(e) => {
                setLearner(e.target.value);
                setGoals(
                  profiles.find((p) => p.id === e.target.value)?.learning_requirements || "",
                );
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
          </label>
          {!profiles.length && (
            <Link to="/learners" className="link inline-block">
              Create or update your Learner profile
            </Link>
          )}
          {!access?.coverage && (
            <PaymentCheckout listing={listing} learnerId={learner} onAccessChange={refreshAccess} />
          )}
          <label className="block text-sm font-medium">
            Learning requirements
            <textarea
              aria-label="Learning requirements"
              className="input mt-2 min-h-28"
              required
              minLength={20}
              maxLength={500}
              value={goals}
              onChange={(e) => {
                setGoals(e.target.value);
                key.current = undefined;
              }}
            />
          </label>
          <label className="block text-sm font-medium">
            Preferred times
            <textarea
              aria-label="Preferred times"
              className="input mt-2 min-h-20"
              required
              minLength={5}
              maxLength={160}
              placeholder="For example: Tuesday and Thursday evenings, IST"
              value={times}
              onChange={(e) => {
                setTimes(e.target.value);
                key.current = undefined;
              }}
            />
          </label>
          <Button
            className="rounded-full"
            type="submit"
            disabled={loading || !access?.can_request || !learner}
          >
            {loading ? "Sending enquiry…" : "Send enquiry"}
          </Button>
          <Link to="/requests" className="link ml-4 inline-block">
            My Contact Requests
          </Link>
        </form>
      )}
    </section>
  );
}
