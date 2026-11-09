import { describe,it,expect } from 'vitest';
import { Workspace } from './workspace';
import { canAccess, type AuditEvent, type Session } from '../domain/core';
const session: Session = {name:'Demo',role:'operaciones',companyIds:['pedial']};
describe('Workspace isolation and roles',()=>{
 it('rejects a company outside the session',()=>{const ws=new Workspace({list:()=>[],append:()=>{}});expect(()=>ws.selectCompany(session,'nexora-demo')).toThrow('Empresa no autorizada');});
 it('rejects restricted navigation before recording it',()=>{const events:AuditEvent[]=[];const ws=new Workspace({list:()=>events,append:e=>events.push(e)});expect(()=>ws.visit(session,'pedial','configuracion')).toThrow();expect(events).toHaveLength(0);});
 it('records the active company on navigation',()=>{const events:AuditEvent[]=[];new Workspace({list:()=>events,append:e=>events.push(e)}).visit(session,'pedial','pedidos');expect(events[0].companyId).toBe('pedial');});
 it('allows administrator settings',()=>expect(canAccess('administracion','configuracion')).toBe(true));
});
