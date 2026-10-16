import { useState } from "react";
import {
  api,
  describeFailure,
  type ContactRequest,
  type PublicOffer,
  type Catalogue,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { PublicOfferTerms } from "./public-offer";
import { ContactRequestForm } from "./contact-request-form";
export function RequestAlternatives({ request }: { request: ContactRequest }) {
  const [offers, setOffers] = useState<PublicOffer[]>();
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [next, setNext] = useState<string>();
  const [selected, setSelected] = useState<PublicOffer>();
  const [error, setError] = useState<string>();
  const action = useSingleFlight();
  const load = (cursor?: string) =>
    action.run(async () => {
      setError(undefined);
      setSelected(undefined);
      setOffers(undefined);
      const [results, terms] = await Promise.all([
        api.requestAlternatives(request.id, cursor),
        api.catalogue(),
      ]);
      if (terms.ok) setCatalogue(terms.data);
      if (results.ok) {
        setOffers(results.data.offers);
        setNext(results.data.next_cursor || undefined);
      } else setError(describeFailure(results.error));
    });
  if (!request.learner_usable) return null;
  return (
    <section className="mt-5 border-t pt-5" aria-label="Alternative Tutors">
      <Button
        variant="outline"
        className="rounded-full"
        disabled={action.loading}
        onClick={() => void load()}
      >
        {action.loading ? "Finding matching Tutors…" : "Find matching Tutors"}
      </Button>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {offers && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Same subject, level, board or exam and a shared teaching language. Review the tuition
            and trial terms. Choosing a Tutor does not send an enquiry, charge you or share contact
            details.
          </p>
          {!offers.length && (
            <p role="status" className="text-sm">
              No matching alternatives available on this page. Try again later or browse Tutors to
              change your requirements.
            </p>
          )}
          {offers.map((listing) => (
            <article key={listing.id} className="rounded-xl border bg-secondary/40 p-4">
              <h3 className="break-words font-semibold">{listing.tutor.display_name}</h3>
              <p className="my-2 break-words text-sm">{listing.offer.title}</p>
              <PublicOfferTerms offer={listing.offer} catalogue={catalogue} />
              <Button
                className="mt-4 rounded-full"
                variant={selected?.id === listing.id ? "secondary" : "outline"}
                onClick={() => setSelected(listing)}
              >
                {selected?.id === listing.id ? "Tutor selected" : "Choose this Tutor"}
              </Button>
              {selected?.id === listing.id && (
                <ContactRequestForm key={listing.id} listing={listing} initialRequest={request} />
              )}
            </article>
          ))}
          {next && (
            <Button variant="outline" disabled={action.loading} onClick={() => void load(next)}>
              More matching Tutors
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
