import path from "node:path";
import express from "express";
import morgan from "morgan";
import multer from "multer";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./config/env.js";
import { connectMongo } from "./db/mongoose.js";
import { UserModel } from "./models/User.js";
import { AskHistoryModel } from "./models/AskHistory.js";
import { authRequired, type AuthedRequest } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { ingestMarkdownFiles } from "./services/ingest.js";
import { askGrounded } from "./services/rag.js";
import { ingestDocsDirOnStart } from "./services/startupIngest.js";

await connectMongo();
// Fire-and-forget: seed `data/docs` into Chroma on startup (deduped).
ingestDocsDirOnStart().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));

const publicDir = path.join(process.cwd(), "web");
app.use(express.static(publicDir));

app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Auth ---
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password required" });
    }
    if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({ email: email.toLowerCase().trim(), passwordHash, createdAt: new Date() });
    return res.json({ userId: String((user as any)._id) });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ error: "email already registered" });
    next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password required" });
    }
    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: "invalid credentials" });
    const ok = await bcrypt.compare(password, (user as any).passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = jwt.sign(
      { sub: String((user as any)._id), email: (user as any).email },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );
    return res.json({ token });
  } catch (err) {
    next(err);
  }
});

// --- Rate limit (per user) ---
const redis = new Redis(env.REDIS_URL);
const askLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // rate-limit-redis expects a fn compatible with Redis "sendCommand"
    sendCommand: (...args: any[]) => (redis as any).call(...args)
  }),
  keyGenerator: (req) => {
    const r = req as AuthedRequest;
    return r.user?.userId ?? req.ip ?? "unknown";
  }
});

// --- Upload/Ingest ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.post("/api/docs/upload", authRequired, upload.array("files"), async (req: AuthedRequest, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) return res.status(400).json({ error: "no files uploaded" });
    const mdFiles = files
      .filter((f) => f.originalname.toLowerCase().endsWith(".md"))
      .map((f) => ({ filename: f.originalname, content: f.buffer.toString("utf8") }));
    if (!mdFiles.length) return res.status(400).json({ error: "only .md files are supported" });
    const result = await ingestMarkdownFiles(mdFiles);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- Ask (RAG) ---
app.post("/api/ask", authRequired, askLimiter, async (req: AuthedRequest, res, next) => {
  const start = Date.now();
  try {
    const { question } = req.body ?? {};
    if (typeof question !== "string") return res.status(400).json({ error: "question required" });

    const result = await askGrounded(question);
    const latencyMs = Date.now() - start;

    await AskHistoryModel.create({
      userId: req.user!.userId as any,
      question: question.slice(0, 500),
      answer: result.answer.slice(0, 4000),
      sources: result.sources,
      confidence: result.confidence,
      latencyMs,
      createdAt: new Date()
    });

    // structured log
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        at: "ask",
        userId: req.user!.userId,
        question: question.slice(0, 80),
        latencyMs,
        confidence: result.confidence
      })
    );

    res.json({ answer: result.answer, sources: result.sources, confidence: result.confidence });
  } catch (err) {
    next(err);
  }
});

app.get("/api/ask/history", authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const items = await AskHistoryModel.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on :${env.PORT}`);
});
