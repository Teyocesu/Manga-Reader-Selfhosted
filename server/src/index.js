import express from "express";
import cors from "cors";
import { libraryRouter } from "./routes/library.js";
import { progressRouter } from "./routes/progress.js";

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

app.listen(port, host, () => {
  console.log(`Manga Reader API listening on http://${host}:${port}`);
});
