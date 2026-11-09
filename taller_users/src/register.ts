import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "./lib/dynamodb";
import { badRequest, conflict, internalServerError, success } from "./lib/response";
import type { User } from "./types/user";

const usersTable = process.env.USERS_TABLE;

export async function register(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!usersTable) {
    console.error("USERS_TABLE is not configured");
    return internalServerError("No se pudo completar el registro.");
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

  const { email, password, name } = body as Record<string, unknown>;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof name !== "string"
  ) {
    return badRequest("Se requieren email, password y name.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    normalizedName.length === 0 ||
    normalizedName.length > 100 ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return badRequest(
      "Ingresa un email válido, un nombre de hasta 100 caracteres y una contraseña de 8 a 72 bytes.",
    );
  }

  try {
    const existingUser = await dynamoDb.send(
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

    if (existingUser.Items && existingUser.Items.length > 0) {
      return conflict("Ya existe una cuenta con ese email.");
    }

    const now = new Date().toISOString();
    const user: User = {
      userId: randomUUID(),
      email: normalizedEmail,
      name: normalizedName,
      passwordHash: await bcrypt.hash(password, 10),
      role: "user",
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: usersTable,
        Item: user,
        ConditionExpression: "attribute_not_exists(userId)",
      }),
    );

    const { passwordHash: _passwordHash, ...publicUser } = user;
    return success(201, {
      success: true,
      message: "Usuario registrado exitosamente.",
      user: publicUser,
    });
  } catch (error) {
    console.error("Error registering user", error);
    return internalServerError("No se pudo completar el registro.");
  }
}