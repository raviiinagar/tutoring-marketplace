import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, describeFailure, type ApiFailure, type LearnerProfile } from "@/lib/api";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/learners")({
  ssr: false,
  component: Learners,
  head: () => ({
    meta: [
      { title: "Learner profile — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
/**
 * One adult Learner profile per account (ADR 0015). A parent who books classes
 * for their child does so from their own profile; no child profile, name or age
 * is stored. Child profiles made before ADR 0015 are shown read-only, and their
 * owner can still withdraw consent.
 */
function Learners() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<LearnerProfile[]>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [alias, setAlias] = useState("");
  const [requirements, setRequirements] = useState("");
  const [adult, setAdult] = useState(false);
  const [editing, setEditing] = useState<string>();
  const { loading, run } = useSingleFlight();
  const fail = useCallback(
    (failure: ApiFailure) => {
      if (failure.kind === "http" && failure.status === 401)
        void navigate({ to: "/auth/signin", replace: true });
      else setError(describeFailure(failure));
    },
    [navigate],
  );
  const load = useCallback(async () => {
    const listed = await api.learners();
    if (listed.ok) setProfiles(listed.data.profiles);
    else fail(listed.error);
  }, [fail]);
  useEffect(() => {
    void load();
  }, [load]);
  const own = profiles?.find((item) => item.kind === "ADULT");
  const historical = profiles?.filter((item) => item.kind === "CHILD") ?? [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setError(undefined);
      if (!editing && !adult) {
        setError("Confirm that you are aged 18 or older.");
        return;
      }
      const result = editing
        ? await api.editLearner(editing, alias, requirements)
        : await api.adultLearner(alias, requirements, adult);
      if (result.ok) {
        setNotice(
          editing
            ? "Learner profile updated."
            : "Learner profile saved. You can now choose it when sending an enquiry.",
        );
        setAlias("");
        setRequirements("");
        setEditing(undefined);
        setAdult(false);
        await load();
      } else fail(result.error);
    });
  };
  const withdraw = (id: string) =>
    run(async () => {
      setError(undefined);
      const result = await api.withdrawLearnerConsent(id);
      if (result.ok) {
        setNotice("Consent withdrawn. That profile can no longer be used.");
        await load();
      } else fail(result.error);
    });
  return (
    <AuthShell
      title="Learner profile"
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!profiles ? (
        <p role="status">Loading your profile…</p>
      ) : (
        <>
          <Notice tone="info">
            Booking classes for your child? Use your own profile: you are the Learner on the account
            and the Tutor talks to you. Describe the level and goal, but leave out your child&apos;s
            name, school and other identifying details.
          </Notice>
          {own && !editing && (
            <section className="mt-5 space-y-3 rounded-xl border p-4">
              <h2 className="font-semibold">{own.alias}</h2>
              <p className="text-sm">
                {own.usable ? "Ready for tutoring" : "Not available for tutoring"}
              </p>
              <p className="text-sm">{own.learning_requirements}</p>
              <Button
                type="button"
                variant="outline"
                disabled={loading || !own.usable}
                onClick={() => {
                  setEditing(own.id);
                  setAlias(own.alias);
                  setRequirements(own.learning_requirements);
                }}
              >
                Edit profile
              </Button>
            </section>
          )}
          {(!own || editing) && (
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <h2 className="font-semibold">
                {editing ? "Edit your Learner profile" : "Create your Learner profile"}
              </h2>
              <Field
                label="Learner alias"
                required
                minLength={2}
                hint="The name Tutors see, such as your first name."
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                maxLength={40}
              />
              <Field
                label="Learning requirements"
                required
                minLength={10}
                hint="Describe the learning goal in 10–300 characters. Do not include contact details, identity documents or a child's identifying details."
                value={requirements}
                onChange={(event) => setRequirements(event.target.value)}
                maxLength={300}
              />
              {!editing && (
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={adult}
                    onChange={(event) => setAdult(event.target.checked)}
                  />
                  I confirm this is my own profile and I am aged 18 or older
                </label>
              )}
              <SubmitButton loading={loading} loadingText="Saving…">
                {editing ? "Save profile" : "Create profile"}
              </SubmitButton>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(undefined);
                    setAlias("");
                    setRequirements("");
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </form>
          )}
          {historical.length > 0 && (
            <section className="mt-8 space-y-3" aria-labelledby="historical-title">
              <h2 id="historical-title" className="font-semibold">
                Earlier child profiles
              </h2>
              <p className="text-sm text-muted-foreground">
                Child profiles are no longer offered. These can no longer be used for tutoring; you
                can still withdraw the consent you gave for them.
              </p>
              <ul className="space-y-3">
                {historical.map((item) => (
                  <li key={item.id} className="space-y-2 rounded-xl border p-4">
                    <p className="font-semibold">{item.alias}</p>
                    <p className="text-sm">
                      {item.status === "ACTIVE" ? "No longer available" : "Consent withdrawn"}
                    </p>
                    {item.status === "ACTIVE" && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loading}
                        onClick={() => void withdraw(item.id)}
                      >
                        Withdraw consent
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AuthShell>
  );
}
