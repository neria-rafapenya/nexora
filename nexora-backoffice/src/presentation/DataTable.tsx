import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type TableHTMLAttributes,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  functionalUpdate,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
} from "@tanstack/react-table";
type Element = ReactElement<any>;
type DataRow = { element: Element; cells: Element[] };
const collator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});
export function elements(nodes: ReactNode): Element[] {
  return Children.toArray(nodes).flatMap((n) =>
    isValidElement(n)
      ? n.type === Fragment
        ? elements((n as Element).props.children)
        : [n as Element]
      : [],
  );
}
export function cellValue(node: ReactNode): unknown {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return node;
  if (Array.isArray(node)) return node.map(cellValue).join(" ").trim();
  if (!isValidElement(node)) return "";
  const p = (node as Element).props;
  if (Object.hasOwn(p, "data-sort-value")) return p["data-sort-value"];
  if (node.type === "input")
    return p.type === "checkbox"
      ? !!p.checked
      : (p.value ?? p.defaultValue ?? "");
  if (node.type === "select") {
    const option = elements(p.children).find(
      (o) => String(o.props.value) === String(p.value),
    );
    return option ? cellValue(option.props.children) : (p.value ?? "");
  }
  if (node.type === "time") return p.dateTime ?? cellValue(p.children);
  if (typeof node.type !== "string" && Object.hasOwn(p, "value"))
    return p.value;
  return cellValue(p.children);
}
function locked(node: ReactNode): boolean {
  return Children.toArray(node).some(
    (n) =>
      isValidElement(n) &&
      ((n as Element).type === "button" ||
        ((n as Element).type === "input" &&
          (n as Element).props.type === "checkbox") ||
        locked((n as Element).props.children)),
  );
}
function comparable(v: unknown): string | number | undefined {
  if (v == null || v === "" || v === "—" || v === "No disponible")
    return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) {
    const date = Date.parse(s);
    if (Number.isFinite(date)) return date;
  }
  const date = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (date)
    return Date.UTC(
      +date[3],
      +date[2] - 1,
      +date[1],
      +(date[4] ?? 0),
      +(date[5] ?? 0),
      +(date[6] ?? 0),
    );
  if (/^-?[\d.\s]+(?:,\d+)?\s*[€%]?$/.test(s)) {
    const clean = s.replace(/[€%\s]/g, "");
    return Number(
      clean.includes(",")
        ? clean.replace(/\./g, "").replace(",", ".")
        : /^-?\d{1,3}(\.\d{3})+$/.test(clean)
          ? clean.replace(/\./g, "")
          : clean,
    );
  }
  return s;
}
export function compareCells(a: unknown, b: unknown) {
  const x = comparable(a),
    y = comparable(b);
  if (x === undefined) return y === undefined ? 0 : 1;
  if (y === undefined) return -1;
  return typeof x === "number" && typeof y === "number"
    ? x - y
    : collator.compare(String(x), String(y));
}
const sizes = [10, 25, 50, 100];
function loadWidths(id: string): ColumnSizingState {
  try {
    const data = JSON.parse(
      window.localStorage.getItem("horekia-table-widths:" + id) ?? "{}",
    );
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(
        ([k, v]) =>
          k.length < 150 &&
          typeof v === "number" &&
          Number.isFinite(v) &&
          v >= 70 &&
          v <= 1400,
      ),
    ) as ColumnSizingState;
  } catch {
    return {};
  }
}
export function DataTable({
  id,
  primary = false,
  filterKey,
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  id: string;
  primary?: boolean;
  filterKey?: string;
}) {
  const [params, setParams] = useSearchParams();
  const [widths, setWidths] = useState(() => loadWidths(id));
  const previousFilter = useRef(filterKey);
  const prefix = primary ? "" : id + ".",
    key = (name: string) => prefix + name;
  const structure = useMemo(() => {
    const parts = elements(children),
      head = parts.find((n) => n.type === "thead"),
      body = parts.find((n) => n.type === "tbody");
    const headerRow = elements(head?.props.children)[0],
      headers = elements(headerRow?.props.children);
    const rows = elements(body?.props.children)
      .filter((n) => n.type === "tr")
      .map((element) => ({ element, cells: elements(element.props.children) }));
    return { parts, head, body, headerRow, headers, rows };
  }, [children]);
  const columns = useMemo<ColumnDef<DataRow>[]>(
    () =>
      structure.headers.map((header, index) => {
        const label = String(
          cellValue(header.props.children) || "Columna " + (index + 1),
        );
        const columnId =
          String(
            header.props["data-column-id"] ??
              label
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
          ) || "column-" + index;
        const fixed =
          header.props["data-fixed"] ||
          /^acciones?$|^seleccionar$/i.test(label) ||
          locked(header.props.children) ||
          structure.rows.some((r) => locked(r.cells[index]));
        return {
          id: columnId + "",
          accessorFn: (row) => comparable(cellValue(row.cells[index])),
          sortingFn: (a, b, col) =>
            compareCells(a.getValue(col), b.getValue(col)),
          sortUndefined: "last",
          enableSorting: !fixed,
          enableResizing: !fixed,
          size: fixed ? 120 : 190,
          minSize: fixed ? 120 : 70,
          maxSize: fixed ? 120 : 1400,
          meta: { header, index, label },
        };
      }),
    [structure],
  );
  const allowedSort = params.get(key("sort")) ?? "",
    sortColumn = columns.find((c) => c.id === allowedSort && c.enableSorting);
  const sorting: SortingState = sortColumn
    ? [{ id: allowedSort, desc: params.get(key("dir")) === "desc" }]
    : [];
  const requestedSize = Number(params.get(key("pageSize")) ?? 25),
    pageSize = sizes.includes(requestedSize) ? requestedSize : 25;
  const requestedPage = Number(params.get(key("page")) ?? 1),
    rawPage =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
  const pageCount = Math.max(1, Math.ceil(structure.rows.length / pageSize)),
    page = Math.min(rawPage, pageCount);
  const update = (values: Record<string, string | null>, replace = false) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [name, value] of Object.entries(values))
          if (value === null) next.delete(key(name));
          else next.set(key(name), value);
        return next;
      },
      { replace },
    );
  useEffect(() => {
    if (filterKey !== previousFilter.current) {
      previousFilter.current = filterKey;
      update({ page: "1" }, true);
    } else if (page !== rawPage) update({ page: String(page) }, true);
  }, [filterKey, page, rawPage, params.toString()]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "horekia-table-widths:" + id,
        JSON.stringify(widths),
      );
    } catch {
      /* Storage is optional. */
    }
  }, [id, widths]);

  const table = useReactTable({
    data: structure.rows,
    columns,
    state: {
      sorting,
      columnSizing: Object.fromEntries(
        Object.entries(widths).filter(([id]) =>
          columns.some((c) => c.id === id && c.enableResizing),
        ),
      ),
      pagination: { pageIndex: page - 1, pageSize },
    },
    getRowId: (row, i) => String(row.element.key ?? i),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    enableMultiSort: false,
    sortDescFirst: false,
    columnResizeMode: "onChange",
    onColumnSizingChange: setWidths,
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting);
      update({
        sort: next[0]?.id ?? null,
        dir: next[0] ? (next[0].desc ? "desc" : "asc") : null,
        page: "1",
      });
    },
  });
  const leaf = table.getFlatHeaders();
  const header = structure.headerRow
    ? cloneElement(
        structure.headerRow,
        {},
        leaf.map((h) => {
          const meta = h.column.columnDef.meta as {
            header: Element;
            label: string;
          };
          return cloneElement(
            meta.header,
            {
              key: h.id,
              style: { ...meta.header.props.style, width: h.getSize() },
              "aria-sort": h.column.getCanSort()
                ? h.column.getIsSorted() === "asc"
                  ? "ascending"
                  : h.column.getIsSorted() === "desc"
                    ? "descending"
                    : "none"
                : undefined,
            },
            h.column.getCanSort() ? (
              <button
                type="button"
                className="table-sort"
                aria-label={"Ordenar por " + meta.label}
                onClick={h.column.getToggleSortingHandler()}
              >
                {meta.header.props.children}
                <span aria-hidden="true">
                  {h.column.getIsSorted() === "asc"
                    ? "↑"
                    : h.column.getIsSorted() === "desc"
                      ? "↓"
                      : "↕"}
                </span>
              </button>
            ) : (
              meta.header.props.children
            ),
            h.column.getCanResize() && (
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={"Ajustar ancho de " + meta.label}
                aria-valuemin={70}
                aria-valuemax={1400}
                aria-valuenow={h.getSize()}
                tabIndex={0}
                className={
                  "column-resizer " +
                  (h.column.getIsResizing() ? "resizing" : "")
                }
                onMouseDown={(e) => {
                  e.stopPropagation();
                  h.getResizeHandler()(e);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  h.getResizeHandler()(e);
                }}
                onDoubleClick={() => h.column.resetSize()}
                onKeyDown={(e) => {
                  if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                    e.preventDefault();
                    setWidths((old) => ({
                      ...old,
                      [h.column.id]: Math.max(
                        70,
                        Math.min(
                          1400,
                          h.getSize() + (e.key === "ArrowRight" ? 16 : -16),
                        ),
                      ),
                    }));
                  }
                }}
                title="Arrastra para ajustar el ancho. Doble clic para restablecerlo."
              />
            ),
          );
        }),
      )
    : null;
  return (
    <div className="managed-table-frame">
      <div className="managed-table-scroll">
        <table
          {...props}
          id={id}
          className={"managed-table " + (props.className ?? "")}
          style={{
            ...props.style,
            width: table.getTotalSize(),
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {leaf.map((h) => (
              <col key={h.id} style={{ width: h.getSize() }} />
            ))}
          </colgroup>
          {structure.head && cloneElement(structure.head, {}, header)}
          {structure.body &&
            cloneElement(
              structure.body,
              {},
              table
                .getRowModel()
                .rows.map((r) =>
                  cloneElement(r.original.element, { key: r.id }),
                ),
            )}
          {structure.parts.filter(
            (n) => n.type !== "thead" && n.type !== "tbody",
          )}
        </table>
      </div>
      <nav className="table-pagination" aria-label={"Paginación de " + id}>
        <span role="status">
          {structure.rows.length
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, structure.rows.length)} de ${structure.rows.length}`
            : "0 registros"}
        </span>
        <label>
          Filas por página{" "}
          <select
            aria-label={"Filas por página de " + id}
            value={pageSize}
            onChange={(e) => update({ pageSize: e.target.value, page: "1" })}
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            aria-label={"Primera página de " + id}
            disabled={page === 1}
            onClick={() => update({ page: "1" })}
          >
            «
          </button>
          <button
            type="button"
            className="secondary"
            aria-label={"Página anterior de " + id}
            disabled={page === 1}
            onClick={() => update({ page: String(page - 1) })}
          >
            ‹
          </button>
          <label>
            Página{" "}
            <input
              aria-label={"Página de " + id}
              type="number"
              min={1}
              max={pageCount}
              value={page}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isInteger(next) && next >= 1 && next <= pageCount)
                  update({ page: String(next) });
              }}
            />{" "}
            de {pageCount}
          </label>
          <button
            type="button"
            className="secondary"
            aria-label={"Página siguiente de " + id}
            disabled={page === pageCount}
            onClick={() => update({ page: String(page + 1) })}
          >
            ›
          </button>
          <button
            type="button"
            className="secondary"
            aria-label={"Última página de " + id}
            disabled={page === pageCount}
            onClick={() => update({ page: String(pageCount) })}
          >
            »
          </button>
        </div>
      </nav>
    </div>
  );
}

/** Lives above the table so an empty filtered result also resets its saved page. */
export function useResetTablePage(filterKey: string) {
  const [params, setParams] = useSearchParams(),
    previous = useRef(filterKey);
  useEffect(() => {
    if (previous.current === filterKey) return;
    previous.current = filterKey;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of [...next.keys()])
          if (key === "page" || key.endsWith(".page")) next.set(key, "1");
        return next;
      },
      { replace: true },
    );
  }, [filterKey]);
}
