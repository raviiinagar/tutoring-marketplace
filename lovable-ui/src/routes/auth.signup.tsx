import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api, describeFailure } from "@/lib/api";
import { hasErrors, mergeServerFieldErrors, validateDisplayName, validateEmail, validateNewPassword, type FieldErrors } from "@/lib/validation";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Create account — Tutor Marketplace" },
      { name: "description", content: "Create your Tutor Marketplace account." },
      { property: "og:title", content: "Create account — Tutor Marketplace" },
      { property: "og:description", content: "Create your Tutor Marketplace account." },
    ],
  }),
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const { loading, run } = useSingleFlight();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      setFormError(undefined);
      const next = { display_name: validateDisplayName(name), email: validateEmail(email), password: validateNewPassword(password) };
      setErrors(next);
      if (hasErrors(next)) return;
      const res = await api.register({ display_name: name.trim(), email: email.trim(), password });
      if (res.ok && res.status === 202) {
        navigate({ to: "/auth/check-email", search: { email: email.trim() } });
        return;
      }
      if (!res.ok) {
        if (res.error.kind === "http" && res.error.field_errors) setErrors(mergeServerFieldErrors(res.error.field_errors));
        setFormError(describeFailure(res.error));
      } else setFormError("Unexpected response. Please try again.");
    });
  };

  return (
    <AuthShell
      title="Create your account"
      intro={<p>This creates your own account. Child learner profiles and guardian tools will come in a later update.</p>}
      footer={<>Already have an account? <Link to="/auth/signin" className="link">Sign in</Link></>}
    >
      <form noValidate onSubmit={onSubmit} className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.display_name} maxLength={200} />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Field label="Password" type="password" autoComplete="new-password" hint="8 to 128 characters." value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <SubmitButton loading={loading} loadingText="Creating account…">Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
