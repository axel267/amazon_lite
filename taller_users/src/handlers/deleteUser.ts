import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import { getAuthenticatedUserId } from "../lib/auth";
import {
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";

const usersTable = process.env.USERS_TABLE;
const refreshTokensTable = process.env.REFRESH_TOKENS_TABLE;

async function deleteRefreshTokens(userId: string): Promise<void> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: refreshTokensTable,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ProjectionExpression: "userId, #token",
        ExpressionAttributeNames: { "#token": "token" },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of result.Items ?? []) {
      if (typeof item.token !== "string") {
        throw new Error("Refresh token record has an invalid token");
      }

      await dynamoDb.send(
        new DeleteCommand({
          TableName: refreshTokensTable,
          Key: { userId, token: item.token },
        }),
      );
    }

    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
}

export async function deleteUser(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!usersTable || !refreshTokensTable) {
    console.error("USERS_TABLE or REFRESH_TOKENS_TABLE is not configured");
    return internalServerError("No se pudo eliminar el usuario.");
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
    return forbidden("Solo puedes eliminar tu propio usuario.");
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

    await deleteRefreshTokens(userId);
    await dynamoDb.send(
      new DeleteCommand({
        TableName: usersTable,
        Key: { userId },
        ConditionExpression: "attribute_exists(userId)",
      }),
    );

    return success(200, {
      success: true,
      message: "Usuario eliminado exitosamente.",
    });
  } catch (error) {
    console.error("Error deleting user", error);
    return internalServerError("No se pudo eliminar el usuario.");
  }
}
