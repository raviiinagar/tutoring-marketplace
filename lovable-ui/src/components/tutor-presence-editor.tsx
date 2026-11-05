import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, CalendarDays, Plus, Trash2 } from "lucide-react";
import {
  api,
  describeFailure,
  type TutorPresence,
  type PresenceWrite,
  type Weekday,
} from "@/lib/api";
import { Field, Notice, SubmitButton, useSingleFlight } from "./account/ui";
import { Button } from "./ui/button";
import { dayLabels, TutorPresenceSummary } from "./tutor-presence-summary";
const toTime = (n: number) =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const minutes = (s: string, end = false) => {
  const [h = 0, m = 0] = s.split(":").map(Number);
  return end && h === 0 && m === 0 ? 1440 : h * 60 + m;
};
export function TutorPresenceEditor() {
  const [saved, setSaved] = useState<TutorPresence>(),
    [form, setForm] = useState<PresenceWrite>(),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const { loading, run } = useSingleFlight();
  const load = async () => {
    setError(undefined);
    const r = await api.tutorPresence();
    if (r.ok) {
      const p = r.data.presence;
      setSaved(p);
      setForm({
        expected_revision: p.revision,
        location: p.location,
        teaching_modes: p.teaching_modes,
        accepting_students: p.accepting_students ?? true,
        weekly_slots: p.weekly_slots,
        timezone: "Asia/Kolkata",
      });
    } else setError(describeFailure(r.error));
  };
  useEffect(() => {
    void load();
  }, []);
  const field = (key: "city" | "area" | "state" | "country", value: string) =>
    setForm((f) =>
      f ? { ...f, location: { city: "", country: "India", ...f.location, [key]: value } } : f,
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      const location = form.location?.city.trim()
        ? {
            city: form.location.city.trim(),
            country: form.location.country.trim() || "India",
            ...(form.location.area?.trim() ? { area: form.location.area.trim() } : {}),
            ...(form.location.state?.trim() ? { state: form.location.state.trim() } : {}),
          }
        : null;
      const r = await api.saveTutorPresence({ ...form, location });
      if (r.ok) {
        const p = r.data.presence;
        setSaved(p);
        setForm({
          ...form,
          expected_revision: p.revision,
          location: p.location,
          weekly_slots: p.weekly_slots,
        });
        setNotice(
          r.data.offers_need_review
            ? `Saved. ${r.data.offers_need_review} ad(s) need updated teaching details after the location/mode change. Open My ads to update and publish them.`
            : "Location and availability saved.",
        );
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <section
      className="mt-8 rounded-2xl border bg-card p-5 sm:p-6"
      aria-label="Location and availability settings"
    >
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <MapPin aria-hidden className="size-5" />
        Where and when you teach
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        These public details help students find you. Share a city/area only, never a house address.
        Your identity approval stays in place.
      </p>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void load()}>
            Refresh location settings
          </Button>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      {!form ? (
        <p role="status" className="mt-4">
          Loading your teaching preferences…
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold">Class modes</legend>
            <div className="mt-3 flex flex-wrap gap-5">
              {(["ONLINE", "IN_PERSON"] as const).map((mode) => (
                <label className="flex items-center gap-2 text-sm" key={mode}>
                  <input
                    type="checkbox"
                    checked={form.teaching_modes.includes(mode)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        teaching_modes: e.target.checked
                          ? [...form.teaching_modes, mode]
                          : form.teaching_modes.filter((m) => m !== mode),
                      })
                    }
                  />
                  {mode === "ONLINE" ? "Online classes" : "In-person classes"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Public city"
              required={form.teaching_modes.includes("IN_PERSON")}
              value={form.location?.city ?? ""}
              maxLength={80}
              placeholder="e.g. New Delhi"
              onChange={(e) => field("city", e.target.value)}
            />
            <Field
              label="Area / locality (optional)"
              value={form.location?.area ?? ""}
              maxLength={80}
              placeholder="e.g. Rohini"
              onChange={(e) => field("area", e.target.value)}
            />
            <Field
              label="State / region (optional)"
              value={form.location?.state ?? ""}
              maxLength={80}
              onChange={(e) => field("state", e.target.value)}
            />
            <Field
              label="Country"
              value={form.location?.country ?? "India"}
              maxLength={80}
              onChange={(e) => field("country", e.target.value)}
            />
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm font-medium">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.accepting_students}
              onChange={(e) => setForm({ ...form, accepting_students: e.target.checked })}
            />
            I am accepting new students.
            <span className="font-normal text-muted-foreground">
              Turn off to stop new enquiries; existing conversations remain available.
            </span>
          </label>
          <fieldset>
            <legend className="flex items-center gap-2 font-semibold">
              <CalendarDays aria-hidden className="size-4" />
              Usual weekly teaching hours
            </legend>
            <p className="mt-2 text-sm text-muted-foreground">
              All times are India Standard Time (IST). Add separate slots for breaks; 00:00 as an
              end time means midnight. Confirm actual class times with students.
            </p>
            <div className="mt-4 space-y-3">
              {form.weekly_slots.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 items-end gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <label className="text-sm">
                    Day
                    <select
                      className="input mt-1"
                      aria-label={`Day ${i + 1}`}
                      value={s.day}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weekly_slots: form.weekly_slots.map((slot, j) =>
                            j === i ? { ...slot, day: e.target.value as Weekday } : slot,
                          ),
                        })
                      }
                    >
                      {Object.entries(dayLabels).map(([day, label]) => (
                        <option key={day} value={day}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    From
                    <input
                      className="input mt-1"
                      type="time"
                      required
                      aria-label={`Start time ${i + 1}`}
                      value={toTime(s.start_minute)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weekly_slots: form.weekly_slots.map((slot, j) =>
                            j === i ? { ...slot, start_minute: minutes(e.target.value) } : slot,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    To
                    <input
                      className="input mt-1"
                      type="time"
                      required
                      aria-label={`End time ${i + 1}`}
                      value={toTime(s.end_minute)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weekly_slots: form.weekly_slots.map((slot, j) =>
                            j === i ? { ...slot, end_minute: minutes(e.target.value, true) } : slot,
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Remove slot ${i + 1}`}
                    onClick={() =>
                      setForm({
                        ...form,
                        weekly_slots: form.weekly_slots.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="mt-3"
              type="button"
              variant="outline"
              disabled={form.weekly_slots.length >= 21}
              onClick={() =>
                setForm({
                  ...form,
                  weekly_slots: [
                    ...form.weekly_slots,
                    { day: "MON", start_minute: 960, end_minute: 1080 },
                  ],
                })
              }
            >
              <Plus aria-hidden className="size-4" />
              Add teaching hours
            </Button>
          </fieldset>
          <SubmitButton loading={loading} loadingText="Saving preferences…">
            Save location and availability
          </SubmitButton>
          {saved?.revision ? (
            <div className="rounded-xl bg-secondary p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide">
                Saved public preferences
              </p>
              <TutorPresenceSummary presence={saved} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Location and hours have not been shared yet.
            </p>
          )}
          <Link className="link text-sm" to="/tutor/listings">
            Manage teaching offers
          </Link>
        </form>
      )}
    </section>
  );
}
