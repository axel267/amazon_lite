import type { APIGatewayProxyResult } from "aws-lambda";
import { getCorsHeaders } from "../common/cors";

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders("OPTIONS,DELETE,GET,POST,PUT"),
    },
    body: JSON.stringify(body),
  };
}

export function success(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult {
  return jsonResponse(statusCode, body);
}

export function badRequest(message: string): APIGatewayProxyResult {
  return jsonResponse(400, { success: false, message });
}

export function conflict(message: string): APIGatewayProxyResult {
  return jsonResponse(409, { success: false, message });
}

export function unauthorized(message: string): APIGatewayProxyResult {
  return jsonResponse(401, { success: false, message });
}

export function forbidden(message: string): APIGatewayProxyResult {
  return jsonResponse(403, { success: false, message });
}

export function notFound(message: string): APIGatewayProxyResult {
  return jsonResponse(404, { success: false, message });
}

export function internalServerError(message: string): APIGatewayProxyResult {
  return jsonResponse(500, { success: false, message });
}
