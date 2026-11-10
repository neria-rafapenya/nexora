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

Each master has a list, search, detail/edit form and permission-controlled create/delete actions. Referenced records cannot be deleted. Products have family and temperature filters. Text search supports approximate word matching. Products also offer an explicit Gemini semantic search mode backed by pgvector (see F1 acceptance below).

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

F1 semantic product search uses Gemini `gemini-embedding-001`, 768 dimensions, and Supabase pgvector. The key remains server-side. Approximate word search remains a separate mode. The requested 200-product fixture replaces the original document's larger demo-catalog target.

F2 orders now works locally with simulated or Gemini proposals and revision-specific customer acceptance and internal approval. F3 has a local menu-to-procurement workflow, weekly calendar, CSV/Excel import, configurable nutrition checks and reviewed order proposals. F4 supplier documents now has a local version/review/expiry workflow. F5 food waste now provides a local measurement, destination and prevention workflow. Real Gemini extraction and embeddings are explicitly enabled for the POC; order approvals remain manual. F1 semantic search is implemented and validated as documented below.

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

Still deferred: OCR, live email/WhatsApp ingestion, automatic diet/allergen-compatible substitute selection, real ERP connector and cancellation protocol, authenticated customer frontend and real-order accuracy benchmarks. Substitutions are manual and require reviewing the product documentation; the unvalidated allergen demo data is never treated as proof of suitability. AWS production infrastructure remains a later phase.

## F3 — local POC menu planning, nutrition and procurement

F3's agreed local scope is implemented. The customer frontend, real menu-generation AI and ERP integration remain separate deferred work. UI is Spanish; models and demo records remain English. Routes: `/menus`, `/menus/new`, `/menus/:id`, `/menus/ingredients[/new|/:id]`, `/menus/recipes[/new|/:id]`, `/menus/nutrition`.

### Planning and imports

- Client-owned plans span up to 31 days and one service, shared across its centers, with diet/course slots and center-specific recipe replacements. Immutable recipe versions prevent later recipe edits from rewriting menus. Published plans are frozen; copying starts a new editable draft.
- A weekly calendar edits recipe slots by diet and center. Copying a day replaces that scope's dishes while preserving diner overrides. Read-only users can browse the calendar without editing recipes.
- Existing client menus can be entered manually or imported from CSV/XLSX. Download the CSV header template, use textual ISO dates, and supply `date,diet,course,recipe,recipe_version,center,servings`. Names/codes/IDs resolve only when unambiguous; recipe version can be explicit or the current active version. Unknown names require manual association in the preview. Empty center means a common slot; imported servings require a concrete center. Columns not used can be omitted.
- Preview writes nothing. APPEND detects duplicate slots; REPLACE explicitly replaces all dishes. Contradictory counts, cross-client recipes, bad dates and unresolved rows prevent commit. Confirmation revalidates the file, plan version and preview hash atomically. Plain values only; no formulas, scanned document processing, PDF menu parsing or AI interpretation is included.
- Habitual center/diet/service counts are replaced by date-specific overrides, including zero for no service. Each person must belong to exactly one planning diet for that service; combined requirements require a combined diet. Positive counts without a menu prevent publication.

### Nutritional and technical data

