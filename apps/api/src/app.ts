import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./lib/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { adminAgentsRouter } from "./modules/admin/agents.routes";
import { adminAnalyticsRouter } from "./modules/admin/analytics.routes";
import { adminApplicationsRouter } from "./modules/admin/review.routes";
import { adminUsersRouter } from "./modules/admin/users.routes";
import { agentRouter } from "./modules/agent/agent.routes";
import { applicationsRouter } from "./modules/applications/applications.routes";
import { adminCmsRouter, blogRouter } from "./modules/cms/cms.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { plansRouter } from "./modules/plans/plans.routes";
import { securityRouter } from "./modules/security/security.routes";

export function createApp() {
  const app = express();
  // Behind Render/Vercel proxies, so req.ip (audit logs) is the client, not the proxy.
  if (env.trustProxyHops > 0) app.set("trust proxy", env.trustProxyHops);
  app.disable("x-powered-by");

  app.use(cors({ origin: env.webOrigin, credentials: true }));
  // Blog posts are the largest JSON bodies (up to BLOG_CONTENT_MAX chars of HTML).
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", securityRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/blog", blogRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/agent", agentRouter);
  app.use("/api/admin/users", adminUsersRouter);
  app.use("/api/admin/agents", adminAgentsRouter);
  app.use("/api/admin/applications", adminApplicationsRouter);
  app.use("/api/admin/analytics", adminAnalyticsRouter);
  app.use("/api/admin/cms", adminCmsRouter);

  app.use(errorHandler);

  return app;
}
