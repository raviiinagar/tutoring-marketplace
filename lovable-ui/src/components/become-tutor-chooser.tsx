import { PencilLine, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TutorSetupPath = "team" | "self";

/**
 * "Become a Tutor" (ADR0021): a new Tutor chooses between sending their details to our team,
 * which is highlighted as the easiest way, and creating the ad themselves in one short form.
 */
export function BecomeTutorChooser({ onChoose }: { onChoose: (path: TutorSetupPath) => void }) {
  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <section
        aria-labelledby="path-team-title"
        className="relative flex flex-col rounded-2xl border-2 border-primary bg-[#fff7d6] p-6"
      >
        <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
          Recommended
        </span>
        <UserRoundCog aria-hidden className="size-7 text-primary" />
        <h2 id="path-team-title" className="mt-3 text-lg font-bold">
          Send to our team
        </h2>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">
          Share your WhatsApp number and send us your details. We create and publish your profile
          and ad for you. It's free.
        </p>
        <Button className="mt-5 rounded-full" onClick={() => onChoose("team")}>
          Send to our team
        </Button>
      </section>
      <section
        aria-labelledby="path-self-title"
        className="flex flex-col rounded-2xl border bg-white p-6"
      >
        <PencilLine aria-hidden className="size-7 text-primary" />
        <h2 id="path-self-title" className="mt-3 text-lg font-bold">
          Create it myself
        </h2>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">
          One short form: class title, your rate per hour or per lesson, your location and whether
          you teach online, in person or both.
        </p>
        <Button variant="outline" className="mt-5 rounded-full" onClick={() => onChoose("self")}>
          Create it myself
        </Button>
      </section>
    </div>
  );
}
