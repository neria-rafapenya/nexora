import { useSyncExternalStore } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { queryClient, refreshCompany } from "../infrastructure/query-cache";
const time = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function DataFreshness({
  companyId,
  disabled,
}: {
  companyId: string;
  disabled: boolean;
}) {
  const fetching = useIsFetching(
    {
      predicate: (q) => q.queryKey[0] === "api" && q.queryKey[2] === companyId,
    },
    queryClient,
  );
  const updated = useSyncExternalStore(
    (listener) => queryClient.getQueryCache().subscribe(listener),
    () =>
      Math.max(
        0,
        ...queryClient
          .getQueryCache()
          .findAll({
            predicate: (q) =>
              q.queryKey[0] === "api" && q.queryKey[2] === companyId,
          })
          .map((q) => q.state.dataUpdatedAt),
      ),
    () => 0,
  );
  return (
    <div className="data-freshness">
      <span role="status" aria-live="polite">
        {fetching
          ? "Actualizando datos…"
          : updated
            ? `Actualizado ${time.format(updated)} · Madrid`
            : "Datos pendientes de consulta"}
      </span>
      <button
        type="button"
        className="icon-button"
        disabled={disabled || !!fetching}
        title={
          disabled
            ? "Los formularios en edición conservan sus cambios"
            : "Consultar los datos actuales"
        }
        aria-label="Actualizar datos"
        onClick={() => refreshCompany(companyId)}
      >
        <RefreshCw size={15} />
      </button>
    </div>
  );
}
