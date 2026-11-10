export async function migrateAccounts(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=14")).rowCount)
    return;
  await s.query(`ALTER TABLE bo.users ADD COLUMN phone TEXT NOT NULL DEFAULT '', ADD COLUMN job_title TEXT NOT NULL DEFAULT '', ADD COLUMN avatar JSONB, ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 1, ADD COLUMN password_ready BOOLEAN NOT NULL DEFAULT true, ADD COLUMN created_at TIMESTAMPTZ, ADD COLUMN updated_at TIMESTAMPTZ;
  UPDATE bo.users u SET created_at=(SELECT min(at) FROM bo.audit a WHERE (a.action='CREATE_USER' AND a.record_id=u.id) OR (a.action='SETUP' AND a.actor_id=u.id));
  UPDATE bo.users SET updated_at=created_at;
  ALTER TABLE bo.users ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN updated_at SET DEFAULT now();
  ALTER TABLE bo.users ADD CONSTRAINT user_avatar_metadata CHECK(avatar IS NULL OR (jsonb_typeof(avatar)='object' AND NOT(avatar ? 'base64') AND avatar->>'storageKey' IS NOT NULL));
  ALTER TABLE bo.memberships ADD COLUMN version INTEGER NOT NULL DEFAULT 1, ADD COLUMN created_at TIMESTAMPTZ, ADD COLUMN updated_at TIMESTAMPTZ;
  ALTER TABLE bo.memberships ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN updated_at SET DEFAULT now();
  CREATE TABLE bo.account_invitations(token_hash TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES bo.users(id),tenant_id TEXT NOT NULL REFERENCES bo.tenants(id),expires_at TIMESTAMPTZ NOT NULL);
  ALTER TABLE bo.account_invitations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON bo.account_invitations FROM PUBLIC,anon,authenticated;
  INSERT INTO bo.migrations(version) VALUES(14)`);
}
