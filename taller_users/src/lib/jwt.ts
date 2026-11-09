import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AccessTokenPayload {
  userId: string;
  role: string;
}

function getSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const secret = process.env[name];
  if (!secret) {
    throw new Error(`${name} is not configured`);
  }
  return secret;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret("JWT_SECRET"), { expiresIn: "1h" });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    getSecret("JWT_REFRESH_SECRET"),
    { expiresIn: "7d" },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, getSecret("JWT_SECRET"));
  if (
    typeof payload === "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Access token has an invalid payload");
  }

  return {
    userId: payload.userId,
    role: payload.role,
  };
}
