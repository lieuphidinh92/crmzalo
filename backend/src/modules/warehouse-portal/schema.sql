-- Additive installation. Run transactionally via the provisioning script.
CREATE TABLE wp_warehouses (
  code text PRIMARY KEY CHECK (code IN ('singapore','58nv1')),
  name text NOT NULL, org_id text NOT NULL REFERENCES organizations(id),
  warehouse_id text NOT NULL UNIQUE REFERENCES warehouses(id),
  timezone text NOT NULL, active boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wp_access (
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  user_id text NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK(role IN ('viewer','operator','admin')),
  see_cost boolean NOT NULL DEFAULT false,
  PRIMARY KEY(warehouse_code,user_id)
);
CREATE TABLE wp_baselines (
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  batch_id text NOT NULL REFERENCES inventory_batches(id),
  quantity integer NOT NULL CHECK(quantity>=0),
  PRIMARY KEY(warehouse_code,batch_id)
);
CREATE TABLE wp_sessions (
  token_hash text PRIMARY KEY,
  device_key text,
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON wp_sessions(expires_at);
CREATE INDEX ON wp_sessions(device_key);
CREATE TABLE wp_documents (
  id text PRIMARY KEY, code text NOT NULL UNIQUE,
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  destination_code text REFERENCES wp_warehouses(code),
  type text NOT NULL CHECK(type IN ('import','export','opening','stocktake','transfer')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','dispatched','partial','completed','cancelled')),
  revision integer NOT NULL DEFAULT 1,
  request_id text NOT NULL, request_hash text NOT NULL,
  currency text NOT NULL CHECK(currency IN ('VND','SGD')),
  exchange_rate numeric(20,6) NOT NULL CHECK(exchange_rate>0),
  counterparty text NOT NULL, note text NOT NULL DEFAULT '',
  document_date date NOT NULL, attachment_url text,
  created_by text NOT NULL REFERENCES users(id), confirmed_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
  UNIQUE(warehouse_code,request_id),
  CHECK((type='transfer' AND destination_code IS NOT NULL AND destination_code<>warehouse_code) OR (type<>'transfer' AND destination_code IS NULL)),
  CHECK(currency<>'VND' OR exchange_rate=1)
);
CREATE TABLE wp_lines (
  id text PRIMARY KEY, document_id text NOT NULL REFERENCES wp_documents(id),
  product_id text NOT NULL REFERENCES products(id), destination_product_id text REFERENCES products(id), destination_signature text,
  sku text NOT NULL, name text NOT NULL, package_size text,
  batch_id text REFERENCES inventory_batches(id), batch_code text NOT NULL,
  expiry_date date, manufacture_date date,
  quantity integer NOT NULL CHECK(quantity>=0),
  expected_quantity integer,
  unit_cost_minor bigint, cost_vnd numeric(15,2),
  received integer NOT NULL DEFAULT 0 CHECK(received>=0),
  reconciled integer NOT NULL DEFAULT 0 CHECK(reconciled>=0),
  CHECK(received+reconciled<=quantity)
);
CREATE INDEX ON wp_lines(document_id);
CREATE TABLE wp_receipts (
  id text PRIMARY KEY, document_id text NOT NULL REFERENCES wp_documents(id),
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  request_id text NOT NULL, request_hash text NOT NULL,
  type text NOT NULL CHECK(type IN ('receive','reconcile')),
  created_by text NOT NULL REFERENCES users(id), note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,request_id)
);
CREATE TABLE wp_receipt_lines (
  id text PRIMARY KEY, receipt_id text NOT NULL REFERENCES wp_receipts(id),
  line_id text NOT NULL REFERENCES wp_lines(id), quantity integer NOT NULL CHECK(quantity>0)
);
CREATE TABLE wp_audit (
  id text PRIMARY KEY, warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  user_id text NOT NULL REFERENCES users(id), action text NOT NULL,
  document_id text REFERENCES wp_documents(id), details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON wp_audit(warehouse_code,created_at);
CREATE TABLE wp_product_links (
  source_product_id text NOT NULL REFERENCES products(id),
  destination_product_id text NOT NULL REFERENCES products(id),
  source_signature text NOT NULL, destination_signature text NOT NULL,
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  approved_by text NOT NULL REFERENCES users(id), approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_product_id,destination_product_id),
  CHECK(source_product_id<>destination_product_id)
);
-- Portal sessions are server-side only; these tables are not a public Data API.
ALTER TABLE wp_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_product_links ENABLE ROW LEVEL SECURITY;
