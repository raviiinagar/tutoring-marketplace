import { useState, type FormEvent } from "react";
import { api, describeFailure, type CouponCampaign } from "@/lib/api";
import { Field, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export function StaffCoupons() {
  const [rows, setRows] = useState<CouponCampaign[]>();
  const [code, setCode] = useState("");
  const [product,setProduct]=useState<"LEARNER_ACCESS"|"TUTOR_PRO">("LEARNER_ACCESS");
  const [percent, setPercent] = useState("100");
  const [limit, setLimit] = useState("100");
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.staffCoupons();
    if (r.ok) {
      setRows(r.data.coupons);
      setError(undefined);
    } else {
      setRows(undefined);
      setError(describeFailure(r.error));
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      setError(undefined);
      setNotice(undefined);
      const at = new Date();
      const r = await api.createCoupon({
        code,product,
        percent_off: Number(percent),
        max_uses: Number(limit),
        starts_at: at.toISOString(),
        expires_at: new Date(at.getTime() + Number(days) * 86400000).toISOString(),
        reason,
      });
      if (r.ok) {
        setNotice("Coupon created. Share the code with eligible users.");
        setCode("");
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <section className="mt-8 space-y-4 rounded-2xl border p-5">
      <h2 className="text-xl font-semibold">Access Pass coupons</h2>
      <p className="text-sm text-muted-foreground">
        Finance access and staff MFA required. One redemption per account per code. Disabling a code
        stops new uses; existing passes keep their original terms.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <Button
        type="button"
        variant="outline"
        disabled={action.loading}
        onClick={() => void action.run(load)}
      >
        Load coupons
      </Button>
      {rows && (
        <>
          <form className="space-y-4" onSubmit={create}><label className="block text-sm font-semibold">Pass product<select className="input mt-2" value={product} onChange={e=>setProduct(e.target.value as "LEARNER_ACCESS"|"TUTOR_PRO")}><option value="LEARNER_ACCESS">Learner Access Pass · ₹599</option><option value="TUTOR_PRO">Tutor Pro · ₹600</option></select></label>
            <Field
              label="Coupon code"
              required
              minLength={4}
              maxLength={32}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,31}"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Discount (%)"
                type="number"
                required
                min={1}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
              <Field
                label="Total uses"
                type="number"
                required
                min={1}
                max={100000}
                step={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <Field
                label="Valid for (days)"
                type="number"
                required
                min={1}
                max={365}
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <Field
              label="Coupon action reason"
              required
              minLength={10}
              maxLength={240}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button disabled={action.loading}>Create coupon</Button>
          </form>
          {rows.length === 0 && <p>No coupons created yet.</p>}
          {rows.map((row) => (
            <article key={row.id} className="space-y-2 rounded-xl border p-4">
              <h3 className="font-semibold break-all">
                {row.code} · {row.product==='TUTOR_PRO'?'Tutor Pro':'Learner Access Pass'} · {row.percent_off}% off
              </h3>
              <p className="text-sm">
                {!row.enabled
                  ? "Disabled"
                  : new Date(row.expires_at) <= new Date()
                    ? "Expired"
                    : new Date(row.starts_at) > new Date()
                      ? "Starts later"
                      : row.uses >= row.max_uses
                        ? "Fully redeemed"
                        : "Available"}{" "}
                · {row.uses} / {row.max_uses} uses
              </p>
              <p className="text-sm">
                Expires:{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(row.expires_at))}{" "}
                IST
              </p>
              {row.enabled && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={action.loading || reason.trim().length < 10}
                  onClick={() =>
                    void action.run(async () => {
                      const r = await api.disableCoupon(row.id, reason);
                      if (r.ok) {
                        setNotice("Coupon disabled for new redemptions.");
                        await load();
                      } else setError(describeFailure(r.error));
                    })
                  }
                >
                  Disable coupon
                </Button>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
