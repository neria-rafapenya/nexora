import type { RecordRow } from "../domain/core";
const dateTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function RecordTime({ value }: { value: string }) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? (
    <span>No disponible</span>
  ) : (
    <time dateTime={parsed.toISOString()} title="Hora de Madrid">
      {dateTime.format(parsed)}
    </time>
  );
}
export function RecordDates({ record }: { record: RecordRow }) {
  return (
    <dl className="panel record-timestamps" aria-label="Fechas del registro">
      <div>
        <dt>Fecha de creación</dt>
        <dd>
          <RecordTime value={record.createdAt} />
        </dd>
      </div>
      <div>
        <dt>Última edición</dt>
        <dd>
          <RecordTime value={record.updatedAt} />
        </dd>
      </div>
      <div className="fine">Hora de Madrid</div>
    </dl>
  );
}
