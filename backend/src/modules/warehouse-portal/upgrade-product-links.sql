-- Upgrade only the known initial nine-table installation. Transaction owned by provisioning.
ALTER TABLE wp_lines ADD COLUMN destination_signature text;
CREATE TABLE wp_product_links (
  source_product_id text NOT NULL REFERENCES products(id),
  destination_product_id text NOT NULL REFERENCES products(id),
  source_signature text NOT NULL, destination_signature text NOT NULL,
  warehouse_code text NOT NULL REFERENCES wp_warehouses(code),
  approved_by text NOT NULL REFERENCES users(id), approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_product_id,destination_product_id), CHECK(source_product_id<>destination_product_id)
);
ALTER TABLE wp_product_links ENABLE ROW LEVEL SECURITY;
