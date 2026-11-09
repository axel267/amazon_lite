import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import bcrypt from "bcryptjs";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import {
  badRequest,
  internalServerError,
  success,
  unauthorized,
} from "../lib/response";
import { generateAccessToken, generateRefreshToken } from "../lib/jwt";
import type { User } from "../types/user";

const usersTable = process.env.USERS_TABLE;
const refreshTokensTable = process.env.REFRESH_TOKENS_TABLE;
const refreshTokenLifetimeSeconds = 7 * 24 * 60 * 60;

export async function login(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!usersTable || !refreshTokensTable) {
    console.error("USERS_TABLE or REFRESH_TOKENS_TABLE is not configured");
    return internalServerError("No se pudo completar el inicio de sesión.");
  }

  if (!event.body) {
    return badRequest("El cuerpo de la solicitud es obligatorio.");
  }

  let body: unknown;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    body = JSON.parse(rawBody);
  } catch {
    return badRequest("El cuerpo debe ser JSON válido.");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return badRequest("El cuerpo debe ser un objeto JSON.");
  }

  const { email, password } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim().length === 0 ||
    password.length === 0
  ) {
    return badRequest("Se requieren email y password.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: usersTable,
        IndexName: "EmailIndex",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": normalizedEmail,
        },
        Limit: 1,
      }),
    );

    const user = result.Items?.[0] as User | undefined;
    if (
      !user ||
      typeof user.passwordHash !== "string" ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return unauthorized("Credenciales inválidas.");
    }

    const payload = {
      userId: user.userId,
      email: user.email,
      role: user.role,
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const expiresAt =
      Math.floor(Date.now() / 1000) + refreshTokenLifetimeSeconds;

    await dynamoDb.send(
      new PutCommand({
        TableName: refreshTokensTable,
        Item: {
          userId: user.userId,
          token: refreshToken,
          expiresAt,
        },
      }),
    );

    return success(200, {
      success: true,
      message: "Inicio de sesión exitoso.",
      tokenType: "Bearer",
      accessToken,
      refreshToken,
      expiresIn: 60 * 60,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error logging in user", error);
    return internalServerError("No se pudo completar el inicio de sesión.");
  }
}
