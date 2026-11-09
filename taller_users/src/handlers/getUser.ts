import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import {
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";
import { getAuthenticatedUserId } from "../lib/auth";

const usersTable = process.env.USERS_TABLE;

export async function getUser(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!usersTable) {
    console.error("USERS_TABLE is not configured");
    return internalServerError("No se pudo obtener el usuario.");
  }

  const userId = event.pathParameters?.id;
  if (!userId) {
    return notFound("El id es necesario en la ruta.");
  }

  const authenticatedUserId = getAuthenticatedUserId(event);
  if (!authenticatedUserId) {
    return unauthorized("Se requiere un token de acceso válido.");
  }
  if (authenticatedUserId !== userId) {
    return forbidden("No tienes permiso para consultar este usuario.");
  }

  try {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: usersTable,
        Key: { userId },
      }),
    );

    if (!result.Item) {
      return notFound("Usuario no encontrado en la base de datos.");
    }

    const { passwordHash: _passwordHash, ...publicUser } = result.Item;
    return success(200, { user: publicUser });
  } catch (error) {
    console.error("Error getting user", error);
    return internalServerError("No se pudo obtener el usuario.");
  }
}
