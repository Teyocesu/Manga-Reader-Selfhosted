import { Router } from "express";
import { getStorageStatus } from "../storageQuota.js";

export const storageRouter = Router();

storageRouter.get("/storage", async (_req, res, next) => {
  try {
    res.json(await getStorageStatus());
  } catch (error) {
    next(error);
  }
});