- Product nutrition profiles store energy, protein, carbohydrates, sugars, fat, saturated fat, fiber and salt with a documented basis (100 g, 100 ml or one kitchen unit). All values must be explicit, including zeros; absent information is never zero. KG/L/UNIT recipes must match their nutritional basis. No density or piece-weight conversion is invented. A unit profile refers to a kitchen piece, not a whole sales box.
- Only Nutrition validates profiles and per-diet/service rules. Administrators can save drafts. Rules specify optional per-serving minimums/maximums, ingredient exclusions and required product claims. Targets have no clinical defaults: the responsible professional supplies the source and values. Food group classification supports existing meat/fish exclusions; existing pureed-diet rules require the corresponding declared suitability. Unknown classification blocks those exclusions rather than assuming plant-based suitability.
- Recipe ingredient amounts scale by batch servings; all courses on a date/diet/service sum to nutritional values per serving. Missing/unreviewed profiles, mismatched bases, unreviewed diet rules and violations are explicit blockers. These calculations do not establish clinical suitability, cross-contamination controls, nutrient retention during cooking or actual serving compliance; professional review remains required.
- Quality records composition, documentary reference and current allergen/claim context in a technical review. Pending product-allergen associations must first be validated on the product record. No allergen links is explicitly unknown, not allergen-free; the professional must substantiate the review. Technical changes invalidate the prior technical review.
- Draft/review/approved/published/archived states remain separate. Current Nutrition and Quality plan approvals are required to publish. Hashes include recipes, counts, conversions, nutrition profiles, diet rules and technical reviews. Changes require renewed approval; publication retains the complete calculation/context. Pre-extension publications remain frozen historical views but must be copied and newly approved before generating order proposals.
- Mock profiles/reviews and mock-origin plans stay labelled demonstration data. Sample catalog products cannot be silently relabelled as real nutrition/technical sources. Demo seeds never create specialist approvals or fill real supplier declarations.

### Procurement and F2 proposals

- Ingredients are separate from commercial products. Referenced conversions declare kitchen quantity per sales unit; units cannot change once referenced. Each ingredient has a default product, with explicitly referenced plan-specific product/format choices. Those choices are part of menu review, including nutritional and allergen compatibility.
- Needs scale by rations and aggregate per center/date/ingredient, with a separately visible margin. Delivery allocations may group consumption dates into an earlier delivery (up to 31 days). Delivery calendars and closure dates are checked. Quality/storage suitability of advance delivery still requires operational review.
- Optional referenced center inventory is a manual planning declaration, not a live warehouse balance. It is allocated once, chronologically, across the plan. Delivery needs aggregate before format rounding: whole BOX/UNIT, KG/L upward to three decimals. Gross need, stock used, net need, purchases, packaging surplus and indicative costs remain visible; a CSV forecast can be downloaded. Ambiguous ingredient reuse of one product is flagged.
- An explicit administrator/order-operations action converts a fully published, still-current plan into F2 proposals per center/delivery date. A database uniqueness key and transactional links prevent duplicate generation. New orders remain IN_REVIEW, all lines unreviewed, client consent absent, ERP NOT_SENT, with no stock reservation. The ordinary F2 acceptance/approval workflow still applies. Changed published source data requires a new reviewed plan revision before generating further proposals.
- The mock recipe rotation remains an optional draft proposal with no automatic nutritional validation or external AI calls.

### Storage, demo data and checks

Migration 6 created `menuIngredients`, `ingredientProducts`, `recipes`, `recipeVersions`, `menuPlans`. Migration 7 adds `nutritionProfiles`, `dietMenuRules`, `productTechnicalReviews`, `menuPurchaseLinks`, procurement settings, tenant-aware FKs and unique profile/rule/order-proposal keys. Unpublished old approvals are invalidated; published snapshots are preserved. RLS, sessions, company scope, role checks, origin checks, audit and optimistic versions apply. Generic master CRUD/import cannot bypass menu workflows. Nested recipe/schedule references are validated transactionally.

`npm --prefix nexora-api run db:seed-menus` creates four kitchen ingredients/mappings, three fictional recipes and a five-day client plan. `npm --prefix nexora-api run db:seed-menu-details` adds four synthetic nutrition drafts and six unreviewed demo diet/service rule drafts to that initial dataset. Seeds are idempotent, do not overwrite edits or validate data, create no accounts, and do not approve/publish menus. Real supplier data and professional reviews are prerequisites for real use; the seeded plan intentionally remains a draft with unresolved issues.

API adds `/api/menus/nutrition`, `/api/menus/technical-review`, `/api/menus/:id/import` and `/api/menus/:id/purchase-drafts` to the existing plan/recipe/ingredient and review endpoints. Tests cover calculations, copied days, imports and atomicity, cross-client references, specialist permissions, stale reviews, diet exclusions, grouping/stock allocation, immutable publication and idempotent F2 proposals. PostgreSQL checks use rollback fixtures without creating accounts:

```sh
NEXORA_MENU_DB_TEST=1 node --env-file=nexora-api/.env --test nexora-api/test/menu-postgres.test.mjs
```

