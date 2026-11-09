import type { APIGatewayProxyEvent } from "aws-lambda";
import { verifyAccessToken } from "./jwt";
import type { AccessTokenPayload } from "./jwt";

export function getAuthenticatedUser(
  event: APIGatewayProxyEvent,
): AccessTokenPayload | undefined {
  const authorization =
    event.headers.Authorization ?? event.headers.authorization;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  try {
    const payload = verifyAccessToken(match[1]);
    const authorizer = event.requestContext.authorizer;
    if (
      (typeof authorizer?.userId === "string" &&
        authorizer.userId !== payload.userId) ||
      (typeof authorizer?.role === "string" &&
        authorizer.role !== payload.role)
    ) {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}
