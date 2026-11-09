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
  resources: Record<string, Resource>;
  permissions: Record<string, { read: boolean; write: boolean }>;
  roles: Record<string, string>;
}
export const operations = [
  {
    id: "orders",
    name: "Multichannel orders",
    phase: "F2",
    description: "Review incoming orders and approve proposed product matches.",
  },
  {
    id: "menus",
    name: "Menu planning",
    phase: "F3",
    description: "Plan weekly menus by center, diet and service.",
  },
  {
    id: "documents",
    name: "Supplier documents",
    phase: "F4",
    description: "Review technical sheets, changes and expiry dates.",
  },
  {
    id: "waste",
    name: "Food waste",
    phase: "F5",
    description: "Track losses, donations and prevention plans.",
  },
];
