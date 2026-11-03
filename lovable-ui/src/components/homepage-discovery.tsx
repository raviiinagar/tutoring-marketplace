import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MapPin,
  Monitor,
  Search,
  MessageCircle,
  UserRound,
} from "lucide-react";
import { api, type Catalogue, type LocationSuggestion } from "@/lib/api";
import { Button } from "./ui/button";
import { subjectShortcuts } from "./subject-shortcuts";
export function PopularSubjects({ catalogue }: { catalogue: Catalogue }) {
  const track = useRef<HTMLDivElement>(null),
    [edges, setEdges] = useState({ start: true, end: true });
  const choices = subjectShortcuts.filter((item) =>
    catalogue.terms.some((t) => t.id === item.id && t.active && t.kind === "SUBJECT"),
  );
  const remaining = catalogue.terms
    .filter((t) => t.active && t.kind === "SUBJECT" && !choices.some((c) => c.id === t.id))
    .slice(0, Math.max(0, 12 - choices.length));
  const items = [
    ...choices,
    ...remaining.map((t) => ({ id: t.id, label: t.label, icon: BookOpen })),
  ];
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () =>
      setEdges({
        start: el.scrollLeft <= 2,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [catalogue]);
  const move = (direction: number) =>
    track.current?.scrollBy({
      left: direction * Math.max(200, track.current.clientWidth * 0.8),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  return (
    <nav aria-label="Popular subjects" className="home-subject-strip">
      <button
        type="button"
        className="subject-scroll-button"
        aria-label="Previous subjects"
        disabled={edges.start}
        onClick={() => move(-1)}
      >
        <ArrowLeft aria-hidden />
      </button>
      <div className="home-subject-track" ref={track}>
        {items.map((item) => (
          <Link
            key={item.id}
            to="/tutors"
            search={{ subject_id: item.id }}
            className="subject-shortcut"
          >
            <item.icon aria-hidden className="size-6" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
      <button
        type="button"
        className="subject-scroll-button"
        aria-label="Next subjects"
        disabled={edges.end}
        onClick={() => move(1)}
      >
        <ArrowRight aria-hidden />
      </button>
      <a href="#subjects" className="subject-browse-all">
        <BookOpen aria-hidden className="size-4" />
        All subjects
      </a>
    </nav>
  );
}
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="market-content home-how-it-works"
    >
      <div className="home-section-heading">
        <p className="home-kicker">Your next chapter starts here</p>
        <h2 id="how-it-works-title">A little curiosity. The right teacher.</h2>
        <p>From finding a subject to planning your first conversation.</p>
      </div>
      <div className="home-step-grid">
        {[
          {
            title: "Find your subject",
            text: "Explore a subject or exam, choose Online or a city, and refine your search.",
            icon: Search,
          },
          {
            title: "Meet your teacher",
            text: "Read introductions, compare tuition and explore the teaching offers that fit your goals.",
            icon: UserRound,
          },
          {
            title: "Make a connection",
            text: "Send an enquiry through an eligible teaching offer. Once connected, chat and plan a class together.",
            icon: MessageCircle,
          },
        ].map((step, i) => (
          <article className="home-step" key={step.title}>
            <div className="home-step-icon">
              <step.icon aria-hidden />
              <span>{i + 1}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
      <p className="home-pass-note">
        Browsing is free. The Learner Access Pass covers eligible in-app connections; tuition is
        paid separately to your Tutor.
      </p>
      <Link to="/tutors" className="home-text-link">
        Find your teacher <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
export function TutorLocations() {
  const [places, setPlaces] = useState<LocationSuggestion[]>(),
    [failed, setFailed] = useState(false);
  const load = async () => {
    setFailed(false);
    const r = await api.tutorLocations();
    if (r.ok) {
      const seen = new Set<string>();
      setPlaces(
        r.data.locations
          .filter((p) => {
            const key = (p.city + "|" + p.country).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 8),
      );
    } else setFailed(true);
  };
  useEffect(() => {
    let active = true;
    void api.tutorLocations().then((r) => {
      if (!active) return;
      if (r.ok) {
        const seen = new Set<string>();
        setPlaces(
          r.data.locations
            .filter((p) => {
              const key = (p.city + "|" + p.country).toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 8),
        );
      } else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section aria-labelledby="tutor-locations-title" className="market-content home-locations">
      <div className="home-section-heading">
        <p className="home-kicker">Near you. Or wherever you are.</p>
        <h2 id="tutor-locations-title">Find a teacher in your city</h2>
        <p>Explore Tutors by their stated location, or learn online from anywhere.</p>
      </div>
      <nav aria-label="Tutor locations" className="home-location-grid">
        <Link to="/tutors" search={{ teaching_mode: "ONLINE" }} className="home-location-card">
          <Monitor aria-hidden />
          <span>
            Online<small>Learn from anywhere</small>
          </span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        {places?.map((place) => (
          <Link
            key={place.city + place.country}
            to="/tutors"
            search={{ location: place.city, country: place.country, teaching_mode: "IN_PERSON" }}
            className="home-location-card"
          >
            <MapPin aria-hidden />
            <span>
              {place.city}
              <small>{place.country}</small>
            </span>
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ))}
      </nav>
      {failed ? (
        <div className="mt-4 text-sm" role="status">
          Tutor locations could not be loaded.{" "}
          <Button variant="outline" onClick={() => void load()}>
            Retry locations
          </Button>
        </div>
      ) : places === undefined ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading Tutor locations...
        </p>
      ) : !places.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          More locations will appear as Tutors share them.
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          City and area are Tutor-declared. Check the current teaching offer for class mode and
          availability.
        </p>
      )}
    </section>
  );
}
