import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api, describeFailure, localMailCapture } from "@/lib/api";
import { mergeServerFieldErrors, validateEmail } from "@/lib/validation";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";

export const Route = createFileRoute("/auth/check-email")({
  validateSearch: (s: Record<string, unknown>): { email?: string } =>
    typeof s["email"] === "string" ? { email: s["email"].slice(0, 254) } : {},
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Check your email — Tutor Marketplace" },
      { name: "description", content: "Verify your email to finish creating your Tutor Marketplace account." },
      { property: "og:title", content: "Check your email — Tutor Marketplace" },
      { property: "og:description", content: "Verify your email address." },
    ],
  }),
  component: CheckEmail,
});

function CheckEmail() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string }>();
  const { loading, run } = useSingleFlight();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      setNotice(undefined);
      const err = validateEmail(email);
      setError(err);
      if (err) return;
      const res = await api.resendVerification(email.trim());
      if (res.ok) setNotice({ tone: "success", text: "If this email can be registered, a new verification link will arrive shortly." });
      else {
        if (res.error.kind === "http" && res.error.field_errors) setError(mergeServerFieldErrors(res.error.field_errors).email);
        setNotice({ tone: "error", text: describeFailure(res.error) });
      }
    });
  };

  return (
    <AuthShell
      title="Check your email"
      intro={
        <>
          <p>If this email can be registered, a verification link will arrive shortly.</p>
          <p className="mt-2">The link expires after 15 minutes. Didn't get it? Request a new one below.</p>
        </>
      }
      footer={<>Already verified? <Link to="/auth/signin" className="link">Sign in</Link></>}
    >
      {localMailCapture && <div className="mb-5"><Notice tone="info">Local testing: no email is sent to your real inbox. <a className="link" href="/dev/inbox">Open captured email inbox</a> to verify your account.</Notice></div>}
      <form noValidate onSubmit={onSubmit} className="space-y-5">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <SubmitButton loading={loading} loadingText="Sending…">Send new verification email</SubmitButton>
      </form>
    </AuthShell>
  );
}
