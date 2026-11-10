import React, { createContext, useContext, useState, useEffect } from "react";
import { Line, Order } from "../domain/demo";
export type Center = { id: string; name: string; clientId: string };
type State = {
  centers: Center[];
  center: Center | null;
  centerError: string;
  selectCenter: (id: string) => void;
  cart: Line[];
  orders: Order[];
  add: (id: string, n?: number) => void;
  setQuantity: (id: string, n: number) => void;
  submit: (delivery: string) => string;
  notice: string;
  notify: (text: string) => void;
};
const C = createContext<State | null>(null);
export function Workspace({ children }: { children: React.ReactNode }) {
  const [centers, setCenters] = useState<Center[]>([]);
  const [centerId, setCenterId] = useState("");
  const [centerError, setCenterError] = useState("");
  const [carts, setCarts] = useState<Record<string, Line[]>>({});
  const cart = carts[centerId] ?? [];
  const setCart = (fn: (c: Line[]) => Line[]) =>
    setCarts((old) => ({ ...old, [centerId]: fn(old[centerId] ?? []) }));
  const center = centers.find((c) => c.id === centerId) ?? null;
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      process.env.EXPO_PUBLIC_CENTERS_URL ?? "http://127.0.0.1:5184/centers",
      {
        signal: controller.signal,
        cache: "no-store",
      },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        setCenters(d.centers);
        setCenterId(d.centers[0]?.id ?? "");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setCenterError(
            "No se pueden cargar los centros. Comprueba el servicio local de la demo.",
          );
      });
    return () => controller.abort();
  }, []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, notify] = useState("");
  return (
    <C.Provider
      value={{
        centers,
        center,
        centerError,
        selectCenter: (id) => {
          if (!centers.some((c) => c.id === id)) return;
          setCenterId(id);
          notify("");
        },
        cart,
        orders,
        notice,
        notify,
        add: (id, n = 1) =>
          center &&
          setCart((c) =>
            c.some((l) => l.productId === id)
              ? c.map((l) =>
                  l.productId === id ? { ...l, quantity: l.quantity + n } : l,
                )
              : [...c, { productId: id, quantity: n }],
          ),
        setQuantity: (id, n) =>
          setCart((c) =>
            n > 0
              ? c.map((l) => (l.productId === id ? { ...l, quantity: n } : l))
              : c.filter((l) => l.productId !== id),
          ),
        submit: (delivery) => {
          if (!center) throw Error("Selecciona un centro");
          const id = String(Date.now());
          setOrders((c) => [
            {
              id,
              centerId: center.id,
              centerName: center.name,
              date: new Date().toISOString(),
              delivery,
              state: "SUBMITTED",
              lines: cart.map((l) => ({ ...l })),
            },
            ...c,
          ]);
          setCart(() => []);
          notify(
            "Pedido de demostración registrado. No se ha enviado a ningún proveedor.",
          );
          return id;
        },
      }}
    >
      {children}
    </C.Provider>
  );
}
export function useWorkspace() {
  const c = useContext(C);
  if (!c) throw Error("Workspace required");
  return c;
}
