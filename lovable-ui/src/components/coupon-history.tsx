import { useEffect, useState } from "react";
import { api, describeFailure, type CouponRedemption } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
const time = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(s)) + " IST";
export function CouponHistory() {
  const [rows, setRows] = useState<CouponRedemption[]>([]);
  const [error, setError] = useState<string>();
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.couponHistory();
    if (r.ok) {
      setRows(r.data.redemptions);
      setError(undefined);
    } else {
      setRows([]);
      setError(describeFailure(r.error));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="mt-6 space-y-4" aria-label="Your coupon passes">
      <h2 className="text-xl font-semibold">Your coupon passes</h2>
      <p className="text-sm text-muted-foreground">
        A 100% coupon needs no payment. Your 30 days start with the first eligible Tutor acceptance.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {rows.length === 0 ? (
        <p className="text-sm">No coupons redeemed yet.</p>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="rounded-xl border p-4 space-y-2">
            <h3 className="font-semibold">
              {row.code} · {row.percent_off}% off
            </h3>
            <p>
              You paid ₹{(row.total_paise / 100).toFixed(2)}
              {row.total_paise > 0
                ? " ? Payment status is tracked separately."
                : " · No payment required."}
            </p>
            {row.access ? (
              <>
                <p className="font-semibold">
                  {row.access.status === "MATCHING"
                    ? "Coupon redeemed · Awaiting Tutor acceptance"
                    : row.access.status === "ACTIVE"
                      ? "Access Pass active"
                      : row.access.status === "REVOKED"
                        ? "Coupon pass cancelled"
                        : "Coupon pass expired"}
                </p>
                {row.access.status === "MATCHING" && (
                  <>
                    <p className="text-sm">
                      Send an enquiry before {time(row.access.matching_deadline)}. If no Tutor
                      accepts by then, this free pass expires. No money is refundable.
                    </p>
                    <Button
                      variant="outline"
                      disabled={action.loading}
                      onClick={() =>
                        void action.run(async () => {
                          const r = await api.cancelCoupon(row.id);
                          if (r.ok) await load();
                          else setError(describeFailure(r.error));
                        })
                      }
                    >
                      Cancel unused coupon pass
                    </Button>
                  </>
                )}
                {row.access.ends_at && (
                  <p className="text-sm">Access ends: {time(row.access.ends_at)}</p>
                )}
              </>
            ) : (
              <p className="text-sm">
                Discount reserved for purchase. Check payment status before trying again.
              </p>
            )}
          </article>
        ))
      )}
      <Button variant="outline" disabled={action.loading} onClick={() => void action.run(load)}>
        Refresh coupon status
      </Button>
    </section>
  );
}
