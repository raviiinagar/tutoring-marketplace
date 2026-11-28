import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Check, GraduationCap } from "lucide-react";
import { api, describeFailure, type User } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
import { useTeachingPresence } from "@/lib/teaching-presence";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export type AccountMode = "student" | "teacher";

const modes = [
  {
    value: "student",
    label: "Student",
    hint: "Find Tutors, your enquiries and saved Tutors",
    icon: BookOpenCheck,
  },
  {
    value: "teacher",
    label: "Teacher",
    hint: "Your ads and enquiries from learners",
    icon: GraduationCap,
  },
] as const;

/** The side the account is using now: Tutor pages are the teacher side. */
export function currentAccountMode(user: Pick<User, "roles">, pathname: string): AccountMode {
  if (pathname === "/tutor" || pathname.startsWith("/tutor/")) return "teacher";
  return user.roles.includes("TUTOR") && !user.roles.includes("LEARNER") ? "teacher" : "student";
}

/**
 * "Use as: Student / Teacher" in the account menu (owner, 28 Nov 2026). Choosing a side opens
 * its dashboard, whose navigation has everything else. Switching never removes a role, so a
 * Tutor's ads stay online while they learn: Teacher opens /tutor (the Tutor role is recorded when
 * a first draft is saved, as before), and Student adds the Learner role only if it is missing.
 */
function useSwitch(user: User, onDone?: () => void) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { hasAds } = useTeachingPresence();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const choose = async (mode: AccountMode) => {
    setError(undefined);
    if (mode === "teacher") {
      onDone?.();
      await navigate({
        to: user.roles.includes("TUTOR") && hasAds ? "/tutor/dashboard" : "/tutor",
      });
      return;
    }
    if (!user.roles.includes("LEARNER")) {
      setBusy(true);
      const result = await api.changeRoles([...user.roles, "LEARNER"]);
      setBusy(false);
      if (!result.ok) {
        setError(describeFailure(result.error));
        return;
      }
      client.setQueryData(accountSessionKey, { ok: true, status: 200, data: result.data });
    }
    onDone?.();
    await navigate({ to: "/account" });
  };
  return { busy, error, choose };
}

/** Desktop: radio items inside the account dropdown. */
export function AccountModeMenu({ user }: { user: User }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = currentAccountMode(user, pathname);
  const { busy, error, choose } = useSwitch(user);
  return (
    <>
      <DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Use as
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={current}>
        {modes.map(({ value, label, hint, icon: Icon }) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            disabled={busy}
            onSelect={() => void choose(value)}
            className="account-mode-item min-h-14 gap-3 rounded-xl py-2.5 pl-3 pr-3 [&>span:first-child]:hidden"
          >
            <span
              aria-hidden
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${current === value ? "bg-primary text-primary-foreground" : "bg-[#fff4cf] text-[#8a4b00]"}`}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            {current === value && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {error && (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

/** Mobile: the same choice as two buttons in the mobile menu. */
export function AccountModeButtons({ user, onDone }: { user: User; onDone: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = currentAccountMode(user, pathname);
  const { busy, error, choose } = useSwitch(user, onDone);
  return (
    <div role="group" aria-labelledby="account-mode-title" className="grid gap-2 border-t pt-5">
      <p
        id="account-mode-title"
        className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        Use as
      </p>
      {modes.map(({ value, label, hint, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          disabled={busy}
          onClick={() => void choose(value)}
          className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 text-left ${current === value ? "bg-[#fff1f0]" : "bg-transparent"}`}
        >
          <span
            aria-hidden
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${current === value ? "bg-primary text-primary-foreground" : "bg-[#fff4cf] text-[#8a4b00]"}`}
          >
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{label}</span>
            <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
          </span>
          {current === value && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
        </button>
      ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
