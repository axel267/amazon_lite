import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import { getAuthenticatedUserId } from "../lib/auth";
import {
  badRequest,
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";

const usersTable = process.env.USERS_TABLE;

export async function updateUser(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!usersTable) {
    console.error("USERS_TABLE is not configured");
    return internalServerError("No se pudo actualizar el usuario.");
  }

  const userId = event.pathParameters?.id;
  if (!userId) {
    return notFound("Usuario no encontrado.");
  }

  const authenticatedUserId = getAuthenticatedUserId(event);
  if (!authenticatedUserId) {
    return unauthorized("Se requiere un token de acceso válido.");
  }
  if (authenticatedUserId !== userId) {
    return forbidden("Solo puedes actualizar tu propio usuario.");
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

  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) {
    return badRequest("El nombre es obligatorio.");
  }

  const normalizedName = name.trim();
  if (normalizedName.length > 100) {
    return badRequest("El nombre no puede superar los 100 caracteres.");
  }

  try {
    const existing = await dynamoDb.send(
      new GetCommand({
        TableName: usersTable,
        Key: { userId },
      }),
    );
    if (!existing.Item) {
      return notFound("El usuario no fue encontrado.");
    }

    const now = new Date().toISOString();
    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: usersTable,
        Key: { userId },
        UpdateExpression: "SET #name = :name, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: {
          ":name": normalizedName,
          ":updatedAt": now,
        },
        ConditionExpression: "attribute_exists(userId)",
        ReturnValues: "ALL_NEW",
      }),
    );

    const { passwordHash: _passwordHash, ...publicUser } = result.Attributes!;
    return success(200, {
      success: true,
      message: "Usuario actualizado exitosamente.",
      user: publicUser,
    });
  } catch (error) {
    console.error("Error updating user", error);
    return internalServerError("No se pudo actualizar el usuario.");
  }
}
