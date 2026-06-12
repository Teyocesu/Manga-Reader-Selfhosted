import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { authRouter, requireAuth } from "./auth.js";
import { libraryRouter } from "./routes/library.js";
import { pagesRouter } from "./routes/pages.js";
import { progressRouter } from "./routes/progress.js";
import { uploadLimitErrorMessage, uploadRouter } from "./routes/upload.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const clientDistDir = path.join(rootDir, "client", "dist");

if (process.env.NODE_ENV === "production" && !config.appPassword) {
  console.warn(
    "WARNING: NODE_ENV=production without APP_PASSWORD. Set APP_PASSWORD before exposing this app online."
  );
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "img-src": ["'self'", "data:"]
    }
  },
  crossOriginResourcePolicy: { policy: "same-site" },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "manga-reader-selfhosted" });
});

app.use("/api", authRouter);
app.use("/api", requireAuth);

app.get("/api/config", (_req, res) => {
  res.json({
    upload: {
      maxUploadMb: config.maxUploadMb,
      maxImagesPerChapter: config.maxImagesPerChapter,
      supportedFormats: [".zip", ".cbz", ".rar", ".cbr"]
    }
  });
});

app.use("/api", libraryRouter);
app.use("/api", pagesRouter);
app.use("/api", progressRouter);
app.use("/api", uploadRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDistDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  const status = error.statusCode || (error.name === "MulterError" ? 400 : 500);
  const message = error.code === "LIMIT_FILE_SIZE" ? uploadLimitErrorMessage() : error.message;
  res.status(status).json({
    error: status === 400 ? message : "Unexpected server error"
  });
});

app.listen(port, host, () => {
  console.log(`Manga Reader API listening on http://${host}:${port}`);
});
