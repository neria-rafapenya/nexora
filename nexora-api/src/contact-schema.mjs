export async function migrateContacts(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=15")).rowCount)
    return;
  await s.query(`CREATE TABLE bo.contact_leads(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),state TEXT NOT NULL DEFAULT 'NEW' CHECK(state IN ('NEW','CONTACTED','ARCHIVED')),version INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),submission_hash TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL);
    CREATE INDEX contact_leads_tenant ON bo.contact_leads(tenant_id,created_at);
    ALTER TABLE bo.contact_leads ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON bo.contact_leads FROM PUBLIC,anon,authenticated;
    INSERT INTO bo.migrations(version) VALUES(15)`);
}
