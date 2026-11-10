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

F2 orders now works locally with explicitly simulated proposals and revision-specific customer acceptance and internal approval. F3 has an initial local menu-to-procurement workflow with mock proposals. F4 supplier documents and F5 food waste remain planned screens. No external AI calls or automatic order confirmations occur. F1 semantic search remains postponed.

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
- Review: original beside proposed lines, client/center/date selection, product search, manual substitutions, quantities, unit checks, catalog prices, confidence and per-line human acceptance. Saving is separate from internal approval. Associations and states cannot be changed through generic master CRUD/import endpoints.
- Submission and consent: an operator may record the original inbound request with a source reference, once. Commercial terms have a revision and canonical hash; changing products, quantities, prices, client, center or date invalidates previous consent. Later changes require acceptance of that exact revision. Customer rejection overrides any prior inbound acceptance. A frozen request/decision history keeps its source, evidence and actor.
- Internal approval: administrator/order-operations action after client acceptance. Checks active client, center ownership, delivery calendar/closures, non-past date, reviewed valid lines, current prices and indicative stock summed across duplicate lines. Prices/totals use integer cents. Approval freezes the payload and records the operator; it does **not** reserve or deduct stock. The external ERP will own final commercial/logistics/inventory processing.
- ERP handoff: separate `NOT_SENT → PENDING → SENDING → ACCEPTED / ERROR` states. A durable outbox stores the approved revision and idempotency key. Attempts have a two-minute lease; interrupted sends can retry with the same key. Only an acknowledgement with an external order ID marks acceptance. The mock adapter persists receipts to reproduce acceptance with a lost response and verify retry deduplication. A real connector must honor equivalent idempotency or lookup semantics before production use.
- Cancel: local cancellation is allowed before an ERP delivery exists. Once queued, commercial edits/local cancellation are blocked; the backoffice can record a pending cancellation request. Sending that request and applying ERP cancellation acknowledgements remain part of the future ERP-specific protocol. A request does not mark the order cancelled. Migration preserves legacy reservations without inventing customer consent or ERP receipts.
- Export: approved orders download frozen CSV/JSON and record an audit event. Downloading does not change approval or ERP state. CSV cells escape formula prefixes.
- Alerts: unmatched/doubtful products, unit mismatch, stock, missing prices, client inactivity, delivery restrictions, missing usual products and atypical quantities. Dismissing an alert never bypasses approval checks. Stock availability is indicative until ERP confirmation.
- Usual baskets: computed only from ERP-accepted orders; rebuilt on acceptance, manually on request, and daily while the API runs. Missing-usual and outlier alerts require at least three historical orders. Seed proposals and downloaded files do not count as purchases.
- Trace: MOCK provider, extraction output, source, duration, zero AI cost and human actions in audit. All orders/data remain scoped to their company. Sales/read-only roles can consult; administrator/order-operations can operate.

Run `npm --prefix nexora-api run db:seed-orders` after business demo masters exist. It creates six English fictional messages and three IN_REVIEW proposals, including stock and matching issues, without reserving stock. It is idempotent and preserves subsequent operator changes. Baskets stay empty until explicitly simulated ERP acceptances build demonstration history.

Operational tables: `inboxMessages`, `orderAttachments`, `orders`, `orderLines`, `orderAlerts`, `usualBaskets`, `aiOrderRuns`; RLS enabled, private `bo` schema, tenant-aware foreign keys and unique message/order fingerprints. Migration 4 creates these structures. Migration 5 adds `orderApprovals`, `erpDeliveries`, `erpAttempts`, `mockErpReceipts` and `erpChangeRequests`, tenant-aware foreign keys and unique delivery/attempt/receipt keys. Existing review proposals remain unaccepted and unsent.

Dedicated API: `/api/orders/catalog`, `/api/orders`, `/api/orders/:id`, `/api/orders/:id/approve` (`/confirm` remains an internal-approval alias), `/submit`, `/start-review`, `/request-acceptance`, `/reopen`, `/reject`, `/cancel`, `/export`, `/erp-queue`, `/erp-send`, `/erp-cancel-request`; `/api/order-inbox`, `/api/order-inbox/:id`, `/process`, `/discard`; `/api/order-alerts`, `/api/order-alerts/:id`; `/api/usual-baskets`, `/api/usual-baskets/recompute`. Mutations require write permission, company membership, same-origin requests and record versions.

Customer interaction belongs to the future customer frontend. There is no public customer-decision HTTP endpoint. The service port requires a tenant/client/center-bound customer identity; future authentication must supply it. For local demonstration only, `ENABLE_MOCK_CLIENT=true` enables the administrator-only `/api/orders/:id/mock-client-decision` endpoint and explicitly labelled UI controls. All such decisions have source `MOCK`. Set `ERP_PROVIDER=mock` to enable simulated sends; default `unconfigured` blocks sending. No customer notifications are sent. Neither feature is a real customer/ERP integration.

Tests include revision invalidation, customer rejection, scoped identities, permissions, immutable exports, lost acknowledgements, concurrent sends, retries, unchanged local stock, PDF extraction and UI approval separation. The opt-in PostgreSQL test exercises approvals/outbox/acknowledgement and constraints inside a rollback-only transaction, using an existing operator reference without creating accounts or sessions:

```sh
NEXORA_ORDER_DB_TEST=1 node --env-file=nexora-api/.env --test nexora-api/test/order-postgres.test.mjs
```

