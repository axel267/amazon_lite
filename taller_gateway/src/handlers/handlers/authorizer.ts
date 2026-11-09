import type {
  APIGatewayTokenAuthorizerHandler,
  APIGatewayAuthorizerResult,
} from "aws-lambda";
import { verifyAccessToken } from "../lib/jwt";

const generatePolicy = (
  principalId: string,
  effect: "Allow" | "Deny",
  resource: string,
  context?: Record<string, string>,
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resource,
      },
    ],
  },
  context,
});

export const authorizer: APIGatewayTokenAuthorizerHandler = async (event) => {
  const token = event.authorizationToken?.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Error("Unauthorized");
  }

  try {
    const payload = verifyAccessToken(token);
    return generatePolicy(payload.userId, "Allow", event.methodArn, {
      userId: payload.userId,
      role: payload.role,
    });
  } catch {
    throw new Error("Unauthorized");
  }
};
