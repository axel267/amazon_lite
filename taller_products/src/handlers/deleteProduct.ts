import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import { getAuthenticatedUser } from "../lib/auth";
import {
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";

const productsTable = process.env.PRODUCTS_TABLE;

export async function deleteProduct(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudo eliminar el producto.");
  }

  const productId = event.pathParameters?.id;
  if (!productId) {
    return notFound("El id del producto es necesario en la ruta.");
  }

  const authenticatedUser = getAuthenticatedUser(event);
  if (!authenticatedUser) {
    return unauthorized("Se requiere un token de acceso válido.");
  }
  if (authenticatedUser.role !== "seller") {
    return forbidden("Solo los vendedores pueden eliminar productos.");
  }

  try {
    const existing = await dynamoDb.send(
      new GetCommand({
        TableName: productsTable,
        Key: { productId },
      }),
    );
    if (!existing.Item) {
      return notFound("Producto no encontrado.");
    }
    if (existing.Item.sellerId !== authenticatedUser.userId) {
      return forbidden("Solo puedes eliminar productos que hayas creado.");
    }

    await dynamoDb.send(
      new DeleteCommand({
        TableName: productsTable,
        Key: { productId },
        ConditionExpression: "sellerId = :sellerId",
        ExpressionAttributeValues: {
          ":sellerId": authenticatedUser.userId,
        },
      }),
    );

    return success(200, {
      success: true,
      message: "Producto eliminado exitosamente.",
    });
  } catch (error) {
    console.error("Error deleting product", error);
    return internalServerError("No se pudo eliminar el producto.");
  }
}