## Deferred integration backlog

- Gemini Developer API free tier is queued for the POC. No provider is connected and no billing is enabled by this work. Start with F2 order interpretation, then menu interpretation/proposals; keep provider adapters replaceable for AWS later.
- Live F2 email/WhatsApp/OCR and real ERP handoff/cancellation remain deferred. F1 embeddings are completed for the POC scope below.
- Customer frontend/authentication and external review requests remain future work. Specialist records here are private backoffice actions, not authenticated customer-frontend decisions.
- Live center inventory, supplier-specific purchasing/logistics, verified food composition datasets and external document ingestion require their actual sources/integrations.
- AWS production infrastructure remains deferred. Supplier portal ingestion, OCR/AI document analysis, external notifications and production object storage remain outside the local F4 workflow.

## F3 weekly validation

The rollback-only PostgreSQL scenario now imports five days for two centers (100 and 50 diners), pins the recipe version, checks 80 test kcal per serving, verifies 40 kg / 20 kg of test ingredient across the week, groups each center's needs into one delivery and creates two unaccepted F2 proposals. Repeating generation returns the same proposals. The values and specialist actions are test fixtures only, not nutritional advice or real professional approvals. All fixtures, review events and proposals roll back; no accounts or access rights are created. Existing demo plans remain drafts.

## F4 — private supplier document lifecycle

Routes: `/supplier-documents`, `/supplier-documents/new`, `/supplier-documents/:id`. Spanish UI; English model/demo data. The local POC includes:

- Document identity: title, supplier, type (technical sheet, allergen declaration, certificate or other) and linked products. Product links must match that supplier; technical sheets/allergen declarations require products. Scope is immutable after creation so historical documents cannot silently move to a different supplier/product.
- Original files and version history: PDF/PNG/JPEG/TXT, maximum 1.5 MB. PDF uses the existing local text extraction limits (20 pages/20,000 characters); TXT must be UTF-8 and at most 20,000 characters. Image/scanned files require manual review; no OCR or external AI is invoked. Upload creates a new immutable private file and a numbered pending version. Lists/details return file metadata, not binary content; a scoped authenticated download retrieves the selected original and records an audit event.
- Declared facts: optional composition, contains/traces, completeness, nutrient values with explicit basis, and product claims. Missing fields are unknown. These are manual transcriptions, not extracted/verified facts. Checksums detect file changes; structured comparisons identify changes to composition, allergens, nutrients, claims and validity. There is no semantic comparison of PDF text and no automatic master-data update.
- Quality decisions: only Quality can approve/reject the pending latest version or withdraw an approved version. The reviewer supplies evidence, explicitly confirms reviewing the file/changes, and submits the current record versions and change hash. Administrators may create/upload, but cannot approve. Expired versions cannot be approved. Rejection of a new version explicitly keeps a prior approved version usable if it remains valid. Approval of a new version selects it as current while preserving all originals and prior decisions.
- Validity and alerts: company business date uses Europe/Madrid. Current documents show valid, expiring within 30 days, expired, not yet effective, pending, rejected, withdrawn or archived states. Pending versions still expose their own expiry alerts. Status is calculated at consultation time, not dependent on a background worker. Certificates require an expiry date. Email/push reminders are not implemented.
- F3 integration: Quality can bind a product technical review to a selected approved/current document. Supplier/product scope, declared composition, complete allergen lists and explicit claims must agree with the product data; discrepancies require explicit product updates, not silent overwrites. New pending versions, expiry, withdrawal, archive or supplier changes invalidate the bound evidence. F3 preserves published historical snapshots, displays current source issues and blocks new order proposals until a new reviewed revision is available. Existing manual source references remain supported for the POC.
- Provenance and archive: mock documents stay labelled, including when used as F3 evidence. Approved documents can only be archived by Quality; administrators can archive unapproved ones. Originals/history are retained. No destructive document/file deletion endpoint is exposed.

