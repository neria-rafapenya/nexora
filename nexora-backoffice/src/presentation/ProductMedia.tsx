import { useEffect, useRef, useState } from "react";
import { Upload, ZoomIn, Trash2, Download } from "lucide-react";
import { request } from "../infrastructure/api";
import type { RecordRow } from "../domain/core";
import { useToasts } from "./Toasts";
import { RecordTime } from "./RecordDates";
const maxBytes = 1_000_000;
type Kind = "IMAGE" | "DOCUMENT";
type DownloadFile = { filename: string; mime: string; base64: string };
function validate(file: File, kind: Kind) {
  if (file.size > maxBytes)
    return kind === "IMAGE"
      ? "La imagen supera el máximo de 1 MB."
      : "El documento supera el máximo de 1 MB.";
  if (!file.size) return "El archivo está vacío. Selecciona otro archivo.";
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (kind === "IMAGE" && !["jpg", "jpeg", "png", "webp"].includes(ext ?? ""))
    return "La imagen solo puede ser de tipo JPG, PNG o WEBP.";
  if (kind === "DOCUMENT" && !["pdf", "doc"].includes(ext ?? ""))
    return "El documento solo puede ser de tipo PDF o DOC.";
  return "";
}
function read(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(Error("No se ha podido leer el archivo. Inténtalo de nuevo."));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      if (comma < 0) reject(Error("No se ha podido leer el archivo."));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
function blob(file: DownloadFile) {
  return new Blob(
    [Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))],
    { type: file.mime },
  );
}
function Dropzone({
  kind,
  disabled,
  onFiles,
}: {
  kind: Kind;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [over, setOver] = useState(false);
  const image = kind === "IMAGE";
  return (
    <div
      role="button"
      aria-label={
        image ? "Subir imagen del producto" : "Subir documentos del producto"
      }
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={
        "file-dropzone " +
        (over ? "drag-over " : "") +
        (disabled ? "disabled" : "")
      }
      onClick={() => {
        if (!disabled) input.current?.click();
      }}
      onKeyDown={(e) => {
        if (!disabled && ["Enter", " "].includes(e.key)) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <Upload size={20} />
      <strong>
        {image ? "Arrastra aquí una imagen" : "Arrastra aquí tus documentos"}
      </strong>
      <span>o pulsa para seleccionar</span>
      <small>
        {image
          ? "JPG, PNG o WEBP · Una imagen · Máximo 1 MB"
          : "PDF o DOC · Máximo 1 MB por archivo"}
      </small>
      <input
        ref={input}
        type="file"
        aria-label={image ? "Seleccionar imagen" : "Seleccionar documentos"}
        accept={image ? ".jpg,.jpeg,.png,.webp" : ".pdf,.doc"}
        multiple={!image}
        disabled={disabled}
        hidden
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          onFiles(files);
        }}
      />
    </div>
  );
}
export function ProductMedia({
  productId,
  companyId,
  writable,
}: {
  productId?: string;
  companyId: string;
  writable: boolean;
}) {
  const [files, setFiles] = useState<RecordRow[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!productId),
    [url, setUrl] = useState(""),
    [zoom, setZoom] = useState(false);
  const scope = useRef(0),
    dialog = useRef<HTMLDialogElement>(null);
  const { notify, toasts } = useToasts();
  const endpoint = "/product-media/" + productId;
  useEffect(() => {
    const seq = ++scope.current;
    setFiles([]);
    setLoading(!!productId);
    if (productId)
      request<{ records: RecordRow[] }>(endpoint, companyId)
        .then((r) => {
          if (scope.current === seq) setFiles(r.records);
        })
        .catch((e) => {
          if (scope.current === seq) notify(e.message);
        })
        .finally(() => {
          if (scope.current === seq) setLoading(false);
        });
    return () => {
      scope.current++;
    };
  }, [endpoint, companyId, productId, notify]);
  const image = files.find((f) => f.data.kind === "IMAGE"),
    documents = files.filter((f) => f.data.kind === "DOCUMENT");
  useEffect(() => {
    let live = true,
      objectUrl = "";
    setUrl("");
    setZoom(false);
    if (image)
      request<DownloadFile>(endpoint + "/" + image.id, companyId)
        .then((f) => {
          if (live) {
            objectUrl = URL.createObjectURL(blob(f));
            setUrl(objectUrl);
          }
        })
        .catch((e) => {
          if (live) notify(e.message);
        });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, companyId, image?.id, image?.version, notify]);
  useEffect(() => {
    if (zoom) dialog.current?.showModal?.();
  }, [zoom]);
  async function reload(seq: number) {
    const r = await request<{ records: RecordRow[] }>(endpoint, companyId);
    if (scope.current === seq) setFiles(r.records);
  }
  async function upload(kind: Kind, selected: File[]) {
    if (busy || loading || !writable || !productId) return;
    if (!selected.length) return;
    if (kind === "IMAGE" && selected.length !== 1) {
      notify("Solo puedes subir una imagen por producto.");
      return;
    }
    const seq = scope.current;
    setBusy(true);
    try {
      for (const file of selected) {
        if (scope.current !== seq) break;
        const error = validate(file, kind);
        if (error) {
          notify(error);
          continue;
        }
        try {
          const base64 = await read(file);
          if (scope.current !== seq) break;
          await request(endpoint, companyId, "POST", {
            kind,
            file: { filename: file.name, mime: file.type, base64 },
            ...(kind === "IMAGE" ? { version: image?.version ?? null } : {}),
          });
          if (scope.current !== seq) break;
          await reload(seq);
          notify(
            kind === "IMAGE" ? "Imagen guardada." : "Documento añadido.",
            false,
          );
        } catch (e) {
          if (scope.current === seq) {
            notify((e as Error).message);
            try {
              await reload(seq);
            } catch {
              /* Keep the upload error visible. */
            }
          }
        }
      }
    } finally {
      if (scope.current === seq) setBusy(false);
    }
  }
  async function remove(file: RecordRow) {
    if (busy || !writable) return;
    const seq = scope.current;
    setBusy(true);
    try {
      await request(endpoint + "/" + file.id, companyId, "DELETE", {
        version: file.version,
      });
      await reload(seq);
      if (scope.current === seq)
        notify(
          file.data.kind === "IMAGE"
            ? "Imagen eliminada."
            : "Documento eliminado.",
          false,
        );
    } catch (e) {
      if (scope.current === seq) notify((e as Error).message);
    } finally {
      if (scope.current === seq) setBusy(false);
    }
  }
  async function download(file: RecordRow) {
    try {
      const data = await request<DownloadFile>(
        endpoint + "/" + file.id,
        companyId,
      );
      const objectUrl = URL.createObjectURL(blob(data)),
        a = document.createElement("a");
      a.href = objectUrl;
      a.download = data.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <section
      className="panel product-media"
      aria-label="Imagen y archivos del producto"
    >
      {toasts}
      <div className="product-media-grid">
        <div>
          <h2>Imagen del producto</h2>
          <button
            type="button"
            className="product-image-preview"
            aria-label="Ampliar imagen del producto"
            disabled={!url}
            onClick={() => setZoom(true)}
          >
            <img
              src={url || "/noimage.png"}
              alt={url ? "Imagen del producto" : "Sin imagen"}
              onError={() => {
                if (url) {
                  setUrl("");
                  notify("No se ha podido mostrar la imagen.");
                }
              }}
            />
            {url && <ZoomIn size={16} />}
          </button>
          {image && writable && (
            <button
              type="button"
              className="secondary"
              disabled={busy || loading}
              onClick={() => void remove(image)}
            >
              <Trash2 size={14} /> Quitar imagen
            </button>
          )}
          {writable && (
            <Dropzone
              kind="IMAGE"
              disabled={busy || loading || !productId}
              onFiles={(f) => void upload("IMAGE", f)}
            />
          )}
          <p className="fine">
            {image
              ? "Al subir otra imagen sustituirás la actual."
              : "Si no hay imagen se muestra la imagen predeterminada."}
          </p>
        </div>
        <div>
          <h2>Archivos adjuntos</h2>
          {writable && (
            <Dropzone
              kind="DOCUMENT"
              disabled={busy || loading || !productId}
              onFiles={(f) => void upload("DOCUMENT", f)}
            />
          )}{" "}
          {loading ? (
            <p role="status">Cargando archivos…</p>
          ) : documents.length ? (
            <ul className="product-file-list">
              {documents.map((f) => (
                <li key={f.id}>
                  <div>
                    <strong>{String(f.data.filename)}</strong>
                    <small>
                      {(Number(f.data.size) / 1000).toFixed(1)} KB · Subido el{" "}
                      <RecordTime value={f.createdAt} />
                    </small>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={"Descargar " + f.data.filename}
                      onClick={() => void download(f)}
                    >
                      <Download size={16} />
                    </button>
                    {writable && (
                      <button
                        type="button"
                        className="icon-button danger"
                        disabled={busy}
                        aria-label={"Eliminar " + f.data.filename}
                        onClick={() => void remove(f)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">No hay documentos adjuntos.</p>
          )}
        </div>
      </div>
      {!productId && (
        <p className="fine">
          Guarda primero el producto para subir su imagen y sus documentos.
        </p>
      )}
      {busy && <p role="status">Guardando archivos…</p>}
      {zoom && url && (
        <dialog
          ref={dialog}
          className="product-image-dialog"
          aria-label="Imagen ampliada del producto"
          onCancel={(e) => {
            e.preventDefault();
            setZoom(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoom(false);
          }}
        >
          <button
            type="button"
            className="secondary"
            autoFocus
            onClick={() => setZoom(false)}
          >
            Cerrar imagen
          </button>
          <img src={url} alt="Imagen ampliada del producto" />
        </dialog>
      )}
    </section>
  );
}
