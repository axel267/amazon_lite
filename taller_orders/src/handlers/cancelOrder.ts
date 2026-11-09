import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getAuthenticatedUser } from "../lib/auth";
import { dynamoDb } from "../lib/dynamodb";
import { listSellerProductIds, ProductLookupError } from "../lib/lambdaClient";
import {
  badGateway,
  badRequest,
  conflict,
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";
import type { Order } from "../types/order";

const ordersTable = process.env.ORDERS_TABLE;

export async function cancelOrder(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!ordersTable) {
    console.error("ORDERS_TABLE is not configured");
    return internalServerError("No se pudo cancelar la orden.");
  }

  const authenticatedUser = getAuthenticatedUser(event);
  if (!authenticatedUser) {
    return unauthorized("Se requiere un token de acceso válido.");
  }

  const orderId = event.pathParameters?.id;
  if (!orderId) {
    return badRequest("El id de la orden es necesario en la ruta.");
  }

  try {
    const existing = await dynamoDb.send(
      new GetCommand({
        TableName: ordersTable,
        Key: { orderId },
      }),
    );
    if (!existing.Item) {
      return notFound("La orden no fue encontrada.");
    }

    const order = existing.Item as Order;
    if (order.status !== "pending") {
      return conflict(
        `No se puede cancelar una orden con estado "${order.status}".`,
      );
    }

    const isBuyer = order.userId === authenticatedUser.userId;
    if (!isBuyer) {
      if (authenticatedUser.role !== "seller" || !Array.isArray(order.items)) {
        return forbidden(
          "Solo el comprador o un vendedor con productos en la orden puede cancelarla.",
        );
      }

      const sellerProductIds = await listSellerProductIds(
        authenticatedUser.userId,
      );
      if (!order.items.some((item) => sellerProductIds.has(item.productId))) {
        return forbidden(
          "Solo el comprador o un vendedor con productos en la orden puede cancelarla.",
        );
      }
    }

    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: ordersTable,
        Key: { orderId },
        UpdateExpression: "SET #status = :cancelled, updatedAt = :updatedAt",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":cancelled": "cancelled",
          ":pending": "pending",
          ":updatedAt": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    return success(200, {
      success: true,
      message: "Orden cancelada exitosamente.",
      order: result.Attributes,
    });
  } catch (error) {
    if (error instanceof ProductLookupError) {
      return badGateway(error.message);
    }
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return conflict("La orden ya no está pendiente.");
    }
    console.error("Error cancelling order", error);
    return internalServerError("No se pudo cancelar la orden.");
  }
}
