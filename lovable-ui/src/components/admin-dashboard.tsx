import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Users,
  MousePointer2,
  LogIn,
  MessagesSquare,
  Ticket,
  RefreshCw,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { api, describeFailure, type AdminOverview, type AdminAccount } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/account/ui";
const number = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("en-IN").format(v));
const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v / 100);
const stamp = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(v)) + " IST";
const activityLabel = (type: string) =>
  ({
    ACCOUNT_REGISTERED: "Account registered",
    EMAIL_VERIFIED: "Email verified",
    CONTACT_REQUEST_SUBMITTED: "Enquiry submitted",
    CONTACT_REQUEST_ACCEPT: "Enquiry accepted",
    CONNECTION_ESTABLISHED: "Connection established",
    ACCESS_COUPON_REDEEMED: "Access Pass coupon redeemed",
    ACCESS_COUPON_CREATED: "Coupon created",
    ACCESS_PASS_ACTIVATED: "Access Pass activated",
    TUTOR_CLAIM_APPROVE: "Tutor evidence approved",
    TUTOR_CLAIM_REJECT: "Tutor evidence declined",
    LISTING_APPROVE: "Teaching offer approved",
    LISTING_CHANGES_REQUESTED: "Teaching offer needs changes",
  })[type] ||
  type
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const dayLabel = (v: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(v + "T00:00:00Z"),
  );
