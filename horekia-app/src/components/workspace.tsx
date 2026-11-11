import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useSyncExternalStore,
} from "react";
import { clientRequest } from "../infrastructure/api";
import {
  products as demoProducts,
  type Product,
  type Line,
  type Order,
} from "../domain/demo";
export type Center = {
  companyId?: string;
  id: string;
  name: string;
  clientId: string;
};
type User = { id: string; name: string; profileType: string };
type Access = { user: User; centers: Center[] };
type State = {
  allowDemo: boolean;
  authLoading: boolean;
  user: User | null;
  mode: "DEMO" | "AUTHENTICATED";
  login: (email: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  catalog: Product[];
  catalogError: string;
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
const subscribe = () => () => {};
const localSnapshot = () =>
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const serverSnapshot = () => false;
export function Workspace({ children }: { children: React.ReactNode }) {
  const allowDemo = useSyncExternalStore(
    subscribe,
    localSnapshot,
    serverSnapshot,
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"DEMO" | "AUTHENTICATED">("DEMO");
  const [catalog, setCatalog] = useState<Product[]>(demoProducts);
  const [catalogError, setCatalogError] = useState("");
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
    const local =
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(window.location.hostname);
    clientRequest<Access>("/session")
      .then((d) => {
        if (controller.signal.aborted) return;
        setUser(d.user);
        setMode("AUTHENTICATED");
        setCatalog([]);
        setCenters(d.centers);
        setCenterId(d.centers[0]?.id ?? "");
      })
      .catch(async () => {
        if (!local || controller.signal.aborted) return;
        try {
          const r = await fetch(
            process.env.EXPO_PUBLIC_CENTERS_URL ??
              "http://127.0.0.1:5184/centers",
            { signal: controller.signal, cache: "no-store" },
          );
          if (!r.ok) throw Error();
          const d = await r.json();
          if (controller.signal.aborted) return;
          setCenters(d.centers);
          setCenterId(d.centers[0]?.id ?? "");
        } catch {
          if (!controller.signal.aborted)
            setCenterError("No se pueden cargar los centros de la demo.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthLoading(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (mode !== "AUTHENTICATED" || !center) return;
    const controller = new AbortController();
    clientRequest<{ products: Omit<Product, "color" | "symbol">[] }>(
      "/catalog?center=" +
        encodeURIComponent(center.id) +
        "&company=" +
        encodeURIComponent(center.companyId ?? ""),
    )
      .then((d) => {
        if (!controller.signal.aborted)
          setCatalog(
            d.products.map((p) => ({
              ...p,
              price: Number(p.price),
              unit:
                (
                  { KG: "kg", L: "l", BOX: "caja", UNIT: "ud" } as Record<
                    string,
                    string
                  >
                )[p.unit] ?? p.unit,
              color: "#e8eddf",
              symbol: "◌",
            })),
          );
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setCatalogError(e.message);
      });
    return () => controller.abort();
  }, [mode, center]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, notify] = useState("");
  return (
    <C.Provider
      value={{
        allowDemo,
        authLoading,
        user,
        mode,
        catalog,
        catalogError,
        login: async (email, password, code) => {
          const d = await clientRequest<Access>("/login", "POST", {
            email,
            password,
            code,
          });
          setUser(d.user);
          setMode("AUTHENTICATED");
          setCatalog([]);
          setCatalogError("");
          setCenters(d.centers);
          setCenterId(d.centers[0]?.id ?? "");
          setCarts({});
          setOrders([]);
          notify("");
          setCenterError("");
        },
        logout: async () => {
          await clientRequest("/logout", "POST");
          setUser(null);
          setMode("DEMO");
          setCatalog(demoProducts);
          setCatalogError("");
          setCarts({});
          setOrders([]);
          setCenters([]);
          setCenterId("");
          setCenterError("Sesión cerrada. Recarga para explorar la demo.");
        },
        centers,
        center,
        centerError,
        selectCenter: (id) => {
          if (!centers.some((c) => c.id === id)) return;
          setCenterId(id);
          if (mode === "AUTHENTICATED") {
            setCatalog([]);
            setCatalogError("");
          }
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
