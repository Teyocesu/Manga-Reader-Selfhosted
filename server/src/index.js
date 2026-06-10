import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "manga-reader-selfhosted" });
});

app.listen(port, host, () => {
  console.log(`Manga Reader API listening on http://${host}:${port}`);
});
