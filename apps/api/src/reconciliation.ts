import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { StaffService } from "./staff.js";
import { ApiProblem } from "./errors.js";
type Row = Record<string, any>;
export class ReconciliationService {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly staff: StaffService,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async owner(
    client: PoolClient,
    token: string | undefined,
    id: string,
  ) {
    const { user } = await this.auth.safetyIdentity(client, token);
    const cycle = (
      await client.query(
        "SELECT * FROM purchase_cycles WHERE id=$1 AND payer_id=$2 FOR UPDATE",
        [id, user.id],
      )
    ).rows[0];
    if (!cycle || (this.config.mode === "production" && cycle.test_only))
      throw new ApiProblem(404, "NOT_FOUND", "Payment record not found.");
    return cycle;
  }
  async history(token: string | undefined, cursor?: string) {
    return this.database.transaction(async (client) => {
      const { user } = await this.auth.safetyIdentity(client, token);
      const rows = (
        await client.query(
          "SELECT * FROM purchase_cycles WHERE payer_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) AND (NOT $3::boolean OR NOT test_only) ORDER BY id LIMIT 21",
          [user.id, cursor || null, this.config.mode === "production"],
        )
      ).rows;
      const purchases = [];
      for (const row of rows.slice(0, 20)) {
        const captures = (
          await client.query(
            "SELECT kind,amount_paise,currency,provider_payment_id,captured_at FROM payment_journal WHERE cycle_id=$1 ORDER BY recorded_at,id",
            [row.id],
          )
        ).rows;
        const reversals = (
          await client.query(
            "SELECT kind,amount_paise,currency,provider_reference,recorded_at FROM reversal_journal WHERE cycle_id=$1 ORDER BY recorded_at,id",
            [row.id],
          )
        ).rows;
        purchases.push({
          id: row.id,
          amount_paise: row.amount_paise,
          currency: row.currency,
          status: row.status,
          created_at: new Date(row.created_at).toISOString(),
          resolution_required: row.resolution_required,
          test_only: row.test_only,
          receipt_available: captures.some((r) => r.kind === "CAPTURE"),
          captures,
          reversals,
        });
      }
      return {
        purchases,
        next_cursor: rows.length > 20 ? rows[19].id : null,
        scope: "PLATFORM_CONNECTION_FEES_ONLY",
        notice:
          "Direct tuition is paid to Tutors and is not platform payment revenue.",
      };
    });
  }
  async receipt(token: string | undefined, id: string) {
    return this.database.transaction(async (client) => {
      const cycle = await this.owner(client, token, id);
      const previous = (
        await client.query(
          "SELECT snapshot FROM payment_documents WHERE cycle_id=$1",
          [id],
        )
      ).rows[0];
      if (previous) return { document: previous.snapshot };
      const capture = (
        await client.query(
          "SELECT * FROM payment_journal WHERE cycle_id=$1 AND kind='CAPTURE'",
          [id],
        )
      ).rows[0];
      if (!capture)
        throw new ApiProblem(
          409,
          "CAPTURE_PENDING",
          "A payment confirmation is available after verified capture.",
        );
      const terms = cycle.disclosures;
      if (
        terms.base_paise + terms.tax_paise !== cycle.amount_paise ||
        Number(capture.amount_paise) !== cycle.amount_paise ||
        capture.currency !== cycle.currency
      )
        throw new ApiProblem(
          409,
          "DOCUMENT_REVIEW",
          "Merchant and financial snapshots require Finance review.",
        );
      const documentId = randomUUID();
      const snapshot = {
        id: documentId,
        number: (cycle.test_only ? "TEST-" : "PAY-") + documentId,
        purchase_id: id,
        kind: cycle.test_only
          ? "TEST_PAYMENT_CONFIRMATION"
          : "PAYMENT_CONFIRMATION",
        merchant: terms.merchant,
        invoice_notice: terms.invoice_notice,
        amount_paise: cycle.amount_paise,
        base_paise: terms.base_paise,
        tax_paise: terms.tax_paise,
        currency: cycle.currency,
        paid_at: new Date(capture.captured_at).toISOString(),
        issued_at: this.now().toISOString(),
        provider_payment_id: capture.provider_payment_id,
        test_only: cycle.test_only,
        description:
          "One-time platform Access Pass. Direct tuition is excluded.",
        tax_document_notice:
          "This payment confirmation is not a tax invoice. Tax documents require the approved merchant invoice configuration.",
      };
      await client.query(
        "INSERT INTO payment_documents(id,cycle_id,snapshot,issued_at) VALUES($1,$2,$3,$4)",
        [documentId, id, snapshot, this.now()],
      );
      return { document: snapshot };
    });
  }
}
