import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getAuthenticatedUser } from "../lib/auth";
import { dynamoDb } from "../lib/dynamodb";
import {
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";

const ordersTable = process.env.ORDERS_TABLE;

export async function getOrder(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!ordersTable) {
    console.error("ORDERS_TABLE is not configured");
    return internalServerError("No se pudo consultar la orden.");
  }

  const authenticatedUser = getAuthenticatedUser(event);
  if (!authenticatedUser) {
    return unauthorized("Se requiere un token de acceso válido.");
  }

  const orderId = event.pathParameters?.id;
  if (!orderId) {
    return notFound("El id de la orden es necesario en la ruta.");
  }

  try {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: ordersTable,
        Key: { orderId },
      }),
    );

    if (!result.Item) {
      return notFound("La orden no fue encontrada.");
    }
    if (result.Item.userId !== authenticatedUser.userId) {
      return forbidden("Solo puedes consultar tus propias órdenes.");
    }

    return success(200, {
      success: true,
      order: result.Item,
    });
  } catch (error) {
    console.error("Error getting order", error);
    return internalServerError("No se pudo consultar la orden.");
  }
}
