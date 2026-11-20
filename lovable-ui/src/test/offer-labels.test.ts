import { expect, it } from "vitest";
import { compactTutorLocation } from "@/components/tutor-card-summary";
import { offerSubjectLabel, teachesInPerson, teachingModeLabel } from "@/lib/offer-labels";

it("names typed subjects and both teaching modes everywhere an ad is shown", () => {
  const label = (id: string) => ({ "subject-physics": "Physics" })[id] ?? id;
  expect(offerSubjectLabel({ subject_id: "subject-other", custom_subject: "Tabla" }, label)).toBe(
    "Tabla",
  );
  expect(offerSubjectLabel({ subject_id: "subject-physics" }, label)).toBe("Physics");
  expect(teachingModeLabel("BOTH")).toBe("Online and in person");
  expect(teachingModeLabel("IN_PERSON")).toBe("In person");
  expect(teachingModeLabel("ONLINE")).toBe("Online");
  expect([
    teachesInPerson("BOTH"),
    teachesInPerson("IN_PERSON"),
    teachesInPerson("ONLINE"),
  ]).toEqual([true, true, false]);
  expect(
    compactTutorLocation(
      {
        revision: 1,
        location: { city: "Kota", country: "India" },
        teaching_modes: ["ONLINE"],
        accepting_students: true,
        weekly_slots: [],
        timezone: "Asia/Kolkata",
        updated_at: null,
      },
      "BOTH",
    ),
  ).toBe("Kota (online & in person)");
});
