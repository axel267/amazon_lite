import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import { internalServerError, notFound, success } from "../lib/response";

const productsTable = process.env.PRODUCTS_TABLE;

export async function getProduct(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudo obtener el producto.");
  }

  const productId = event.pathParameters?.id;
  if (!productId) {
    return notFound("El id del producto es necesario en la ruta.");
  }

  try {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: productsTable,
        Key: { productId },
      }),
    );

    if (!result.Item) {
      return notFound("Producto no encontrado.");
    }

    return success(200, { product: result.Item });
  } catch (error) {
    console.error("Error getting product", error);
    return internalServerError("No se pudo obtener el producto.");
  }
}
