import { useState } from "react";
import type { MenuCatalog, PlanForm } from "../application/menuModel";
import { menuName, ml } from "../application/menuModel";
export function copyMenuDay(
  form: PlanForm,
  from: string,
  to: string,
  centerId: string | null,
) {
  const source = form.schedule.entries.filter(
    (e) => e.date === from && (!e.centerId || e.centerId === centerId),
  );
  const selected = new Map<string, (typeof source)[number]>();
  for (const e of source.sort(
    (a, b) => Number(!!a.centerId) - Number(!!b.centerId),
  ))
    selected.set(e.dietId + "|" + e.course, e);
  return {
    ...form,
    schedule: {
      entries: [
        ...form.schedule.entries.filter(
          (e) => e.date !== to || (e.centerId ?? null) !== centerId,
        ),
        ...[...selected.values()].map((e) => ({ ...e, date: to, centerId })),
      ],
    },
  };
}
export function MenuCalendar({
  form,
  c,
  disabled,
  onChange,
}: {
  form: PlanForm;
  c: MenuCatalog;
  disabled: boolean;
  onChange: (p: Partial<PlanForm>) => void;
}) {
  const [week, setWeek] = useState(0),
    [diet, setDiet] = useState(c.diets[0]?.id ?? ""),
    [center, setCenter] = useState(""),
    [from, setFrom] = useState(form.startDate),
    [to, setTo] = useState(form.endDate);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) ||
    !Number.isFinite(Date.parse(form.startDate))
  )
    return <p>Selecciona una fecha inicial válida para ver el calendario.</p>;
  const date = (n: number) =>
    new Date(Date.parse(form.startDate) + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => date(week * 7 + i)).filter(
    (d) => d <= form.endDate,
  );
  const versions = c.recipeVersions.filter((v) => {
    const s = v.data.snapshot as { clientId?: string };
    return !s.clientId || s.clientId === form.clientId;
  });
  return (
    <section className="mt">
      <h3>Calendario semanal</h3>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          disabled={!week}
          onClick={() => setWeek((w) => w - 1)}
        >
          Semana anterior
        </button>
        <button
          type="button"
          className="secondary"
          disabled={date((week + 1) * 7) > form.endDate}
          onClick={() => setWeek((w) => w + 1)}
        >
          Semana siguiente
        </button>
        <label>
          Dieta del calendario
          <select value={diet} onChange={(e) => setDiet(e.target.value)}>
            {c.diets.map((r) => (
              <option key={r.id} value={r.id}>
                {String(r.data.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Centro del calendario
          <select value={center} onChange={(e) => setCenter(e.target.value)}>
            <option value="">Menú común</option>
            {form.centerIds.map((id) => (
              <option key={id} value={id}>
                {menuName(c, "centers", id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-responsive">
        <table className="menu-calendar">
          <thead>
            <tr>
              <th>Plato</th>
              {days.map((d) => (
                <th key={d}>
                  {new Intl.DateTimeFormat("es-ES", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(d))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["FIRST", "MAIN", "SIDE", "DESSERT", "DRINK"].map((course) => (
              <tr key={course}>
                <th>{ml(course)}</th>
                {days.map((date) => {
                  const matching = form.schedule.entries.filter(
                      (e) =>
                        e.date === date &&
                        e.dietId === diet &&
                        e.course === course,
                    ),
                    entry =
                      matching.find((e) => e.centerId === center) ??
                      matching.find((e) => !e.centerId);
                  return (
                    <td key={date}>
                      <select
                        aria-label={ml(course) + " " + date}
                        disabled={disabled || !diet}
                        value={entry?.recipeVersionId ?? ""}
                        onChange={(e) => {
                          const entries = form.schedule.entries.filter(
                            (x) =>
                              !(
                                x.date === date &&
                                x.dietId === diet &&
                                x.course === course &&
                                (x.centerId ?? "") === center
                              ),
                          );
                          if (e.target.value)
                            entries.push({
                              date,
                              dietId: diet,
                              course,
                              recipeVersionId: e.target.value,
                              centerId: center || null,
                            });
                          onChange({ schedule: { entries } });
                        }}
                      >
                        <option
                          value=""
                          disabled={!!center && !!entry && !entry.centerId}
                        >
                          Sin plato
                        </option>
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {String((v.data.snapshot as { name: string }).name)}{" "}
                            · v{String(v.data.revision)}
                          </option>
                        ))}
                      </select>
                      {center && entry && !entry.centerId && (
                        <small>Heredado del menú común</small>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt">
        <summary>Copiar platos de un día</summary>
        <p>
          Se copian todas las dietas del ámbito elegido. Se conservan los
          ajustes de comensales. Los platos del destino se sustituyen.
        </p>
        <div className="actions">
          <label>
            Origen
            <input
              type="date"
              value={from}
              min={form.startDate}
              max={form.endDate}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Destino
            <input
              type="date"
              value={to}
              min={form.startDate}
              max={form.endDate}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={
              disabled ||
              from === to ||
              from < form.startDate ||
              from > form.endDate ||
              to < form.startDate ||
              to > form.endDate
            }
            onClick={() =>
              onChange(copyMenuDay(form, from, to, center || null))
            }
          >
            Copiar platos al destino
          </button>
        </div>
      </details>
    </section>
  );
}
