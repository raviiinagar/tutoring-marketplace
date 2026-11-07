import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeachingPresence } from "@/lib/teaching-presence";

/**
 * Teaching summary on the learner dashboard, shown to accounts with the Tutor
 * role. It reports the owner's own ads; having drafts never implies that
 * anything is visible to learners, because the owner publishes each ad.
 */
export function TeachingCard() {
  const { isTutor, summary, loading } = useTeachingPresence();
  if (!isTutor) return null;
  return (
    <section className="reference-requests-card mt-6" aria-label="Your teaching">
      <div className="reference-card-heading">
        <h2>Your teaching</h2>
        <Link to="/tutor/dashboard" className="reference-subtle-link">
          Open your teaching dashboard <ArrowUpRight aria-hidden className="inline size-4" />
        </Link>
      </div>
      <div className="space-y-3 p-6 text-sm">
        {loading ? (
          <p role="status" className="text-muted-foreground">
            Loading your ads…
          </p>
        ) : !summary || summary.total === 0 ? (
          <>
            <p>You have no ads yet. Learners cannot see you until you publish one.</p>
            <Button asChild className="reference-coral-button">
              <Link to="/tutor/listings">Create your first ad</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="font-semibold">
              {summary.online} online · {summary.drafts} draft · {summary.offline} offline
            </p>
            <p className="text-muted-foreground">
              {summary.online > 0
                ? `${summary.online} ${summary.online === 1 ? "ad is" : "ads are"} published and visible to learners.`
                : "Nothing is published yet, so learners cannot see your ads. You publish each ad yourself when it is ready."}
            </p>
            <Button asChild variant="outline">
              <Link to="/tutor/listings">Manage ads</Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
