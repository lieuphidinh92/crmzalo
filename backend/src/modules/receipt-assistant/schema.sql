BEGIN;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS unallocated_amount numeric(15,2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS receipt_assistant_drafts (
 id text PRIMARY KEY, org_id text NOT NULL, created_by text NOT NULL,
 bills jsonb NOT NULL, preview jsonb, result jsonb, status text NOT NULL DEFAULT 'draft',
 created_at timestamp NOT NULL DEFAULT now(), expires_at timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS receipt_assistant_drafts_org_id_created_by_idx ON receipt_assistant_drafts(org_id,created_by);
CREATE TABLE IF NOT EXISTS receipt_assistant_evidence (
 id text PRIMARY KEY, org_id text NOT NULL, payment_id text NOT NULL, hash text NOT NULL,
 transaction_ref text, url text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_assistant_evidence_org_id_hash_key ON receipt_assistant_evidence(org_id,hash);
CREATE INDEX IF NOT EXISTS receipt_assistant_evidence_org_id_transaction_ref_idx ON receipt_assistant_evidence(org_id,transaction_ref);
ALTER TABLE receipt_assistant_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_assistant_evidence ENABLE ROW LEVEL SECURITY;
COMMIT;
