import "../workspace.css";
import { useEffect, useState, type ReactNode } from "react";
import { useTutorApi } from "@/lib/tutor-api";
import { Link } from "@tanstack/react-router";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  api,
  type Catalogue,
  type TeachingListing,
  type TutorPhoto,
  type TutorProfile,
} from "@/lib/api";
import {
  offerAvailability,
  offerStatusLabels,
  canPublishAd,
  canResumeOffer,
  hasPublicationPhoto,
} from "@/lib/tutor-workspace";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";

export function TutorAdManager({
  ads,
  catalogue,
  profile,
  photo,
  subjects,
  disabled,
  canCreate,
  onCreate,
  onEdit,
  onAction,
}: {
  ads: TeachingListing[];
  catalogue?: Catalogue | undefined;
  profile?: TutorProfile | undefined;
  photo?: TutorPhoto | null | undefined;
  subjects: string[];
  disabled: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onEdit: (ad: TeachingListing, step?: number) => void;
  onAction: (ad: TeachingListing, action: "PUBLISH" | "PAUSE" | "RESUME" | "ARCHIVE") => void;
}) {
  const tutorApi = useTutorApi();
  const [selected, setSelected] = useState<string>(),
    [confirm, setConfirm] = useState<"PAUSE" | "ARCHIVE">();
  useEffect(() => {
    if (!ads.some((ad) => ad.id === selected)) setSelected(ads[0]?.id);
  }, [ads, selected]);
  const ad = ads.find((ad) => ad.id === selected),
    online = !!ad && ad.status === "PUBLISHED" && ad.eligible;
  const label = (id: string | undefined) =>
    catalogue?.terms.find((term) => term.id === id)?.label || id || "Not specified";
  const section = (title: string, body: ReactNode, step: number) => (
    <section className="ma-sec min-w-0">
      <div className="ma-sec-head">
        <h3>{title}</h3>
        <button
          type="button"
          className="ma-edit"
          disabled={disabled}
          onClick={() => ad && onEdit(ad, step)}
          aria-label={"Modify " + title.toLowerCase()}
        >
          <Pencil aria-hidden className="size-[18px]" />
        </button>
      </div>
      <div className="ma-val">{body}</div>
    </section>
  );
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[190px_minmax(0,1fr)_250px]">
      <aside
        aria-label="Your ads"
        className="ma-list order-1 min-w-0 space-y-3 xl:sticky xl:top-28"
      >
        <button
          type="button"
          className="ws-btn ws-btn-primary ws-btn-sm w-full"
          disabled={disabled || !canCreate}
          onClick={onCreate}
        >
          <Plus aria-hidden className="size-4" />
          Create an ad
        </button>
        {ads.map((item) => (
          <button
            type="button"
            key={item.id}
            disabled={disabled}
            aria-pressed={item.id === selected}
            onClick={() => setSelected(item.id)}
            className="ma-ad"
          >
            <span className="block truncate text-sm font-semibold">
              {label(item.offer.subject_id)}
            </span>
            <span
              className={`ma-ad-status${item.status === "PUBLISHED" && item.eligible ? " is-online" : ""}`}
            >
              {item.status === "PUBLISHED"
                ? item.eligible
                  ? "Online"
                  : "Unavailable"
                : offerStatusLabels[item.status]}
            </span>
          </button>
        ))}
      </aside>
      {!ad ? (
        <div className="ma-card p-8">
          <h2 className="text-2xl font-semibold">Share what you love teaching</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Create your first ad for free. Add your teaching details, then publish when you are
            ready.
          </p>
        </div>
      ) : (
        <>
          <div className="ma-card order-3 min-w-0 xl:order-2" aria-label="Ad sections">
            {section("Courses taught", label(ad.offer.subject_id), 0)}
            {section(
              "Ad title",
              <p className="text-lg font-semibold text-foreground">{ad.offer.title}</p>,
              1,
            )}
            {section(
              "Venue",
              ad.offer.teaching_mode === "ONLINE"
                ? "Online"
                : ["In person", ad.class_location?.area, ad.class_location?.city]
                    .filter(Boolean)
                    .join(" · "),
              4,
            )}
            {section(
              "Levels",
              [ad.offer.level_id, ad.offer.curriculum_id, ad.offer.exam_id]
                .filter(Boolean)
                .map(label)
                .join(" · "),
              0,
            )}
            {section("Languages", ad.offer.language_ids.map(label).join(", "), 5)}
            <section className="ma-sec">
              <div className="ma-sec-head">
                <h3>About you</h3>
                <Link to="/tutor" className="ma-edit" aria-label="Modify about you">
                  <Pencil aria-hidden className="size-[18px]" />
                </Link>
              </div>
              <p className="ma-val whitespace-pre-wrap">
                {profile?.biography || "Add your introduction in your profile."}
              </p>
            </section>
            {section(
              "About the class",
              <p className="whitespace-pre-wrap">{ad.offer.description}</p>,
              2,
            )}
            {section(
              "Price",
              <p className="text-xl font-semibold text-foreground">
                ₹{(ad.offer.rate_paise / 100).toLocaleString("en-IN")}
                <span className="text-sm font-normal">
                  {" "}
                  /{" "}
                  {ad.offer.rate_unit === "HOUR"
                    ? "hour"
                    : `${ad.offer.lesson_minutes} minute lesson`}
                </span>
              </p>,
              6,
            )}
            {section(
              "First class",
              ad.offer.trial_kind === "NONE"
                ? "No trial class"
                : `${ad.offer.trial_kind === "FREE" ? "Free" : `₹${(ad.offer.trial_price_paise || 0) / 100}`} · ${ad.offer.trial_minutes} minutes`,
              7,
            )}
            <section className="ma-sec">
              <div className="ma-sec-head">
                <h3>Recommendations</h3>
              </div>
              <p className="ma-val">Invite people who know your teaching to recommend you.</p>
              <Link to="/tutor/evaluations" className="ws-link">
                Manage recommendations
              </Link>
            </section>
          </div>
          <aside
            aria-label="Ad publication"
            className="ma-card ma-side order-2 min-w-0 space-y-4 p-6 xl:order-3 xl:sticky xl:top-28"
          >
            <div className="mx-auto flex aspect-[4/5] w-full max-w-40 items-center justify-center overflow-hidden rounded-3xl bg-amber-100 text-4xl font-semibold text-amber-950">
              {photo &&
              photo.scan_status === "CLEAN" &&
              (photo.status === "APPROVED" ||
                (photo.status === "PENDING" && photo.self_published)) ? (
                <img
                  src={tutorApi.photoPreviewUrl(photo.id)}
                  alt="Your Tutor portrait"
                  className="h-full w-full object-cover"
                />
              ) : (
                (profile?.display_name || "Tutor").trim().slice(0, 1)
              )}
            </div>
            <p className="break-words text-center text-lg font-semibold">
              {profile?.display_name || "Your Tutor ad"}
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Hourly fee
              <br />
              <strong className="mt-1 block text-xl text-foreground">
                ₹{(ad.offer.rate_paise / 100).toLocaleString("en-IN")}
                {ad.offer.rate_unit === "HOUR" ? "/hr" : "/lesson"}
              </strong>
            </p>
            <div className={`ma-status${online ? " is-online" : ""}`}>
              <p className="font-semibold" role="status">
                {online
                  ? "Your ad is online"
                  : ad.status === "PAUSED"
                    ? "Your ad is offline"
                    : ad.status === "DRAFT"
                      ? "Your ad is a draft"
                      : "Your ad is unavailable"}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed">{offerAvailability(ad)}</p>
            </div>
            {(online || ad.status === "PAUSED") && (
              <button
                type="button"
                role="switch"
                aria-label="Ad is online"
                aria-checked={online}
                disabled={
                  disabled ||
                  (!online && (!canResumeOffer(ad, true, subjects) || !hasPublicationPhoto(photo)))
                }
                onClick={() => (online ? setConfirm("PAUSE") : onAction(ad, "RESUME"))}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border p-3 text-sm"
              >
                <span>{online ? "Ad is online" : "Ad is offline"}</span>
                <span
                  aria-hidden
                  className={
                    "flex h-6 w-11 items-center rounded-full p-1 " +
                    (online ? "justify-end bg-emerald-600" : "justify-start bg-muted-foreground")
                  }
                >
                  <span className="size-4 rounded-full bg-white" />
                </span>
              </button>
            )}
            {["DRAFT", "REVIEW", "CHANGES_REQUESTED"].includes(ad.status) && (
              <Button
                className="w-full rounded-full"
                disabled={disabled || !canPublishAd(ad, subjects) || !hasPublicationPhoto(photo)}
                onClick={() => onAction(ad, "PUBLISH")}
              >
                Publish my ad
              </Button>
            )}
            {!online && !hasPublicationPhoto(photo) && (
              <p className="text-sm text-muted-foreground">
                Add a profile photo before publishing or resuming this ad. You can keep editing your
                private draft.{" "}
                <Link to="/tutor" className="link">
                  Add your photo
                </Link>
              </p>
            )}
            {ad.review_reason && (
              <div className="ma-feedback">
                <p className="font-semibold">Feedback from our team</p>
                <p className="mt-1 break-words">{ad.review_reason}</p>
              </div>
            )}
            {ad.safety_reason && (
              <p role="alert" className="text-xs text-destructive">
                {ad.safety_reason}
              </p>
            )}
            {online && (
              <Button asChild variant="outline" className="w-full rounded-full">
                <Link
                  to="/tutors/$listingId"
                  params={{ listingId: ad.id }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye aria-hidden className="size-4" />
                  Student's view
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              disabled={disabled}
              onClick={() => setConfirm("ARCHIVE")}
            >
              <Trash2 aria-hidden className="size-4" />
              Delete advert
            </Button>
          </aside>
        </>
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "ARCHIVE" ? "Delete your advert?" : "Deactivate your ad?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "ARCHIVE"
                ? "This removes the ad from your workspace and public search. Existing enquiries, payments and conversations are kept."
                : "Your ad will be offline. You can reactivate it from My ads when you are ready."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ad && confirm) onAction(ad, confirm);
                setConfirm(undefined);
              }}
            >
              {confirm === "ARCHIVE" ? "Delete advert" : "Deactivate this ad"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
