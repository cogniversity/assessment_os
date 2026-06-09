import { AssessmentStatus, ReattemptRequestStatus, Role } from "@prisma/client";
import { prisma } from "../db.js";

export async function getLatestReattemptRequest(assessmentId: string) {
  return prisma.reattemptRequest.findFirst({
    where: { assessmentId },
    orderBy: { createdAt: "desc" },
    include: {
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}

export async function createReattemptRequest(
  assessmentId: string,
  candidateId: string,
  message?: string
) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      attempts: { orderBy: { startedAt: "desc" } },
    },
  });
  if (!assessment || assessment.userId !== candidateId) {
    throw Object.assign(new Error("Assessment not found"), { status: 404 });
  }
  if (assessment.status === "in_progress") {
    throw Object.assign(new Error("Assessment is still in progress"), { status: 400 });
  }
  const hasFinishedAttempt = assessment.attempts.some(
    (a) => a.status === "completed" || a.status === "timed_out"
  );
  if (!hasFinishedAttempt && assessment.status !== "completed") {
    throw Object.assign(
      new Error("You can request a reattempt only after completing an attempt"),
      { status: 400 }
    );
  }
  const inProgress = assessment.attempts.some((a) => a.status === "in_progress");
  if (inProgress) {
    throw Object.assign(new Error("An attempt is still in progress"), { status: 400 });
  }
  const pending = await prisma.reattemptRequest.findFirst({
    where: { assessmentId, status: ReattemptRequestStatus.pending },
  });
  if (pending) {
    throw Object.assign(new Error("A reattempt request is already pending for this assessment"), {
      status: 409,
    });
  }
  if (assessment.status === "assigned") {
    throw Object.assign(
      new Error("This assessment is already open for a new attempt"),
      { status: 400 }
    );
  }

  return prisma.reattemptRequest.create({
    data: {
      assessmentId,
      candidateId,
      message: message?.trim() || null,
    },
    include: {
      assessment: {
        include: {
          skill: true,
          topics: { include: { topic: true } },
          assignedBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

function canReviewRequest(
  reviewerRole: string,
  reviewerId: string,
  assignedById: string
): boolean {
  if (reviewerRole === Role.admin) return true;
  if (reviewerRole === Role.capability_manager && assignedById === reviewerId) return true;
  return false;
}

export async function reviewReattemptRequest(
  requestId: string,
  reviewerId: string,
  reviewerRole: string,
  action: "approve" | "reject",
  managerNote?: string
) {
  const request = await prisma.reattemptRequest.findUnique({
    where: { id: requestId },
    include: { assessment: true },
  });
  if (!request) {
    throw Object.assign(new Error("Request not found"), { status: 404 });
  }
  if (request.status !== ReattemptRequestStatus.pending) {
    throw Object.assign(new Error("Request is no longer pending"), { status: 400 });
  }
  if (!canReviewRequest(reviewerRole, reviewerId, request.assessment.assignedById)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  const now = new Date();
  if (action === "reject") {
    return prisma.reattemptRequest.update({
      where: { id: requestId },
      data: {
        status: ReattemptRequestStatus.rejected,
        reviewedById: reviewerId,
        reviewedAt: now,
        managerNote: managerNote?.trim() || null,
      },
      include: {
        assessment: {
          include: {
            skill: true,
            topics: { include: { topic: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        },
        candidate: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.reattemptRequest.update({
      where: { id: requestId },
      data: {
        status: ReattemptRequestStatus.approved,
        reviewedById: reviewerId,
        reviewedAt: now,
        managerNote: managerNote?.trim() || null,
      },
    });
    await tx.assessment.update({
      where: { id: request.assessmentId },
      data: { status: AssessmentStatus.assigned },
    });
    return tx.reattemptRequest.findUnique({
      where: { id: updated.id },
      include: {
        assessment: {
          include: {
            skill: true,
            topics: { include: { topic: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        },
        candidate: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  });
}
