import { Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import type { User } from "@/lib/api";

type Choice = "LEARN" | "TEACH" | "BOTH";
const roleSets: Record<Choice, User["roles"]> = {
  LEARN: ["LEARNER"],
  TEACH: ["TUTOR"],
  BOTH: ["LEARNER", "TUTOR"],
};
const options = [
  { value: "LEARN", label: "Learn", hint: "Find Tutors and message them", icon: BookOpen },
  { value: "TEACH", label: "Teach", hint: "Publish your teaching ad", icon: GraduationCap },
  { value: "BOTH", label: "Both", hint: "Learn and teach from one account", icon: Users },
] as const;

export function currentChoice(roles: User["roles"]): Choice {
  return roles.includes("TUTOR") ? (roles.includes("LEARNER") ? "BOTH" : "TEACH") : "LEARN";
}

/**
 * "I want to: Learn, Teach or Both" (ADR0021). New accounts answer it on their first visit to
 * My Account; afterwards it stays here to change at any time.
 */
export function RoleChooser({
  user,
  busy,
  onChoose,
}: {
  user: User;
  busy: boolean;
  onChoose: (roles: User["roles"]) => void;
}) {
  const first = user.roles_chosen === false;
  const choice = currentChoice(user.roles);
  const teaching = user.roles.includes("TUTOR");
  return (
    <section
      id="roles"
      aria-labelledby="roles-title"
      tabIndex={-1}
      className={`scroll-mt-28 rounded-lg p-6 sm:p-8 ${first ? "border-2 border-primary bg-[#fff7d6]" : "bg-white"}`}
    >
      <h2 id="roles-title" className="text-lg font-bold">
        {first ? "How will you use Tutor Marketplace?" : "I want to"}
      </h2>
      {first && (
        <p className="mt-1 text-sm text-muted-foreground">
          Choose one. You can change it here at any time.
        </p>
      )}
      <fieldset className="mt-5" disabled={busy}>
        <legend className="sr-only">I want to</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map(({ value, label, hint, icon: Icon }) => {
            const selected = !first && choice === value;
            return (
              <label
                key={value}
                className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white p-4 ${selected ? "border-primary" : "border-transparent outline outline-1 outline-border"}`}
              >
                <input
                  type="radio"
                  name="account-roles"
                  value={value}
                  className="size-5 accent-[#ff6268]"
                  checked={selected}
                  onChange={() => onChoose(roleSets[value])}
                />
                <Icon aria-hidden className="size-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {!first && (
        <p className="mt-4 text-sm">
          {teaching ? (
            <Link to="/tutor" className="font-semibold underline underline-offset-4">
              Go to your teaching
            </Link>
          ) : (
            <Link to="/tutors" className="font-semibold underline underline-offset-4">
              Find a Tutor
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
