import type { AuditEvent, AuditPort, AuthPort, Role, Session } from '../domain/core';
export class DemoAuthAdapter implements AuthPort {
 signIn(role: Role): Session { return {name:'Equipo de demostración',role,companyIds:['pedial','nexora-demo']}; }
 signOut(): void { /* No remote session exists in demo mode. */ }
}
export class LocalAuditAdapter implements AuditPort {
 list(companyId: string): AuditEvent[] {
  try { const value: unknown = JSON.parse(localStorage.getItem('nexora.audit.v1') ?? '[]');
   if (!Array.isArray(value)) return [];
   return value.filter((e): e is AuditEvent => !!e && typeof e.id==='string' && typeof e.companyId==='string' && typeof e.actor==='string' && typeof e.action==='string' && typeof e.at==='string').filter(e=>e.companyId===companyId);
  } catch { return []; }
 }
 append(event: AuditEvent): void {
  const all = ['pedial','nexora-demo'].flatMap(id=>this.list(id));
  localStorage.setItem('nexora.audit.v1',JSON.stringify([event,...all].slice(0,250)));
 }
}
