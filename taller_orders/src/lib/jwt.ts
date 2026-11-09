import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
  role: string;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload = jwt.verify(token, secret);
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
