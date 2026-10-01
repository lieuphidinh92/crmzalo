import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';

export function importScopeWhere(user: {id:string;orgId:string;role:string}) {
  return { orgId: user.orgId, ...(['owner','admin'].includes(user.role) ? {} : {createdById:user.id}) };
}
/** Grants/revocations apply immediately; delegated members only manage their own imports. */
export async function requireImportAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session=request.user;
  if(!session){reply.status(401).send({error:'Unauthorized'});return;}
  const user=await prisma.user.findFirst({where:{id:session.id,orgId:session.orgId,isActive:true},select:{role:true,canManageImports:true}});
  if(!user || (!['owner','admin'].includes(user.role) && !user.canManageImports)) {
    reply.status(403).send({error:'Bạn chưa được cấp quyền nhập kho'});return;
  }
  request.user={...session,role:user.role,canManageImports:user.canManageImports};
}
