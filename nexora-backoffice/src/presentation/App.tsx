import { useState, useEffect, type FormEvent } from "react";
import {
  LayoutDashboard,
  ShoppingBasket,
  Utensils,
  Building2,
  Sprout,
  Settings,
  History,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Plus,
  Search,
  Pencil,
  Trash2,
  Upload,
  ArrowLeft,
  Database,
  Users,
  FolderTree,
  Package,
  RefreshCw,
  Download,
} from "lucide-react";
import {
  operations,
  type Session,
  type Contract,
  type Resource,
  type RecordRow,
} from "../domain/core";
import { request } from "../infrastructure/api";
import { emptyForm, payload } from "../application/forms";
const icons = [ShoppingBasket, Utensils, Building2, Sprout];
const labels: Record<string, string> = {
  families: "Families",
  products: "Products",
  allergens: "Allergens",
  suppliers: "Suppliers",
  clients: "Clients",
  centers: "Centers",
  diets: "Diets",
  centerDiners: "Center diners",
  productAllergens: "Product allergens",
};
export function App() {
  const [user, setUser] = useState<Session | null>(null),
    [setup, setSetup] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [companyId, setCompany] = useState(""),
    [page, setPage] = useState("dashboard"),
    [contract, setContract] = useState<Contract | null>(null),
    [refresh, setRefresh] = useState(0);
  const company = user?.companies.find((c) => c.id === companyId);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await request<{ required: boolean }>("/setup");
        if (live) setSetup(s.required);
        if (!s.required) {
          try {
            const { user } = await request<{ user: Session }>("/session");
            if (live) {
              setUser(user);
              setCompany(user.companies[0]?.id ?? "");
            }
          } catch (e) {
            if ((e as { status?: number }).status !== 401) throw e;
          }
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!user || !companyId) return;
    let live = true;
    setContract(null);
    request<Contract>("/schema", companyId)
      .then((c) => {
        if (live) setContract(c);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [user, companyId]);
  function signedIn(u: Session) {
    setUser(u);
    setCompany(u.companies[0]?.id ?? "");
    setSetup(false);
    setError("");
    setPage("dashboard");
  }
  function navigate(next: string) {
    setPage(next);
    setError("");
  }
  if (loading) return <div className="loading">Connecting to Nexora…</div>;
  if (!user)
    return (
      <Access
        setup={setup}
        error={error}
        onSuccess={signedIn}
        onError={setError}
      />
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => navigate("dashboard")}>
          nexora<span>✳</span>
        </a>
        <nav>
          <button
            className={page === "dashboard" ? "active" : ""}
            onClick={() => navigate("dashboard")}
            title="Overview"
          >
            <LayoutDashboard size={19} />
            Overview
          </button>
          <span className="sidebar-label">MASTER DATA</span>
          {Object.keys(labels)
            .filter((r) => contract?.permissions[r]?.read)
            .map((r) => (
              <button
                key={r}
                title={labels[r]}
                className={page === r ? "active" : ""}
                onClick={() => navigate(r)}
              >
                {r === "products" ? (
                  <Package size={18} />
                ) : r === "families" ? (
                  <FolderTree size={18} />
                ) : (
                  <Database size={18} />
                )}
                <span>{labels[r]}</span>
              </button>
            ))}
          <span className="sidebar-label">OPERATIONS</span>
          {operations.map((m, i) => {
            const Icon = icons[i];
            return (
              <button
                title={m.name}
                key={m.id}
                className={page === m.id ? "active" : ""}
                onClick={() => navigate(m.id)}
              >
                <Icon size={18} />
                <span>{m.name}</span>
              </button>
            );
          })}
          {company?.role === "admin" && (
            <>
              <span className="sidebar-label">SYSTEM</span>
              <button
                title="Users and roles"
                className={page === "users" ? "active" : ""}
                onClick={() => navigate("users")}
              >
                <Users size={18} />
                <span>Users and roles</span>
              </button>
              <button
                title="Audit history"
                className={page === "audit" ? "active" : ""}
                onClick={() => navigate("audit")}
              >
                <History size={18} />
                <span>Audit history</span>
              </button>
              <button
                title="Settings"
                className={page === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>
              {contract?.roles[company?.role ?? ""] ?? company?.role}
            </small>
          </div>
          <button
            aria-label="Sign out"
            onClick={async () => {
              try {
                await request("/logout", "", "POST");
                setUser(null);
                setContract(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> {labels[page] ?? page}
          </div>
          <label className="company">
            <Building2 size={17} />
            <span className="sr-only">Active company</span>
            <select
              value={companyId}
              onChange={(e) => {
                setCompany(e.target.value);
                navigate("dashboard");
              }}
            >
              {user.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <span className="local-badge">
            <i />
            Local API · Supabase
          </span>
        </header>
        <main>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {!contract ? (
            <p>Loading workspace…</p>
          ) : (
            <div key={companyId + ":" + page}>
              {page === "dashboard" ? (
                <Overview
                  company={company?.name ?? ""}
                  companyId={companyId}
                  contract={contract}
                  navigate={navigate}
                  refresh={refresh}
                />
              ) : contract.resources[page] ? (
                <Master
                  resource={page}
                  def={contract.resources[page]}
                  contract={contract}
                  companyId={companyId}
                  writable={contract.permissions[page].write}
                  onChanged={() => setRefresh((x) => x + 1)}
                />
              ) : page === "audit" ? (
                <Audit companyId={companyId} />
              ) : page === "users" ? (
                <UserManagement companyId={companyId} roles={contract.roles} />
              ) : page === "settings" ? (
                <WorkspaceSettings
                  companyId={companyId}
                  onUser={(u) => {
                    setUser(u);
                  }}
                />
              ) : (
                <div>
                  <Heading
                    eyebrow="OPERATIONS"
                    title={operations.find((x) => x.id === page)?.name ?? page}
                    description={
                      operations.find((x) => x.id === page)?.description ?? ""
                    }
                  />
                  <section className="empty panel">
                    <ShieldCheck size={38} />
                    <span className="pill">
                      {operations.find((x) => x.id === page)?.phase} · PLANNED
                    </span>
                    <h2>Ready for the next phase.</h2>
                    <p>
                      Operational workflows and AI proposals are not available
                      yet. Build your master data first.
                    </p>
                    <button
                      className="primary"
                      onClick={() => navigate("products")}
                    >
                      Open products <ArrowRight size={17} />
                    </button>
                  </section>
                </div>
              )}
            </div>
          )}
          <footer>
            Nexora Backoffice{" "}
            <span>
              Private workspace · PostgreSQL on Supabase · AI workflows pending
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Access({
  setup,
  error,
  onError,
  onSuccess,
}: {
  setup: boolean;
  error: string;
  onError: (s: string) => void;
  onSuccess: (u: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    onError("");
    try {
      const { user } = await request<{ user: Session }>(
        setup ? "/setup" : "/login",
        "",
        "POST",
        b,
      );
      onSuccess(user);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-story">
        <a className="brand" href="#">
          nexora<span>✳</span>
        </a>
        <div>
          <span className="eyebrow">YOUR OPERATIONS, CONNECTED</span>
          <h1>
            More clarity.
            <br />
            Better decisions.
          </h1>
          <p>
            Your team, your data and your operations.
            <br />
            One private workspace to work better.
          </p>
          <div className="story-line">
            <ShieldCheck size={20} /> AI proposes. Your team decides.
          </div>
        </div>
        <small>PRIVATE BACKOFFICE · HORECA & COLLECTIVE CATERING</small>
      </section>
      <section className="login-form">
        <div>
          <span className="pill">LOCAL WORKSPACE · SUPABASE</span>
          <h2>{setup ? "Set up your workspace" : "Welcome to Nexora"}</h2>
          <p>
            {setup
              ? "Create the first administrator. No demo accounts are created."
              : "Sign in with your workspace account."}
          </p>
          {error && (
            <div className="alert" role="alert">
              {error}{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => window.location.reload()}
              >
                Retry connection
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {setup && (
              <>
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
                <label htmlFor="companyName">Company name</label>
                <input
                  id="companyName"
                  name="companyName"
                  required
                  maxLength={120}
                />
              </>
            )}
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              minLength={setup ? 12 : 1}
              maxLength={128}
              required
            />
            {setup && (
              <p className="fine">
                Use at least 12 characters. This account controls the private
                workspace.
              </p>
            )}
            {!setup && (
              <>
                <label htmlFor="login-code">
                  Authenticator code (if enabled)
                </label>
                <input
                  id="login-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                />
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Please wait…" : setup ? "Create workspace" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="fine">
            {setup
              ? "The catalog contains 10 fictional families and 200 fictional products. All other business masters start empty."
              : "Authenticated sessions are managed by the local API."}
          </p>
        </div>
      </section>
    </div>
  );
}
function Overview({
  company,
  companyId,
  contract,
  navigate,
  refresh,
}: {
  company: string;
  companyId: string;
  contract: Contract;
  navigate: (p: string) => void;
  refresh: number;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    request<{ counts: Record<string, number> }>("/dashboard", companyId)
      .then((d) => setCounts(d.counts))
      .catch((e) => setError(e.message));
  }, [companyId, refresh]);
  return (
    <>
      <Heading
        eyebrow="YOUR OPERATIONS, IN PERSPECTIVE"
        title="Everything starts here."
        description={`Welcome to ${company}.`}
      />
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <section className="welcome">
        <div>
          <span className="pill">FOUNDATIONS & MASTER DATA</span>
          <h2>
            A solid foundation.
            <br />
            Real data, connected.
          </h2>
          <p>
            Manage your catalog and business records in one private space.
            <br />
            Changes are saved in PostgreSQL and recorded in audit history.
          </p>
          <button onClick={() => navigate("products")}>
            Explore the catalog <ArrowRight size={18} />
          </button>
        </div>
        <div className="abstract" aria-hidden="true">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <Database size={65} />
        </div>
      </section>
      <div className="section-heading">
        <h2>Master data</h2>
        <span>Your active company</span>
      </div>
      <div className="row g-3">
        {Object.keys(contract.resources).map((r) => (
          <div className="col-12 col-md-6 col-xl-3" key={r}>
            <button className="stat-card" onClick={() => navigate(r)}>
              <span>{labels[r]}</span>
              <strong>{counts[r] ?? "—"}</strong>
              <span className="card-link">
                Manage records <ArrowRight size={16} />
              </span>
            </button>
          </div>
        ))}
      </div>
      <div className="section-heading mt">
        <h2>Upcoming operations</h2>
        <span>Human approval at every critical step</span>
      </div>
      <div className="row g-3">
        {operations.map((m, i) => {
          const Icon = icons[i];
          return (
            <div className="col-12 col-md-6 col-xl-3" key={m.id}>
              <button className="module-card" onClick={() => navigate(m.id)}>
                <span className={"module-icon tone-" + i}>
                  <Icon size={23} />
                </span>
                <span className="module-phase">{m.phase} · Planned</span>
                <h3>{m.name}</h3>
                <p>{m.description}</p>
                <span className="card-link">
                  View module <ArrowRight size={16} />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
function Master({
  resource,
  def,
  contract,
  companyId,
  writable,
  onChanged,
}: {
  resource: string;
  def: Resource;
  contract: Contract;
  companyId: string;
  writable: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [lookups, setLookups] = useState<Record<string, RecordRow[]>>({}),
    [q, setQ] = useState(""),
    [family, setFamily] = useState(""),
    [temperature, setTemperature] = useState(""),
    [editing, setEditing] = useState<RecordRow | null | undefined>(undefined),
    [form, setForm] = useState<Record<string, unknown>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [confirmDelete, setConfirmDelete] = useState<RecordRow | null>(null),
    [showImport, setShowImport] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        q,
        ...(family ? { familyId: family } : {}),
        ...(temperature ? { temperature } : {}),
      });
      request<{ records: RecordRow[] }>(
        `/masters/${resource}?${params}`,
        companyId,
      )
        .then((d) => {
          if (live) setRows(d.records);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [resource, companyId, q, family, temperature, version]);
  useEffect(() => {
    let live = true;
    const needed = [
      ...new Set(
        Object.values(def.fields)
          .map((f) => f.resource)
          .filter((x): x is string => !!x && !!contract.permissions[x]?.read),
      ),
    ];
    Promise.all(
      needed.map(
        async (r) =>
          [
            r,
            (
              await request<{ records: RecordRow[] }>(
                `/masters/${r}`,
                companyId,
              )
            ).records,
          ] as const,
      ),
    )
      .then((entries) => {
        if (live) setLookups(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [companyId, def, contract, version]);
  function edit(row: RecordRow | null) {
    setEditing(row);
    setForm(
      row
        ? Object.fromEntries(
            Object.entries(def.fields).map(([k, f]) => [
              k,
              f.type === "json"
                ? JSON.stringify(row.data[k] ?? {}, null, 2)
                : f.type === "dates"
                  ? ((row.data[k] as string[]) ?? []).join(", ")
                  : (row.data[k] ?? emptyForm(def)[k]),
            ]),
          )
        : emptyForm(def),
    );
    setError("");
  }
  function changed() {
    setVersion((x) => x + 1);
    onChanged();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(
        `/masters/${resource}${editing ? "/" + editing.id : ""}`,
        companyId,
        editing ? "PUT" : "POST",
        {
          data: payload(def, form),
          ...(editing ? { version: editing.version } : {}),
        },
      );
      setEditing(undefined);
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function display(key: string, value: unknown) {
    const f = def.fields[key];
    if (f.type === "relation")
      return String(
        lookups[f.resource!]?.find((x) => x.id === value)?.data.name ??
          (value ? "Linked record" : "—"),
      );
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (key === "price" && typeof value === "number")
      return new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
      }).format(value);
    return value === null || value === undefined
      ? "—"
      : Array.isArray(value)
        ? value.join(", ")
        : String(value);
  }
  if (editing !== undefined)
    return (
      <>
        <Heading
          eyebrow="MASTER DATA"
          title={editing ? `Edit ${def.singular}` : `New ${def.singular}`}
          description="Changes are validated and saved to the active company."
        >
          <button className="secondary" onClick={() => setEditing(undefined)}>
            <ArrowLeft size={16} />
            Back to list
          </button>
        </Heading>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <form className="panel master-form" onSubmit={save}>
          <div className="row g-4">
            {Object.entries(def.fields).map(([key, f]) => (
              <div
                className={f.type === "json" ? "col-12" : "col-12 col-md-6"}
                key={key}
              >
                <label htmlFor={key}>
                  {f.label}
                  {f.required ? " *" : ""}
                </label>
                {f.type === "checkbox" ? (
                  <label className="checkbox">
                    <input
                      id={key}
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.checked })
                      }
                      disabled={
                        !writable ||
                        (key === "validated" &&
                          companyRole(contract) !== "quality")
                      }
                    />
                    {f.label}
                  </label>
                ) : ["select", "relation", "multi", "relations"].includes(
                    f.type,
                  ) ? (
                  <select
                    id={key}
                    required={f.required}
                    multiple={["multi", "relations"].includes(f.type)}
                    value={form[key] as string | string[]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [key]: e.target.multiple
                          ? Array.from(e.target.selectedOptions).map(
                              (x) => x.value,
                            )
                          : e.target.value,
                      })
                    }
                    disabled={!writable}
                  >
                    <option
                      value=""
                      disabled={["multi", "relations"].includes(f.type)}
                    >
                      Select…
                    </option>
                    {f.resource
                      ? (lookups[f.resource] ?? []).map((row) => (
                          <option key={row.id} value={row.id}>
                            {String(row.data.name ?? row.data.code ?? row.id)}
                          </option>
                        ))
                      : f.options?.map((v) => <option key={v}>{v}</option>)}
                  </select>
                ) : f.type === "json" ? (
                  <textarea
                    id={key}
                    value={String(form[key] ?? "{}")}
                    rows={5}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    readOnly={!writable}
                  />
                ) : (
                  <input
                    id={key}
                    type={
                      f.type === "number"
                        ? "number"
                        : f.type === "date"
                          ? "date"
                          : key.toLowerCase().includes("email")
                            ? "email"
                            : "text"
                    }
                    min={f.min}
                    step={
                      f.type === "number"
                        ? f.integer
                          ? "1"
                          : "any"
                        : undefined
                    }
                    required={f.required}
                    value={String(form[key] ?? "")}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    readOnly={!writable}
                  />
                )}
              </div>
            ))}
          </div>
          {resource === "products" && (
            <p className="fine">
              Sample ingredients and allergen information are unverified.
              Validation is managed separately by the Quality role.
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </button>
            {writable && (
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save record"}
              </button>
            )}
          </div>
        </form>
      </>
    );
  return (
    <>
      <Heading
        eyebrow="MASTER DATA"
        title={def.label}
        description={`${rows.length} ${loading ? "loading…" : "records"} · ${writable ? "Manage your company records." : "Read-only access."}`}
      >
        <div className="actions">
          {writable && (
            <>
              <button
                className="secondary"
                onClick={() => setShowImport((x) => !x)}
              >
                <Upload size={15} />
                Import
              </button>
              <button className="primary" onClick={() => edit(null)}>
                <Plus size={17} />
                Add {def.singular}
              </button>
            </>
          )}
        </div>
      </Heading>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {showImport && (
        <ImportPanel
          resource={resource}
          def={def}
          companyId={companyId}
          onDone={() => {
            setShowImport(false);
            changed();
          }}
        />
      )}
      <section className="panel list-panel">
        <div className="list-toolbar">
          <label className="search">
            <Search size={17} />
            <span className="sr-only">Search {def.label}</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${def.label.toLowerCase()}…`}
            />
          </label>
          {resource === "products" && (
            <>
              <select
                aria-label="Filter by family"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              >
                <option value="">All families</option>
                {(lookups.families ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {String(f.data.name)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by temperature"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              >
                <option value="">All temperatures</option>
                {["AMBIENT", "CHILLED", "FROZEN"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </>
          )}
          <button
            className="icon-button"
            aria-label="Refresh records"
            onClick={() => setVersion((x) => x + 1)}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {loading ? (
          <p className="empty-copy">Loading records…</p>
        ) : rows.length ? (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  {def.columns.map((k) => (
                    <th key={k}>{def.fields[k].label}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {def.columns.map((k) => (
                      <td key={k}>
                        {k === "allergenStatus" ? (
                          <span className="pill warning">
                            {display(k, row.data[k])}
                          </span>
                        ) : (
                          display(k, row.data[k])
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="actions">
                        <button
                          className="icon-button"
                          aria-label={`${writable ? "Edit" : "View"} ${String(row.data.name ?? row.data.code ?? row.id)}`}
                          onClick={() => edit(row)}
                        >
                          <Pencil size={15} />
                        </button>
                        {writable && (
                          <button
                            className="icon-button danger"
                            aria-label={`Delete ${String(row.data.name ?? row.data.code ?? row.id)}`}
                            onClick={() => setConfirmDelete(row)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-copy">
            <Database size={30} />
            <h3>
              {q || family || temperature
                ? "No matching records"
                : "No records yet"}
            </h3>
            <p>
              {q || family || temperature
                ? "Try a different search or filter."
                : "This master is intentionally empty. Add your own records when ready."}
            </p>
          </div>
        )}
      </section>
      {confirmDelete && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="panel dialog"
          >
            <h2 id="delete-title">Delete this {def.singular}?</h2>
            <p>
              This removes the record. Records used elsewhere cannot be deleted.
            </p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="primary danger-bg"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(
                      `/masters/${resource}/${confirmDelete.id}`,
                      companyId,
                      "DELETE",
                      { version: confirmDelete.version },
                    );
                    setConfirmDelete(null);
                    changed();
                  } catch (e) {
                    setError((e as Error).message);
                    setConfirmDelete(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete record
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
// The API is authoritative for permissions; only Quality receives supplier + allergen writes.
function companyRole(c: Contract) {
  return c.permissions.productAllergens?.write &&
    c.permissions.suppliers?.write &&
    !c.permissions.families?.write
    ? "quality"
    : "other";
}
function ImportPanel({
  resource,
  def,
  companyId,
  onDone,
}: {
  resource: string;
  def: Resource;
  companyId: string;
  onDone: () => void;
}) {
  const [file, setFile] = useState<{ format: string; content: string } | null>(
      null,
    ),
    [valid, setValid] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel import-panel">
      <h2>Import {def.label.toLowerCase()}</h2>
      <p>
        CSV or XLSX · up to 1,000 rows · validate before saving. Use field keys
        as column headers. Relationships use record IDs.
      </p>
      <p className="fine">Fields: {Object.keys(def.fields).join(", ")}</p>
      <div className="actions">
        <input
          aria-label="Import file"
          type="file"
          accept=".csv,.xlsx"
          onChange={async (e) => {
            setValid(false);
            setMessage("");
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 2_000_000) {
              setMessage("Maximum file size is 2 MB");
              return;
            }
            if (f.name.endsWith(".xlsx")) {
              const b = new Uint8Array(await f.arrayBuffer());
              let s = "";
              for (const byte of b) s += String.fromCharCode(byte);
              setFile({ format: "xlsx", content: btoa(s) });
            } else setFile({ format: "csv", content: await f.text() });
          }}
        />
        <button
          className="secondary"
          onClick={() => {
            const content = Object.keys(def.fields).join(",") + "\n";
            const u = URL.createObjectURL(
              new Blob([content], { type: "text/csv" }),
            );
            const a = document.createElement("a");
            a.href = u;
            a.download = resource + "-template.csv";
            a.click();
            URL.revokeObjectURL(u);
          }}
        >
          <Download size={15} />
          CSV headers
        </button>
        <button
          className="secondary"
          disabled={!file || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = await request<{ count: number }>(
                `/imports/${resource}`,
                companyId,
                "POST",
                { ...file, commit: false },
              );
              setValid(true);
              setMessage(`${d.count} rows passed validation. Ready to import.`);
            } catch (e) {
              setValid(false);
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Validate file
        </button>
        <button
          className="primary"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request(`/imports/${resource}`, companyId, "POST", {
                ...file,
                commit: true,
              });
              onDone();
            } catch (e) {
              setMessage((e as Error).message);
              setValid(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm import
        </button>
      </div>
      {message && (
        <p className="import-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
function Audit({ companyId }: { companyId: string }) {
  const [data, setData] = useState<
      Array<{
        id: string;
        action: string;
        resource: string;
        actor: string;
        at: string;
        before_data: unknown;
        after_data: unknown;
      }>
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    request<{ events: typeof data }>("/audit", companyId)
      .then((d) => setData(d.events))
      .catch((e) => setError(e.message));
  }, [companyId]);
  return (
    <>
      <Heading
        eyebrow="SYSTEM"
        title="Audit history"
        description="Latest 200 events for the active company. Changes are recorded by the API."
      />
      {error && <p role="alert">{error}</p>}
      <section className="panel table-responsive">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Resource</th>
              <th>Actor</th>
              <th>Time</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td>{e.action}</td>
                <td>{e.resource ?? "—"}</td>
                <td>{e.actor ?? "Catalog initialization"}</td>
                <td>{new Date(e.at).toLocaleString("en-GB")}</td>
                <td>
                  <details>
                    <summary>Details</summary>
                    <pre>
                      {JSON.stringify(
                        { before: e.before_data, after: e.after_data },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
function UserManagement({
  companyId,
  roles,
}: {
  companyId: string;
  roles: Record<string, string>;
}) {
  const [users, setUsers] = useState<
      Array<{ id: string; name: string; email: string; role: string }>
    >([]),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ users: typeof users }>("/users", companyId)
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));
  }, [companyId, version]);
  return (
    <>
      <Heading
        eyebrow="SYSTEM"
        title="Users and roles"
        description="Create real accounts with access to this company."
      />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <section className="panel table-responsive">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label={"Role for " + u.name}
                    value={u.role}
                    onChange={async (e) => {
                      try {
                        await request("/users/" + u.id, companyId, "PUT", {
                          role: e.target.value,
                        });
                        setVersion((x) => x + 1);
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {Object.entries(roles).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="mt">Add user</h2>
        <form
          className="master-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            try {
              await request(
                "/users",
                companyId,
                "POST",
                Object.fromEntries(new FormData(form)),
              );
              form.reset();
              setVersion((x) => x + 1);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="user-name">Name</label>
          <input id="user-name" name="name" required />
          <label htmlFor="user-email">Email</label>
          <input id="user-email" name="email" type="email" required />
          <label htmlFor="user-password">Initial password</label>
          <input
            id="user-password"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <label htmlFor="user-role">Role</label>
          <select id="user-role" name="role">
            {Object.entries(roles).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              Create user
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
function WorkspaceSettings({
  companyId,
  onUser,
}: {
  companyId: string;
  onUser: (u: Session) => void;
}) {
  const [settings, setSettings] = useState({
      confidenceThreshold: 0.85,
      dailyAiBudget: 10,
    }),
    [message, setMessage] = useState("");
  useEffect(() => {
    request<{ settings: typeof settings }>("/settings", companyId)
      .then((d) => setSettings(d.settings))
      .catch((e) => setMessage(e.message));
  }, [companyId]);
  return (
    <>
      <Heading
        eyebrow="SYSTEM"
        title="Workspace settings"
        description="Company configuration and future AI limits."
      />
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
      <section className="panel master-form">
        <h2>AI parameters</h2>
        <p>Stored for future workflows. No AI service is connected yet.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await request("/settings", companyId, "PUT", settings);
              setMessage("Settings saved.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label htmlFor="confidence">Review confidence threshold</label>
          <input
            id="confidence"
            type="number"
            min={0}
            max={1}
            step="0.01"
            value={settings.confidenceThreshold}
            onChange={(e) =>
              setSettings({
                ...settings,
                confidenceThreshold: Number(e.target.value),
              })
            }
          />
          <label htmlFor="budget">Daily AI budget (€)</label>
          <input
            id="budget"
            type="number"
            min={0}
            step="0.01"
            value={settings.dailyAiBudget}
            onChange={(e) =>
              setSettings({
                ...settings,
                dailyAiBudget: Number(e.target.value),
              })
            }
          />
          <div className="form-actions">
            <button className="primary">Save settings</button>
          </div>
        </form>
      </section>
      <Mfa />
      <section className="panel master-form mt">
        <h2>Add company</h2>
        <p>New companies start with empty master data.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            try {
              const d = await request<{ user: Session }>(
                "/companies",
                "",
                "POST",
                Object.fromEntries(new FormData(f)),
              );
              onUser(d.user);
              f.reset();
              setMessage("Company created. Select it in the workspace menu.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label htmlFor="company-name">Company name</label>
          <input id="company-name" name="name" maxLength={120} required />
          <div className="form-actions">
            <button className="primary">Create company</button>
          </div>
        </form>
      </section>
    </>
  );
}

function Mfa() {
  const [enabled, setEnabled] = useState(false),
    [secret, setSecret] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    request<{ enabled: boolean }>("/mfa")
      .then((d) => setEnabled(d.enabled))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <section className="panel master-form mt">
      <h2>Two-factor authentication</h2>
      <p>
        {enabled
          ? "Enabled for your account. A current authenticator code is required at sign-in."
          : "Protect your account with a time-based authenticator code."}
      </p>
      {!enabled && !secret && (
        <button
          className="secondary"
          onClick={async () => {
            try {
              const d = await request<{ secret: string }>(
                "/mfa/enroll",
                "",
                "POST",
              );
              setSecret(d.secret);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Set up authenticator
        </button>
      )}
      {!enabled && secret && (
        <>
          <p>
            Add a time-based account in your authenticator using this secret:
          </p>
          <code className="mfa-secret">{secret}</code>
          <p className="fine">
            SHA-1 · 6 digits · 30-second interval. Keep this secret private.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await request(
                  "/mfa/enable",
                  "",
                  "POST",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
                setEnabled(true);
                setSecret("");
                setMessage("Two-factor authentication enabled.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label htmlFor="mfa-code">Current authenticator code</label>
            <input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              maxLength={6}
            />
            <div className="form-actions">
              <button className="primary">Verify and enable</button>
            </div>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
