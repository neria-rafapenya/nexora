export type Role = 'administracion' | 'operaciones' | 'calidad' | 'compras';
export interface Company { id: string; name: string; sector: string }
export interface Session { name: string; role: Role; companyIds: string[] }
export interface AuditEvent { id: string; companyId: string; actor: string; action: string; at: string }
export interface AuthPort { signIn(role: Role): Session; signOut(): void }
export interface AuditPort { list(companyId: string): AuditEvent[]; append(event: AuditEvent): void }
export const companies: Company[] = [{id:'pedial',name:'Pedial · Demo',sector:'Distribución HORECA y colectividades'},{id:'nexora-demo',name:'Nexora · Demo',sector:'Empresa de prueba independiente'}];
export const modules = [
 {id:'pedidos',name:'Pedidos multicanal',description:'De cada canal a una única bandeja de revisión.',phase:'F2',icon:'orders'},
 {id:'menus',name:'Menús para colectividades',description:'Planificación por centro, servicio y dieta.',phase:'F3',icon:'menus'},
 {id:'proveedores',name:'Proveedores',description:'Documentación, vigencias y cambios de ficha.',phase:'F4',icon:'suppliers'},
 {id:'desperdicio',name:'Desperdicio alimentario',description:'Mermas, donaciones y prevención.',phase:'F5',icon:'waste'}
] as const;
export function canAccess(role: Role, page: string): boolean {
 if (role === 'administracion') return true;
 if (page === 'configuracion') return false;
 return true;
}
