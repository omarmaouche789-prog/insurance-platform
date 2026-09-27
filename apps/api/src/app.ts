import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./lib/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin/users", usersRouter);

  app.use(errorHandler);

  return app;
}
