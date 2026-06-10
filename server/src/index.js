import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { libraryRouter } from "./routes/library.js";
import { pagesRouter } from "./routes/pages.js";
import { progressRouter } from "./routes/progress.js";
import { uploadLimitErrorMessage, uploadRouter } from "./routes/upload.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "manga-reader-selfhosted" });
});

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