function Trend({ report }: { report: AdminOverview }) {
  const [series, setSeries] = useState<"visits" | "logins" | "signups">("visits");
  const gradient = useId().replace(/:/g, "");
  const rows = report.trend;
  const max = Math.max(2, ...rows.map((r) => r[series] || 0));
  const pts = rows
    .map((r, i) =>
      r[series] === null
        ? null
        : {
            x: 30 + (i / Math.max(1, rows.length - 1)) * 670,
            y: 175 - ((r[series] || 0) / max) * 140,
            row: r,
          },
    )
    .filter((p) => p !== null);
  const line = pts.map((p, i) => (i ? "L" : "M") + p.x + "," + p.y).join(" ");
  const area = pts.length
    ? line + " L" + pts[pts.length - 1]!.x + ",175 L" + pts[0]!.x + ",175 Z"
    : "";
  return (
    <section className="admin-panel admin-trend">
      <div className="admin-panel-title">
        <div>
          <h2>Audience activity</h2>
          <p>Daily activity · India Standard Time</p>
        </div>
        <div className="admin-series" aria-label="Chart metric">
          {(["visits", "logins", "signups"] as const).map((s) => (
            <button type="button" key={s} aria-pressed={series === s} onClick={() => setSeries(s)}>
              {s === "visits" ? "Visits" : s === "logins" ? "Logins" : "Signups"}
            </button>
          ))}
        </div>
      </div>
      {series === "visits" && !report.audience.tracking_started_at ? (
        <div className="admin-chart-empty">
          <strong>No public visits observed yet</strong>
          <span>Visits will appear here after public pages are opened.</span>
        </div>
      ) : (
        <svg
          viewBox="0 0 730 215"
          role="img"
          aria-label={`${series} trend over ${report.days} days`}
          className="admin-chart"
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ec6476" stopOpacity=".22" />
              <stop offset="100%" stopColor="#ec6476" stopOpacity=".01" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1="30"
                x2="700"
                y1={175 - f * 140}
                y2={175 - f * 140}
                stroke="#e8ebf0"
                strokeDasharray="4 5"
              />
              <text x="24" y={179 - f * 140} textAnchor="end" fill="#65738a" fontSize="11">
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="#e75b70" strokeWidth="3" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle
              key={p.row.day}
              cx={p.x}
              cy={p.y}
              r={i === pts.length - 1 ? 4 : 2}
              fill="#e75b70"
            >
              <title>
                {dayLabel(p.row.day)}: {number(p.row[series])} {series}
              </title>
            </circle>
          ))}
          {rows.length > 0 && (
            <>
              <text x="30" y="202" fill="#65738a" fontSize="12">
                {dayLabel(rows[0]!.day)}
              </text>
              <text x="700" y="202" textAnchor="end" fill="#65738a" fontSize="12">
                {dayLabel(rows[rows.length - 1]!.day)}
              </text>
            </>
          )}
        </svg>
      )}
      {!report.audience.tracking_started_at ? (
        <p className="admin-measure-note">
          Visit tracking has just been enabled. Counts appear after public pages are visited.
        </p>
      ) : (
        <p className="admin-measure-note">
          Visit tracking began {stamp(report.audience.tracking_started_at)}. Earlier visitor counts
          are unavailable. Visits are browser sessions, not unique people.
        </p>
      )}
      <details className="admin-chart-data">
        <summary>View daily numbers</summary>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Visits</th>
                <th>Logins</th>
                <th>Signups</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day}>
                  <td>{dayLabel(r.day)}</td>
                  <td>{number(r.visits)}</td>
                  <td>{number(r.logins)}</td>
                  <td>{number(r.signups)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
function Accounts() {
  const [query, setQuery] = useState(""),
    [loadedQuery, setLoadedQuery] = useState(""),
    [rows, setRows] = useState<AdminAccount[]>(),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(false);
  const serial = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = async (value: string, cursor?: string) => {
    const id = ++serial.current;
    setLoading(true);
    setError(undefined);
    const r = await api.adminAccounts(value, cursor);
    if (id !== serial.current || !alive.current) return;
    if (r.ok) {
      setRows(r.data.accounts);
      setNext(r.data.next_cursor);
      setLoadedQuery(value);
    } else {
      setRows(undefined);
      setNext(null);
      setError(describeFailure(r.error));
    }
    setLoading(false);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void load(query.trim());
  };
  return (
    <section id="accounts" className="admin-panel admin-accounts">
      <div className="admin-panel-title">
        <div>
          <h2>Account directory</h2>
          <p>Registered accounts · Support access</p>
        </div>
        <Users size={20} aria-hidden />
      </div>
      <form className="admin-account-search" onSubmit={submit}>
        <label className="sr-only" htmlFor="admin-account-query">
          Search accounts by name or email
        </label>
        <Search aria-hidden size={18} />
        <input
          id="admin-account-query"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
        />
        <Button disabled={loading} type="submit">
          {loading ? "Loading…" : rows ? "Search accounts" : "Load accounts"}
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {rows ? (
        <>
          <div className="admin-table-scroll">
            <table className="admin-accounts-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Marketplace roles</th>
                  <th>Joined</th>
                  <th>Last successful login</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.display_name}</strong>
                      <span className="admin-account-email">{row.email}</span>
                    </td>
                    <td>
                      <span
                        className={`admin-status ${row.status === "ACTIVE" ? "admin-status-good" : ""}`}
                      >
                        {row.status === "ACTIVE"
                          ? "Active"
                          : row.status === "PENDING"
                            ? "Unverified"
                            : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {row.roles.map((r) => (r === "TUTOR" ? "Tutor" : "Learner")).join(", ")}
                    </td>
                    <td>{stamp(row.created_at)}</td>
                    <td>
                      {row.last_sign_in_at
                        ? stamp(row.last_sign_in_at)
                        : "No successful login recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="admin-empty">No matching accounts. Try another name or email.</div>
            )}
          </div>
          <div className="admin-directory-footer">
            <span>{rows.length} accounts shown · Private staff view</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                type="button"
                disabled={loading}
                onClick={() => void load(loadedQuery)}
              >
                Start over
              </Button>
              {next && (
                <Button
                  variant="outline"
                  type="button"
                  disabled={loading}
                  onClick={() => void load(loadedQuery, next)}
                >
                  Next 25
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="admin-measure-note">
          Load the directory to inspect account status and successful sign-in history. This view
          does not change accounts.
        </p>
      )}
    </section>
  );
}
export function AdminDashboard() {
  const [days, setDays] = useState(30),
    [report, setReport] = useState<AdminOverview>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(true);
  const serial = useRef(0);
  const alive = useRef(true);
  const load = useCallback(async () => {
    const id = ++serial.current;
    setLoading(true);
    setError(undefined);
    const r = await api.adminOverview(days);
    if (id !== serial.current || !alive.current) return;
    if (r.ok) setReport(r.data);
    else {
      setReport(undefined);
      setError(describeFailure(r.error));
    }
    setLoading(false);
  }, [days]);
  useEffect(() => {
    alive.current = true;
    setReport(undefined);
    void load();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => {
      clearInterval(tick);
      alive.current = false;
    };
  }, [load]);
  const audience = report?.audience;
  const healthy =
    report &&
    report.workers.length > 0 &&
    report.workers.every(
      (w) =>
        w.last_success_at &&
        new Date(report.as_of).getTime() - new Date(w.last_success_at).getTime() < 120000 &&
        w.consecutive_errors === 0,
    );
  return (
    <div className="admin-overview">
      <div className="admin-report-controls">
        <div>
          <span className="admin-environment">
            {report?.test_only
              ? "Fictional sandbox"
              : report?.environment === "staging"
                ? "Staging preview"
                : "Administration"}
          </span>
          <p>{report ? "Updated " + stamp(report.as_of) : "Loading your workspace…"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="admin-period">
            Reporting period
          </label>
          <select
            id="admin-period"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setReport(undefined);
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw aria-hidden size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>
      {error && (
        <Notice tone="error">
          {error}{" "}
          <a href="/staff" className="underline">
            Verify staff access
          </a>
        </Notice>
      )}
      {!report && !error ? (
        <div role="status" className="admin-loading">
          Preparing your overview…
        </div>
      ) : (
        report &&
        audience && (
          <>
            <div className="admin-kpi-grid">
              {[
                {
                  label: "Observed visits",
                  value: audience.visits,
                  note:
                    audience.page_views === null
                      ? "Tracking starts with public visits"
                      : number(audience.page_views) + " public page views",
                  icon: MousePointer2,
                  color: "pink",
                },
                {
                  label: "New accounts",
                  value: audience.new_accounts,
                  note: number(audience.accounts_total) + " registered accounts in total",
                  icon: Users,
                  color: "blue",
                },
                {
                  label: "Successful logins",
                  value: audience.successful_logins,
                  note: number(audience.signed_in_accounts) + " distinct signed-in accounts",
                  icon: LogIn,
                  color: "purple",
                },
                {
                  label: "Enquiries received",
                  value: report.business.enquiries,
                  note: number(report.business.pending_enquiries) + " pending now",
                  icon: MessagesSquare,
                  color: "mint",
                },
              ].map((card) => (
                <article className="admin-kpi" key={card.label}>
                  <div className="admin-kpi-heading">
                    <p>{card.label}</p>
                    <span className={"admin-kpi-icon " + card.color}>
                      <card.icon size={19} aria-hidden />
                    </span>
                  </div>
                  <strong>{number(card.value)}</strong>
                  <p className="admin-kpi-note">{card.note}</p>
                </article>
              ))}
            </div>
            <div className="admin-middle-grid">
              <Trend report={report} />
              <section className="admin-panel">
                <div className="admin-panel-title">
                  <div>
                    <h2>Needs your review</h2>
                    <p>Current queues in your assigned areas</p>
                  </div>
                  <ShieldCheck aria-hidden size={20} />
                </div>
                <div className="admin-queue-list">
                  {report.queues.length ? (
                    report.queues.map((q) => (
                      <a key={q.key} href={q.href}>
                        <span>{q.label}</span>
                        <strong className={q.count ? "admin-count" : "admin-count-clear"}>
                          {number(q.count)}
                        </strong>
                        <ChevronRight size={15} aria-hidden />
                      </a>
                    ))
                  ) : (
                    <div className="admin-empty">No review queues in your assigned areas.</div>
                  )}
                </div>
                <a className="admin-panel-link" href="/staff/support">
                  Open case workspace
                  <ArrowUpRight size={15} aria-hidden />
                </a>
              </section>
            </div>
            {report.finance && (
              <section className="admin-finance-strip" aria-label="Finance overview">
                <div>
                  <Wallet aria-hidden size={22} />
                  <span>
                    Platform payments<small>Actual captured payments, separate from tuition</small>
                  </span>
                </div>
                <div>
                  <small>Gross captured</small>
                  <strong>{money(report.finance.captured_paise)}</strong>
                </div>
                <div>
                  <small>Provider refunds</small>
                  <strong>{money(report.finance.refunded_paise)}</strong>
                </div>
                <div>
                  <small>Coupon uses</small>
                  <strong>
                    {number(report.finance.coupon_redemptions)}
                    <span> · {number(report.finance.free_passes)} free passes</span>
                  </strong>
                </div>
                <a href="/staff/finance" aria-label="Open finance and coupons">
                  <ArrowUpRight size={22} />
                </a>
              </section>
            )}
            <div className="admin-bottom-grid">
              <section className="admin-panel">
                <div className="admin-panel-title">
                  <div>
                    <h2>Recent marketplace activity</h2>
                    <p>Recorded actions · latest first</p>
                  </div>
                  <Activity aria-hidden size={20} />
                </div>
                <div className="admin-activity-list">
                  {report.activity.length ? (
                    report.activity.map((a) => (
                      <div key={a.id}>
                        <span className="admin-activity-icon">
                          <CheckCircle2 aria-hidden size={16} />
                        </span>
                        <div>
                          <p>{activityLabel(a.event_type)}</p>
                          <time>{stamp(a.created_at)}</time>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="admin-empty">No marketplace actions recorded yet.</p>
                  )}
                </div>
              </section>
              <section className="admin-panel">
                <div className="admin-panel-title">
                  <div>
                    <h2>Platform status</h2>
                    <p>Worker health and open alerts</p>
                  </div>
                  <Activity aria-hidden size={20} />
                </div>
                <div className={"admin-health " + (healthy ? "is-healthy" : "is-waiting")}>
                  {healthy ? (
                    <CheckCircle2 aria-hidden size={20} />
                  ) : (
                    <AlertTriangle aria-hidden size={20} />
                  )}
                  <div>
                    <strong>
                      {healthy
                        ? "Workers reporting normally"
                        : report.workers.length
                          ? "Worker attention needed"
                          : "Waiting for worker signals"}
                    </strong>
                    <p>
                      {report.workers.length} workers reporting · {report.alerts.length} open alert
                      groups
                    </p>
                  </div>
                </div>
                {report.alerts.map((a) => (
                  <div className="admin-alert" key={a.code}>
                    <AlertTriangle size={16} aria-hidden />
                    <span>
                      {a.code.toLowerCase().replaceAll("_", " ")} · {a.count}
                    </span>
                  </div>
                ))}
                {!report.alerts.length && (
                  <p className="admin-measure-note">No open alerts in your assigned areas.</p>
                )}
                <p className="admin-measure-note">
                  {number(audience.valid_sessions)} valid login sessions. This does not mean those
                  people are online now.
                </p>
                {report.scopes.some((s) => s === "SUPPORT" || s === "FINANCE") && (
                  <a href="/staff/operations" className="admin-panel-link">
                    Inspect operations
                    <ArrowUpRight size={15} aria-hidden />
                  </a>
                )}
              </section>
            </div>
            {report.scopes.includes("SUPPORT") && <Accounts />}
            <p className="admin-report-footnote">
              Range: last {days} calendar days, including today, in IST. Login counts record
              successful sign-ins; one account may sign in more than once. Deleted accounts are
              excluded from audience reporting. Visitor observations may include automated traffic
              and are not unique-human counts.
            </p>
          </>
        )
      )}
    </div>
  );
}
