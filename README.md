# Nexora

Private backoffice for food distribution and collective catering. React + Vite is the interface; a local Node.js API connects to PostgreSQL on Supabase. The interface is in Spanish. Database/model keys, stored enum values and fictional catalog records remain in English. Presentation labels are localized without changing API payloads or persisted data.

## Start locally

Requires Node.js 22.13+ and npm. From the repository root:

```sh
npm ci
npm run install:all
cp nexora-api/.env.example nexora-api/.env
# Fill DATABASE_URL and generate MFA_KEY as described in the example.
npm run dev
```

For the existing local checkout the API `.env` is already configured. Credentials are excluded from Git and never sent to the frontend. Open http://127.0.0.1:5180. The API binds to 127.0.0.1:5181.

On first access, create your own administrator and enter your company name. No demo users or passwords are provisioned. Subsequent visits use email/password login. The administrator can create accounts and assign roles in **Users and roles**. **Settings** supports company creation, future AI limits and authenticator-based two-factor enrollment. Adding a company starts with empty masters; the initial fictional catalog belongs only to the first workspace.

## Foundations

- Real authentication: salted scrypt password hashes, HttpOnly/SameSite cookies, eight-hour server sessions, logout invalidation and login throttling.
- Two-factor authentication: TOTP with encrypted secrets, replay rejection and enrollment verification. The account holder enables it in Settings; it is not automatically enabled for a fresh account. Preserve MFA_KEY when moving the server or restoring the database.
- Six roles: administrator, order operations, menu planning, quality, sales and read only. Permissions are checked by the API, not just by the menu. An administrator cannot change their own access through the role editor.
- Company memberships checked on every scoped request. Data, settings and audit history are separated by company.
- Writes and their audit events commit in the same PostgreSQL transaction. Server-side advisory locks protect reference checks and uniqueness; versions prevent stale updates.
- A private `bo` schema, RLS enabled on application tables with no browser policies, verified TLS and no direct database credentials in React.
- Startup applies versioned, idempotent schema migrations. Existing data is preserved. The shared transaction pooler uses unnamed queries and explicitly qualified schema names; no session-dependent search path.

The API is deliberately local. Public hosting, TLS for the web interface, managed worker/storage services and automated deployment remain outside this local delivery. Browser previews through Vite are not a production deployment.

## Master data

| Master            |                 Initial records | Capabilities                                                                                 |
| ----------------- | ------------------------------: | -------------------------------------------------------------------------------------------- |
| Main categories   |                               3 | Root level; no parent categories                                                             |
| Families          |                              10 | CRUD, required main category, temperature                                                    |
| Products          |                             200 | CRUD, family/supplier references, SKU/EAN, sales units, price, stock, temperature and claims |
| Allergens         |          14 after explicit seed | EU reference catalog                                                                         |
| Suppliers         |                               0 | Company details, quality contact, approval expiry, active state                              |
| Clients           |                               0 | ERP code, segment, order contact, active state                                               |
| Centers           |                               0 | Client, address, delivery days/windows, route, closure dates                                 |
| Diets             |                               0 | Code, excluded allergens and structured rules                                                |
| Center diners     |                               0 | Aggregated counts per center, diet and service                                               |
| Product allergens | Explicit synthetic associations | Contains/traces, mock source, pending Quality validation                                     |

There are exactly **20 fictional products per family**. Startup seeds only a brand-new workspace; it never refills a catalog after user edits or repeats seeding on restart. Sample products have no supplier, ingredient list or validated allergen data. No food-safety suitability is inferred from the sample catalog.

Each master has a list, search, detail/edit form and permission-controlled create/delete actions. Referenced records cannot be deleted. Products have family and temperature filters. Text search supports approximate word matching; it is **not semantic search**.

The database uses one table per master, with tenant/identity/version/audit columns and a JSONB business-data document. The shared field contract validates these documents. Unique catalog keys are indexed in PostgreSQL; cross-master references and hierarchy rules are checked transactionally by the API. This is not a collection of frontend-only mock objects.

## CSV / Excel imports

Available from each editable master. Files are limited to 2 MB and 1,000 rows. XLSX reads the first worksheet and requires plain cell values; formulas and rich values are rejected.

1. Download the CSV header template from the master.
2. Use field keys as headers (for example `sku,name,familyId,unit,temperature,allergenStatus`).
3. Relationships use record IDs, booleans use `true`/`false`, arrays and rules use JSON.
4. Validate the file. No rows persist during preview.
5. Confirm import. Validation runs again and the complete file commits atomically; any error rolls back all rows.

Imports create new records and reject duplicate unique keys. They do not silently overwrite existing records. Only the Quality role can validate product allergen associations, including through imports.

## Architecture

