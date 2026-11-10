import { SemanticProducts } from "./SemanticProducts";
import { FoodWaste } from "./FoodWaste";
import { SupplierDocuments } from "./SupplierDocuments";
import { Menus } from "./Menus";
import { Orders } from "./Orders";
import { AllergenTags, ProductAllergens } from "./ProductAllergens";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  resolveRoute,
  routeURL,
  masterPaths,
  companyFromSearch,
} from "../application/routes";
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
import { localizeContract, enumEs } from "../application/locale";
import { request } from "../infrastructure/api";
import { emptyForm, payload } from "../application/forms";
const icons = [ShoppingBasket, Utensils, Building2, Sprout];
const labels: Record<string, string> = {
  menus: "Planificación de menús",
  documents: "Documentación de proveedores",
  waste: "Desperdicio alimentario",
  dashboard: "Resumen",
  audit: "Historial de cambios",
  users: "Usuarios y roles",
  settings: "Configuración",
  mainCategories: "Categorías principales",
  families: "Familias",
  products: "Productos",
  allergens: "Alérgenos",
  suppliers: "Proveedores",
  clients: "Clientes",
  centers: "Centros",
  diets: "Dietas",
  centerDiners: "Comensales por centro",
  productAllergens: "Alérgenos de productos",
};
export function App() {
  const location = useLocation(),
    routerNavigate = useNavigate();
  const route = resolveRoute(location.pathname),
    page = route.page;
  const [user, setUser] = useState<Session | null>(null),
    [setup, setSetup] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [companyId, setCompany] = useState(""),
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
              setCompany(
                companyFromSearch(window.location.search, user.companies),
              );
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
        if (live) setContract(localizeContract(c));
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
    setCompany(companyFromSearch(location.search, u.companies));
    setSetup(false);
    setError("");
  }
  function urlFor(next: string, id?: string) {
    return routeURL(
      next,
      id,
      companyId && companyId !== user?.companies[0]?.id ? companyId : undefined,
    );
  }
  function navigate(next: string, id?: string) {
    routerNavigate(urlFor(next, id));
    setError("");
  }
  useEffect(() => {
    if (user) setCompany(companyFromSearch(location.search, user.companies));
  }, [location.search, user]);
  if (loading) return <div className="loading">Conectando con Nexora…</div>;
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
        <Link className="brand" to={urlFor("dashboard")}>
          nexora<span>✳</span>
        </Link>
        <nav>
          <Link
            className={page === "dashboard" ? "active" : ""}
            to={urlFor("dashboard")}
            title="Resumen"
          >
            <LayoutDashboard size={19} />
            Resumen
          </Link>
          <span className="sidebar-label">MAESTROS</span>
          {Object.keys(contract?.resources ?? {})
            .filter(
              (r) => r !== "productAllergens" && contract?.permissions[r]?.read,
            )
            .map((r) => (
              <Link
                key={r}
                title={labels[r]}
                className={page === r ? "active" : ""}
                to={urlFor(r)}
              >
                {r === "products" ? (
                  <Package size={18} />
                ) : r === "families" ? (
                  <FolderTree size={18} />
                ) : (
                  <Database size={18} />
                )}
                <span>{labels[r]}</span>
              </Link>
            ))}
          <span className="sidebar-label">OPERACIONES</span>
          {operations.map((m, i) => {
            const Icon = icons[i];
            return (
              <Link
                title={m.name}
                key={m.id}
                className={page === m.id ? "active" : ""}
                to={urlFor(m.id)}
              >
                <Icon size={18} />
                <span>{m.name}</span>
              </Link>
            );
          })}
          {company?.role === "admin" && (
            <>
              <span className="sidebar-label">SISTEMA</span>
              <Link
                title="Usuarios y roles"
                className={page === "users" ? "active" : ""}
                to={urlFor("users")}
              >
                <Users size={18} />
                <span>Usuarios y roles</span>
              </Link>
              <Link
                title="Historial de cambios"
                className={page === "audit" ? "active" : ""}
                to={urlFor("audit")}
              >
                <History size={18} />
                <span>Historial de cambios</span>
              </Link>
              <Link
                title="Configuración"
                className={page === "settings" ? "active" : ""}
                to={urlFor("settings")}
              >
                <Settings size={18} />
                <span>Configuración</span>
              </Link>
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
            aria-label="Cerrar sesión"
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
            Espacio de trabajo <span>/</span> {labels[page] ?? page}
          </div>
          <label className="company">
            <Building2 size={17} />
            <span className="sr-only">Empresa activa</span>
            <select
              value={companyId}
              onChange={(e) => {
                setCompany(e.target.value);
                routerNavigate(
                  routeURL(
                    "dashboard",
                    undefined,
                    e.target.value === user.companies[0]?.id
                      ? undefined
                      : e.target.value,
                  ),
                );
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
            Entorno local · Supabase
          </span>
        </header>
        <main>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {!contract ? (
            <p>Cargando espacio de trabajo…</p>
          ) : (
            <div key={companyId + ":" + page}>
              {page === "notFound" ? (
                <RouteNotice
                  title="Página no encontrada"
                  message="La dirección no corresponde a ninguna página del backoffice."
                  onBack={() => navigate("dashboard")}
                />
              ) : (masterPaths[page] && !contract.resources[page]) ||
                (["audit", "users", "settings"].includes(page) &&
                  company?.role !== "admin") ? (
                <RouteNotice
                  title="Acceso restringido"
                  message="No tienes permisos para acceder a esta sección."
                  onBack={() => navigate("dashboard")}
                />
              ) : page === "dashboard" ? (
                <Overview
                  company={company?.name ?? ""}
                  companyId={companyId}
                  contract={contract}
                  navigate={navigate}
                  refresh={refresh}
                />
              ) : page === "orders" ? (
                <Orders
                  key={companyId}
                  companyId={companyId}
                  section={route.section}
                  recordId={route.recordId}
                  isNew={route.isNew}
                  permissions={
                    contract.orderPermissions ?? { read: false, write: false }
                  }
                />
              ) : page === "menus" ? (
                <Menus
                  companyId={companyId}
                  section={route.section}
                  recordId={route.recordId}
                  isNew={route.isNew}
                  permissions={
                    contract.menuPermissions ?? {
                      read: false,
                      write: false,
                      nutrition: false,
                      quality: false,
                    }
                  }
                />
              ) : page === "documents" ? (
                <SupplierDocuments
                  companyId={companyId}
                  recordId={route.recordId}
                  isNew={route.isNew}
                  permissions={
                    contract.documentPermissions ?? {
                      read: false,
                      write: false,
                      quality: false,
                    }
                  }
                />
              ) : page === "waste" ? (
                <FoodWaste
                  companyId={companyId}
                  section={route.section}
                  recordId={route.recordId}
                  isNew={route.isNew}
                  permissions={
                    contract.wastePermissions ?? {
                      read: false,
                      write: false,
                      quality: false,
                    }
                  }
                />
              ) : contract.resources[page] ? (
                <Master
                  resource={page}
                  recordId={route.recordId}
                  createNew={route.isNew}
                  onNavigate={(id) => navigate(page, id)}
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
                    eyebrow="OPERACIONES"
                    title={operations.find((x) => x.id === page)?.name ?? page}
                    description={
                      operations.find((x) => x.id === page)?.description ?? ""
                    }
                  />
                  <section className="empty panel">
                    <ShieldCheck size={38} />
                    <span className="pill">
                      {operations.find((x) => x.id === page)?.phase} · PREVISTO
                    </span>
                    <h2>Preparado para la siguiente fase.</h2>
                    <p>
                      Los flujos operativos y las propuestas de IA estarán
                      disponibles en las próximas fases. Empieza por los
                      maestros.
                    </p>
                    <button
                      className="primary"
                      onClick={() => navigate("products")}
                    >
                      Ver productos <ArrowRight size={17} />
                    </button>
                  </section>
                </div>
              )}
            </div>
          )}
          <footer>
            Nexora Backoffice{" "}
            <span>
              Espacio privado · PostgreSQL en Supabase · Flujos de IA pendientes
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
          <span className="eyebrow">TUS OPERACIONES, CONECTADAS</span>
          <h1>
            Más claridad.
            <br />
            Mejores decisiones.
          </h1>
          <p>
            Tu equipo, tus datos y tus operaciones.
            <br />
            Un espacio privado para trabajar mejor.
          </p>
          <div className="story-line">
            <ShieldCheck size={20} /> La IA propone. Tu equipo decide.
          </div>
        </div>
        <small>BACKOFFICE PRIVADO · HORECA Y COLECTIVIDADES</small>
      </section>
      <section className="login-form">
        <div>
          <span className="pill">ENTORNO LOCAL · SUPABASE</span>
          <h2>
            {setup ? "Configura tu espacio de trabajo" : "Bienvenido a Nexora"}
          </h2>
          <p>
            {setup
              ? "Crea la primera cuenta de administración. No hay usuarios de ejemplo."
              : "Accede con tu cuenta de trabajo."}
          </p>
          {error && (
            <div className="alert" role="alert">
              {error}{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => window.location.reload()}
              >
                Reintentar conexión
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {setup && (
              <>
                <label htmlFor="name">Nombre completo</label>
                <input
                  id="name"
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
                <label htmlFor="companyName">Nombre de la empresa</label>
                <input
                  id="companyName"
                  name="companyName"
                  required
                  maxLength={120}
                />
              </>
            )}
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
            <label htmlFor="password">Contraseña</label>
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
                Usa al menos 12 caracteres. Esta cuenta administrará el espacio
                privado.
              </p>
            )}
            {!setup && (
              <>
                <label htmlFor="login-code">
                  Código de autenticación (si está activado)
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
              {busy
                ? "Un momento…"
                : setup
                  ? "Crear espacio de trabajo"
                  : "Entrar"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="fine">
            {setup
              ? "El espacio de demostración utiliza datos ficticios. Crea tu cuenta para gestionar el catálogo y los maestros de la empresa."
              : "El acceso se gestiona mediante el servicio local."}
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
        eyebrow="TU OPERATIVA, EN PERSPECTIVA"
        title="Todo empieza aquí."
        description={`Bienvenido al espacio de ${company}.`}
      />
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <section className="welcome">
        <div>
          <span className="pill">CIMIENTOS Y MAESTROS</span>
          <h2>
            Una base sólida.
            <br />
            Tus datos, conectados.
          </h2>
          <p>
            Gestiona tu catálogo y tus datos de negocio en un espacio privado.
            <br />
            Los cambios se guardan en la base de datos y quedan registrados en
            el historial.
          </p>
          <button onClick={() => navigate("products")}>
            Explorar catálogo <ArrowRight size={18} />
          </button>
        </div>
        <div className="abstract" aria-hidden="true">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <Database size={65} />
        </div>
      </section>
      <div className="section-heading">
        <h2>Maestros</h2>
        <span>Tu empresa activa</span>
      </div>
      <div className="row g-3">
        {Object.keys(contract.resources)
          .filter((r) => r !== "productAllergens")
          .map((r) => (
            <div className="col-12 col-md-6 col-xl-3" key={r}>
              <button className="stat-card" onClick={() => navigate(r)}>
                <span>{labels[r]}</span>
                <strong>{counts[r] ?? "—"}</strong>
                <span className="card-link">
                  Gestionar registros <ArrowRight size={16} />
                </span>
              </button>
            </div>
          ))}
      </div>
      <div className="section-heading mt">
        <h2>Próximas operaciones</h2>
        <span>Aprobación humana en cada paso crítico</span>
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
                <span className="module-phase">
                  {m.phase} ·{" "}
                  {["orders", "menus", "documents", "waste"].includes(m.id)
                    ? "Disponible"
                    : "Previsto"}
                </span>
                <h3>{m.name}</h3>
                <p>{m.description}</p>
                <span className="card-link">
                  Ver módulo <ArrowRight size={16} />
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
  recordId,
  createNew,
  onNavigate,
  resource,
  def,
  contract,
  companyId,
  writable,
  onChanged,
}: {
  recordId?: string;
  createNew: boolean;
  onNavigate: (id?: string) => void;
  resource: string;
  def: Resource;
  contract: Contract;
  companyId: string;
  writable: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]),
    [lookups, setLookups] = useState<Record<string, RecordRow[]>>({}),
    [lookupsLoading, setLookupsLoading] = useState(true),
    [lookupsFailed, setLookupsFailed] = useState(false),
    [q, setQ] = useState(""),
    [semantic, setSemantic] = useState(false),
    [family, setFamily] = useState(""),
    [temperature, setTemperature] = useState(""),
    [editing, setEditing] = useState<RecordRow | null | undefined>(undefined),
    [form, setForm] = useState<Record<string, unknown>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [confirmDelete, setConfirmDelete] = useState<RecordRow | null>(null),
    [showImport, setShowImport] = useState(false),
    [version, setVersion] = useState(0),
    [detailLoading, setDetailLoading] = useState(!!recordId),
    [detailError, setDetailError] = useState(""),
    [saveNotice, setSaveNotice] = useState("");
  useEffect(() => {
    let live = true;
    setDetailError("");
    setSaveNotice("");
    setError("");
    if (createNew) {
      setDetailLoading(false);
      openForm(null);
      return;
    }
    if (!recordId) {
      setDetailLoading(false);
      setEditing(undefined);
      return;
    }
    setDetailLoading(true);
    setEditing(undefined);
    request<{ record: RecordRow }>(
      `/masters/${resource}/${encodeURIComponent(recordId)}`,
      companyId,
    )
      .then((d) => {
        if (live) openForm(d.record);
      })
      .catch((e) => {
        if (live) setDetailError(e.message);
      })
      .finally(() => {
        if (live) setDetailLoading(false);
      });
    return () => {
      live = false;
    };
  }, [recordId, createNew, resource, companyId, def]);
  useEffect(() => {
    let live = true;
    if (semantic && resource === "products") return;
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
  }, [resource, companyId, q, family, temperature, version, semantic]);
  useEffect(() => {
    let live = true;
    setLookupsLoading(true);
    setLookupsFailed(false);
    const needed = [
      ...new Set(
        [
          ...Object.values(def.fields).map((f) => f.resource),
          ...(resource === "products" ? ["productAllergens", "allergens"] : []),
        ].filter((x): x is string => !!x && !!contract.permissions[x]?.read),
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
        if (live) {
          setError(e.message);
          setLookupsFailed(true);
        }
      })
      .finally(() => {
        if (live) setLookupsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [companyId, def, contract, version]);
  function edit(row: RecordRow | null) {
    onNavigate(row?.id ?? "new");
  }
  function openForm(row: RecordRow | null) {
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
      const result = await request<{ record: RecordRow }>(
        `/masters/${resource}${editing ? "/" + editing.id : ""}`,
        companyId,
        editing ? "PUT" : "POST",
        {
          data: payload(def, form),
          ...(editing ? { version: editing.version } : {}),
        },
      );
      changed();
      if (resource === "products") {
        if (editing) {
          openForm(result.record);
          setSaveNotice("Datos generales del producto guardados.");
        } else onNavigate(result.record.id);
      } else onNavigate();
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
          (value ? "Registro relacionado" : "—"),
      );
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (key === "price" && typeof value === "number")
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(value);
    return value === null || value === undefined
      ? "—"
      : Array.isArray(value)
        ? value.join(", ")
        : f.options
          ? enumEs(String(value))
          : String(value);
  }
  if (detailLoading) return <p role="status">Cargando registro…</p>;
  if (detailError)
    return (
      <RouteNotice
        title="No se puede abrir el registro"
        message={detailError}
        onBack={() => onNavigate()}
      />
    );
  if (createNew && !writable)
    return (
      <RouteNotice
        title="Acceso restringido"
        message="No tienes permisos para crear registros."
        onBack={() => onNavigate()}
      />
    );
  if (editing !== undefined)
    return (
      <>
        <Heading
          eyebrow="MAESTROS"
          title={
            resource === "products" && editing
              ? String(editing.data.name)
              : editing
                ? `Editar registro de ${def.singular}`
                : `Nuevo registro de ${def.singular}`
          }
          description={
            resource === "products"
              ? writable
                ? "Ficha del producto: consulta o edita sus datos y gestiona sus alérgenos."
                : "Ficha del producto en modo de consulta."
              : resource === "mainCategories"
                ? "Es el nivel más alto del catálogo. No tiene categorías superiores."
                : resource === "families"
                  ? "Vincula la familia a una categoría principal."
                  : "Los cambios se validarán y guardarán en la empresa activa."
          }
        >
          <button className="secondary" onClick={() => onNavigate()}>
            <ArrowLeft size={16} />
            Volver al listado
          </button>
        </Heading>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {saveNotice && <p role="status">{saveNotice}</p>}
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
                      Seleccionar…
                    </option>
                    {f.resource
                      ? (lookups[f.resource] ?? []).map((row) => (
                          <option key={row.id} value={row.id}>
                            {String(row.data.name ?? row.data.code ?? row.id)}
                          </option>
                        ))
                      : f.options?.map((v) => (
                          <option key={v} value={v}>
                            {enumEs(v)}
                          </option>
                        ))}
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
              Los ingredientes y los alérgenos de los productos de ejemplo no
              están validados. Su validación corresponde al rol de Calidad.
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => onNavigate()}
            >
              Cancelar
            </button>
            {writable && (
              <button className="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar registro"}
              </button>
            )}
          </div>
        </form>
        {resource === "products" &&
          (editing ? (
            contract.permissions.productAllergens?.read ? (
              <ProductAllergens
                key={editing.id}
                productId={editing.id}
                companyId={companyId}
                writable={!!contract.permissions.productAllergens?.write}
                canValidate={companyRole(contract) === "quality"}
                onChanged={changed}
              />
            ) : (
              <p>No tienes permisos para consultar los alérgenos.</p>
            )
          ) : (
            <section className="panel product-allergens">
              <h2>Alérgenos del producto</h2>
              <p>
                Guarda primero el producto para añadir sus alérgenos en esta
                misma ficha.
              </p>
            </section>
          ))}
      </>
    );
  return (
    <>
      <Heading
        eyebrow="MAESTROS"
        title={def.label}
        description={`${rows.length} ${loading ? "cargando…" : "registros"} · ${writable ? "Gestiona los registros de tu empresa." : "Acceso de solo lectura."}`}
      >
        <div className="actions">
          {writable && (
            <>
              <button
                className="secondary"
                onClick={() => setShowImport((x) => !x)}
              >
                <Upload size={15} />
                Importar
              </button>
              <button className="primary" onClick={() => edit(null)}>
                <Plus size={17} />
                Añadir registro de {def.singular}
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
      {resource === "products" && (
        <div className="actions mt">
          <button
            className="secondary"
            aria-pressed={semantic}
            onClick={() => {
              setSemantic((x) => !x);
              setRows([]);
              setError("");
            }}
          >
            {semantic
              ? "Volver a búsqueda por texto"
              : "Buscar por significado con IA"}
          </button>
        </div>
      )}
      {resource === "products" && semantic && (
        <SemanticProducts
          key={version}
          companyId={companyId}
          familyId={family}
          temperature={temperature}
          canIndex={writable}
          onResults={setRows}
          onLoading={setLoading}
        />
      )}
      <section className="panel list-panel">
        <div className="list-toolbar">
          <label className="search">
            <Search size={17} />
            <span className="sr-only">Buscar {def.label}</span>
            <input
              value={q}
              disabled={semantic && resource === "products"}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Buscar ${def.label.toLowerCase()}…`}
            />
          </label>
          {resource === "products" && (
            <>
              <select
                aria-label="Filtrar por familia"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              >
                <option value="">Todas las familias</option>
                {(lookups.families ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {String(f.data.name)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por temperatura"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              >
                <option value="">Todas las temperaturas</option>
                {["AMBIENT", "CHILLED", "FROZEN"].map((t) => (
                  <option key={t} value={t}>
                    {enumEs(t)}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            className="icon-button"
            aria-label="Actualizar registros"
            onClick={() => setVersion((x) => x + 1)}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {loading ? (
          <p className="empty-copy">Cargando registros…</p>
        ) : rows.length ? (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  {def.columns.map((k) => (
                    <th key={k}>{def.fields[k].label}</th>
                  ))}
                  {resource === "products" && semantic && (
                    <th title="Similitud coseno; no es una probabilidad ni una validación sanitaria">
                      Similitud
                    </th>
                  )}
                  {resource === "products" && <th>Alérgenos</th>}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {def.columns.map((k) => (
                      <td key={k}>
                        {resource === "products" && k === "name" ? (
                          <Link
                            className="record-link"
                            to={routeURL("products", row.id, companyId)}
                          >
                            {display(k, row.data[k])}
                          </Link>
                        ) : k === "allergenStatus" ? (
                          <span className="pill warning">
                            {display(k, row.data[k])}
                          </span>
                        ) : (
                          display(k, row.data[k])
                        )}
                      </td>
                    ))}
                    {resource === "products" && semantic && (
                      <td>
                        {typeof (row as RecordRow & { score?: number })
                          .score === "number"
                          ? (
                              row as RecordRow & { score: number }
                            ).score.toFixed(3)
                          : "—"}
                      </td>
                    )}
                    {resource === "products" && (
                      <td className="allergen-cell">
                        <AllergenTags
                          productId={row.id}
                          links={lookups.productAllergens ?? []}
                          allergens={lookups.allergens ?? []}
                          loading={lookupsLoading}
                          error={
                            lookupsFailed ||
                            !contract.permissions.productAllergens?.read
                          }
                        />
                      </td>
                    )}
                    <td>
                      <div className="actions">
                        <button
                          className="icon-button"
                          aria-label={`${writable ? "Editar" : "Ver"} ${String(row.data.name ?? row.data.code ?? row.id)}`}
                          onClick={() => edit(row)}
                        >
                          <Pencil size={15} />
                        </button>
                        {writable && (
                          <button
                            className="icon-button danger"
                            aria-label={`Eliminar ${String(row.data.name ?? row.data.code ?? row.id)}`}
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
                ? "No hay coincidencias"
                : "Todavía no hay registros"}
            </h3>
            <p>
              {q || family || temperature
                ? "Prueba con otra búsqueda o filtro."
                : "Este maestro está vacío. Añade tus propios registros cuando lo necesites."}
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
            <h2 id="delete-title">
              ¿Eliminar este registro de {def.singular}?
            </h2>
            <p>
              Se eliminará el registro. Los registros utilizados por otros datos
              no se pueden eliminar.
            </p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Cancelar
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
                Eliminar registro
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
      <h2>Importar {def.label.toLowerCase()}</h2>
      <p>
        CSV o XLSX · hasta 1.000 filas · valida antes de guardar. Usa las claves
        de los campos como cabeceras y los identificadores para las relaciones.
      </p>
      <p className="fine">Campos: {Object.keys(def.fields).join(", ")}</p>
      <div className="actions">
        <input
          aria-label="Archivo de importación"
          type="file"
          accept=".csv,.xlsx"
          onChange={async (e) => {
            setValid(false);
            setMessage("");
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 2_000_000) {
              setMessage("El archivo no puede superar los 2 MB");
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
          Cabeceras CSV
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
              setMessage(
                `${d.count} filas han superado la validación. Puedes confirmar la importación.`,
              );
            } catch (e) {
              setValid(false);
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Validar archivo
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
          Confirmar importación
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
        eyebrow="SISTEMA"
        title="Historial de cambios"
        description="Últimos 200 eventos de la empresa activa. Los cambios quedan registrados por el servicio."
      />
      {error && <p role="alert">{error}</p>}
      <section className="panel table-responsive">
        <table>
          <thead>
            <tr>
              <th>Acción</th>
              <th>Recurso</th>
              <th>Usuario</th>
              <th>Fecha</th>
              <th>Cambios</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td>{enumEs(e.action)}</td>
                <td>{labels[e.resource] ?? e.resource ?? "—"}</td>
                <td>{e.actor ?? "Carga inicial del catálogo"}</td>
                <td>{new Date(e.at).toLocaleString("es-ES")}</td>
                <td>
                  <details>
                    <summary>Detalles</summary>
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
        eyebrow="SISTEMA"
        title="Usuarios y roles"
        description="Crea cuentas con acceso a esta empresa."
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
              <th>Nombre</th>
              <th>Correo electrónico</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label={"Rol de " + u.name}
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
        <h2 className="mt">Añadir usuario</h2>
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
          <label htmlFor="user-name">Nombre</label>
          <input id="user-name" name="name" required />
          <label htmlFor="user-email">Correo electrónico</label>
          <input id="user-email" name="email" type="email" required />
          <label htmlFor="user-password">Contraseña inicial</label>
          <input
            id="user-password"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
          <label htmlFor="user-role">Rol</label>
          <select id="user-role" name="role">
            {Object.entries(roles).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              Crear usuario
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
        eyebrow="SISTEMA"
        title="Configuración del espacio"
        description="Configuración de la empresa y límites para los futuros servicios de IA."
      />
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
      <section className="panel master-form">
        <h2>Parámetros de IA</h2>
        <p>
          Se guardarán para los próximos flujos. Todavía no hay servicios de IA
          conectados.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await request("/settings", companyId, "PUT", settings);
              setMessage("Configuración guardada.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label htmlFor="confidence">Umbral de confianza para revisión</label>
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
          <label htmlFor="budget">Presupuesto diario de IA (€)</label>
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
            <button className="primary">Guardar configuración</button>
          </div>
        </form>
      </section>
      <Mfa />
      <section className="panel master-form mt">
        <h2>Añadir empresa</h2>
        <p>Las nuevas empresas empiezan con los maestros vacíos.</p>
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
              setMessage(
                "Empresa creada. Selecciónala en el menú de empresas.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label htmlFor="company-name">Nombre de la empresa</label>
          <input id="company-name" name="name" maxLength={120} required />
          <div className="form-actions">
            <button className="primary">Crear empresa</button>
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
      <h2>Autenticación de dos factores</h2>
      <p>
        {enabled
          ? "Activada para tu cuenta. Necesitarás un código de tu aplicación de autenticación para entrar."
          : "Protege tu cuenta con códigos de una aplicación de autenticación."}
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
          Configurar autenticador
        </button>
      )}
      {!enabled && secret && (
        <>
          <p>
            Añade una cuenta basada en tiempo en tu aplicación de autenticación
            con esta clave:
          </p>
          <code className="mfa-secret">{secret}</code>
          <p className="fine">
            SHA-1 · 6 dígitos · intervalo de 30 segundos. Mantén esta clave en
            privado.
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
                setMessage("Autenticación de dos factores activada.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label htmlFor="mfa-code">Código actual del autenticador</label>
            <input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              maxLength={6}
            />
            <div className="form-actions">
              <button className="primary">Verificar y activar</button>
            </div>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function RouteNotice({
  title,
  message,
  onBack,
}: {
  title: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <section className="panel empty">
      <h1>{title}</h1>
      <p>{message}</p>
      <button className="primary" onClick={onBack}>
        Volver al listado o resumen
      </button>
    </section>
  );
}
