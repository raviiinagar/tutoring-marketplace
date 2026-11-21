import { MailCheck, ShieldCheck } from "lucide-react";

/**
 * The verification facts the server reports about one account, each shown only when it is
 * true. Email verification and identity verification are independent: neither implies the
 * other, and nothing here claims a profile, its subjects or its experience are verified.
 * Learners have no identity-document review, so callers pass only `emailVerified` for them.
 */
export function VerificationFacts({
  emailVerified,
  identityVerified,
  headingLevel = 2,
  id,
}: {
  emailVerified?: boolean | undefined;
  identityVerified?: boolean | undefined;
  headingLevel?: 2 | 4;
  id?: string;
}) {
  const email = emailVerified === true,
    identity = identityVerified === true;
  if (!email && !identity) return null;
  const Heading = headingLevel === 2 ? "h2" : "h4";
  const headingId = (id ?? "verification") + "-title";
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-28 rounded-2xl bg-emerald-50/70 p-5"
    >
      <Heading
        id={headingId}
        className={headingLevel === 2 ? "text-2xl font-semibold" : "font-semibold"}
      >
        Verification
      </Heading>
      <ul className="mt-3 space-y-3">
        {email && (
          <li>
            <p className="flex items-center gap-2 font-semibold text-emerald-900">
              <MailCheck aria-hidden className="size-5 shrink-0" />
              Email verified
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The email address on this account was confirmed.
            </p>
          </li>
        )}
        {identity && (
          <li>
            <p className="flex items-center gap-2 font-semibold text-emerald-900">
              <ShieldCheck aria-hidden className="size-5 shrink-0" />
              Identity verified
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team checked an identity document. Subjects and experience are described by the
              Tutor.
            </p>
          </li>
        )}
      </ul>
    </section>
  );
}
