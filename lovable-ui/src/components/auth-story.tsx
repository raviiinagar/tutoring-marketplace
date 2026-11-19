import type { ReactNode } from "react";
import { GraduationCap, type LucideIcon } from "lucide-react";

export type AuthPerk = { icon: LucideIcon; title: string; text: string };

/**
 * The left panel of the sign-in and sign-up pages (design A, 19 November 2026): why to
 * sign in or join, in plain words. On phones only the heading and one line show, so the
 * form stays near the top. Nothing here is a claim the product cannot back.
 */
export function AuthStory({
  title,
  lead,
  perks,
  note,
}: {
  title: ReactNode;
  lead: string;
  perks: AuthPerk[];
  note?: string;
}) {
  return (
    <section
      aria-labelledby="auth-story-title"
      className="auth-story relative flex flex-col justify-center overflow-hidden rounded-[28px] p-7 lg:p-11"
    >
      <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[#8a5a00]">
        <GraduationCap aria-hidden className="size-4" />
        Tutor Marketplace
      </span>
      <h2
        id="auth-story-title"
        className="mt-3 max-w-[18ch] font-display text-[clamp(26px,3.2vw,40px)] font-semibold leading-[1.12] tracking-tight"
      >
        {title}
      </h2>
      <p className="mt-2.5 max-w-[42ch] text-muted-foreground">{lead}</p>
      <ul className="mt-6 hidden gap-3.5 lg:grid">
        {perks.map(({ icon: Icon, title: perk, text }) => (
          <li
            key={perk}
            className="flex items-start gap-3.5 rounded-[18px] border border-white/90 bg-white/70 px-4 py-3.5 backdrop-blur-sm"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-coral-strong shadow-sm">
              <Icon aria-hidden className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{perk}</span>
              <span className="block text-sm text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-5 hidden text-[13px] text-[#6b5a3a] lg:block">{note}</p>}
    </section>
  );
}
