import express from "express";
import morgan from "morgan";
import { env } from "./config/env.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${env.PORT}`);
});

