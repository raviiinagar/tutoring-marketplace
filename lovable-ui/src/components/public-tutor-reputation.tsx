import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { reputationApi } from "@/lib/tutor-reputation-api";
export function PublicTutorReputation({ profileId }: { profileId: string }) {
  const query = useQuery({
    queryKey: ["public-tutor-reputation", profileId],
    queryFn: () => reputationApi.publicBadge(profileId),
    retry: false,
    staleTime: 0,
  });
  const result = query.data?.ok ? query.data.data : undefined;
  return (
    <section id="recommendations" className="scroll-mt-28 space-y-4 border-t pt-7">
      <h2 className="text-2xl font-semibold">Tutor level & recommendations</h2>
      {result ? (
        <>
          <p>
            <span className="inline-flex rounded-full bg-violet-50 px-4 py-2 font-semibold text-violet-700">
              {result.label ?? "No current Tutor level"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{result.meaning}</p>
          <p className="text-sm">
            {result.recommendations} published network recommendations. These are separate from
            reviews by connected students and do not verify teaching qualifications.
          </p>
          {result.published_recommendations?.map((item) => (
            <blockquote key={item.id} className="rounded-2xl border p-5">
              <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>
              <footer className="mt-3 text-xs text-muted-foreground">
                {item.author_display_name} · {item.relationship.replaceAll("_", " ").toLowerCase()}
              </footer>
            </blockquote>
          ))}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {query.isPending ? "Loading Tutor level…" : "Tutor level could not be loaded."}
        </p>
      )}
      <Link
        to="/recommendations/$profileId"
        params={{ profileId }}
        className="link inline-flex min-h-11 items-center text-sm"
      >
        Write a recommendation
      </Link>
    </section>
  );
}
