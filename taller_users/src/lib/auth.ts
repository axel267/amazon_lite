import type { APIGatewayProxyEvent } from "aws-lambda";
import { verifyAccessToken } from "./jwt";

export function getAuthenticatedUserId(
  event: APIGatewayProxyEvent,
): string | undefined {
  const authorization =
    event.headers.Authorization ?? event.headers.authorization;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  try {
    const { userId } = verifyAccessToken(match[1]);
    const authorizerUserId = event.requestContext.authorizer?.userId;
    if (
      typeof authorizerUserId === "string" &&
      authorizerUserId !== userId
    ) {
      return undefined;
    }

    return userId;
  } catch {
    return undefined;
  }
}
