import "../workspace.css";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Award,
  Check,
  Copy,
  GraduationCap,
  Mail,
  Send,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeFailure, type User } from "@/lib/api";
import { reputationApi, type RecommendationRelationship } from "@/lib/tutor-reputation-api";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import { AuthShell, Field, Notice, useSingleFlight } from "./account/ui";
import { Button } from "./ui/button";
import { TutorProgressionPanel, useReputationRead } from "./tutor-progression";

export const recommendationStatuses = {
  PENDING: "Awaiting review",
  PUBLISHED: "Published",
  REJECTED: "Not approved",
  WITHDRAWN: "Withdrawn",
} as const;
const relationshipLabels = {
  FORMER_STUDENT: "Former student",
  COLLEAGUE: "Colleague",
  FAMILY: "Family",
  OTHER: "Other acquaintance",
} as const;
export function TutorEvaluationsPage() {
  const account = useTutorAccount(),
    navigate = useNavigate();
  useEffect(() => {
    if (account.anonymous) void navigate({ to: "/auth/signin", replace: true });
  }, [account.anonymous, navigate]);
  return (
    <AuthShell wide dashboard title="Your evaluations">
      {account.user?.roles.includes("TUTOR") ? (
        <TutorRecommendations key={account.user.id} user={account.user} />
      ) : account.user ? (
        <p>
          Enable the Tutor role in{" "}
          <Link className="link" to="/account/settings">
            account settings
          </Link>{" "}
          to manage your evaluations.
        </p>
      ) : account.error ? (
        <Notice tone="error">{account.error}</Notice>
      ) : (
        <p role="status">{account.anonymous ? "Please sign in." : "Loading your account…"}</p>
      )}
    </AuthShell>
  );
}
function TutorRecommendations({ user }: { user: User }) {
  const query = useReputationRead(user.id, "recommendations", reputationApi.recommendations);
  const profile = useReputationRead(user.id, "profile", api.tutor);
  const [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false),
    [tab, setTab] = useState<"rec" | "level" | "diploma">("rec");
  const publicId =
    profile.data?.ok && profile.data.data.profile?.eligible
      ? profile.data.data.profile.public_id
      : undefined;
  const path = publicId ? "/recommendations/" + encodeURIComponent(publicId) : undefined;
  const link = path && typeof window !== "undefined" ? window.location.origin + path : undefined;
  const ask = link
    ? `Hi! I teach on Tutor Marketplace. Could you write a short recommendation about my teaching? ${link}`
    : "";
  const tabs = [
    ["rec", "Recommendations", Star],
    ["level", "My level", Award],
    ["diploma", "Diploma", GraduationCap],
  ] as const;
  return (
    <div className="ev-wrap">
      <div
        className="ev-nav"
        role="tablist"
        aria-label="Evaluations"
        aria-orientation="vertical"
        onKeyDown={(event) => {
          const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
          if (!step) return;
          event.preventDefault();
          const index = tabs.findIndex(([id]) => id === tab);
          const next = tabs[(index + step + tabs.length) % tabs.length]![0];
          setTab(next);
          document.getElementById("ev-tab-" + next)?.focus();
        }}
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={"ev-tab-" + id}
            aria-controls={"ev-panel-" + id}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            <Icon aria-hidden className="size-[18px]" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-w-0">
        <section
          className="ev-panel ev-center"
          role="tabpanel"
          id="ev-panel-rec"
          aria-labelledby="ev-tab-rec"
          hidden={tab !== "rec"}
        >
          <div className="ev-benefits">
            <div>
              <span className="ws-tile" aria-hidden="true">
                <UserRound className="size-7" />
              </span>
              Shown on your profile
            </div>
            <div>
              <span className="ws-tile ws-tile-butter" aria-hidden="true">
                <Award className="size-7" />
              </span>
              Counts towards Experienced
            </div>
            <div>
              <span className="ws-tile ws-tile-ok" aria-hidden="true">
                <ShieldCheck className="size-7" />
              </span>
              Checked by our team
            </div>
          </div>
          <hr className="ev-hr" />
          <h2>Ask people who know your teaching</h2>
          <p className="ev-text">
            Former students, colleagues, family or friends can recommend you. A recommendation is a
            network endorsement, not a verified lesson or a star review. Each one appears on your
            profile after our team has reviewed it.
          </p>
          <hr className="ev-hr" />
          {link ? (
            <>
              <p className="ev-label">Ask for a recommendation via</p>
              <div className="ev-via">
                <a
                  className="ws-btn ws-btn-primary ws-btn-sm"
                  href={
                    "mailto:?subject=" +
                    encodeURIComponent("Could you recommend my teaching?") +
                    "&body=" +
                    encodeURIComponent(ask)
                  }
                >
                  <Mail aria-hidden className="size-[18px]" />
                  Email
                </a>
                <a
                  className="ws-btn ws-btn-soft ws-btn-sm"
                  href={"https://wa.me/?text=" + encodeURIComponent(ask)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send aria-hidden className="size-[18px]" />
                  WhatsApp
                </a>
              </div>
              <hr className="ev-hr" />
              <p className="ev-label">Or share your link</p>
              <div className="ev-linkrow">
                <label htmlFor="ev-link" className="sr-only">
                  Your recommendation link
                </label>
                <input id="ev-link" value={link} readOnly />
                <button
                  type="button"
                  className="ws-btn ws-btn-ink ws-btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                      setCopyError(false);
                    } catch {
                      setCopyError(true);
                      setCopied(false);
                    }
                  }}
                >
                  <Copy aria-hidden className="size-[18px]" />
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
              {copyError && (
                <p role="status" className="ev-text">
                  Select and copy the link above.
                </p>
              )}
            </>
          ) : profile.isPending ? (
            <p role="status">Loading profile link…</p>
          ) : profile.isError || profile.data?.ok === false ? (
            <>
              <Notice tone="error">Could not load your profile link.</Notice>
              <Button variant="outline" onClick={() => void profile.refetch()}>
                Retry profile link
              </Button>
            </>
          ) : (
            <p className="ev-text">
              Your link becomes available when your profile is published.{" "}
              <Link className="link" to="/tutor">
                Check profile and identity status
              </Link>
              .
            </p>
          )}
          <hr className="ev-hr" />
          <p className="ev-label">Your recommendations</p>
          {query.isPending ? (
            <p role="status">Loading recommendations…</p>
          ) : query.isError || query.data?.ok === false ? (
            <>
              <Notice tone="error">
                Could not load recommendations. This is not an empty result.
              </Notice>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Retry recommendations
              </Button>
            </>
          ) : query.data?.ok ? (
            query.data.data.recommendations.length ? (
              <ul className="ev-rows">
                {query.data.data.recommendations.map((row) => (
                  <li key={row.id}>
                    <span
                      className={`ev-dot${row.status === "PUBLISHED" ? " is-ok" : ""}`}
                      aria-hidden="true"
                    >
                      {row.status === "PUBLISHED" && <Check className="size-3.5" />}
                    </span>
                    <span>
                      <b>{relationshipLabels[row.relationship]}</b>
                      <small>
                        {recommendationStatuses[row.status]} ·{" "}
                        {new Date(row.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </small>
                      {row.review_reason && (
                        <small>Feedback from our team: {row.review_reason}</small>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ev-text">
                No recommendations yet. Share your link with someone who knows your work.
              </p>
            )
          ) : null}
        </section>
        <section
          className="ev-panel"
          role="tabpanel"
          id="ev-panel-level"
          aria-labelledby="ev-tab-level"
          hidden={tab !== "level"}
        >
          <TutorProgressionPanel id={user.id} />
          <p className="ev-text ev-reviews">
            Student reviews come from connected learners after an eligible interaction; they are
            separate from recommendations.{" "}
            <Link className="link" to="/connections">
              Open My messages
            </Link>
          </p>
        </section>
        <section
          className="ev-panel"
          role="tabpanel"
          id="ev-panel-diploma"
          aria-labelledby="ev-tab-diploma"
          hidden={tab !== "diploma"}
        >
          <DiplomaEvidence userId={user.id} />
        </section>
      </div>
    </div>
  );
}
export function RecommendationPage({ profileId }: { profileId: string }) {
  const account = useTutorAccount();
  return (
    <AuthShell
      title="Recommend a Tutor"
      intro="Share an honest recommendation based on how you know this Tutor."
    >
      {account.user ? (
        <RecommendationForm
          key={account.user.id + profileId}
          user={account.user}
          profileId={profileId}
        />
      ) : account.error ? (
        <Notice tone="error">{account.error}</Notice>
      ) : account.anonymous ? (
        <div className="space-y-4">
          <p>
            Sign in with a verified account to submit a recommendation. Return to this link after
            signing in.
          </p>
          <Link to="/auth/signin" className="link">
            Sign in
          </Link>
        </div>
      ) : (
        <p role="status">Loading your account…</p>
      )}
    </AuthShell>
  );
}
function DiplomaEvidence({ userId }: { userId: string }) {
  const client = useQueryClient();
  const policy = useReputationRead(userId, "upload-policy", api.tutorPolicy);
  const [file, setFile] = useState<File>(),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const action = useSingleFlight();
  const settings = policy.data?.ok ? policy.data.data : undefined;
  const upload = (event: FormEvent) => {
    event.preventDefault();
    void action.run(async () => {
      setError(undefined);
      setNotice(undefined);
      if (!file || !confirmed || !settings?.uploads_enabled) return;
      if (file.size > settings.max_bytes || !settings.media_types.includes(file.type)) {
        setError("Choose a PDF, PNG or JPEG within the upload limit.");
        return;
      }
      try {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
          reader.onerror = () => reject(new Error("Could not read your file."));
          reader.readAsDataURL(file);
        });
        const result = await api.uploadTutorEvidence(file.type, data);
        if (!result.ok) {
          setError(describeFailure(result.error));
          return;
        }
        if (result.data.evidence.scan_status !== "CLEAN") {
          setNotice("File uploaded. It must pass scanning before it can be recorded as a diploma.");
          return;
        }
        const linked = await reputationApi.diploma(result.data.evidence.id);
        if (!linked.ok) {
          setError(describeFailure(linked.error));
          return;
        }
        client.setQueryData(["tutor-reputation", userId, "progression"], linked);
        setNotice(
          "Diploma upload recorded privately. This does not verify your qualification or award a badge.",
        );
        setFile(undefined);
        setConfirmed(false);
      } catch {
        setError("Could not read or upload the diploma. Try again.");
      }
    });
  };
  return (
    <details className="ev-diploma" open>
      <summary className="min-h-7 cursor-pointer font-semibold">Optional diploma evidence</summary>
      <p className="mt-3 text-sm text-muted-foreground">
        A diploma is optional for your public introduction. Uploading it is separate from identity
        review and does not verify the qualification. Super Teacher remains unavailable while its
        eligibility rules are unresolved. Do not upload your identity document here.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}
      {policy.isPending ? (
        <p role="status">Loading upload policy…</p>
      ) : !settings ? (
        <>
          <Notice tone="error">Could not load the upload policy.</Notice>
          <Button className="mt-3" variant="outline" onClick={() => void policy.refetch()}>
            Retry upload policy
          </Button>
        </>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={upload}>
          {settings.test_only && (
            <Notice tone="info">
              Fictional testing only. Do not upload a real diploma or identity document.
            </Notice>
          )}
          <label className="block text-sm font-semibold">
            Diploma file
            <input
              className="input mt-2"
              type="file"
              required
              accept={settings.media_types.join(",")}
              disabled={!settings.uploads_enabled || action.loading}
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            PDF, PNG or JPEG · up to {Math.round(settings.max_bytes / 1024)} KiB · kept private.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            This is my diploma evidence, not my identity document.
          </label>
          <Button disabled={!file || !confirmed || !settings.uploads_enabled || action.loading}>
            {action.loading ? "Uploading…" : "Upload private diploma"}
          </Button>
        </form>
      )}
    </details>
  );
}
function RecommendationForm({ user, profileId }: { user: User; profileId: string }) {
  const [relationship, setRelationship] = useState<RecommendationRelationship>("FORMER_STUDENT"),
    [text, setText] = useState(""),
    [attested, setAttested] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const action = useSingleFlight();
  const authored = useReputationRead(user.id, "authored", reputationApi.authored);
  const target = useReputationRead(user.id, "target-" + profileId, () =>
    api.publicTutor(profileId),
  );
  const tutor = target.data?.ok ? target.data.data.profile : undefined;
  const previous =
    authored.data?.ok && tutor
      ? authored.data.data.recommendations.find((row) => row.tutor_public_id === profileId)
      : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void action.run(async () => {
      setError(undefined);
      setNotice(undefined);
      if (!attested) {
        setError("Confirm that this recommendation describes your own genuine experience.");
        return;
      }
      const result = await reputationApi.submit(profileId, {
        relationship,
        text: text.trim(),
        interaction_attested: true,
      });
      if (result.ok) {
        setText("");
        setAttested(false);
        setNotice("Recommendation submitted for staff review. It is not public yet.");
        await authored.refetch();
      } else setError(describeFailure(result.error));
    });
  };
  if (target.isPending || authored.isPending)
    return <p role="status">Loading recommendation page…</p>;
  if (target.isError || target.data?.ok === false || !tutor)
    return (
      <>
        <Notice tone="error">This Tutor profile is currently unavailable.</Notice>
        <Button className="mt-4" variant="outline" onClick={() => void target.refetch()}>
          Retry Tutor profile
        </Button>
      </>
    );
  if (authored.isError || authored.data?.ok === false)
    return (
      <>
        <Notice tone="error">Could not check your existing recommendations.</Notice>
        <Button className="mt-4" variant="outline" onClick={() => void authored.refetch()}>
          Retry recommendations
        </Button>
      </>
    );

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Recommend {tutor.display_name}</h2>
      <p className="text-sm text-muted-foreground">
        Describe how you know this Tutor and what you can honestly recommend. Keep contact details,
        links and private information out. Recommendations are moderated network endorsements; they
        are not verified lessons.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {previous ? (
        <div className="space-y-3 rounded-2xl border p-5">
          <p className="font-semibold">
            Your recommendation: {recommendationStatuses[previous.status]}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{previous.text}</p>
          {previous.status !== "WITHDRAWN" && (
            <Button
              variant="outline"
              disabled={action.loading}
              onClick={() =>
                void action.run(async () => {
                  const result = await reputationApi.withdraw(previous.id);
                  if (result.ok) {
                    setNotice("Recommendation withdrawn. It no longer counts towards Tutor level.");
                    await authored.refetch();
                  } else setError(describeFailure(result.error));
                })
              }
            >
              Withdraw my recommendation
            </Button>
          )}
          <p className="text-xs text-muted-foreground">One recommendation per account and Tutor.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm font-semibold">
            How do you know this Tutor?
            <select
              className="input mt-2"
              value={relationship}
              onChange={(event) =>
                setRelationship(event.target.value as RecommendationRelationship)
              }
            >
              {Object.entries(relationshipLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            Your recommendation
            <textarea
              aria-label="Your recommendation"
              className="input min-h-36 font-normal"
              required
              minLength={40}
              maxLength={1500}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <span className="block text-xs font-normal text-muted-foreground">
              {text.length}/1,500 characters · minimum 40.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              required
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
            />
            This describes my own genuine experience with this Tutor, and I agree to publication
            after staff review.
          </label>
          <Button type="submit" disabled={action.loading}>
            {action.loading ? "Submitting…" : "Submit recommendation for review"}
          </Button>
        </form>
      )}
    </div>
  );
}
