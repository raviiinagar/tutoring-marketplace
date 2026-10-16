import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { ApiProblem } from "./errors.js";
import { financeReason } from "./refunds.js";
import { financeException as recordFinanceException } from "./finance.js";
import { tokenHash } from "./security.js";
import {
  reconRowSchema,
  settlementSchema,
  refundSchema,
  type RefundProvider,
  type PaymentProvider,
  type ReconciliationProvider,
} from "./payment-provider.js";
import type { ProviderPayment, ProviderOrder } from "./payment-provider.js";
type Row = Record<string, any>;
type Posting = {
  account: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
};
export const reconciliationInput = z.strictObject({
  request_key: z.uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31).optional(),
  reason: financeReason,
});
export const bankInput = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        reference: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
        utr: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/),
        amount_paise: z.number().int().positive().safe(),
        currency: z.literal("INR"),
        received_at: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(100),
  reason: financeReason,
});
export const captureConfirmationInput = z.strictObject({
  provider_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  captured_at: z.iso.datetime(),
  reason: financeReason,
});
export class SettlementReconciliation {
  private dailyKey = "";
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly provider:
      | (PaymentProvider & Partial<ReconciliationProvider & RefundProvider>)
      | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async exception(
    client: PoolClient,
    cycle: string | null,
    kind: string,
    reference: string,
    details: unknown,
    at: Date,
  ) {
    return recordFinanceException(client, cycle, kind, reference, details, at, {
      providerKey: this.config.payments?.keyId,
      testOnly: this.config.mode !== "production",
    });
  }
  private async audit(
    client: PoolClient,
    actor: string,
    event: string,
    target: string,
    reason: string,
  ) {
    await client.query(
      "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        actor,
        event,
        randomUUID(),
        this.now(),
        { target, reason },
      ],
    );
  }
  private async post(
    client: PoolClient,
    type: string,
    source: string,
    cycle: string | null,
    currency: string,
    postings: Posting[],
  ) {
    const id = randomUUID();
    const key = cycle
      ? (
          await client.query(
            "SELECT provider_key_id FROM purchase_cycles WHERE id=$1",
            [cycle],
          )
        ).rows[0].provider_key_id
      : this.config.payments?.keyId || "UNCONFIGURED";
    const inserted = await client.query(
      "INSERT INTO financial_entries(id,source_type,source_id,cycle_id,currency,created_at,provider_key_id,test_only) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_type,source_id) DO NOTHING",
      [
        id,
        type,
        source,
        cycle,
        currency,
        this.now(),
        key,
        this.config.mode !== "production",
      ],
    );
    if (!inserted.rowCount) return false;
    for (const p of postings.filter((p) => p.amount > 0))
      await client.query(
        "INSERT INTO financial_postings(entry_id,account,direction,amount_paise) VALUES($1,$2,$3,$4)",
        [id, p.account, p.direction, p.amount],
      );
    return true;
  }
  async start(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof reconciliationInput>,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      if (!this.config.payments)
        throw new ApiProblem(
          503,
          "PAYMENTS_UNCONFIGURED",
          "Provider reconciliation requires configured payment credentials.",
        );
      const selection = {
        year: input.year,
        month: input.month,
        ...(input.day ? { day: input.day } : {}),
      };
      const existing = (
        await client.query(
          "SELECT * FROM reconciliation_runs WHERE request_key=$1",
          [input.request_key],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.provider_key_id !== this.config.payments.keyId ||
          (JSON.stringify(existing.selection) !== JSON.stringify(selection) &&
            tokenHash(
              JSON.stringify(Object.entries(existing.selection).sort()),
            ) !== tokenHash(JSON.stringify(Object.entries(selection).sort())))
        )
          throw new ApiProblem(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This reconciliation key has different parameters.",
          );
        return {
          run: { id: existing.id, status: existing.status },
          replayed: true,
        };
      }
      const id = randomUUID();
      await client.query(
        "INSERT INTO reconciliation_runs(id,request_key,provider_key_id,test_only,selection,actor_id,reason,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)",
        [
          id,
          input.request_key,
          this.config.payments.keyId,
          this.config.mode !== "production",
          selection,
          user.id,
          input.reason,
          this.now(),
        ],
      );
      await this.audit(
        client,
        user.id,
        "RECONCILIATION_STARTED",
        id,
        input.reason,
      );
      return { run: { id, status: "PENDING" }, replayed: false };
    });
  }
  async view(
    account: string | undefined,
    elevated: string | undefined,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      await this.audit(
        client,
        user.id,
        "FINANCIAL_RECONCILIATION_READ",
        "settlement-ledger",
        reason,
      );
      const entries = (
        await client.query(
          `SELECT e.*,jsonb_agg(jsonb_build_object('account',p.account,'direction',p.direction,'amount_paise',p.amount_paise) ORDER BY p.account) AS postings FROM financial_entries e JOIN financial_postings p ON p.entry_id=e.id LEFT JOIN purchase_cycles c ON c.id=e.cycle_id WHERE e.test_only<>$1::boolean GROUP BY e.id ORDER BY e.created_at DESC,e.id LIMIT 100`,
          [this.config.mode === "production"],
        )
      ).rows;
      const totals = (
        await client.query(
          `SELECT COALESCE(sum(CASE WHEN p.direction='DEBIT' THEN p.amount_paise ELSE 0 END),0) AS debits,COALESCE(sum(CASE WHEN p.direction='CREDIT' THEN p.amount_paise ELSE 0 END),0) AS credits,COALESCE(sum(CASE WHEN p.account IN ('GATEWAY_FEE_EX_TAX','GATEWAY_TAX') AND p.direction='DEBIT' THEN p.amount_paise ELSE 0 END),0) AS fee,COALESCE(sum(CASE WHEN p.account='GATEWAY_TAX' AND p.direction='DEBIT' THEN p.amount_paise ELSE 0 END),0) AS tax,COALESCE(sum(CASE WHEN p.account='BANK_CONTROL' AND p.direction='DEBIT' THEN p.amount_paise ELSE 0 END),0) AS bank FROM financial_postings p JOIN financial_entries e ON e.id=p.entry_id LEFT JOIN purchase_cycles c ON c.id=e.cycle_id WHERE e.test_only<>$1::boolean`,
          [this.config.mode === "production"],
        )
      ).rows[0];
      return {
        entries,
        totals: {
          total_debits_paise: Number(totals.debits),
          total_credits_paise: Number(totals.credits),
          gateway_fee_paise: Number(totals.fee),
          gateway_tax_paise: Number(totals.tax),
          bank_received_paise: Number(totals.bank),
        },
        runs: (
          await client.query(
            "SELECT id,selection,status,next_skip,last_error,created_at,reason FROM reconciliation_runs WHERE provider_key_id=$1 ORDER BY created_at DESC,id LIMIT 50",
            [this.config.payments?.keyId || ""],
          )
        ).rows,
        settlements: (
          await client.query(
            "SELECT s.id,s.amount_paise,s.currency,s.status,s.utr,EXISTS(SELECT 1 FROM bank_receipts b WHERE b.settlement_id=s.id) AS bank_matched FROM provider_settlements s WHERE s.provider_key_id=$1 ORDER BY s.updated_at DESC,s.id LIMIT 100",
            [this.config.payments?.keyId || ""],
          )
        ).rows,
        notice:
          "Operational subledger for platform payments. Direct tuition is excluded; provider processing and bank receipt remain separate.",
      };
    });
  }
  async bank(
    account: string | undefined,
    elevated: string | undefined,
    input: z.infer<typeof bankInput>,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      if (!this.config.payments)
        throw new ApiProblem(
          503,
          "PAYMENTS_UNCONFIGURED",
          "Configure the provider account before importing bank evidence.",
        );
      let recorded = 0;
      let conflicts = 0;
      for (const row of input.rows) {
        const hash = tokenHash(JSON.stringify(row));
        const prior = (
          await client.query("SELECT * FROM bank_receipts WHERE reference=$1", [
            row.reference,
          ])
        ).rows[0];
        if (prior) {
          if (
            prior.fingerprint !== hash ||
            prior.provider_key_id !== this.config.payments.keyId
          ) {
            conflicts++;
            await this.exception(
              client,
              null,
              "BANK_IMPORT_CONFLICT",
              row.reference,
              { observed: row },
              this.now(),
            );
          }
          continue;
        }
        const inserted = await client.query(
          "INSERT INTO bank_receipts(reference,provider_key_id,fingerprint,utr,amount_paise,currency,received_at,actor_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING",
          [
            row.reference,
            this.config.payments.keyId,
            hash,
            row.utr,
            row.amount_paise,
            row.currency,
            row.received_at,
            user.id,
            input.reason,
            this.now(),
          ],
        );
        if (inserted.rowCount) recorded++;
      }
      await this.matchBank(client);
      for (const row of input.rows) {
        const stored = (
          await client.query(
            "SELECT settlement_id FROM bank_receipts WHERE reference=$1",
            [row.reference],
          )
        ).rows[0];
        if (stored && !stored.settlement_id)
          await this.exception(
            client,
            null,
            "BANK_RECEIPT_UNMATCHED",
            row.reference,
            { utr: row.utr, amount_paise: row.amount_paise },
            this.now(),
          );
      }
      await this.audit(
        client,
        user.id,
        "BANK_RECEIPTS_IMPORTED",
        "bank-import",
        input.reason,
      );
      return { recorded, conflicts };
    });
  }
  private async matchBank(client: PoolClient) {
    const matches = (
      await client.query(
        `SELECT b.*,s.id AS matched_settlement FROM bank_receipts b JOIN provider_settlements s ON s.provider_key_id=b.provider_key_id AND s.utr=b.utr AND s.currency=b.currency AND s.amount_paise=b.amount_paise AND s.status='processed' WHERE b.provider_key_id=$1 AND b.settlement_id IS NULL AND NOT EXISTS(SELECT 1 FROM bank_receipts other WHERE other.settlement_id=s.id) ORDER BY b.reference LIMIT 100 FOR UPDATE OF b SKIP LOCKED`,
        [this.config.payments?.keyId || ""],
      )
    ).rows;
    for (const row of matches) {
      if (
        (
          await client.query(
            "SELECT 1 FROM bank_receipts WHERE settlement_id=$1",
            [row.matched_settlement],
          )
        ).rowCount
      ) {
        await this.exception(
          client,
          null,
          "DUPLICATE_BANK_UTR",
          row.reference,
          { utr: row.utr, amount_paise: Number(row.amount_paise) },
          this.now(),
        );
        continue;
      }
      await client.query(
        "UPDATE bank_receipts SET settlement_id=$2 WHERE reference=$1",
        [row.reference, row.matched_settlement],
      );
      await client.query(
        "UPDATE finance_exceptions SET status='RESOLVED',resolution_reason='Matched verified bank evidence',resolved_at=$2 WHERE kind='BANK_RECEIPT_UNMATCHED' AND reference=$1 AND status='OPEN'",
        [row.reference, this.now()],
      );
      await this.post(
        client,
        "BANK_RECEIPT",
        row.reference,
        null,
        row.currency,
        [
          {
            account: "BANK_CONTROL",
            direction: "DEBIT",
            amount: Number(row.amount_paise),
          },
          {
            account: "PROVIDER_CONTROL",
            direction: "CREDIT",
            amount: Number(row.amount_paise),
          },
        ],
      );
      await client.query(
        "UPDATE finance_exceptions SET status='RESOLVED',resolution_reason='Verified bank receipt matched by UTR, amount and currency',resolved_at=$2 WHERE kind='BANK_CREDIT_PENDING' AND reference=$1 AND status='OPEN'",
        [row.matched_settlement, this.now()],
      );
    }
    return matches.length > 0;
  }
  private async ledger() {
    return this.database.transaction(async (client) => {
      const capture = (
        await client.query(
          "SELECT j.* FROM payment_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE p.test_only=$1 AND NOT EXISTS(SELECT 1 FROM financial_entries e WHERE e.source_type='CAPTURE' AND e.source_id=j.id::text) ORDER BY j.recorded_at,j.id LIMIT 1",
          [this.config.mode !== "production"],
        )
      ).rows[0];
      if (capture) {
        await client.query(
          "SELECT 1 FROM purchase_cycles WHERE id=$1 FOR UPDATE",
          [capture.cycle_id],
        );
        await this.post(
          client,
          "CAPTURE",
          capture.id,
          capture.cycle_id,
          capture.currency,
          [
            {
              account: "PROVIDER_CONTROL",
              direction: "DEBIT",
              amount: Number(capture.amount_paise),
            },
            {
              account:
                capture.kind === "CAPTURE"
                  ? "PLATFORM_FEE_CONTROL"
                  : "EXCESS_CAPTURE_LIABILITY",
              direction: "CREDIT",
              amount: Number(capture.amount_paise),
            },
          ],
        );
        return true;
      }
      const reversal = (
        await client.query(
          "SELECT r.* FROM reversal_journal r JOIN purchase_cycles p ON p.id=r.cycle_id WHERE p.test_only=$1 AND NOT EXISTS(SELECT 1 FROM financial_entries e WHERE e.source_type='REVERSAL' AND e.source_id=r.id::text) ORDER BY r.recorded_at,r.id LIMIT 1",
          [this.config.mode !== "production"],
        )
      ).rows[0];
      if (reversal) {
        await client.query(
          "SELECT 1 FROM purchase_cycles WHERE id=$1 FOR UPDATE",
          [reversal.cycle_id],
        );
        await this.post(
          client,
          "REVERSAL",
          reversal.id,
          reversal.cycle_id,
          reversal.currency,
          [
            {
              account:
                reversal.kind === "REFUND"
                  ? "PLATFORM_REFUND_CONTROL"
                  : "CHARGEBACK_CONTROL",
              direction: "DEBIT",
              amount: Number(reversal.amount_paise),
            },
            {
              account: "PROVIDER_CONTROL",
              direction: "CREDIT",
              amount: Number(reversal.amount_paise),
            },
          ],
        );
        return true;
      }
      return false;
    });
  }
  private async storeSettlement(client: PoolClient, value: unknown) {
    const row = settlementSchema.parse(value);
    const old = (
      await client.query("SELECT * FROM provider_settlements WHERE id=$1", [
        row.id,
      ])
    ).rows[0];
    if (
      old &&
      (Number(old.amount_paise) !== row.amount ||
        old.currency !== row.currency ||
        old.provider_key_id !== this.config.payments!.keyId)
    ) {
      await this.exception(
        client,
        null,
        "SETTLEMENT_IMPORT_CONFLICT",
        row.id,
        { observed: row },
        this.now(),
      );
      return;
    }
    await client.query(
      "INSERT INTO provider_settlements(id,provider_key_id,amount_paise,currency,status,utr,snapshot,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,utr=COALESCE(EXCLUDED.utr,provider_settlements.utr),snapshot=EXCLUDED.snapshot,updated_at=EXCLUDED.updated_at",
      [
        row.id,
        this.config.payments!.keyId,
        row.amount,
        row.currency,
        row.status,
        row.utr || null,
        row,
        this.now(),
      ],
    );
    if (
      row.status === "processed" &&
      !(
        await client.query(
          "SELECT 1 FROM bank_receipts WHERE settlement_id=$1",
          [row.id],
        )
      ).rowCount
    )
      await this.exception(
        client,
        null,
        "BANK_CREDIT_PENDING",
        row.id,
        { amount_paise: row.amount, currency: row.currency },
        this.now(),
      );
  }
  private async renewRun(job:Row){const kept=await this.database.pool.query('UPDATE reconciliation_runs SET lease_until=$2 WHERE id=$1 AND lease_token=$3',[job.id,new Date(this.now().getTime()+60000),job.lease_token]);if(!kept.rowCount)throw new Error('Reconciliation lease ended');}
  private async importRun() {
    if (
      !this.provider?.fetchRecon ||
      !this.provider.fetchSettlement ||
      !this.config.payments
    )
      return false;
    const job = await this.database.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM reconciliation_runs WHERE provider_key_id=$1 AND status IN ('PENDING','PROCESSING') AND (lease_until IS NULL OR lease_until<=$2) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [this.config.payments!.keyId, this.now()],
        )
      ).rows[0];
      if (!row) return;
      const lease = randomUUID();
      await client.query(
        "UPDATE reconciliation_runs SET status='PROCESSING',lease_token=$2,lease_until=$3 WHERE id=$1",
        [row.id, lease, new Date(this.now().getTime() + 60000)],
      );
      return { ...row, lease_token: lease };
    });
    if (!job) return false;
    try {
      const rows = z
        .array(reconRowSchema)
        .max(100)
        .parse(
          await this.provider.fetchRecon({
            ...job.selection,
            skip: job.next_skip,
            count: 100,
          }),
        );
      const refundReads: z.infer<typeof refundSchema>[] = [];
      for (const row of rows.filter((row) => row.type === "refund")) {
        if (!this.provider!.fetchRefund)
          throw new Error("Refund reads unavailable");
        const actual = refundSchema.parse(
          await this.provider!.fetchRefund(row.entity_id),
        );
        if (
          actual.id !== row.entity_id ||
          actual.amount !== row.amount ||
          actual.currency !== row.currency
        )
          throw new Error("Refund reconciliation identity conflict");
        refundReads.push(actual);await this.renewRun(job);
      }
      const recovered: { payment: ProviderPayment; order: ProviderOrder }[] =
        [];
      for (const row of rows.filter((row) => row.type === "payment")) {
        if (
          (
            await this.database.pool.query(
              "SELECT 1 FROM payment_journal WHERE provider_payment_id=$1",
              [row.entity_id],
            )
          ).rowCount
        )
          continue;
        const payment = await this.provider!.fetchPayment(row.entity_id);
        const order = await this.provider!.fetchOrder(payment.order_id);
        if (
          payment.id !== row.entity_id ||
          payment.order_id !== order.id ||
          (row.order_id && row.order_id !== order.id)
        )
          throw new Error("Provider reconciliation identity conflict");
        recovered.push({ payment, order });await this.renewRun(job);
      }
      const settlements: z.infer<typeof settlementSchema>[] = [];
      for (const id of [
        ...new Set(
          rows
            .map((row) => row.settlement_id)
            .filter((id): id is string => !!id),
        ),
      ]){settlements.push(settlementSchema.parse(await this.provider.fetchSettlement(id)));await this.renewRun(job);}
      await this.database.transaction(async (client) => {
        const locked = (
          await client.query(
            "SELECT * FROM reconciliation_runs WHERE id=$1 FOR UPDATE",
            [job.id],
          )
        ).rows[0];
        if (locked.lease_token !== job.lease_token) return;
        const captures = (
          await client.query(
            "SELECT j.* FROM payment_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE j.provider_payment_id=ANY($1::text[]) AND p.provider_key_id=$2",
            [
              rows.map((row) =>
                row.type === "payment" ? row.entity_id : row.payment_id || "",
              ),
              job.provider_key_id,
            ],
          )
        ).rows;
        await client.query(
          "SELECT id FROM purchase_cycles WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [
            [
              ...captures.map((row) => row.cycle_id),
              ...recovered
                .map((row) => z.uuid().safeParse(row.order.receipt))
                .filter((row) => row.success)
                .map((row) => row.data!),
            ],
          ],
        );
        const recoveredIds = recovered
          .map((row) => z.uuid().safeParse(row.order.receipt))
          .filter((row) => row.success)
          .map((row) => row.data!);
        await client.query(
          "SELECT id FROM purchase_cycles WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [recoveredIds],
        );
        for (const item of recovered) {
          const cycle = (
            await client.query(
              "SELECT * FROM purchase_cycles WHERE id::text=$1 AND provider_key_id=$2 AND test_only=$3",
              [
                item.order.receipt,
                job.provider_key_id,
                this.config.mode !== "production",
              ],
            )
          ).rows[0];
          if (
            !cycle ||
            (cycle.provider_order_id &&
              cycle.provider_order_id !== item.order.id)
          )
            continue;
          if (
            item.payment.captured &&
            ["captured", "refunded"].includes(item.payment.status) &&
            !(
              await client.query(
                "SELECT 1 FROM payment_journal WHERE provider_payment_id=$1",
                [item.payment.id],
              )
            ).rowCount
          ) {
            await client.query(
              "UPDATE purchase_cycles SET provider_order_id=COALESCE(provider_order_id,$2),status='REVIEW',resolution_required=true,updated_at=$3 WHERE id=$1",
              [cycle.id, item.order.id, this.now()],
            );
            await client.query(
              "INSERT INTO finance_observations(fingerprint,cycle_id,provider_reference,kind,fact,recorded_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
              [
                tokenHash("RECONCILED_CAPTURE:" + JSON.stringify(item.payment)),
                cycle.id,
                item.payment.id,
                "RECONCILED_CAPTURE",
                item.payment,
                this.now(),
              ],
            );
            await this.exception(
              client,
              cycle.id,
              "CAPTURE_TIMESTAMP_REQUIRED",
              item.payment.id,
              {
                provider_payment_id: item.payment.id,
                amount_paise: item.payment.amount,
                currency: item.payment.currency,
                payment_created_at: item.payment.created_at,
              },
              this.now(),
            );
          }
        }
        for (const refund of refundReads) {
          const eventId = "recon_refund_" + refund.id + "_" + refund.status;
          const event = {
            event: "refund.reconciled",
            created_at: refund.created_at,
            payload: { refund: { entity: refund } },
          };
          await client.query(
            "INSERT INTO payment_webhook_inbox(event_id,body_hash,event,provider_key_id,status,next_attempt_at,received_at) VALUES($1,$2,$3,$4,'PENDING',$5,$5) ON CONFLICT DO NOTHING",
            [
              eventId,
              tokenHash(JSON.stringify(event)),
              event,
              job.provider_key_id,
              this.now(),
            ],
          );
        }
        for (const row of rows) {
          const reference = [
            job.provider_key_id,
            row.type,
            row.entity_id,
            row.settlement_id || "unsettled",
          ].join(":");
          const fingerprint = tokenHash(JSON.stringify(row));
          const old = (
            await client.query(
              "SELECT fingerprint FROM provider_recon_rows WHERE reference=$1",
              [reference],
            )
          ).rows[0];
          if (old) {
            if (old.fingerprint !== fingerprint)
              await this.exception(
                client,
                null,
                "PROVIDER_IMPORT_CONFLICT",
                reference,
                { observed: row },
                this.now(),
              );
            continue;
          }
          await client.query(
            "INSERT INTO provider_recon_rows(reference,provider_key_id,fingerprint,settlement_id,snapshot,imported_at) VALUES($1,$2,$3,$4,$5,$6)",
            [
              reference,
              job.provider_key_id,
              fingerprint,
              row.settlement_id || null,
              row,
              this.now(),
            ],
          );
          const capture = captures.find(
            (c) =>
              c.provider_payment_id ===
              (row.type === "payment" ? row.entity_id : row.payment_id),
          );
          if (!capture) {
            await this.exception(
              client,
              null,
              "UNKNOWN_PROVIDER_TRANSACTION",
              reference,
              {
                type: row.type,
                entity_id: row.entity_id,
                amount_paise: row.amount,
              },
              this.now(),
            );
            continue;
          }
          if (capture.currency !== row.currency) {
            await this.exception(
              client,
              capture.cycle_id,
              "PROVIDER_CURRENCY_CONFLICT",
              reference,
              { currency: row.currency },
              this.now(),
            );
            continue;
          }
          if (row.type === "payment" && row.settled && row.fee > 0)
            await this.post(
              client,
              "GATEWAY_FEE",
              job.provider_key_id + ":" + row.entity_id,
              capture.cycle_id,
              row.currency,
              [
                {
                  account: "GATEWAY_FEE_EX_TAX",
                  direction: "DEBIT",
                  amount: row.fee - row.tax,
                },
                { account: "GATEWAY_TAX", direction: "DEBIT", amount: row.tax },
                {
                  account: "PROVIDER_CONTROL",
                  direction: "CREDIT",
                  amount: row.fee,
                },
              ],
            );
        }
        for (const row of settlements) await this.storeSettlement(client, row);
        await this.matchBank(client);
        await client.query(
          "UPDATE reconciliation_runs SET status=$2,next_skip=$3,lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=$4 WHERE id=$1",
          [
            job.id,
            rows.length === 100 ? "PENDING" : "COMPLETED",
            job.next_skip + rows.length,
            this.now(),
          ],
        );
      });
    } catch {
      await this.database.pool.query(
        "UPDATE reconciliation_runs SET status='REVIEW',lease_token=NULL,lease_until=NULL,last_error='PROVIDER_RECONCILIATION_PENDING',updated_at=$2 WHERE id=$1 AND lease_token=$3",
        [job.id, this.now(), job.lease_token],
      );
    }
    return true;
  }
  async confirmCapture(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    input: z.infer<typeof captureConfirmationInput>,
  ) {
    const preflight = await this.database.transaction(async (client) => {
      const found = (
        await client.query("SELECT * FROM purchase_cycles WHERE id=$1", [id])
      ).rows[0];
      await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
        found ? [found.payer_id] : [],
      );
      if (
        !found ||
        found.test_only !== (this.config.mode !== "production") ||
        found.provider_key_id !== this.config.payments?.keyId
      )
        throw new ApiProblem(404, "NOT_FOUND", "Purchase not found.");
      return found;
    });
    if (!this.provider)
      throw new ApiProblem(
        503,
        "PROVIDER_UNAVAILABLE",
        "Configure provider reads before confirming capture evidence.",
      );
    const payment = await this.provider.fetchPayment(input.provider_payment_id);
    const order = await this.provider.fetchOrder(payment.order_id);
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
        [preflight.payer_id],
      );
      const cycle = (
        await client.query(
          "SELECT * FROM purchase_cycles WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      const at = new Date(input.captured_at);
      if (
        payment.id !== input.provider_payment_id ||
        payment.order_id !== order.id ||
        order.receipt !== cycle.id ||
        (cycle.provider_order_id && cycle.provider_order_id !== order.id) ||
        !payment.captured ||
        !["captured", "refunded"].includes(payment.status) ||
        at.getTime() > this.now().getTime() ||
        at.getTime() < payment.created_at * 1000 ||
        at.getTime() + 1000 < new Date(cycle.created_at).getTime()
      )
        throw new ApiProblem(
          409,
          "CAPTURE_EVIDENCE_CONFLICT",
          "Provider identity, captured state and confirmed capture instant must agree.",
        );
      const prior = (
        await client.query(
          "SELECT * FROM payment_journal WHERE provider_payment_id=$1",
          [payment.id],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.cycle_id !== id ||
          new Date(prior.captured_at).getTime() !== at.getTime()
        )
          throw new ApiProblem(
            409,
            "CAPTURE_ALREADY_RECORDED",
            "The recorded capture instant cannot be changed.",
          );
        return { recorded: true, replayed: true };
      }
      const kind =
        payment.amount === cycle.amount_paise &&
        payment.currency === cycle.currency &&
        order.amount === cycle.amount_paise &&
        order.currency === cycle.currency &&
        !(
          await client.query(
            "SELECT 1 FROM payment_journal WHERE cycle_id=$1 AND kind='CAPTURE'",
            [id],
          )
        ).rowCount
          ? "CAPTURE"
          : "UNEXPECTED_CAPTURE";
      const eventId = "finance_capture_" + payment.id;
      const fact = {
        event: "finance.capture.confirmed",
        created_at: Math.floor(at.getTime() / 1000),
        provider_payment_id: payment.id,
        captured_at: input.captured_at,
      };
      await client.query(
        "INSERT INTO payment_webhook_inbox(event_id,body_hash,event,provider_key_id,status,next_attempt_at,received_at,processed_at) VALUES($1,$2,$3,$4,'PROCESSED',$5,$5,$5) ON CONFLICT DO NOTHING",
        [
          eventId,
          tokenHash(JSON.stringify(fact)),
          fact,
          cycle.provider_key_id,
          this.now(),
        ],
      );
      await client.query(
        "INSERT INTO payment_journal(id,cycle_id,provider_payment_id,provider_order_id,kind,amount_paise,currency,captured_at,recorded_at,event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          randomUUID(),
          cycle.id,
          payment.id,
          order.id,
          kind,
          payment.amount,
          payment.currency,
          at,
          this.now(),
          eventId,
        ],
      );
      await client.query(
        "UPDATE finance_exceptions SET status='RESOLVED',resolved_by=$2,resolved_at=$3,resolution_reason=$4 WHERE kind='CAPTURE_TIMESTAMP_REQUIRED' AND reference=$1 AND status='OPEN'",
        [payment.id, user.id, this.now(), input.reason],
      );
      if (kind === "CAPTURE") {
        const deadline = new Date(at.getTime() + 72 * 3600000);
        const held =
          deadline <= this.now() ||
          payment.status === "refunded" ||
          !!(
            await client.query(
              "SELECT 1 FROM purchase_cancellations WHERE cycle_id=$1",
              [id],
            )
          ).rowCount ||
          !!(
            await client.query(
              "SELECT 1 FROM finance_exceptions WHERE cycle_id=$1 AND status='OPEN' AND kind NOT IN ('BANK_CREDIT_PENDING','BANK_RECEIPT_UNMATCHED')",
              [id],
            )
          ).rowCount;
        await client.query(
          "UPDATE purchase_cycles SET provider_order_id=COALESCE(provider_order_id,$2),status='CAPTURED',captured_at=$3,matching_deadline=$4,resolution_required=$5,updated_at=$6 WHERE id=$1",
          [id, order.id, at, deadline, held, this.now()],
        );
      } else
        await client.query(
          "UPDATE purchase_cycles SET provider_order_id=COALESCE(provider_order_id,$2),status='REVIEW',resolution_required=true,updated_at=$3 WHERE id=$1",
          [id, order.id, this.now()],
        );
      await this.audit(
        client,
        user.id,
        "CAPTURE_TIME_CONFIRMED",
        cycle.id,
        input.reason,
      );
      return { recorded: true, replayed: false };
    });
  }
  private async settlementEvent() {
    if (!this.provider?.fetchSettlement || !this.config.payments) return false;
    const job = await this.database.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT * FROM payment_webhook_inbox WHERE status IN ('PENDING','UNMATCHED') AND event->>'event'='settlement.processed' AND provider_key_id=$1 AND next_attempt_at<=$2 ORDER BY received_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [this.config.payments!.keyId, this.now()],
        )
      ).rows[0];
      if (row)
        await client.query(
          "UPDATE payment_webhook_inbox SET attempts=attempts+1,next_attempt_at=$2 WHERE event_id=$1",
          [row.event_id, new Date(this.now().getTime() + 60000)],
        );
      return row;
    });
    if (!job) return false;
    try {
      const reported = settlementSchema.parse(
        job.event.payload.settlement.entity,
      );
      const actual = settlementSchema.parse(
        await this.provider.fetchSettlement(reported.id),
      );
      await this.database.transaction(async (client) => {
        const row = (
          await client.query(
            "SELECT status FROM payment_webhook_inbox WHERE event_id=$1 FOR UPDATE",
            [job.event_id],
          )
        ).rows[0];
        if (!["PENDING", "UNMATCHED"].includes(row.status)) return;
        if (actual.id !== reported.id || actual.amount !== reported.amount) {
          await this.exception(
            client,
            null,
            "SETTLEMENT_WEBHOOK_CONFLICT",
            reported.id,
            { amount_paise: actual.amount },
            this.now(),
          );
          await client.query(
            "UPDATE payment_webhook_inbox SET status='REVIEW',last_error='SETTLEMENT_FACT_CONFLICT' WHERE event_id=$1",
            [job.event_id],
          );
          return;
        }
        await this.storeSettlement(client, actual);
        await this.matchBank(client);
        await client.query(
          "UPDATE payment_webhook_inbox SET status='PROCESSED',processed_at=$2,last_error=NULL WHERE event_id=$1",
          [job.event_id, this.now()],
        );
      });
    } catch {
      await this.database.pool.query(
        "UPDATE payment_webhook_inbox SET last_error='SETTLEMENT_VERIFICATION_PENDING' WHERE event_id=$1 AND status IN ('PENDING','UNMATCHED')",
        [job.event_id],
      );
    }
    return true;
  }
  private async daily() {
    if (
      !this.config.payments?.dailyReconciliation ||
      !this.provider?.fetchRecon
    )
      return;
    const at = this.now();
    const key =
      this.config.payments.keyId + ":" + at.toISOString().slice(0, 10);
    if (this.dailyKey === key) return;
    const prior = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1),
    );
    const selections = [
      { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 },
      { year: prior.getUTCFullYear(), month: prior.getUTCMonth() + 1 },
    ];
    await this.database.transaction(async (client) => {
      for (const selection of selections) {
        const h = tokenHash(key + ":" + JSON.stringify(selection));
        const requestKey = [
          h.slice(0, 8),
          h.slice(8, 12),
          "4" + h.slice(13, 16),
          "a" + h.slice(17, 20),
          h.slice(20, 32),
        ].join("-");
        const id = randomUUID();
        const inserted = await client.query(
          "INSERT INTO reconciliation_runs(id,request_key,provider_key_id,test_only,selection,actor_id,reason,created_at,updated_at) VALUES($1,$2,$3,$4,$5,NULL,'Automatic daily provider reconciliation',$6,$6) ON CONFLICT(request_key) DO NOTHING",
          [
            id,
            requestKey,
            this.config.payments!.keyId,
            this.config.mode !== "production",
            selection,
            at,
          ],
        );
        if (inserted.rowCount)
          await client.query(
            "INSERT INTO audit_events(id,event_type,correlation_id,created_at,metadata) VALUES($1,'RECONCILIATION_SCHEDULED',$2,$3,$4)",
            [
              randomUUID(),
              randomUUID(),
              at,
              { target: id, reason: "Automatic daily provider reconciliation" },
            ],
          );
      }
    });
    this.dailyKey = key;
  }
  async tick(): Promise<boolean> {
    await this.daily();
    if (await this.ledger()) return true;
    if (await this.importRun()) return true;
    if (await this.settlementEvent()) return true;
    return this.database.transaction((client) => this.matchBank(client));
  }
  async retry(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      const row = (
        await client.query(
          "SELECT * FROM reconciliation_runs WHERE id=$1 AND provider_key_id=$2 FOR UPDATE",
          [id, this.config.payments?.keyId || ""],
        )
      ).rows[0];
      if (!row)
        throw new ApiProblem(404, "NOT_FOUND", "Reconciliation run not found.");
      if (row.status === "REVIEW")
        await client.query(
          "UPDATE reconciliation_runs SET status='PENDING',lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=$2 WHERE id=$1",
          [id, this.now()],
        );
      await this.audit(client, user.id, "RECONCILIATION_RETRY", id, reason);
      return { scheduled: true };
    });
  }
  async resolve(
    account: string | undefined,
    elevated: string | undefined,
    id: string,
    reason: string,
  ) {
    return this.database.transaction(async (client) => {
      const user = await this.staff.authorize(
        client,
        account,
        elevated,
        "FINANCE",
      );
      const row = (
        await client.query(
          "SELECT * FROM finance_exceptions WHERE id=$1 AND test_only=$2 FOR UPDATE",
          [id, this.config.mode !== "production"],
        )
      ).rows[0];
      if (!row)
        throw new ApiProblem(
          404,
          "NOT_FOUND",
          "Financial exception not found.",
        );
      if (row.status === "RESOLVED") {
        if (row.resolution_reason !== reason)
          throw new ApiProblem(
            409,
            "DECISION_RECORDED",
            "This exception already has a resolution.",
          );
        return { resolved: true, replayed: true };
      }
      await client.query(
        "UPDATE finance_exceptions SET status='RESOLVED',resolved_by=$2,resolved_at=$3,resolution_reason=$4 WHERE id=$1",
        [id, user.id, this.now(), reason],
      );
      await this.audit(
        client,
        user.id,
        "FINANCIAL_EXCEPTION_RESOLVED",
        id,
        reason,
      );
      return { resolved: true };
    });
  }
}
