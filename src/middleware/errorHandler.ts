import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  const expose = Boolean(err?.expose) || status < 500;
  const message = expose ? err?.message ?? "Request failed" : "Internal server error";
  res.status(status).json({ error: message });
}
