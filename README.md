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

| Master            | Demo records after explicit seeds | Capabilities                                                                                 |
| ----------------- | --------------------------------: | -------------------------------------------------------------------------------------------- |
| Main categories   |                                 3 | Root level; no parent categories                                                             |
| Families          |                                10 | CRUD, required main category, temperature                                                    |
| Products          |                               200 | CRUD, family/supplier references, SKU/EAN, sales units, price, stock, temperature and claims |
| Allergens         |            14 after explicit seed | EU reference catalog                                                                         |
| Suppliers         |                                10 | Company details, quality contact, approval expiry, active state                              |
| Clients           |                                 8 | ERP code, segment, order contact, active state                                               |
| Centers           |                                16 | Client, address, delivery days/windows, route, closure dates                                 |
| Diets             |                                 6 | Code, excluded allergens and structured rules                                                |
| Center diners     |                               192 | Aggregated counts per center, diet and service                                               |
| Product allergens |   Explicit synthetic associations | Contains/traces, mock source, pending Quality validation                                     |

There are exactly **20 fictional products per family**. Startup seeds only a brand-new workspace; it never refills a catalog after user edits or repeats seeding on restart. The explicit master seed assigns sample suppliers to previously unassigned sample products. Sample products have no ingredient list or validated allergen data. No food-safety suitability is inferred from the sample catalog.

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

F2 orders now works locally with explicitly simulated proposals and authenticated human confirmation. F3 menu planning, F4 supplier documents and F5 food waste remain planned screens. No external AI calls or automatic order confirmations occur. F1 semantic search remains postponed.

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

## Complete business demo data

Run `npm --prefix nexora-api run db:seed-masters` to populate the initial workspace with 10 clearly named demo suppliers, 8 clients, 16 centers, 6 diets and 192 aggregated center/diet/service diner counts. The script first ensures the allergen reference fixtures exist, then links unassigned fictional Nexora products to family-specific suppliers. Centers link to clients, diets to their excluded allergens, and diner counts to centers and diets.

The load is transactional and idempotent. Existing records and supplier assignments are preserved; non-sample products are untouched. Demo contacts use reserved `.test` email domains; phone numbers and supplier approval dates remain empty. Diet rules are explicitly demo data requiring Quality review. There are no individual diner/patient records, no user-account changes and no generated business documents. Future operational modules are not yet database models and are not fabricated by this seed.

## Product details and allergens

`/products/:id` is the combined product consultation/editing screen. General fields respect product write permissions; the allergen panel independently respects association permissions. Product names in the list link to this record URL. Saving general fields keeps the product open; creating a product opens its new record so allergens can be added immediately. Allergen changes are saved separately using explicitly labelled actions.

The product list displays contains/traces badges, pending-validation labels and a neutral “no information” state. The product detail supports adding/editing/removing allergen links and reviewing their source and validation. Only Quality can approve. Missing or failed information is never shown as allergen-free. The reference catalog remains under Allergens; the standalone Product allergens entry and overview tile are hidden. Its old route/API remain available for existing bookmarks and internal compatibility. No associations or reference rows are removed from the database by this UI change.

Offline component tests cover read-only consultation, scoped links, English payloads, Quality approval, deletion confirmation and missing/error states without creating accounts in Supabase.

## F2 — local multichannel orders with mock proposals

Routes: `/orders`, `/orders/new`, `/orders/:id`, `/orders/inbox`, `/orders/inbox/new`, `/orders/inbox/:id`, `/orders/review`, `/orders/alerts`, `/orders/baskets`.

- Inbox: local entry of email/WhatsApp/manual/PDF-origin messages, immutable original text, editable transcription, stored original attachment, deduplication and discard/retry. No external mailbox or webhook is connected.
- Attachments: PDF/PNG/JPEG, up to 1.5 MB, 20 PDF pages, 20,000 text characters. Digital PDFs are read locally; scanned PDFs/images require manual transcription. Files are kept in private Supabase tables for this local phase, not a public storage bucket.
- Mock extraction: one line per product using `SKU | quantity | unit` or `quantity unit product name`. Exact references/literal names and deliberately doubtful lexical suggestions are supported. This is not an LLM or semantic search. Dates in explicit `Delivery: YYYY-MM-DD` headers can be proposed. All generated lines start unreviewed.
- Review: original beside proposed lines, client/center/date selection, product search, manual substitutions, quantities, unit checks, catalog prices, confidence and per-line human acceptance. Saving is separate from confirmation. Associations and states cannot be changed through generic master CRUD/import endpoints.
- Confirm: authenticated administrator/order-operations action; checks active client, center ownership, delivery calendar/closures, non-past date, reviewed valid lines, current prices and stock summed across duplicate product lines. Prices/totals use integer cents. Stock reservation, confirmed order and audit commit atomically.
- Cancel: draft/review/confirmed orders can be cancelled; confirmed stock is restored once. Exported/cancelled orders cannot be edited or cancelled here. No actual sale or external ERP action occurs.
- Export: confirmed orders download CSV/JSON. The first export sets EXPORTED and is audited; CSV cells escape spreadsheet formula prefixes. Stored line prices are retained even when catalog prices change later.
- Alerts: unmatched/doubtful products, unit mismatch, stock, missing prices, client inactivity, delivery restrictions, missing usual products and atypical quantities. Dismissing an alert never bypasses confirmation checks.
- Usual baskets: computed from confirmed/exported history; automatically rebuilt on confirm/cancel, manually on request, and daily while the API runs. Missing-usual and outlier alerts require at least three historical orders. No fictitious human confirmations are seeded.
- Trace: MOCK provider, extraction output, source, duration, zero AI cost and human actions in audit. All orders/data remain scoped to their company. Sales/read-only roles can consult; administrator/order-operations can operate.

Run `npm --prefix nexora-api run db:seed-orders` after business demo masters exist. It creates six English fictional messages and three IN_REVIEW proposals, including stock and matching issues, without reserving stock. It is idempotent and preserves subsequent operator changes. Baskets stay empty until genuine demo confirmations build history.

Operational tables: `inboxMessages`, `orderAttachments`, `orders`, `orderLines`, `orderAlerts`, `usualBaskets`, `aiOrderRuns`; RLS enabled, private `bo` schema, tenant-aware foreign keys and unique message/order fingerprints. Migration 4 creates these structures.

Dedicated API: `/api/orders/catalog`, `/api/orders`, `/api/orders/:id`, `/api/orders/:id/confirm`, `/cancel`, `/export`; `/api/order-inbox`, `/api/order-inbox/:id`, `/process`, `/discard`; `/api/order-alerts`, `/api/order-alerts/:id`; `/api/usual-baskets`, `/api/usual-baskets/recompute`. Mutations require write permission, company membership, same-origin requests and record versions.

Tests include business/state/stock transactions in memory, HTTP permissions/tenant checks, original PDF text extraction, UI save/confirm separation, read-only access and routes. The opt-in PostgreSQL test uses a rollback-only transaction and does not create users or confirm orders:

```sh
NEXORA_ORDER_DB_TEST=1 node --env-file=nexora-api/.env --test nexora-api/test/order-postgres.test.mjs
```

Still deferred: real AI/embeddings, OCR, live email/WhatsApp ingestion, automatic diet/allergen-compatible substitute selection, external ERP export/integration and real-order accuracy benchmarks. Substitutions are manual and require reviewing the product documentation; the unvalidated allergen demo data is never treated as proof of suitability. AWS production infrastructure remains a later phase.
