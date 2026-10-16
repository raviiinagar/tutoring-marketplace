CREATE TABLE payment_documents (
 id uuid PRIMARY KEY,
 cycle_id uuid NOT NULL UNIQUE REFERENCES purchase_cycles(id),
 snapshot jsonb NOT NULL,
 issued_at timestamptz NOT NULL
);
CREATE TRIGGER immutable_payment_documents BEFORE UPDATE OR DELETE ON payment_documents FOR EACH ROW EXECUTE FUNCTION immutable_payment_fact();
