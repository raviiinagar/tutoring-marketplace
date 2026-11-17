import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MessageCircle, UserRoundCog } from "lucide-react";
import { api, describeFailure, type OnboardingHelpRequest } from "@/lib/api";
import { teamContact, whatsappLink } from "@/lib/team-contact";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

const whatToSend = [
  "A clear photo of yourself for your profile",
  "The subjects, classes or exams you teach",
  "Your fee per hour or per lesson",
  "Your city, or that you teach online",
  "Certificates or degrees, if you would like them mentioned",
];

function ContactTeam({ reference }: { reference: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Message our team on WhatsApp and quote your reference <strong>{reference}</strong>. Send:
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {whatToSend.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Please do not send Aadhaar or other identity documents. Identity verification is optional
        and separate.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <a
            href={whatsappLink(
              `Hi, I would like the team to set up my Tutor profile. My reference is ${reference}.`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle aria-hidden className="size-4" />
            WhatsApp {teamContact.whatsappDisplay}
          </a>
        </Button>
        {teamContact.email && (
          <a
            className="link text-sm"
            href={`mailto:${teamContact.email}?subject=${encodeURIComponent(reference)}`}
          >
            Or email {teamContact.email}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The second way to become a Tutor (ADR0018): send your details to the team and let
 * them set up and publish your profile. Shown on the Tutor page above the wizard.
 */
export function TeamSetup({ hasProfile }: { hasProfile: boolean }) {
  const [state, setState] = useState<{
    consents: string[];
    request: OnboardingHelpRequest | null;
  }>();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState<boolean[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState<string>();
  const key = useRef(crypto.randomUUID());
  const { loading, run } = useSingleFlight();
  const ids = useId();
  useEffect(() => {
    let alive = true;
    void api.onboardingHelp().then((r) => {
      if (!alive) return;
      if (r.ok) setState({ consents: r.data.policy.consents, request: r.data.request });
    });
    return () => {
      alive = false;
    };
  }, []);
  // Hidden until loaded, and when the feature cannot be reached, so the wizard never shifts.
  if (!state) return null;
  const active =
    state.request && ["OPEN", "IN_PROGRESS"].includes(state.request.status) ? state.request : null;

  if (active)
    return (
      <section
        aria-labelledby={ids + "-title"}
        className="rounded-2xl border bg-secondary/60 p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <UserRoundCog aria-hidden className="mt-0.5 size-6 shrink-0 text-coral-strong" />
          <div>
            <h2 id={ids + "-title"} className="text-lg font-semibold">
              Our team is setting up your profile
            </h2>
            <p role="status" className="text-sm text-muted-foreground">
              {active.status === "IN_PROGRESS"
                ? "A team member is working on it now."
                : "Your request is waiting for a team member."}{" "}
              You can still edit your profile yourself below.
            </p>
          </div>
        </div>
        <ContactTeam reference={active.reference} />
        {error && <Notice tone="error">{error}</Notice>}
        {confirmWithdraw ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">The team will stop working on your profile.</span>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() =>
                void run(async () => {
                  const r = await api.cancelOnboardingHelp();
                  if (r.ok) {
                    setState({ ...state, request: r.data.request });
                    setConfirmWithdraw(false);
                    setOpen(false);
                  } else setError(describeFailure(r.error));
                })
              }
            >
              Withdraw my request
            </Button>
            <Button variant="ghost" onClick={() => setConfirmWithdraw(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="px-0 underline"
            onClick={() => setConfirmWithdraw(true)}
          >
            I'd rather do it myself
          </Button>
        )}
      </section>
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setError(undefined);
      if (!state.consents.every((_, i) => agreed[i])) {
        setError("Tick each box to let the team set up your profile.");
        return;
      }
      const r = await api.requestOnboardingHelp({
        request_key: key.current,
        whatsapp_number: number,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (r.ok) {
        key.current = crypto.randomUUID();
        setState({ ...state, request: r.data.request });
      } else setError(describeFailure(r.error));
    });
  };
  const completed = state.request?.status === "COMPLETED" ? state.request : null;
  return (
    <section aria-labelledby={ids + "-title"} className="rounded-2xl border p-5 space-y-4">
      {completed && (
        <Notice tone="success">
          Our team finished setting up your profile. Check it below and change anything you like.
        </Notice>
      )}
      <div className="flex items-start gap-3">
        <UserRoundCog aria-hidden className="mt-0.5 size-6 shrink-0 text-coral-strong" />
        <div>
          <h2 id={ids + "-title"} className="text-lg font-semibold">
            {hasProfile ? "Need help with your profile?" : "Prefer that we set it up for you?"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasProfile
              ? "Our team can finish and publish your profile and ad for you."
              : "Set it up yourself below, or send your details to our team and we will create and publish your profile and ad for you. It's free."}
          </p>
        </div>
      </div>
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Send my details to the team
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor={ids + "-number"} className="text-sm font-semibold">
              Your WhatsApp number
            </label>
            <input
              id={ids + "-number"}
              className="input w-full max-w-xs"
              inputMode="tel"
              autoComplete="tel"
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              aria-describedby={ids + "-number-hint"}
            />
            <p id={ids + "-number-hint"} className="text-xs text-muted-foreground">
              The number you will message us from, so we can match your details to your account.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor={ids + "-note"} className="text-sm font-semibold">
              Anything we should know? (optional)
            </label>
            <textarea
              id={ids + "-note"}
              className="input min-h-20 w-full"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Your permission</legend>
            {state.consents.map((text, i) => (
              <label key={text} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!agreed[i]}
                  onChange={(e) =>
                    setAgreed((old) => Object.assign([...old], { [i]: e.target.checked }))
                  }
                />
                <span>{text}</span>
              </label>
            ))}
          </fieldset>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send to the team"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
