import { canAccess, companies, type AuditPort, type Session } from '../domain/core';
export class Workspace {
 constructor(private audit: AuditPort) {}
 selectCompany(session: Session, id: string) {
  if (!session.companyIds.includes(id) || !companies.some(c=>c.id===id)) throw new Error('Empresa no autorizada');
  return companies.find(c=>c.id===id)!;
 }
 visit(session: Session, companyId: string, page: string) {
  this.selectCompany(session,companyId);
  if (!canAccess(session.role,page)) throw new Error('No tienes acceso a esta sección');
  this.audit.append({id:crypto.randomUUID(),companyId,actor:session.name,action:page,at:new Date().toISOString()});
 }
}
