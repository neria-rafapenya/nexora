import { DocumentsService } from "./documents.mjs";
import { documentPermissions } from "./document-schema.mjs";
export async function handleDocuments({
  store,
  path,
  method,
  body,
  tenant,
  role,
  user,
  send,
}) {
  if (!path.startsWith("/api/supplier-documents")) return false;
  const permissions = documentPermissions(role),
    s = new DocumentsService(store);
  const fail = () => {
    throw Object.assign(new Error("Access denied"), { status: 403 });
  };
  if (!permissions.read) fail();
  if (method !== "GET" && !permissions.write) fail();
  if (path === "/api/supplier-documents/catalog" && method === "GET") {
    send(200, await s.catalog(tenant));
    return true;
  }
  if (path === "/api/supplier-documents") {
    if (method === "GET") {
      send(200, { records: await s.list(tenant) });
      return true;
    }
    if (method === "POST") {
      send(201, { record: await s.create(tenant, body, user.id) });
      return true;
    }
  }
  const match = path.match(
    /^\/api\/supplier-documents\/([a-zA-Z0-9-]+)(?:\/(versions|archive)(?:\/([a-zA-Z0-9-]+)(?:\/(review|download))?)?)?$/,
  );
  if (match) {
    const [, id, section, versionId, action] = match;
    if (method === "GET" && !section) {
      send(200, await s.view(tenant, id));
      return true;
    }
    if (method === "POST" && section === "versions" && !versionId) {
      send(201, { record: await s.upload(tenant, id, body, user.id) });
      return true;
    }
    if (method === "POST" && section === "archive" && !versionId) {
      send(200, { record: await s.archive(tenant, id, body, role, user.id) });
      return true;
    }
    if (method === "POST" && action === "review") {
      send(200, {
        record: await s.review(tenant, id, versionId, body, role, user.id),
      });
      return true;
    }
    if (method === "GET" && action === "download") {
      send(200, await s.download(tenant, id, versionId, user.id));
      return true;
    }
  }
  throw Object.assign(new Error("Endpoint not found"), { status: 404 });
}
