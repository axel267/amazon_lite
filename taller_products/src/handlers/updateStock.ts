import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import { getAuthenticatedUser } from "../lib/auth";
import {
  badRequest,
  forbidden,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";

const productsTable = process.env.PRODUCTS_TABLE;

export async function updateStock(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudo actualizar el stock.");
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
    return forbidden("Solo los vendedores pueden actualizar el stock.");
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

  const { quantity } = body as Record<string, unknown>;
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return badRequest("La cantidad debe ser un entero positivo.");
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
      return forbidden("Solo puedes actualizar el stock de tus productos.");
    }
    if (
      typeof existing.Item.stock !== "number" ||
      existing.Item.stock < quantity
    ) {
      return badRequest("Stock insuficiente.");
    }

    const now = new Date().toISOString();
    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: productsTable,
        Key: { productId },
        UpdateExpression: "SET stock = stock - :quantity, updatedAt = :updatedAt",
        ConditionExpression:
          "sellerId = :sellerId AND stock >= :quantity",
        ExpressionAttributeValues: {
          ":sellerId": authenticatedUser.userId,
          ":quantity": quantity,
          ":updatedAt": now,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    return success(200, {
      success: true,
      message: "Stock actualizado exitosamente.",
      product: result.Attributes,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return badRequest("Stock insuficiente.");
    }
    console.error("Error updating product stock", error);
    return internalServerError("No se pudo actualizar el stock.");
  }
}
