import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_COOKIE_NAME = "nexo_growth_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sessionSecret(): string | null {
  return process.env.SESSION_SECRET?.trim() || null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createAdminSessionToken(): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("Admin session is not configured");
  }

  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function isValidAdminSessionToken(token: unknown): boolean {
  const secret = sessionSecret();
  if (!secret || typeof token !== "string") {
    return false;
  }

  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return false;
  }

  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/i.test(suppliedSignature)) {
    return false;
  }

  const expected = Buffer.from(sign(payload, secret), "hex");
  const supplied = Buffer.from(suppliedSignature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return false;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("expiresAt" in decoded) ||
      typeof decoded.expiresAt !== "number"
    ) {
      return false;
    }
    return decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function verifyAdminPassword(candidate: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const secret = sessionSecret();
  if (!configuredPassword || !secret) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(configuredPassword)
    .digest();
  const supplied = createHmac("sha256", secret).update(candidate).digest();
  return timingSafeEqual(expected, supplied);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isValidAdminSessionToken(req.cookies?.[ADMIN_COOKIE_NAME])) {
    next();
    return;
  }

  res.status(401).json({ error: "Inicia sesión para continuar." });
}