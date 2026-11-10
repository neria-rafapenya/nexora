import { useCallback, useEffect, useRef, useState } from "react";
export function useToasts() {
  const [items, setItems] = useState<
      Array<{ id: number; message: string; error: boolean }>
    >([]),
    next = useRef(0),
    timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const close = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((rows) => rows.filter((r) => r.id !== id));
  }, []);
  const notify = useCallback(
    (message: string, error = true) => {
      const id = ++next.current;
      setItems((rows) => [...rows, { id, message, error }].slice(-4));
      timers.current.set(
        id,
        setTimeout(() => close(id), error ? 7000 : 4000),
      );
    },
    [close],
  );
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );
  return {
    notify,
    toasts: (
      <div className="toast-stack">
        {items.map((t) => (
          <div
            className={
              "toast-message " + (t.error ? "toast-error" : "toast-success")
            }
            key={t.id}
            role={t.error ? "alert" : "status"}
          >
            <span>{t.message}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => close(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    ),
  };
}
