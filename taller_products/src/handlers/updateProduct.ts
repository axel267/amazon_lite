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

export async function updateProduct(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudo actualizar el producto.");
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
    return forbidden("Solo los vendedores pueden actualizar productos.");
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

  const fields = body as Record<string, unknown>;
  const allowedFields = ["name", "description", "price", "stock"];
  const providedFields = Object.keys(fields);
  if (
    providedFields.length === 0 ||
    providedFields.some((field) => !allowedFields.includes(field))
  ) {
    return badRequest(
      "Envía al menos un campo editable: name, description, price o stock.",
    );
  }

  const updates: Record<string, string | number> = {};
  if (Object.prototype.hasOwnProperty.call(fields, "name")) {
    const { name } = fields;
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.trim().length > 120
    ) {
      return badRequest("El nombre es obligatorio y no debe superar 120 caracteres.");
    }
    updates.name = name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(fields, "description")) {
    const { description } = fields;
    if (
      typeof description !== "string" ||
      description.trim().length === 0 ||
      description.trim().length > 2000
    ) {
      return badRequest(
        "La descripción es obligatoria y no debe superar 2000 caracteres.",
      );
    }
    updates.description = description.trim();
  }

  if (Object.prototype.hasOwnProperty.call(fields, "price")) {
    const { price } = fields;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return badRequest("El precio debe ser un número mayor que cero.");
    }
    updates.price = price;
  }

  if (Object.prototype.hasOwnProperty.call(fields, "stock")) {
    const { stock } = fields;
    if (
      typeof stock !== "number" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return badRequest("El stock debe ser un entero mayor o igual a cero.");
    }
    updates.stock = stock;
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
      return forbidden("Solo puedes actualizar productos que hayas creado.");
    }

    const now = new Date().toISOString();
    const updateEntries = Object.entries(updates);
    const expressionAttributeNames: Record<string, string> = {
      "#updatedAt": "updatedAt",
    };
    const expressionAttributeValues: Record<string, string | number> = {
      ":sellerId": authenticatedUser.userId,
      ":updatedAt": now,
    };
    const setExpressions = updateEntries.map(([field, value], index) => {
      const nameKey = `#field${index}`;
      const valueKey = `:value${index}`;
      expressionAttributeNames[nameKey] = field;
      expressionAttributeValues[valueKey] = value;
      return `${nameKey} = ${valueKey}`;
    });

    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: productsTable,
        Key: { productId },
        UpdateExpression: `SET ${setExpressions.join(", ")}, #updatedAt = :updatedAt`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: "sellerId = :sellerId",
        ReturnValues: "ALL_NEW",
      }),
    );

    return success(200, {
      success: true,
      message: "Producto actualizado exitosamente.",
      product: result.Attributes,
    });
  } catch (error) {
    console.error("Error updating product", error);
    return internalServerError("No se pudo actualizar el producto.");
  }
}
