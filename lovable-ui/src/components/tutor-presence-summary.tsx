import { MapPin, Monitor, Clock } from "lucide-react";
import type { TutorPresence, WeeklySlot } from "@/lib/api";
export const dayLabels = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};
export const timeLabel = (n: number) => {
  if (n === 1440) return "midnight";
  const h = Math.floor(n / 60);
  return `${h % 12 || 12}:${String(n % 60).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};
export const slotLabel = (s: WeeklySlot) =>
  `${dayLabels[s.day].slice(0, 3)} · ${timeLabel(s.start_minute)}–${timeLabel(s.end_minute)}`;
export function TutorPresenceSummary({
  presence,
  detail = false,
}: {
  presence?: TutorPresence | undefined;
  detail?: boolean;
}) {
  const place = presence?.location,
    open = presence?.accepting_students;
  return (
    <div className="space-y-2 text-sm" aria-label="Tutor location and availability">
      {place && (
        <p className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {[place.area, place.city, place.state, place.country].filter(Boolean).join(", ")}
          </span>
        </p>
      )}
      <p className="flex items-center gap-2 text-muted-foreground">
        <Monitor aria-hidden className="size-4" />
        {(presence?.teaching_modes ?? ["ONLINE"])
          .map((m) => (m === "ONLINE" ? "Online" : "In person"))
          .join(" + ")}
      </p>
      <p className={open === true ? "font-medium text-success" : "text-muted-foreground"}>
        <span aria-hidden>{open === true ? "●" : "○"} </span>
        {open === true
          ? "Accepting new students"
          : open === false
            ? "Not accepting new students"
            : "Availability not shared yet"}
      </p>
      {!!presence?.weekly_slots.length && (
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Clock aria-hidden className="size-3.5" />
            Usual teaching hours · IST
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {presence.weekly_slots.slice(0, detail ? 21 : 2).map((s, i) => (
              <li key={i}>{slotLabel(s)}</li>
            ))}
          </ul>
          {!detail && presence.weekly_slots.length > 2 && (
            <p className="mt-1 text-xs text-muted-foreground">More hours on the Tutor profile</p>
          )}
        </div>
      )}
      {detail && (
        <p className="text-xs text-muted-foreground">
          Location and hours are shared by the Tutor. Confirm the class time and meeting
          arrangements together; these hours are not a booking.
        </p>
      )}
    </div>
  );
}
