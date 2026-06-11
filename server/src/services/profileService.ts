import { computeFte } from "@assessment-os/shared";
import { prisma } from "../db.js";
import { logProfileChange } from "./auditService.js";

export async function ensureProfile(userId: string) {
  let profile = await prisma.candidateProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.candidateProfile.create({ data: { userId } });
  }
  return profile;
}

export async function updateProfile(
  userId: string,
  actorId: string,
  data: Record<string, unknown>,
  changeReason?: string
) {
  const profile = await ensureProfile(userId);
  const updates: Record<string, unknown> = {};
  const dateFields = [
    "joiningDate",
    "assignFromDate",
    "assignToDate",
  ] as const;
  const allowed = [
    "country",
    "employeeId",
    "employeeName",
    "band",
    "subBand",
    "reportingManagerCode",
    "reportingManagerName",
    "projectCode",
    "projectName",
    "lastProjectCode",
    "lastProjectName",
    "customerCode",
    "customerName",
    "allocationPercentage",
    "status",
    "customFields",
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      const oldVal = (profile as Record<string, unknown>)[key];
      let newVal = data[key];
      if (key === "allocationPercentage" && typeof newVal === "number") {
        updates.fte = computeFte(newVal);
      }
      if (dateFields.includes(key as (typeof dateFields)[number]) && newVal) {
        newVal = new Date(newVal as string);
      }
      updates[key] = newVal;
      await logProfileChange({
        candidateUserId: userId,
        actorUserId: actorId,
        fieldName: key,
        oldValue: oldVal,
        newValue: newVal,
        changeReason,
      });
    }
  }

  for (const key of dateFields) {
    if (data[key] !== undefined) {
      const oldVal = (profile as Record<string, unknown>)[key];
      const newVal = data[key] ? new Date(data[key] as string) : null;
      updates[key] = newVal;
      await logProfileChange({
        candidateUserId: userId,
        actorUserId: actorId,
        fieldName: key,
        oldValue: oldVal,
        newValue: newVal,
        changeReason,
      });
    }
  }

  if (data.allocationPercentage !== undefined && typeof data.allocationPercentage === "number") {
    updates.fte = computeFte(data.allocationPercentage);
  }

  return prisma.candidateProfile.update({
    where: { userId },
    data: updates as Parameters<typeof prisma.candidateProfile.update>[0]["data"],
  });
}
