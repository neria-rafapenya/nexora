export type Product = {
  id: string;
  name: string;
  sku: string;
  family: string;
  unit: string;
  price: number;
  color: string;
  symbol: string;
};
export const products: Product[] = [
  {
    id: "rice",
    name: "Arroz basmati",
    sku: "NX-01-001",
    family: "Cereales",
    unit: "kg",
    price: 2.4,
    color: "#f1ead6",
    symbol: "◌",
  },
  {
    id: "chicken",
    name: "Muslo de pollo",
    sku: "NX-06-002",
    family: "Carnes",
    unit: "kg",
    price: 4.9,
    color: "#f4e0d4",
    symbol: "◒",
  },
  {
    id: "noodles",
    name: "Fideos de arroz",
    sku: "NX-02-015",
    family: "Pastas",
    unit: "kg",
    price: 3.2,
    color: "#e9e8cf",
    symbol: "≋",
  },
  {
    id: "carrot",
    name: "Zanahoria fresca",
    sku: "DEMO-004",
    family: "Verduras",
    unit: "kg",
    price: 1.8,
    color: "#f5dfbf",
    symbol: "◇",
  },
  {
    id: "oil",
    name: "Aceite de oliva",
    sku: "DEMO-005",
    family: "Despensa",
    unit: "l",
    price: 6.5,
    color: "#e1e6ce",
    symbol: "◊",
  },
  {
    id: "apple",
    name: "Manzana Golden",
    sku: "DEMO-006",
    family: "Frutas",
    unit: "kg",
    price: 2.1,
    color: "#e5e9c8",
    symbol: "●",
  },
];
export type Line = { productId: string; quantity: number };
export type Order = {
  centerId: string;
  centerName: string;
  id: string;
  date: string;
  delivery: string;
  state: "DRAFT" | "SUBMITTED";
  lines: Line[];
};
export const total = (lines: Line[]) =>
  lines.reduce(
    (a, l) =>
      a + (products.find((p) => p.id === l.productId)?.price ?? 0) * l.quantity,
    0,
  );
export const money = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    n,
  );
