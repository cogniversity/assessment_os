import { Router } from "express";
import { requireAuth, requireRole, requireAdminOrManagerRead, requireAdminOrManager } from "../../middleware/auth.js";
import { Role } from "@assessment-os/shared";
import { categoriesRouter } from "./categories.js";
import { skillsRouter } from "./skills.js";
import { topicsRouter } from "./topics.js";
import { questionsRouter } from "./questions.js";
import { usersRouter } from "./users.js";
import { profileFieldsRouter } from "./profileFields.js";
import { exportRouter } from "./export.js";
import { questionImportRouter } from "./questionImport.js";
import { blueprintsRouter } from "./blueprints.js";
import { appidUsersRouter } from "./appidUsers.js";
import { dataTransferRouter } from "./dataTransfer.js";
import { managerSkillsRouter } from "./managerSkills.js";
import { managerQuestionBanksRouter } from "./managerQuestionBanks.js";

export const adminRouter = Router();
adminRouter.use(requireAuth);

// Catalog + export reads — capability managers need these for assign/results
adminRouter.use("/categories", requireAdminOrManagerRead, categoriesRouter);
adminRouter.use("/skills", requireAdminOrManagerRead, skillsRouter);
adminRouter.use("/topics", requireAdminOrManagerRead, topicsRouter);
adminRouter.use("/export", requireAdminOrManagerRead, exportRouter);

// Questions + blueprints — managers with grants / skill assignments can mutate
adminRouter.use("/questions", requireAdminOrManager, questionsRouter);
adminRouter.use("/blueprints", requireAdminOrManager, blueprintsRouter);

// Admin-only
adminRouter.use(requireRole(Role.ADMIN));
adminRouter.use("/users", usersRouter);
adminRouter.use("/profile-fields", profileFieldsRouter);
adminRouter.use("/question-import", questionImportRouter);
adminRouter.use("/appid-users", appidUsersRouter);
adminRouter.use("/data-transfer", dataTransferRouter);
adminRouter.use("/manager-skills", managerSkillsRouter);
adminRouter.use("/manager-question-banks", managerQuestionBanksRouter);
