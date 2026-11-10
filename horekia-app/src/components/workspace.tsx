import React, { createContext, useContext, useState } from "react";
import { Line, Order } from "../domain/demo";
type State = {
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
  const [cart, setCart] = useState<Line[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, notify] = useState("");
  return (
    <C.Provider
      value={{
        cart,
        orders,
        notice,
        notify,
        add: (id, n = 1) =>
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
          const id = String(Date.now());
          setOrders((c) => [
            {
              id,
              date: new Date().toISOString(),
              delivery,
              state: "SUBMITTED",
              lines: cart.map((l) => ({ ...l })),
            },
            ...c,
          ]);
          setCart([]);
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
