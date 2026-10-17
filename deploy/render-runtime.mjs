// Only run through the setup tool using an admin connection, never at API startup.
export async function provisionRuntime(pool, password) {
  if (typeof password !== 'string' || password.length < 32) throw new Error('STORE_APP_PASSWORD must be at least 32 characters.');
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query("SELECT pg_advisory_xact_lock(hashtext('store:runtime-role'))");
    const existing = await connection.query("SELECT 1 FROM pg_roles WHERE rolname='store_app'");
    // Server-side identifier/literal quoting, never shell interpolation of credentials.
    const statement = await connection.query(existing.rowCount
      ? "SELECT format('ALTER ROLE store_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text) AS sql"
      : "SELECT format('CREATE ROLE store_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text) AS sql", [password]);
    await connection.query(statement.rows[0].sql);
    const database = await connection.query("SELECT format('GRANT CONNECT ON DATABASE %I TO store_app', current_database()) AS sql");
    await connection.query(database.rows[0].sql);
    const grants = `
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO store_app;
      GRANT SELECT ON owners TO store_app;
      GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,rate_limits,drafts,chat_messages TO store_app;
      GRANT SELECT,INSERT,UPDATE ON mfa_used TO store_app;
      GRANT SELECT,INSERT ON receipts,receipt_lines,audit_events TO store_app;
      GRANT SELECT,INSERT ON products TO store_app;
      GRANT UPDATE(name) ON products TO store_app;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO store_app;
    `;
    for (const statement of grants.split(';').map(value => value.trim()).filter(Boolean)) await connection.query(statement);
    await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
