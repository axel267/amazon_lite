import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import {
  badRequest,
  forbidden,
  internalServerError,
  success,
  unauthorized,
} from "../lib/response";
import { getAuthenticatedUser } from "../lib/auth";
import type { Product } from "../types/product";

const productsTable = process.env.PRODUCTS_TABLE;

export async function createProduct(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudo crear el producto.");
  }

  const authenticatedUser = getAuthenticatedUser(event);
  if (!authenticatedUser) {
    return unauthorized("Se requiere un token de acceso válido.");
  }
  if (authenticatedUser.role !== "seller") {
    return forbidden("Solo los vendedores pueden crear productos.");
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

  const { name, description, price, stock } = body as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 120 ||
    typeof description !== "string" ||
    description.trim().length === 0 ||
    description.trim().length > 2000
  ) {
    return badRequest(
      "Se requieren un nombre (hasta 120 caracteres) y una descripción (hasta 2000 caracteres).",
    );
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return badRequest("El precio debe ser un número mayor que cero.");
  }
  if (
    typeof stock !== "number" ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return badRequest("El stock debe ser un entero mayor o igual a cero.");
  }

  const now = new Date().toISOString();
  const product: Product = {
    productId: randomUUID(),
    sellerId: authenticatedUser.userId,
    name: name.trim(),
    description: description.trim(),
    price,
    stock,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: productsTable,
        Item: product,
        ConditionExpression: "attribute_not_exists(productId)",
      }),
    );

    return success(201, {
      success: true,
      message: "Producto creado exitosamente.",
      product,
    });
  } catch (error) {
    console.error("Error creating product", error);
    return internalServerError("No se pudo crear el producto.");
  }
}