```text
nexora-backoffice/src/
  domain/          Contracts, roles and future modules
  application/     Form conversion and defaults
  infrastructure/  HTTP adapter
  presentation/    React interface and SCSS
nexora-api/src/
  schema.mjs       Master contracts, validation and permissions
  store.mjs        PostgreSQL adapter, migrations and transactional CRUD
  server.mjs       HTTP endpoints, auth and orchestration
  seed.mjs         English fictional catalog
  imports.mjs      CSV/Excel parsing and conversion
  totp.mjs         Authenticator codes
```

Bootstrap supplies only the grid. Business data is loaded from the API; localStorage demo adapters were removed.

## API

- `GET /api/health`, `GET/POST /api/setup`, `POST /api/login`, `POST /api/logout`, `GET /api/session`.
- `GET /api/schema`, `GET /api/dashboard`.
- `GET/POST /api/masters/:resource`, `GET/PUT/DELETE /api/masters/:resource/:id`.
- `POST /api/imports/:resource` with `{format,content,commit}`.
- `GET/POST /api/users`, `PUT/DELETE /api/users/:id` (role changes / removing company access).
- `GET/PUT /api/settings`, `POST /api/companies`, `GET /api/audit`.
- `GET /api/mfa`, `POST /api/mfa/enroll`, `POST /api/mfa/enable`.

Scoped endpoints require an authenticated session and `X-Company-Id`. Browser mutations require a local allowed Origin. PUT/DELETE master operations require the last observed record version. Audit retains before/after values but no passwords, session tokens or authenticator secrets.

## Verification

```sh
npm test
npm run build
npm run format:check
npm --prefix nexora-api run db:verify
```

Unit tests cover catalog cardinality and seed idempotency, model validation, roles, CSV conversion, Excel/formula handling, password hashing, RFC 6238 TOTP vectors and frontend payloads.

The integration suite is opt-in. It creates temporary privileged fixtures in the target database, checks tenant isolation, CRUD, conflicts, referential integrity, import rollback, audit, login, encrypted MFA and expiry, then cleans up its own fixtures. Run only against an explicitly authorized test target:

```sh
NEXORA_INTEGRATION=1 npm --prefix nexora-api run test:integration
```

CI runs offline tests and a production build, without Supabase credentials. TLS CA source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt.

## Remaining phases

F1 semantic product search requires an embedding provider and API key; none is connected. An initial candidate is OpenAI `text-embedding-3-small`. Do not confuse approximate word search with embeddings. The requested 200-product fixture replaces the original document's larger demo-catalog target.

F2 orders, F3 menu planning, F4 supplier documents and F5 food waste remain explicitly marked as planned screens. No AI calls or automatic commercial/food-safety actions occur. AI proposals will require human approval.

The final end-user application is separate from this private backoffice.

Catalog hierarchy: **Main category → Family → Product**. Main categories cannot have parents, and families cannot contain other families. Migration 3 links the existing families to Ambient Food, Chilled Food and Frozen Food while preserving product IDs. Main categories used by families cannot be deleted.

## Allergen reference and mock associations

Run `npm --prefix nexora-api run db:seed-allergens` to insert the 14 EU reference allergen categories and explicit example associations for the fictional Nexora catalog in the initial workspace. The script is transactional, tenant-scoped and idempotent, preserves existing links, and never validates an association. It only matches products with the sample brand and sample SKU pattern. `SEED_TENANT_ID` can explicitly select another authorized target.

Associated sample products move from UNVERIFIED to PENDING_REVIEW; all links use a clear MOCK DATA source and `validated: false`. Traces are deliberately synthetic fixtures, not supplier declarations. An unlinked product is not a claim of allergen absence. Supplier documents and Quality approval remain necessary before any real use. No diets or other master records are inserted.

Reference categories: https://food.ec.europa.eu/food-safety/campaign-2026/allergies_en

## Browser routes

The interface uses React Router with browser history. `/` is the summary. Each master has a list, a `/new` route and a `/:id` record route, e.g. `/categories`, `/categories/new`, `/categories/<record-id>` and `/products/<record-id>`. Record IDs are stable identifiers, not names or generated slugs. The record is loaded from the API when its URL is opened or refreshed; login preserves the requested route. Unknown routes and missing records show an explicit message. System routes remain permission-controlled.

Masters: `/categories`, `/families`, `/products`, `/allergens`, `/suppliers`, `/clients`, `/centers`, `/diets`, `/center-diners`, `/product-allergens`. Other pages: `/orders`, `/menus`, `/supplier-documents`, `/food-waste`, `/audit`, `/users`, `/settings`.

Links for a company other than the user's default include `?company=<company-id>`; the API checks membership independently. Switching companies returns to the summary. Vite serves deep links locally. A future production server must serve `index.html` for non-API application paths, while keeping `/api/*` routed to the API.
