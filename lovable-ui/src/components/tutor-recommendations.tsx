import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
    <AuthShell
      wide
      dashboard
      title="Your evaluations"
      intro="Build your Tutor profile with genuine recommendations and student feedback."
    >
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
    [copyError, setCopyError] = useState(false);
  const publicId =
    profile.data?.ok && profile.data.data.profile?.eligible
      ? profile.data.data.profile.public_id
      : undefined;
  const path = publicId ? "/recommendations/" + encodeURIComponent(publicId) : undefined;
  const link = path && typeof window !== "undefined" ? window.location.origin + path : undefined;
  return (
    <div className="space-y-6">
      <TutorProgressionPanel id={user.id} />
      <DiplomaEvidence userId={user.id} />
      <section className="space-y-4 rounded-3xl border p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Ask for recommendations</h2>
        <p className="text-sm text-muted-foreground">
          Invite former students, colleagues, family or acquaintances who know your work. A
          recommendation is a network endorsement, not a verified lesson or a star review. Every
          submission is reviewed before publication.
        </p>
        {link ? (
          <>
            <Field label="Your recommendation link" value={link} readOnly />
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
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
                {copied ? "Link copied" : "Copy recommendation link"}
              </Button>
              <a className="link inline-flex min-h-11 items-center" href={path}>
                Open recommendation page
              </a>
            </div>
            {copyError && (
              <p role="status" className="text-sm">
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
          <p className="text-sm">
            Your link becomes available when your profile is publicly eligible.{" "}
            <Link className="link" to="/tutor">
              Check profile and identity status
            </Link>
            .
          </p>
        )}
      </section>
      <section className="space-y-4 rounded-3xl border p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Recommendation status</h2>
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
            <ul className="space-y-3">
              {query.data.data.recommendations.map((row) => (
                <li className="rounded-2xl border p-4" key={row.id}>
                  <p className="font-semibold">
                    {relationshipLabels[row.relationship]} · {recommendationStatuses[row.status]}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Submitted {new Date(row.created_at).toLocaleDateString()}
                  </p>
                  {row.review_reason && (
                    <p className="mt-2 text-sm">Staff feedback: {row.review_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recommendations received yet. Share your link with someone who knows your work.
            </p>
          )
        ) : null}
        <p className="text-xs text-muted-foreground">
          This list shows up to 100 recent submissions. The level calculation uses all eligible
          published recommendations.
        </p>
      </section>
      <section className="rounded-3xl border p-5">
        <h2 className="font-semibold">Student reviews</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connected learners and guardians use the existing review flow after an eligible
          interaction. Recommendations do not replace those reviews.
        </p>
        <Link className="link mt-3 inline-block" to="/connections">
          Open Connections
        </Link>
      </section>
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
    <details className="rounded-3xl border p-5 sm:p-7">
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
