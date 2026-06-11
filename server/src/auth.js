import crypto from "node:crypto";
import { Router } from "express";
import { config } from "./config.js";

const cookieName = "manga_reader_auth";
const token = config.appPassword
  ? crypto.createHash("sha256").update(config.appPassword).digest("hex")
  : "";

export const authRouter = Router();

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, decodeURIComponent(value)])
  );
}

function isAuthenticated(req) {
  if (!config.appPassword) {
    return true;
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies[cookieName] === token;
}

authRouter.get("/auth/status", (req, res) => {
  res.json({
    requiresPassword: Boolean(config.appPassword),
    authenticated: isAuthenticated(req)
  });
});

authRouter.post("/auth/login", (req, res) => {
  if (!config.appPassword) {
    return res.json({ authenticated: true });
  }

  if (req.body?.password !== config.appPassword) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/"
  });
  res.json({ authenticated: true });
});

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) {
    next();
    return;
  }

  res.status(401).json({ error: "Necesitás ingresar la contraseña de la app." });
}
