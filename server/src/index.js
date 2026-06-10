import express from "express";
import cors from "cors";
import { libraryRouter } from "./routes/library.js";
import { progressRouter } from "./routes/progress.js";
import { uploadRouter } from "./routes/upload.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "manga-reader-selfhosted" });
});

app.use("/api", libraryRouter);
app.use("/api", progressRouter);
app.use("/api", uploadRouter);

app.use((error, _req, res, _next) => {
  const status = error.name === "MulterError" ? 400 : 500;
  res.status(status).json({
    error: status === 400 ? error.message : "Unexpected server error"
  });
});

app.listen(port, host, () => {
  console.log(`Manga Reader API listening on http://${host}:${port}`);
});
