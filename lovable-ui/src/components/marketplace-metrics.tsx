import { useEffect, useState, type FormEvent } from "react";
import { api, describeFailure, type MarketplaceReport, type StaffAccess } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/account/ui";
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
function Ratio({ numerator, denominator }: { numerator: number; denominator: number }) {
  return (
    <span className="block min-w-32">
      {denominator ? (
        <>
          <strong>{((100 * numerator) / denominator).toFixed(1)}%</strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            {numerator} / {denominator}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Not yet measurable</span>
      )}
    </span>
  );
}
export function MarketplaceMetricsDesk() {
  const [access, setAccess] = useState<StaffAccess>(),
    [report, setReport] = useState<MarketplaceReport>(),
    [reason, setReason] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    void api.staffAccess().then((r) => {
      if (!active) return;
      if (r.ok) setAccess(r.data);
      else setError(describeFailure(r.error));
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!access?.expires_at) return;
    const t = setTimeout(
      () => {
        setAccess(undefined);
        setReport(undefined);
        setError("Verify staff MFA again.");
      },
      Math.max(0, new Date(access.expires_at).getTime() - Date.now()),
    );
    return () => clearTimeout(t);
  }, [access?.expires_at]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      loading ||
      !access?.authenticated ||
      !access.scopes.includes("FINANCE") ||
      reason.trim().length < 10
    )
      return;
    setLoading(true);
    setError(undefined);
    setReport(undefined);
    const result = await api.marketplaceMetrics(reason.trim(), from || undefined, to || undefined);
    if (result.ok) setReport(result.data);
    else {
      setError(describeFailure(result.error));
      if (result.error.kind === "http" && [401, 403].includes(result.error.status))
        setAccess(undefined);
    }
    setLoading(false);
  };
  const totals = report
    ? report.domains.reduce(
        (a, r) => ({
          offers: a.offers + r.available_offers,
          requests: a.requests + r.requests,
          connections: a.connections + r.connections,
          captured: a.captured + r.captured_paise,
          refunds: a.refunds + r.refunded_paise,
        }),
        { offers: 0, requests: 0, connections: 0, captured: 0, refunds: 0 },
      )
    : undefined;
  return (
    <div className="space-y-6">
      <aside className="rounded-2xl border border-primary/15 bg-primary/5 p-5 text-sm leading-relaxed">
        See the value the marketplace has delivered from recorded server facts. Current supply,
        request cohorts and capture cohorts have separate denominators.
        <p className="mt-2">Teaching outcomes and unique customers are not measured.</p>
      </aside>
      {error && <Notice tone="error">{error}</Notice>}
      {access && (!access.authenticated || !access.scopes.includes("FINANCE")) && (
        <Notice tone="info">
          Finance permission and active staff MFA are required. Verify access in the staff console.
        </Notice>
      )}
      <form
        className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
        onSubmit={(e) => void submit(e)}
      >
        <label className="block text-sm sm:col-span-2">
          Reason for report access
          <textarea
            className="input mt-2 w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={240}
          />
        </label>
        <label className="text-sm">
          From date (UTC)
          <input
            type="date"
            className="input mt-2 w-full"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setReport(undefined);
            }}
          />
        </label>
        <label className="text-sm">
          To date (exclusive, UTC)
          <input
            type="date"
            className="input mt-2 w-full"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setReport(undefined);
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Leave dates blank for the last 30 UTC calendar days, including today. Maximum reporting
          interval: 90 days.
        </p>
        <Button
          disabled={
            loading ||
            !access?.authenticated ||
            !access.scopes.includes("FINANCE") ||
            reason.trim().length < 10
          }
          className="sm:col-span-2"
        >
          {loading ? "Loading report..." : "Load marketplace report"}
        </Button>
      </form>
      {report && (
        <>
          {report.test_only && (
            <Notice tone="info">
              Fictional test-mode facts. These numbers are not live customer demand or revenue.
            </Notice>
          )}
          <p className="text-sm text-muted-foreground">
            UTC interval [{report.from}, {report.to}). Observed through{" "}
            {new Date(report.as_of).toISOString()}. Refund outcomes include subsequent known facts
            for that capture cohort.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Eligible offers now", totals!.offers],
              ["Submitted requests", totals!.requests],
              ["Issued Connections", totals!.connections],
              ["Gross INR captured", money(totals!.captured)],
              ["Provider refunds", money(totals!.refunds)],
            ].map(([label, value]) => (
              <div className="rounded-2xl border p-4" key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 break-words text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Current coverage and search results</h2>
            <p className="text-sm text-muted-foreground">
              Tutor counts are distinct within each domain. Searches without a selected domain
              remain unclassified. Search executions include observed automated traffic and do not
              identify people.
            </p>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {[
                      "Learning Domain",
                      "Offers now",
                      "Tutors in domain",
                      "Subjects covered",
                      "Searches",
                      "Returned matches",
                      "Empty first pages",
                      "Partial first pages",
                    ].map((label) => (
                      <th className="whitespace-nowrap p-4" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.domains.map((r) => (
                    <tr key={r.id} className="border-t">
                      <th scope="row" className="min-w-44 p-4 font-medium">
                        {r.label}
                      </th>
                      {[
                        r.available_offers,
                        r.available_tutors,
                        r.covered_subjects,
                        r.searches,
                        r.matched_searches,
                        r.empty_searches,
                        r.partial_searches,
                      ].map((value, i) => (
                        <td className="p-4" key={i}>
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Request response and Connections</h2>
            <p className="text-sm text-muted-foreground">
              Requests are grouped by creation date. A mature request has reached its recorded
              response deadline; cancelled requests remain in that denominator. Erased or withdrawn
              contexts are excluded. Issued Connections describe contact access that was
              established; current safety controls may revoke it.
            </p>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {[
                      "Learning Domain",
                      "Requests",
                      "Responses",
                      "Acceptances",
                      "Declines",
                      "Cancelled",
                      "Connections",
                      "Mature response rate",
                      "Mature Connection rate",
                    ].map((label) => (
                      <th className="whitespace-nowrap p-4" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.domains.map((r) => (
                    <tr className="border-t" key={r.id}>
                      <th scope="row" className="min-w-44 p-4 font-medium">
                        {r.label}
                      </th>
                      {[
                        r.requests,
                        r.responses,
                        r.acceptances,
                        r.declines,
                        r.cancelled,
                        r.connections,
                      ].map((n, i) => (
                        <td className="p-4" key={i}>
                          {n}
                        </td>
                      ))}
                      <td className="p-4">
                        <Ratio numerator={r.mature_responses} denominator={r.mature_requests} />
                      </td>
                      <td className="p-4">
                        <Ratio numerator={r.mature_connections} denominator={r.mature_requests} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Captured purchase cohorts and refunds</h2>
            <p className="text-sm text-muted-foreground">
              A purchase belongs to its original checkout domain and capture interval. Maturity uses
              the original matching deadline. Financial obligations remain after account erasure.
              Refund intents, provider-confirmed refunds and bank arrival are different stages; bank
              arrival is not measured here.
            </p>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary">
                  <tr>
                    {[
                      "Learning Domain",
                      "Captured purchases",
                      "INR captured",
                      "Unexpected INR captures",
                      "Refund intents",
                      "Confirmed refunds",
                      "INR refunded",
                      "INR chargebacks",
                      "Mature paid match rate",
                      "Mature paid refund rate",
                    ].map((label) => (
                      <th className="whitespace-nowrap p-4" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.domains.map((r) => (
                    <tr className="border-t" key={r.id}>
                      <th scope="row" className="min-w-44 p-4 font-medium">
                        {r.label}
                      </th>
                      {[
                        r.captured_purchases,
                        money(r.captured_paise),
                        money(r.unexpected_capture_paise),
                        r.refund_intents,
                        r.confirmed_refunds,
                        money(r.refunded_paise),
                        money(r.chargeback_paise),
                      ].map((n, i) => (
                        <td className="whitespace-nowrap p-4" key={i}>
                          {n}
                        </td>
                      ))}
                      <td className="p-4">
                        <Ratio
                          numerator={r.mature_matched_purchases}
                          denominator={r.mature_paid_purchases}
                        />
                      </td>
                      <td className="p-4">
                        <Ratio
                          numerator={r.mature_refunded_purchases}
                          denominator={r.mature_paid_purchases}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <details className="rounded-2xl border p-5 text-sm">
            <summary className="cursor-pointer font-semibold">
              Definitions and interpretation
            </summary>
            <dl className="mt-4 space-y-3">
              {Object.entries(report.definitions).map(([label, definition]) => (
                <div key={label}>
                  <dt className="font-semibold">{label.replaceAll("_", " ")}</dt>
                  <dd className="mt-1 text-muted-foreground">{definition}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-muted-foreground">
              National enrolment and exam participation figures are not included or summed as
              marketplace customers. Tuition is paid directly to Tutors. Gross captured money is not
              net profit.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
