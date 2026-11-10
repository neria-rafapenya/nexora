export async function vectorNamespace(s) {
  const row = (
    await s.query(
      "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector'",
    )
  ).rows[0];
  if (!row) throw Error("Vector extension missing");
  return '"' + row.nspname.replaceAll('"', '""') + '"';
}
export async function migrateSearch(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=11")).rowCount)
    return;
  await s.query(
    "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions",
  );
  const ns = await vectorNamespace(s);
  await s.query(`CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_id_id ON bo.products(tenant_id,id);
 CREATE TABLE bo.product_embeddings(tenant_id TEXT NOT NULL,product_id TEXT NOT NULL,source_hash TEXT NOT NULL,model TEXT NOT NULL,embedding ${ns}.vector(768) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,product_id),FOREIGN KEY(tenant_id,product_id) REFERENCES bo.products(tenant_id,id) ON DELETE CASCADE);
 CREATE TABLE bo.embedding_queries(tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),query_hash TEXT NOT NULL,model TEXT NOT NULL,embedding ${ns}.vector(768) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,query_hash,model));
 CREATE TABLE bo.embedding_requests(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),kind TEXT NOT NULL CHECK(kind IN ('INDEX','QUERY')),input_hash TEXT NOT NULL,model TEXT NOT NULL,units INTEGER NOT NULL CHECK(units>0),day DATE NOT NULL,state TEXT NOT NULL CHECK(state IN ('PROCESSING','SUCCEEDED','FAILED')),started_at TIMESTAMPTZ NOT NULL DEFAULT now(),lease_until TIMESTAMPTZ NOT NULL,finished_at TIMESTAMPTZ,error_code TEXT,actor_id TEXT REFERENCES bo.users(id));
 CREATE UNIQUE INDEX embedding_index_inflight ON bo.embedding_requests(tenant_id) WHERE state='PROCESSING' AND kind='INDEX';
 CREATE UNIQUE INDEX embedding_query_inflight ON bo.embedding_requests(tenant_id,input_hash,model) WHERE state='PROCESSING' AND kind='QUERY';
 CREATE INDEX embedding_usage_day ON bo.embedding_requests(tenant_id,day);
 ALTER TABLE bo.product_embeddings ENABLE ROW LEVEL SECURITY; ALTER TABLE bo.embedding_queries ENABLE ROW LEVEL SECURITY; ALTER TABLE bo.embedding_requests ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON bo.product_embeddings,bo.embedding_queries,bo.embedding_requests FROM PUBLIC;
 INSERT INTO bo.migrations(version) VALUES(11)`);
}
