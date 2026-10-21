-- Run using a migration/admin connection; never the runtime app role.
BEGIN;
CREATE TABLE IF NOT EXISTS owners (
  id uuid PRIMARY KEY, username text UNIQUE NOT NULL,
  password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id),
  csrf text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL
);
CREATE TABLE IF NOT EXISTS mfa_used (
  owner_id uuid PRIMARY KEY REFERENCES owners(id), counter bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id),
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id),
  draft_id uuid UNIQUE NOT NULL REFERENCES drafts(id),
  kind text NOT NULL CHECK (kind IN ('purchase','sale','waste','expense')),
  business_date date NOT NULL, note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id),
  name text NOT NULL, unit text NOT NULL, name_key text NOT NULL, unit_key text NOT NULL,
  UNIQUE(owner_id, name_key, unit_key)
);
CREATE TABLE IF NOT EXISTS receipt_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES receipts(id), product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  amount bigint GENERATED ALWAYS AS (round(quantity * unit_price)::bigint) STORED
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS inventory_changes (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id),
  draft_id uuid UNIQUE NOT NULL REFERENCES drafts(id), product_id uuid NOT NULL REFERENCES products(id),
  business_date date NOT NULL, delta numeric(15,3) NOT NULL,
  operation text NOT NULL CHECK(operation IN ('set_stock','rename_product','archive_product','restore_product')),
  before_state jsonb NOT NULL, after_state jsonb NOT NULL, reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_changes_product ON inventory_changes(product_id,business_date);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id), action text NOT NULL,
  entity_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id), role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipts_owner_date ON receipts(owner_id, business_date);
CREATE INDEX IF NOT EXISTS receipt_lines_receipt ON receipt_lines(receipt_id);
CREATE INDEX IF NOT EXISTS receipt_lines_product ON receipt_lines(product_id);
CREATE INDEX IF NOT EXISTS messages_owner ON chat_messages(owner_id, id DESC);
-- This deployment intentionally supports one owner / one store.
-- Application checks owner_id on every business-data query.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
COMMIT;
