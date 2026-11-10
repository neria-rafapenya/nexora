export type Role =
  | "admin"
  | "operations_orders"
  | "nutrition_menus"
  | "quality"
  | "commercial"
  | "read_only";
export interface Company {
  id: string;
  name: string;
  role: Role;
}
export interface Session {
  id: string;
  name: string;
  email: string;
  companies: Company[];
}
export interface Field {
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  resource?: string;
  integer?: boolean;
  min?: number;
}
export interface Resource {
  label: string;
  singular: string;
  fields: Record<string, Field>;
  columns: string[];
}
export interface RecordRow {
  id: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface Contract {
  menuPermissions?: {
    read: boolean;
    write: boolean;
    nutrition: boolean;
    quality: boolean;
  };
  orderPermissions?: {
    read: boolean;
    write: boolean;
    mockClient?: boolean;
    mockErp?: boolean;
    erpConfigured?: boolean;
  };
  resources: Record<string, Resource>;
  permissions: Record<string, { read: boolean; write: boolean }>;
  roles: Record<string, string>;
}
export const operations = [
  {
    id: "orders",
    name: "Pedidos multicanal",
    phase: "F2",
    description:
      "Revisa pedidos entrantes y aprueba las asociaciones de productos propuestas.",
  },
  {
    id: "menus",
    name: "Planificación de menús",
    phase: "F3",
    description: "Planifica menús semanales por centro, dieta y servicio.",
  },
  {
    id: "documents",
    name: "Documentación de proveedores",
    phase: "F4",
    description: "Revisa fichas técnicas, cambios y caducidades.",
  },
  {
    id: "waste",
    name: "Desperdicio alimentario",
    phase: "F5",
    description: "Gestiona mermas, donaciones y planes de prevención.",
  },
];
