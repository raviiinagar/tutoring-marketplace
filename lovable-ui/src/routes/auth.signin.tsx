import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, describeFailure } from "@/lib/api";
import {
  hasErrors,
  mergeServerFieldErrors,
  validateEmail,
  validateSignInPassword,
  type FieldErrors,
} from "@/lib/validation";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { useQueryClient } from "@tanstack/react-query";
import { accountSessionKey } from "@/lib/session";
import { enquiryTarget } from "@/lib/enquiry";
import { GoogleSignInButton, GoogleSignInNotice } from "@/components/google-sign-in";
import { landingAfterSignIn } from "@/lib/teaching-presence";
import { AuthStory } from "@/components/auth-story";
import { Heart, LockKeyhole, MessageSquare, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth/signin")({
  validateSearch: (search: Record<string, unknown>): { enquire?: string; google?: string } => {
    const target = enquiryTarget(search["enquire"]);
    const google = typeof search["google"] === "string" ? search["google"] : undefined;
    return { ...(target ? { enquire: target } : {}), ...(google ? { google } : {}) };
  },
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
  const { enquire, google } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        await queryClient.cancelQueries({ queryKey: accountSessionKey });
        queryClient.setQueryData(accountSessionKey, res);
        if (enquire)
          navigate({ to: "/teachers/$slug", params: { slug: enquire }, hash: "contact" });
        else navigate({ to: await landingAfterSignIn(res.data.user) });
        return;
      }
      const err = res.error;
      if (err.kind === "http" && err.code === "EMAIL_NOT_VERIFIED") {
        setFormError(
          <>
            Please verify your email before signing in.{" "}
            <Link to="/auth/check-email" search={{ email: email.trim() }} className="link">
              Send a new verification email
            </Link>
          </>,
        );
      } else if (err.kind === "http" && err.code === "INVALID_CREDENTIALS") {
        setFormError("That email and password don't match. Check them and try again.");
      } else {
        if (err.kind === "http" && err.field_errors)
          setErrors(mergeServerFieldErrors(err.field_errors));
        setFormError(describeFailure(err));
      }
    });
  };

  return (
    <AuthShell
      title="Sign in"
      intro="Welcome back. Continue with Google or your email."
      aside={
        <AuthStory
          title="Pick up right where you left off."
          lead="Your Tutors, messages and enquiries, all in one place. Online or in person, across India."
          perks={[
            {
              icon: MessageSquare,
              title: "One inbox for every Tutor",
              text: "Continue your conversations and plan the next class.",
            },
            {
              icon: Heart,
              title: "Saved Tutors and enquiries",
              text: "Everything you shortlisted is waiting for you.",
            },
            {
              icon: ShieldCheck,
              title: "See who is identity-verified",
              text: "Verified Tutors carry a clear badge on their profile.",
            },
          ]}
          note="Teaching? Your ads and learner enquiries are here too."
        />
      }
      footer={
        <>
          <p>
            New to Tutor Marketplace?{" "}
            <Link to="/auth/signup" className="link whitespace-nowrap font-semibold">
              Create a free account
            </Link>
          </p>
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px]">
            <LockKeyhole aria-hidden className="size-4" />
            Secure sign-in. Your email is never shown publicly.
          </p>
        </>
      }
    >
      <GoogleSignInNotice outcome={google} />
      <div className="mt-5">
        <GoogleSignInButton
          returnTo={enquire ? "/teachers/" + enquire : undefined}
          divider="or sign in with email"
        />
      </div>
      <form noValidate onSubmit={onSubmit} className="mt-5 space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          action={
            <Link to="/auth/forgot-password" className="link">
              Forgot password?
            </Link>
          }
        />
        <SubmitButton loading={loading} loadingText="Signing in…" className="auth-primary">
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
