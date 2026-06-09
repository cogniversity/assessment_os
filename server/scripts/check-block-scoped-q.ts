import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
prisma.question
  .findMany({
    where: { stem: { contains: "block-scoped", mode: "insensitive" } },
    select: { id: true, stem: true, questionType: true, correctIndices: true, status: true },
  })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
  })
  .finally(() => prisma.$disconnect());
