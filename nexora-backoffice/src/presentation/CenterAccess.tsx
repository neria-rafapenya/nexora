import { useEffect, useState } from "react";
import { request } from "../infrastructure/api";
import type { ManagedUser } from "./UserProfiles";
type Grants = {
  centerIds: string[];
  revision: string;
  centers: { id: string; name: string }[];
  allCenters: boolean;
};
export function CenterAccess({
  users,
  companyId,
}: {
  users: ManagedUser[];
  companyId: string;
}) {
  const [id, setId] = useState("");
  const [data, setData] = useState<Grants | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    if (!id) return;
    request<Grants>("/center-access/" + id, companyId)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, companyId]);
  return (
    <section className="panel" aria-label="Acceso a centros de la app">
      <h2>Acceso a centros de la app</h2>
      <p>
        Asigna los centros que cada usuario puede seleccionar. El rol
        «Responsable de centro (app)» no da acceso al backoffice. Los
        administradores pueden utilizar todos los centros de su empresa.
      </p>
      <label>
        Usuario
        <select
          value={id}
          disabled={busy}
          onChange={(e) => {
            setId(e.target.value);
            setData(null);
            setError("");
            setMessage("");
          }}
        >
          <option value="">Selecciona un usuario</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.email}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {id && !data && !error && <p>Cargando asignaciones…</p>}
      {data && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setMessage("");
            try {
              setData(
                await request<Grants>(
                  "/center-access/" + id,
                  companyId,
                  "PUT",
                  { centerIds: data.centerIds, revision: data.revision },
                ),
              );
              setMessage("Asignación de centros guardada.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy || data.allCenters}>
            <legend>
              {data.allCenters
                ? "Acceso a todos los centros por su rol de administrador"
                : "Centros autorizados"}
            </legend>
            {data.centers.map((c) => (
              <label key={c.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={data.allCenters || data.centerIds.includes(c.id)}
                  onChange={(e) =>
                    setData({
                      ...data,
                      centerIds: e.target.checked
                        ? [...data.centerIds, c.id]
                        : data.centerIds.filter((x) => x !== c.id),
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          {!data.allCenters && (
            <button disabled={busy} type="submit">
              {busy ? "Guardando…" : "Guardar centros autorizados"}
            </button>
          )}
          <p>
            Sin centros asignados, el usuario no podrá entrar en la app. No se
            modifica su tipo de perfil ni su contraseña.
          </p>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
