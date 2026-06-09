import { prisma } from "../db.js";

export async function logProfileChange(params: {
  candidateUserId: string;
  actorUserId: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  changeReason?: string;
}) {
  return prisma.profileAuditLog.create({
    data: {
      candidateUserId: params.candidateUserId,
      actorUserId: params.actorUserId,
      fieldName: params.fieldName,
      oldValue: params.oldValue as object,
      newValue: params.newValue as object,
      changeReason: params.changeReason,
    },
  });
}
