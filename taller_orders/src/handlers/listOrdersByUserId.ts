import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getAuthenticatedUser } from "../lib/auth";
import { dynamoDb } from "../lib/dynamodb";
import {
  badRequest,
  forbidden,
  internalServerError,
  success,
  unauthorized,
} from "../lib/response";

const ordersTable = process.env.ORDERS_TABLE;
const maxPageSize = 100;

function getLimit(event: APIGatewayProxyEvent): number | undefined {
  const value = event.queryStringParameters?.limit;
  if (value === undefined || value === null) {
    return 50;
  }
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= maxPageSize
    ? limit
    : undefined;
}

function getExclusiveStartKey(
  token: string | null | undefined,
  userId: string,
): Record<string, unknown> | undefined | null {
  if (!token) {
    return undefined;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    );
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      Array.isArray(decoded)
    ) {
      return null;
    }

    const key = decoded as Record<string, unknown>;
    if (
      key.userId !== userId ||
      typeof key.orderId !== "string" ||
      typeof key.createdAt !== "string"
    ) {
      return null;
    }
    return {
      orderId: key.orderId,
      userId: key.userId,
      createdAt: key.createdAt,
    };
  } catch {
    return null;
  }
}

export async function listOrdersByUserId(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!ordersTable) {
    console.error("ORDERS_TABLE is not configured");
    return internalServerError("No se pudieron consultar las órdenes.");
  }

  const authenticatedUser = getAuthenticatedUser(event);
  if (!authenticatedUser) {
    return unauthorized("Se requiere un token de acceso válido.");
  }

  const userId = event.pathParameters?.userId;
  if (!userId) {
    return badRequest("El userId es necesario en la ruta.");
  }
  if (userId !== authenticatedUser.userId) {
    return forbidden("Solo puedes listar tus propias órdenes.");
  }

  const limit = getLimit(event);
  if (limit === undefined) {
    return badRequest(`El límite debe ser un entero entre 1 y ${maxPageSize}.`);
  }

  const exclusiveStartKey = getExclusiveStartKey(
    event.queryStringParameters?.nextToken,
    userId,
  );
  if (exclusiveStartKey === null) {
    return badRequest("El nextToken no es válido para este usuario.");
  }

  try {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: ordersTable,
        IndexName: "UserIdIndex",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    return success(200, {
      success: true,
      orders: result.Items ?? [],
      count: result.Count ?? 0,
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
            "base64url",
          )
        : null,
    });
  } catch (error) {
    console.error("Error listing orders by user", error);
    return internalServerError("No se pudieron consultar las órdenes.");
  }
}