Migration 8 creates `supplierDocuments`, `documentFiles`, `documentVersions`, with RLS, tenant-scoped FKs and unique revision numbers. Files live in the private PostgreSQL schema for the local POC, not a public bucket. Sessions, membership, same-origin mutation checks, record versions and transactional audit apply. Generic master CRUD/import cannot bypass this workflow. API: `/api/supplier-documents`, `/catalog`, `/:id`, `/:id/versions`, `/:id/versions/:versionId/review`, `/:id/versions/:versionId/download`, `/:id/archive`.

`npm --prefix nexora-api run db:seed-documents` adds three clearly fictitious documents and four pending versions: a technical sheet with two different versions, an expired certificate example and an expiring certificate example. No approvals, product/allergen changes, accounts or external notifications are created. Repeating the seed preserves existing examples.

Offline tests cover scope, roles, stale reviews, private metadata/downloads, version changes, validity, withdrawals, archives and document/F3 consistency. The PostgreSQL F4 test checks persistence, constraints and F3 evidence links inside a rollback-only transaction:

```sh
NEXORA_DOCUMENT_DB_TEST=1 node --env-file=nexora-api/.env --test nexora-api/test/document-postgres.test.mjs
```

Remaining integrations are still deferred: AI document analysis, real customer/supplier frontends, ERP, external document sources, OCR/AI classification, email notifications and AWS production services. Real documents and professional validation must replace synthetic fixtures before real operations.

## F5 — local food waste observations and prevention

Routes: `/food-waste` (indicators), `/food-waste/events[/new|/:id]`, `/food-waste/actuals[/new|/:id]`, `/food-waste/actions[/new|/:id]`. Spanish UI; English models/demo data. This phase records observations and decisions. It never adjusts catalog stock, creates an inventory ledger movement, creates an order or sends anything to an ERP.

### Observed losses and destinations

- Waste events identify center, non-future date, service, cause, a product or immutable recipe version, measured quantity, optional diet/published menu, traceability and intended destination. Product observations use the catalog sales unit. Recipe observations use equivalent portions. Weight, volume, sales units and portions remain separate; they are never summed into one waste total.
- Linked menus must be published/archived, match client/center/date/service/diet, and contain the selected recipe/product. Historical menu snapshots are used even if today's technical sources changed: recording an observation is not new food approval or purchase authorization.
- Indicative valuation is captured with its source context. Products use catalog price or the linked menu's preserved product price. Recipe portions use batch servings, ingredient mappings and product prices; there is no assumption about purchase pack rounding or cooking yield. Missing prices/conversions are unvalued, not zero. Recorded valuations remain frozen after price changes.
- DRAFT → RECORDED → VOID. Confirmation is separate from saving. Confirmed facts cannot be edited; correction voids the original with a reason and creates a replacement. Audit and destination evidence remain. Reusing a creation key with the same payload returns the same record; different data with that key is rejected. Generic master CRUD/import cannot change operational states.
- Destinations are disposal, supplier return or possible donation. Return/donation requires recipient, batch and traceability; only Quality may approve/reject. Donation candidates require a declared use-by date; expiry, deterioration and plate leftovers are excluded by this POC workflow. Current date is rechecked at approval/execution. These are conservative application gates, not a legal or food-safety determination; Quality must substantiate suitability externally.
- Quality approval does not mean execution. An operator separately records execution evidence; only then do disposal/returned/donated quantities appear as completed. A pending/rejected/approved-but-unexecuted non-disposal destination may be rerouted to disposal with a reason, preserving the previous decision. Voiding a record corrects reporting; it does not reverse an actual handover.

### Service volumes and improvement actions

- Actual-service observations store produced and served integer portions by center/date/service/diet. Served cannot exceed produced. Planned counts come from a linked published menu or the habitual diner baseline at capture time; missing baseline is unknown. There is at most one RECORDED observation for those dimensions, enforced by the service and a PostgreSQL unique partial index. Void/correction preserves history.
- Produced minus served is unserved portions, not inferred waste. No waste event is generated automatically and no diner/menu baseline is overwritten. Period reports compare planned, produced and served counts; descriptive mean served/produced references appear only after three confirmed observations per center/service/diet. These are not AI recommendations and do not apply future quantities automatically.
- Improvement actions contain center, target cause, responsible person's name, deadline, optional reduction target, related confirmed waste records and an action plan. OPEN → IN_PROGRESS → COMPLETED/CANCELLED requires progress/outcome evidence. Closed actions remain immutable; overdue open actions are highlighted. A reduction target is declared, not a computed or verified achievement. No assignment messages or notifications are sent.
- Dashboard filters date/center/service/cause, preserves unit-specific totals, separates pending versus executed destinations, shows known valuation plus unvalued counts, service comparisons, historical references and action follow-up. Cause filters affect waste; production/service comparisons are not assigned causes. Action follow-up uses center/cause rather than the observation date range. CSV exports escape spreadsheet formula prefixes.

