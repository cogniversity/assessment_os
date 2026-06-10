import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { ensureUploadDirs } from "./services/storage.js";
import { authRouter } from "./routes/auth.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { assessmentsRouter } from "./routes/assessments.js";
import { attemptsRouter } from "./routes/attempts.js";
import { adminRouter } from "./routes/admin/index.js";
import { managerRouter } from "./routes/manager/index.js";
import { profileRouter } from "./routes/profile.js";
import { certificatesRouter } from "./routes/certificates.js";
import { analyticsRouter } from "./routes/analytics.js";
import { photosRouter } from "./routes/photos.js";
import { questionImportTemplateRouter } from "./routes/questionImportTemplate.js";
import { reattemptRequestsRouter } from "./routes/reattemptRequests.js";
import { requireAuth } from "./middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Secure cookies only on HTTPS unless SESSION_COOKIE_SECURE is set explicitly. */
function sessionCookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  try {
    return new URL(config.clientUrl).protocol === "https:";
  } catch {
    return false;
  }
}

async function main() {
  await ensureUploadDirs();

  const app = express();
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: sessionCookieSecure(),
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );

  const api = config.apiBasePath;
  app.use(`${api}/auth`, authRouter);
  app.use(`${api}/assignments`, assignmentsRouter);
  app.use(`${api}/assessments`, assessmentsRouter);
  app.use(`${api}/attempts`, attemptsRouter);
  app.use(`${api}/admin`, adminRouter);
  app.use(`${api}/manager`, managerRouter);
  app.use(`${api}/profile`, profileRouter);
  app.use(`${api}/certificates`, certificatesRouter);
  app.use(`${api}/analytics`, analyticsRouter);
  app.use(`${api}/photos`, photosRouter);
  app.use(`${api}/question-import`, questionImportTemplateRouter);
  app.use(`${api}/reattempt-requests`, reattemptRequestsRouter);

  app.get(`${api}/health`, (_req, res) => res.json({ ok: true }));

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

main().catch(console.error);
