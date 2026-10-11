import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, describeFailure } from "@/lib/api";
import { hasErrors, mergeServerFieldErrors, validateEmail, validateSignInPassword, type FieldErrors } from "@/lib/validation";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";

export const Route = createFileRoute("/auth/signin")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Sign in — Tutor Marketplace" },
      { name: "description", content: "Sign in to your Tutor Marketplace account." },
      { property: "og:title", content: "Sign in — Tutor Marketplace" },
      { property: "og:description", content: "Sign in to your Tutor Marketplace account." },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<ReactNode>();
  const { loading, run } = useSingleFlight();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      setFormError(undefined);
      const next = { email: validateEmail(email), password: validateSignInPassword(password) };
      setErrors(next);
      if (hasErrors(next)) return;
      const res = await api.signIn({ email: email.trim(), password });
      if (res.ok) {
        navigate({ to: "/account" });
        return;
      }
      const err = res.error;
      if (err.kind === "http" && err.code === "EMAIL_NOT_VERIFIED") {
        setFormError(
          <>
            Please verify your email before signing in.{" "}
            <Link to="/auth/check-email" search={{ email: email.trim() }} className="link">Send a new verification email</Link>
          </>,
        );
      } else if (err.kind === "http" && err.code === "INVALID_CREDENTIALS") {
        setFormError("That email and password don't match. Check them and try again.");
      } else {
        if (err.kind === "http" && err.field_errors) setErrors(mergeServerFieldErrors(err.field_errors));
        setFormError(describeFailure(err));
      }
    });
  };

  return (
    <AuthShell title="Welcome back" footer={<>New here? <Link to="/auth/signup" className="link">Create an account</Link></>}>
      <form noValidate onSubmit={onSubmit} className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
        <Link to="/auth/forgot-password" className="link inline-block">Forgot password?</Link>
      </form>
    </AuthShell>
  );
}