Migration 9 creates `wasteEvents`, `serviceActuals`, `wasteActions`, with RLS, tenant-scoped FKs, unique creation keys and confirmed-service uniqueness. All mutations are transactional/audited and use optimistic record versions. Admin/order operations/menu planning/Quality may record observations and actions; only Quality reviews restricted destinations. Sales/read-only roles may consult. No destructive deletion endpoints are exposed.

API: `/api/food-waste/catalog`, `/report`, `/events`, `/actuals`, `/actions`, record routes and `/record`, `/void`, `/approve`, `/reject`, `/discard`, `/complete`, `/progress` transitions as applicable.

`npm --prefix nexora-api run db:seed-waste` adds six explicitly synthetic recorded measurements, six recorded service-count observations and one open improvement action to the initial demo workspace. `recordedBy=MOCK_SEED` distinguishes generated telemetry from a real human observation. All return/donation decisions remain pending; no destination is marked executed. The seed preserves existing data on repeat, does not create accounts or professional approvals, and never changes stock/orders.

Tests cover snapshots/costs, idempotency, unit separation, absence of stock/ERP effects, Quality permissions, destination traces, voiding, unique service observations, partial baselines, three-observation references, action evidence, tenant scope and UI save/confirmation separation. PostgreSQL verification uses rollback-only fixtures and existing actor references without creating accounts:

```sh
NEXORA_WASTE_DB_TEST=1 node --env-file=nexora-api/.env --test nexora-api/test/waste-postgres.test.mjs
```

Outstanding integrations remain the agreed backlog: live channels/OCR, customer/supplier frontends, ERP, live inventory, external notifications and AWS production deployment. Real measurements, operating procedures and professional decisions must replace demo fixtures for real use.

## F5 functional acceptance closure — local POC

Functional technical validation is closed for the agreed local scope. It is not an approval of real food handling or a customer production sign-off. The executable rollback scenario now covers disposal, a simulated Quality-reviewed donation, a supplier return, service-count comparison and an improvement action progressed to completion with evidence. Confirmed destination totals are checked separately, repeated requests do not duplicate observations, voiding removes the corrected record from indicators while retaining evidence, and stock/order counts stay unchanged. UI tests cover explicit confirmation/evidence and immutable completed records. No real Quality approvals, completed sample donations, users or external movements are created by validation.

The original F0–F5 delivery sequence is complete for the documented local POC scopes, with external integrations still pending; F1 semantic search is now completed for the POC. There is no previously defined F6. Gemini order interpretation and F1 semantic search are now enabled locally with the user-provided key and free-tier confirmation. Customer frontend work and the remaining integrations are deferred until selected by the user. No billing is enabled automatically.

### Gemini POC order extraction

The first real-provider slice is text extraction in the F2 order inbox. The existing simulated proposal remains available. Gemini proposes catalog references and quantities; server-side catalog prices and validations remain authoritative. Every line requires review, followed by the existing client acceptance and internal approval. It does not submit orders to an ERP, reserve stock, approve allergens, or implement menu generation/embeddings.

