import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api, describeFailure } from "@/lib/api";
import {
  PASSWORD_LENGTH_GUIDANCE,
  hasErrors,
  mergeServerFieldErrors,
  validateDisplayName,
  validateEmail,
  validateNewPassword,
  type FieldErrors,
} from "@/lib/validation";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { AuthStory } from "@/components/auth-story";
import { GraduationCap, LockKeyhole, Search, Users } from "lucide-react";

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
      const next = {
        display_name: validateDisplayName(name),
        email: validateEmail(email),
        password: validateNewPassword(password),
      };
      setErrors(next);
      if (hasErrors(next)) return;
      const res = await api.register({ display_name: name.trim(), email: email.trim(), password });
      if (res.ok && res.status === 202) {
        navigate({ to: "/auth/check-email", search: { email: email.trim() } });
        return;
      }
      if (!res.ok) {
        if (res.error.kind === "http" && res.error.field_errors)
          setErrors(mergeServerFieldErrors(res.error.field_errors));
        setFormError(describeFailure(res.error));
      } else setFormError("Unexpected response. Please try again.");
    });
  };

  return (
    <AuthShell
      title="Create your account"
      intro="It's free. Continue with Google or use your email."
      aside={
        <AuthStory
          title="Find your Tutor, or start teaching."
          lead="One free account to learn, to teach, or both. Parents book classes for their child from their own account; no separate child profile is needed."
          perks={[
            {
              icon: Search,
              title: "Learn",
              text: "Find Tutors by subject, class and city, save them and message them.",
            },
            {
              icon: GraduationCap,
              title: "Teach",
              text: "Publish your ad for free, yourself or with our team's help.",
            },
            {
              icon: Users,
              title: "Parents, too",
              text: "Book classes for your child from your own account.",
            },
          ]}
          note="You choose Learn, Teach or Both after signing up, and can change it any time."
        />
      }
      footer={
        <>
          <p>
            Already have an account?{" "}
            <Link to="/auth/signin" className="link font-semibold">
              Sign in
            </Link>
          </p>
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px]">
            <LockKeyhole aria-hidden className="size-4" />
            We send one email to verify your address. Your email is never shown publicly.
          </p>
        </>
      }
    >
      <GoogleSignInButton divider="or sign up with email" />
      <form noValidate onSubmit={onSubmit} className="mt-5 space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field
          label="Your name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.display_name}
          maxLength={200}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_LENGTH_GUIDANCE}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <SubmitButton loading={loading} loadingText="Creating account…" className="auth-primary">
          Create account
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
