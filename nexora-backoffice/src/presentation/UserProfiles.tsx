import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Pencil, Trash2, Mail } from "lucide-react";
import { request } from "../infrastructure/api";
import { useDataRefresh } from "../infrastructure/useDataRefresh";
import type { Session } from "../domain/core";
import { routeURL } from "../application/routes";
import { useToasts } from "./Toasts";
import { RecordTime } from "./RecordDates";
import { DataTable, useResetTablePage } from "./DataTable";
export interface AvatarUpload {
  filename: string;
  mime: string;
  base64: string;
}
interface ProfileData {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  avatar?: AvatarUpload | null;
}
export interface ManagedUser extends Omit<ProfileData, "avatar"> {
  id: string;
  role: string;
  profileVersion: number;
  accessVersion: number;
  pendingActivation: boolean;
  canEditProfile: boolean;
  avatarUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
interface Invitation {
  activationPath: string;
  expiresAt: string;
}
export function UserAvatar({
  name,
  src,
}: {
  name: string;
  src?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="avatar user-avatar">
      {src && !failed ? (
        <img
          src={src}
          alt={"Avatar de " + name}
          onError={() => setFailed(true)}
        />
      ) : (
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((s) => s[0] ?? "")
          .join("")
          .toUpperCase() || "?"
      )}
    </span>
  );
}
function AvatarField({
  name,
  src,
  value,
  onChange,
  onError,
  onReading,
  disabled,
}: {
  name: string;
  src?: string | null;
  value?: AvatarUpload | null;
  onChange: (v: AvatarUpload | null) => void;
  onError: (s: string) => void;
  onReading: (busy: boolean) => void;
  disabled: boolean;
}) {
  const seq = useRef(0);
  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );
  async function choose(file?: File) {
    if (!file) return;
    const n = ++seq.current;
    if (file.size > 1_000_000) {
      onError("La imagen supera el máximo de 1 MB.");
      return;
    }
    if (!file.size) {
      onError("La imagen está vacía.");
      return;
    }
    if (
      !/\.(jpe?g|png|webp)$/i.test(file.name) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      onError("El avatar solo puede ser de tipo JPG, PNG o WEBP.");
      return;
    }
    onReading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("No se ha podido leer la imagen."));
        reader.readAsDataURL(file);
      });
      if (seq.current === n)
        onChange({ filename: file.name, mime: file.type, base64 });
    } catch (e) {
      if (seq.current === n) onError((e as Error).message);
    } finally {
      if (seq.current === n) onReading(false);
    }
  }
  const preview = value
    ? `data:${value.mime};base64,${value.base64}`
    : value === null
      ? null
      : src;
  return (
    <div className="avatar-editor">
      <UserAvatar name={name} src={preview} />
      <label>
        Avatar (máximo 1 MB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={disabled || !preview}
        onClick={() => {
          seq.current++;
          onChange(null);
        }}
      >
        Quitar avatar
      </button>
    </div>
  );
}
function ProfileFields({
  data,
  onChange,
  disabled,
  emailReadOnly = false,
}: {
  data: ProfileData;
  onChange: (d: ProfileData) => void;
  disabled: boolean;
  emailReadOnly?: boolean;
}) {
  return (
    <div className="profile-fields">
      <label>
        Nombre
        <input
          required
          maxLength={120}
          value={data.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
        />
      </label>
      <label>
        Correo electrónico
        <input
          type="email"
          required
          maxLength={254}
          value={data.email}
          disabled={disabled}
          readOnly={emailReadOnly}
          onChange={(e) => onChange({ ...data, email: e.target.value })}
        />
      </label>
      <label>
        Teléfono
        <input
          type="tel"
          maxLength={40}
          value={data.phone}
          disabled={disabled}
          onChange={(e) => onChange({ ...data, phone: e.target.value })}
        />
      </label>
      <label>
        Cargo
        <input
          maxLength={120}
          value={data.jobTitle}
          disabled={disabled}
          onChange={(e) => onChange({ ...data, jobTitle: e.target.value })}
        />
      </label>
    </div>
  );
}
function Dates({
  createdAt,
  updatedAt,
}: {
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  return (
    <p className="fine">
      Creación: <RecordTime value={createdAt ?? ""} /> · Última edición:{" "}
      <RecordTime value={updatedAt ?? ""} />
    </p>
  );
}
export function UserManagement({
  companyId,
  roles,
  selfId,
}: {
  companyId: string;
  roles: Record<string, string>;
  selfId: string;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{
      user: ManagedUser | null;
      data: ProfileData;
      role: string;
    } | null>(null),
    [remove, setRemove] = useState<ManagedUser | null>(null),
    [invitation, setInvitation] = useState<Invitation | null>(null);
  const { notify, toasts } = useToasts();
  const blocked = busy || !!editor || !!remove;
  const refresh = useDataRefresh(companyId, !blocked);
  useResetTablePage(search);
  useEffect(() => {
    if (blocked) return;
    let live = true;
    request<{ users: ManagedUser[] }>("/users", companyId)
      .then((r) => {
        if (live) {
          setUsers(r.users);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [companyId, reload, refresh, blocked]);
  const filtered = users.filter((u) =>
    (
      u.name +
      " " +
      u.email +
      " " +
      u.phone +
      " " +
      u.jobTitle +
      " " +
      roles[u.role]
    )
      .toLocaleLowerCase("es")
      .includes(search.toLocaleLowerCase("es")),
  );
  async function save() {
    if (!editor || busy) return;
    setBusy(true);
    try {
      if (editor.user) {
        const body = {
          role: editor.role,
          accessVersion: editor.user.accessVersion,
          ...(editor.user.canEditProfile
            ? {
                profile: {
                  version: editor.user.profileVersion,
                  data: editor.data,
                },
              }
            : {}),
        };
        await request("/users/" + editor.user.id, companyId, "PUT", body);
      } else {
        const result = await request<Invitation>("/users", companyId, "POST", {
          profile: editor.data,
          role: editor.role,
        });
        setInvitation(result);
      }
      setEditor(null);
      setReload((n) => n + 1);
      notify("Usuario guardado.", false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteUser() {
    if (!remove || busy) return;
    setBusy(true);
    try {
      await request("/users/" + remove.id, companyId, "DELETE", {
        accessVersion: remove.accessVersion,
      });
      setRemove(null);
      setReload((n) => n + 1);
      notify("Se ha eliminado el acceso del usuario a esta empresa.", false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reissue(u: ManagedUser) {
    setBusy(true);
    try {
      const r = await request<Invitation>(
        "/users/" + u.id + "/invitation",
        companyId,
        "POST",
        { accessVersion: u.accessVersion },
      );
      setInvitation(r);
      notify("Se ha generado un nuevo enlace de activación.", false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {toasts}
      <div className="page-heading">
        <div>
          <p className="eyebrow">SISTEMA</p>
          <h1>Usuarios y roles</h1>
          <p>
            Gestiona los perfiles y el acceso a la empresa activa. Cada usuario
            gestiona su contraseña desde Mi perfil.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={blocked}
          onClick={() =>
            setEditor({
              user: null,
              data: { name: "", email: "", phone: "", jobTitle: "" },
              role: "read_only",
            })
          }
        >
          Añadir usuario
        </button>
      </div>
      {error && (
        <p role="alert">
          {error}
          <button
            type="button"
            disabled={blocked}
            onClick={() => setReload((n) => n + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {invitation && (
        <section
          className="panel profile-panel"
          aria-label="Enlace de activación"
        >
          <h2>Activación de la cuenta</h2>
          <p>
            Comparte este enlace con el usuario para que elija su contraseña. Es
            de un solo uso y caduca en 24 horas. No se ha enviado ningún correo.
          </p>
          <input
            aria-label="Enlace de activación"
            readOnly
            value={
              new URL(invitation.activationPath, window.location.origin).href
            }
          />
          <p>
            Caduca: <RecordTime value={invitation.expiresAt} />
          </p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(invitation.activationPath, window.location.origin)
                      .href,
                  );
                  notify("Enlace copiado.", false);
                } catch {
                  notify(
                    "No se ha podido copiar. Selecciona el enlace y cópialo manualmente.",
                  );
                }
              }}
            >
              Copiar enlace
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setInvitation(null)}
            >
              Cerrar
            </button>
          </div>
        </section>
      )}
      {editor && (
        <form
          className="panel profile-panel"
          aria-label="Editar usuario"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{editor.user ? "Editar usuario" : "Nuevo usuario"}</h2>
          <fieldset disabled={busy}>
            <ProfileFields
              data={editor.data}
              onChange={(data) => setEditor({ ...editor, data })}
              disabled={busy || (!!editor.user && !editor.user.canEditProfile)}
            />
            {(!editor.user || editor.user.canEditProfile) && (
              <AvatarField
                name={editor.data.name}
                src={editor.user?.avatarUrl}
                value={editor.data.avatar}
                disabled={busy}
                onError={notify}
                onReading={setBusy}
                onChange={(avatar) =>
                  setEditor({ ...editor, data: { ...editor.data, avatar } })
                }
              />
            )}
            {editor.user && !editor.user.canEditProfile && (
              <p>
                Este perfil está compartido con empresas que no administras.
                Aquí puedes cambiar su rol en esta empresa; sus datos personales
                debe editarlos el propio usuario desde Mi perfil.
              </p>
            )}
            <label>
              Rol
              <select
                value={editor.role}
                onChange={(e) => setEditor({ ...editor, role: e.target.value })}
              >
                {Object.entries(roles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              La contraseña solo puede cambiarla el titular.{" "}
              {editor.user
                ? "No se modifica desde esta pantalla."
                : "Al guardar se generará un enlace para que active su cuenta."}
            </p>
            <div className="actions">
              <button type="submit" className="primary">
                Guardar usuario
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(null)}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
          {editor.user && <Dates {...editor.user} />}
        </form>
      )}
      {remove && (
        <section
          className="panel profile-panel"
          role="alertdialog"
          aria-label="Eliminar usuario"
        >
          <h2>Eliminar a {remove.name}</h2>
          <p>
            Se retirará su acceso a esta empresa. Se conservará su historial de
            actividad y sus accesos a otras empresas. Esta acción no elimina
            pedidos ni documentos.
          </p>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={deleteUser}
            >
              Confirmar eliminación
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      <section className="panel profile-panel">
        <input
          aria-label="Buscar usuarios"
          placeholder="Buscar usuarios…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <DataTable id="users" primary filterKey={search}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo electrónico</th>
              <th>Teléfono</th>
              <th>Cargo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creación</th>
              <th>Última edición</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td data-sort-value={u.name}>
                  <div className="user-name">
                    <UserAvatar name={u.name} src={u.avatarUrl} />
                    {u.name}
                  </div>
                </td>
                <td>{u.email}</td>
                <td>{u.phone || "—"}</td>
                <td>{u.jobTitle || "—"}</td>
                <td>{roles[u.role] ?? u.role}</td>
                <td>
                  {u.pendingActivation ? "Pendiente de activación" : "Activo"}
                </td>
                <td data-sort-value={u.createdAt}>
                  <RecordTime value={u.createdAt ?? ""} />
                </td>
                <td data-sort-value={u.updatedAt}>
                  <RecordTime value={u.updatedAt ?? ""} />
                </td>
                <td>
                  {u.id === selfId ? (
                    <Link to={routeURL("profile", undefined, companyId)}>
                      Mi perfil
                    </Link>
                  ) : (
                    <div className="actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"Editar a " + u.name}
                        disabled={blocked}
                        onClick={() =>
                          setEditor({
                            user: u,
                            data: {
                              name: u.name,
                              email: u.email,
                              phone: u.phone,
                              jobTitle: u.jobTitle,
                            },
                            role: u.role,
                          })
                        }
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"Eliminar a " + u.name}
                        disabled={blocked}
                        onClick={() => setRemove(u)}
                      >
                        <Trash2 size={16} />
                      </button>
                      {u.pendingActivation && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={"Renovar activación de " + u.name}
                          disabled={blocked}
                          onClick={() => void reissue(u)}
                        >
                          <Mail size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {!filtered.length && (
          <p>No hay usuarios que coincidan con la búsqueda.</p>
        )}
      </section>
    </>
  );
}
export function SelfProfile({
  onUser,
  security,
}: {
  onUser: (u: Session) => void;
  security?: ReactNode;
}) {
  const [user, setUser] = useState<Session | null>(null),
    [data, setData] = useState<ProfileData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [reload, setReload] = useState(0);
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [code, setCode] = useState("");
  const { notify, toasts } = useToasts();
  useEffect(() => {
    let live = true;
    setBusy(true);
    request<{ user: Session }>("/profile")
      .then((r) => {
        if (live) {
          setUser(r.user);
          setData({
            name: r.user.name,
            email: r.user.email,
            phone: r.user.phone ?? "",
            jobTitle: r.user.jobTitle ?? "",
          });
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [reload]);
  function update(u: Session) {
    setUser(u);
    setData({
      name: u.name,
      email: u.email,
      phone: u.phone ?? "",
      jobTitle: u.jobTitle ?? "",
    });
    setDirty(false);
    onUser(u);
  }
  return (
    <>
      {toasts}
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUENTA</p>
          <h1>Mi perfil</h1>
          <p>
            Gestiona tus datos personales, tu avatar y tu contraseña. El perfil
            es común a tus empresas.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={() => setReload((n) => n + 1)}
          >
            Reintentar
          </button>
        </p>
      )}
      {!user || !data ? (
        <p>Cargando perfil…</p>
      ) : (
        <>
          <form
            className="panel profile-panel"
            aria-label="Mi perfil"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const { email, ...fields } = data;
                void email;
                const r = await request<{ user: Session }>(
                  "/profile",
                  "",
                  "PUT",
                  { version: user.profileVersion, data: fields },
                );
                update(r.user);
                notify("Perfil actualizado.", false);
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <ProfileFields
                data={data}
                onChange={(d) => {
                  setData(d);
                  setDirty(true);
                }}
                disabled={busy}
                emailReadOnly
              />
              <p className="fine">
                El correo de acceso lo gestiona Administración.
              </p>
              <AvatarField
                name={data.name}
                src={user.avatarUrl}
                value={data.avatar}
                disabled={busy}
                onError={notify}
                onReading={setBusy}
                onChange={(avatar) => {
                  setData({ ...data, avatar });
                  setDirty(true);
                }}
              />
              <div className="actions">
                <button type="submit" className="primary" disabled={!dirty}>
                  Guardar perfil
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!dirty}
                  onClick={() => {
                    setDirty(false);
                    setReload((n) => n + 1);
                  }}
                >
                  Descartar cambios
                </button>
              </div>
            </fieldset>
            <Dates createdAt={user.createdAt} updatedAt={user.updatedAt} />
          </form>
          <form
            className="panel profile-panel"
            aria-label="Cambiar contraseña"
            onSubmit={async (e) => {
              e.preventDefault();
              if (next !== confirm) {
                notify("Las contraseñas nuevas no coinciden.");
                return;
              }
              setBusy(true);
              try {
                const r = await request<{ user: Session }>(
                  "/profile/password",
                  "",
                  "PUT",
                  {
                    currentPassword: current,
                    newPassword: next,
                    ...(code ? { code } : {}),
                  },
                );
                update(r.user);
                setCurrent("");
                setNext("");
                setConfirm("");
                setCode("");
                notify(
                  "Contraseña actualizada. Se han cerrado tus otras sesiones.",
                  false,
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Cambiar contraseña</h2>
            <p>
              Necesitas tu contraseña actual. Si tienes segundo factor,
              introduce también un código nuevo del autenticador.
            </p>
            <fieldset disabled={busy || dirty}>
              <label>
                Contraseña actual
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </label>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <label>
                Repite la nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label>
                Código del autenticador, si está activado
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button type="submit" className="primary">
                Cambiar mi contraseña
              </button>
            </fieldset>
            {dirty && (
              <p>Guarda o descarta primero los cambios de tu perfil.</p>
            )}
          </form>
          {security}
        </>
      )}
    </>
  );
}
export function ActivateAccount() {
  const [token] = useState(
      () =>
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
    ),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const { notify, toasts } = useToasts();
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return (
    <main className="activation-page">
      {toasts}
      <section className="panel profile-panel">
        <h1>Activa tu cuenta de Horekia</h1>
        {done ? (
          <>
            <p>
              Tu contraseña ya está configurada. Puedes iniciar sesión con tu
              correo electrónico.
            </p>
            <a className="primary" href="/">
              Ir al acceso
            </a>
          </>
        ) : !token ? (
          <p>
            El enlace no incluye una activación válida. Solicita uno nuevo a
            Administración.
          </p>
        ) : (
          <form
            aria-label="Activar cuenta"
            onSubmit={async (e) => {
              e.preventDefault();
              if (password !== confirm) {
                notify("Las contraseñas no coinciden.");
                return;
              }
              setBusy(true);
              try {
                await request("/account/activate", "", "POST", {
                  token,
                  password,
                });
                setPassword("");
                setConfirm("");
                setDone(true);
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Elige tu contraseña personal. El enlace es de un solo uso.</p>
            <fieldset disabled={busy}>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Repite la contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <button className="primary" type="submit">
                Activar mi cuenta
              </button>
            </fieldset>
          </form>
        )}
      </section>
    </main>
  );
}