Configuration is server-only in `nexora-api/.env`: `GEMINI_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `GEMINI_FREE_TIER_CONFIRMED`, and `GEMINI_MAX_DAILY_REQUESTS` (default 5 per company/day in Europe/Madrid). Disabled is the default. The free-tier flag is an operator attestation, **not** a billing-account check or guaranteed spending cap; verify the project's current Google AI Studio plan before enabling. The application does not enable billing. No credentials are returned to the browser.

Each request requires confirmation that the message contains only fictitious POC data. Only saved text and active `Nexora Sample` SKU/name/unit references are sent; sender/client metadata and catalog prices are excluded. Do not include real personal or confidential information in the message. Usage tokens are recorded when returned; monetary cost is unknown rather than reported as zero. Local attempts, including failed attempts, consume the daily allowance. There is no automatic retry, provider fallback, or model fallback; provider quota errors are displayed. An in-flight lease prevents duplicate processing, and source/catalog changes invalidate the response before any proposal is committed.

Migration 10 adds tenant-scoped request tracing and an in-flight uniqueness constraint. Automated adapter/service/UI checks use simulated provider responses. The PostgreSQL check can run with `NEXORA_AI_DB_TEST=1 node --env-file=.env --test test/gemini.test.mjs` from the API directory and rolls back its fixtures. A live adapter smoke test with fictitious data passed using `gemini-3.5-flash-lite`. The older 2.5 Flash-Lite returned 404 for this project. The current REST responseFormat schema uses basic types; strict bounds and unknown-field rejection remain enforced locally. Full live order workflow acceptance has also passed; see acceptance evidence below. AWS remains the future target; this provider is isolated behind an extraction adapter.

Official references: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [generateContent API](https://ai.google.dev/api/generate-content).

### F2 live Gemini functional acceptance — 2026-11-10

`test/gemini-workflow.test.mjs` completed a real Gemini extraction against the fictitious catalog and the existing workflow services in Supabase. It verifies an unreviewed proposal, server-side prices, reviewed corrections, rejection of internal approval without acceptance, rejection of an obsolete customer decision, simulated client acceptance of the corrected revision, internal approval, and mock ERP handoff. A lost acknowledgement after mock ERP acceptance followed by retry produces two attempts but exactly one receipt/external order. Repeated dispatch stays idempotent; product stock is unchanged and another tenant cannot read the order. All business fixtures, test approvals and mock ERP receipts roll back; no users, sessions or memberships are created. This is technical POC acceptance with a **simulated customer and ERP**, not a real customer's approval or external ERP integration.

Run from `nexora-api`: `NEXORA_AI_WORKFLOW_DB_TEST=1 NEXORA_GEMINI_LIVE=1 node --env-file=.env --test test/gemini-workflow.test.mjs`. Omitting `NEXORA_GEMINI_LIVE=1` uses an injected extraction response, while retaining the real database workflow. The live option sends fictitious data to Google.

### F1 semantic search — POC implementation and acceptance

Products offer “Buscar por significado con IA”, separate from the existing text search. Explicit queries in Spanish or English use Gemini `gemini-embedding-001` with `RETRIEVAL_QUERY`; product documents use `RETRIEVAL_DOCUMENT`. Vectors are normalized to 768 dimensions. Migration 11 enables pgvector and creates private RLS-enabled `bo.product_embeddings`, `bo.embedding_queries` and `bo.embedding_requests` tables. Vectors have tenant/product foreign keys and cascade away with deleted products. An exact cosine scan is appropriate for the current 200-product catalog; approximate vector indexes are not required at this size. Scores describe relative similarity, not confidence or nutritional/allergen suitability.

Only active `Nexora Sample` products are embedded in this POC. Text includes SKU, name, family/category names, format, unit, temperature and ingredients. Prices, stock, client identities, supplier contact details and allergen approvals are excluded. Product/family/category changes invalidate source hashes; stale and inactive entries are excluded immediately and administrators can update the index. Only changed/new documents are sent. Queries re-read current products after the provider response. A provider failure never silently switches to lexical search or approves a product substitution.

Server configuration: `GEMINI_EMBEDDINGS_ENABLED=true`, `GEMINI_API_KEY`, `GEMINI_FREE_TIER_CONFIRMED=true`, and `GEMINI_EMBEDDING_MAX_DAILY_REQUESTS=50` (default). Each uncached query consumes one local request unit; indexing reserves one unit per synchronous batch of up to 20 products, with 15-second spacing between batches. Failed/reserved attempts count conservatively against the daily limit in Europe/Madrid. This local allowance does not replace Google's project quotas or guarantee billing status. There are no automatic retries or provider/model fallbacks. Hash-only query caches are scoped by company/model and expire after 24 hours for reuse; query text is not persisted in those tables. Explicit fictitious-data confirmation is required before indexing/searching. Product readers can search; only administrators can trigger indexing.

The API routes are `GET /api/product-search/status`, `POST /api/product-search` and administrator-only `POST /api/product-search/index`. Responses expose current products and similarity scores, not vectors or credentials. Indexing reports current/pending counts so interrupted or rate-limited runs can be resumed manually without re-embedding unchanged products. AWS remains a later provider migration behind the adapter.

`test/embeddings.test.mjs`, `test/search-postgres.test.mjs` and `SemanticProducts.test.tsx` cover request shape, invalid vectors, strict permissions, quotas, cache reuse, incremental updates, deactivation, tenant isolation, foreign keys and UI consent/filter behavior. The database test rolls back its fixtures and makes no real provider calls. Run it with `NEXORA_SEARCH_DB_TEST=1 node --env-file=.env --test test/search-postgres.test.mjs` from the API directory. `npm run ai:validate-search` explicitly indexes the existing 200 demo products and checks Spanish-to-English catalog retrieval plus cache reuse using the live provider; it does not modify commercial catalog data.

References: [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings), [free-tier pricing](https://ai.google.dev/gemini-api/docs/pricing), [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector).

Live acceptance result (2026-11-10): **200/200** demo products indexed, no pending entries. Four Spanish queries each returned the expected English reference at rank 1: “arroz basmati para cocinar” → Basmati Rice; “aceite de oliva virgen extra” → Extra Virgin Olive Oil; “filetes de merluza congelados” with FROZEN filter → Hake Fillets; “leche entera” → Whole Milk. Repeating the rice query reused the persisted query vector without a provider call. An initial rate-limited run retained 80 successful entries; manual continuation with batch pacing completed the remaining 120 without re-embedding those 80. These examples demonstrate the POC retrieval behavior; they are not a broad accuracy benchmark.

### IONOS POC deployment — backoffice.horekia.com

The backoffice and `/api/*` share the HTTPS origin `https://backoffice.horekia.com`; Caddy serves only `nexora-backoffice/dist`, with SPA fallback for routes such as `/products`. API requests retain `/api` and proxy to the loopback listener at port 3000 with a loopback Host header. The main domain and other subdomains are independent. The existing wildcard DNS covers the backoffice name; Caddy obtains the hostname certificate automatically.

Production settings live only in `/var/www/horekia/.env`: the existing `DATABASE_URL` and `MFA_KEY` must be preserved, alongside server-side Gemini configuration. Set `PORT=3000`, `COOKIE_SECURE=true`, and `ALLOWED_ORIGINS=https://backoffice.horekia.com`. Supabase remains the database; the current direct PostgreSQL API does not use `SUPABASE_URL` or `SUPABASE_KEY`. Never put the env file inside the frontend output directory. No new users or memberships are required for deployment; existing credentials and MFA continue to apply.

`npm start` at the repository root reads the root `.env`. PM2 uses `deploy/ecosystem.config.cjs` (one process, env file loaded by Node, restart on failure). Install dependencies with `npm ci` and `npm run install:all` because the API/frontend have their own lockfiles. Build with `npm run build` on the development/CI machine and transfer only the resulting `nexora-backoffice/dist` output to avoid compiling on the 2 GB VPS. API-only production dependency install is `npm --prefix nexora-api ci --omit=dev`. After updating source/artifacts run `pm2 restart horekia` and save the process list with `pm2 save`. The initial deployment may transfer a Git bundle over SSH; configure independent repository read access on the VPS before relying on `git pull` for later updates.

`deploy/Caddyfile` contains the hostname block to add to `/etc/caddy/Caddyfile`, preserving unrelated sites. Validate with `caddy validate --config /etc/caddy/Caddyfile` before reloading Caddy. Verify HTTPS `/api/health`, SPA deep links, protected API rejection without a session, and origin rejection. Logs remain available through `pm2 logs horekia`. This deployment uses the same POC Supabase workspace as local development; it does not migrate or duplicate its data.
