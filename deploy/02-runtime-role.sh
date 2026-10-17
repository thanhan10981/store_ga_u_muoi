#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE store_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'app_password') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE store FROM PUBLIC;
GRANT CONNECT ON DATABASE store TO store_app;
GRANT USAGE ON SCHEMA public TO store_app;
GRANT SELECT ON owners TO store_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,rate_limits,drafts,chat_messages TO store_app;
GRANT SELECT,INSERT,UPDATE ON mfa_used TO store_app;
GRANT SELECT,INSERT ON receipts,receipt_lines,audit_events TO store_app;
GRANT SELECT,INSERT ON products TO store_app;
GRANT UPDATE(name) ON products TO store_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO store_app;
SQL
