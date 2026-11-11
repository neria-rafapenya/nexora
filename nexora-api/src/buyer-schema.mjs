export async function migrateBuyerAccess(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=17")).rowCount)
    return;
  await s.query(`ALTER TABLE bo.memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
 ALTER TABLE bo.memberships ADD CONSTRAINT memberships_role_check CHECK(role IN ('admin','operations_orders','nutrition_menus','quality','commercial','read_only','center_buyer'));
 CREATE TABLE bo.center_access(user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,center_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_by TEXT REFERENCES bo.users(id),PRIMARY KEY(user_id,tenant_id,center_id),FOREIGN KEY(user_id,tenant_id) REFERENCES bo.memberships(user_id,tenant_id) ON DELETE CASCADE,FOREIGN KEY(tenant_id,center_id) REFERENCES bo.centers(tenant_id,id) ON DELETE CASCADE);
 CREATE TABLE bo.buyer_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES bo.users(id) ON DELETE CASCADE,expires BIGINT NOT NULL);
 ALTER TABLE bo.center_access ENABLE ROW LEVEL SECURITY; ALTER TABLE bo.buyer_sessions ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON bo.center_access,bo.buyer_sessions FROM PUBLIC,anon,authenticated;
 INSERT INTO bo.migrations(version) VALUES(17)`);
}