Still deferred: real AI/embeddings, OCR, live email/WhatsApp ingestion, automatic diet/allergen-compatible substitute selection, real ERP connector and cancellation protocol, authenticated customer frontend and real-order accuracy benchmarks. Substitutions are manual and require reviewing the product documentation; the unvalidated allergen demo data is never treated as proof of suitability. AWS production infrastructure remains a later phase.

## F3 — first local menu-to-procurement workflow

This is the initial F3 implementation, not a production nutrition or food-safety engine. UI is Spanish; business data and mock fixtures are English. Routes: `/menus`, `/menus/new`, `/menus/:id`, `/menus/ingredients`, `/menus/ingredients/new`, `/menus/ingredients/:id`, `/menus/recipes`, `/menus/recipes/new`, `/menus/recipes/:id`.

- **Kitchen ingredients and purchase mappings:** conceptual ingredients have KG/L/UNIT units. An explicit, referenced mapping selects a commercial catalog product and the kitchen quantity contained in one sales unit. No conversion is guessed from product names. Ingredient units cannot change once referenced. Initial scope has one purchase mapping per ingredient; alternative supplier/product selection remains future work.
- **Recipes and versions:** batch servings, ingredient quantities, preparation notes and optional client ownership. Every save appends an immutable recipe snapshot. Plans pin a specific version, so later recipe edits cannot rewrite existing menus. Recipes shared across clients have no owner. Ingredients/recipes can be deactivated; destructive deletion is not exposed.
- **Client menu plans:** up to 31 days, one service, multiple centers belonging to the client, date/diet/course slots, common recipes and center-specific replacements. Existing customer menus can be manually transcribed and identified by a source reference. Automatic document/CSV menu import is not implemented. Plan copies are editable drafts with a parent link; published plans are immutable.
- **Diners and requirements:** habitual center/diet/service counts, replaced by explicit date overrides, including zero for no service. Each person must be counted in exactly one planning diet per service; combined dietary requirements need a corresponding combined diet. Positive diner counts without a menu for that diet/date prevent approval. Recipe quantities scale by batch servings, aggregate per center/date/ingredient, then apply a separately visible margin. No actual center inventory is assumed or subtracted.
- **Procurement forecast:** explicit mapping converts kitchen quantities to sales quantities; BOX/UNIT round upward to whole units and KG/L upward to three decimals, per center/date. Surplus from packaging and estimated catalog cost are displayed. Ambiguous reuse of one product for distinct ingredients is flagged for review. No stock is reserved and no purchase/order/ERP action is automatic.
- **Professional review:** DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED. Only `nutrition_menus` records Nutrition approval and only `quality` records Quality approval. Administrator is not a specialist override. Current approvals by both roles are required to publish. Approval evidence, operator, time and a canonical hash capture recipe versions, counts, product/mapping/technical information and diets; changed inputs require renewed approvals. These are private backoffice specialist records, not authenticated decisions by users of the future customer frontend.
- **Quality gates:** incomplete product composition, unvalidated allergen links, excluded allergens/traces, missing mappings, inactive ingredients/products and missing diet/count references prevent Quality approval. Products with zero allergen links are explicitly unknown, not allergen-free; Quality must review documentation and record its evidence. Other diet rules, nutrient balance, cross-contamination and clinical suitability are not inferred by this calculation and require professional assessment. Published snapshots retain the approved calculation and technical context.
- **Simulated proposal:** a deterministic rotation of existing recipes into main-course slots for a chosen diet. It starts in DRAFT, is labelled MOCK, sends no external AI requests and has no automatic approval or nutritional guarantee.

Migration 6 adds `menuIngredients`, `ingredientProducts`, `recipes`, `recipeVersions`, `menuPlans`, RLS, tenant-aware foreign keys and unique ingredient mapping/recipe revision indexes. Nested schedule/count/recipe references are validated by the transactional service. Generic master CRUD/import cannot alter operational menu states.

Run `npm --prefix nexora-api run db:seed-menus` for the initial workspace demonstration: four kitchen ingredients and mappings, three fictional recipes, and a five-day client menu for its centers and available diets. It is idempotent, does not overwrite existing examples, does not modify product technical/allergen data, and creates no approvals/publications/accounts. The menu deliberately retains technical issues from unvalidated mock masters.

Dedicated API: `/api/menus/catalog`, `/api/menu-ingredients`, `/api/ingredient-products`, `/api/recipes`, `/api/menus` and scoped record routes; menu actions `/forecast`, `/copy`, `/mock`, `/review`, `/nutrition`, `/quality`, `/publish`, `/archive`. Sessions, company scope, origin checks, role checks, audit and optimistic versions apply.

Tests cover recipe pinning, quantities/rounding/margins, center replacements, zero/date overrides, diet coverage, specialist permissions, stale approvals, immutable publication, English payloads/Spanish UI and demo seed idempotency. Optional PostgreSQL verification uses only rollback fixtures without creating accounts:

```sh
NEXORA_MENU_DB_TEST=1 node --env-file=nexora-api/.env --test nexora-api/test/menu-postgres.test.mjs
```

Next F3 increments: easier calendar editing and client-menu file import; reliable nutrient/recipe data and more complete dietary checks; real customer frontend/authentication and review requests; actual AI proposals/benchmarks; center inventory and ERP-backed order proposals. F1 embeddings and live F2 integrations remain deferred. F4/F5 and AWS production deployment are later phases.
