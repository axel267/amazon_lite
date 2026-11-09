import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { getAuthenticatedUser } from "../lib/auth";
import { dynamoDb } from "../lib/dynamodb";
import { getProduct, ProductLookupError } from "../lib/lambdaClient";
import {
  badGateway,
  badRequest,
  conflict,
  internalServerError,
  notFound,
  success,
  unauthorized,
} from "../lib/response";
import type { Order, RequestedOrderItem } from "../types/order";

const ordersTable = process.env.ORDERS_TABLE;

function parseItems(body: unknown): RequestedOrderItem[] | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }

  const items = (body as Record<string, unknown>).items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 24) {
    return undefined;
  }

  const parsed: RequestedOrderItem[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return undefined;
    }

    const { productId, quantity } = item as Record<string, unknown>;
    if (
      typeof productId !== "string" ||
      productId.trim().length === 0 ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return undefined;
    }

    parsed.push({ productId: productId.trim(), quantity });
  }
  return parsed;
}

export async function createOrder(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!ordersTable) {
    console.error("ORDERS_TABLE is not configured");
    return internalServerError("No se pudo crear la orden.");
  }

  const authenticatedUser = getAuthenticatedUser(event);
  if (!authenticatedUser) {
    return unauthorized("Se requiere iniciar sesión para crear una orden.");
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

  const requestedItems = parseItems(body);
  if (!requestedItems) {
    return badRequest(
      "Envía de 1 a 24 productos; cada uno debe tener productId y quantity entero positivo.",
    );
  }

  try {
    const quantities = new Map<string, number>();
    for (const item of requestedItems) {
      const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity)) {
        return badRequest("La cantidad solicitada es demasiado grande.");
      }
      quantities.set(item.productId, quantity);
    }

    const items: Order["items"] = [];
    for (const [productId, quantity] of quantities) {
      const product = await getProduct(productId);
      if (product.stock < quantity) {
        return conflict(
          `Stock insuficiente para el producto "${product.name}".`,
        );
      }

      const subtotal = product.price * quantity;
      if (!Number.isFinite(subtotal)) {
        return badRequest("El total de la orden no es válido.");
      }
      items.push({
        productId,
        name: product.name,
        quantity,
        unitPrice: product.price,
        subtotal,
      });
    }

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    if (!Number.isFinite(total)) {
      return badRequest("El total de la orden no es válido.");
    }

    const now = new Date().toISOString();
    const order: Order = {
      orderId: randomUUID(),
      userId: authenticatedUser.userId,
      items,
      total,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: ordersTable,
        Item: order,
        ConditionExpression: "attribute_not_exists(orderId)",
      }),
    );

    return success(201, {
      success: true,
      message: "Orden creada exitosamente.",
      order,
    });
  } catch (error) {
    if (error instanceof ProductLookupError) {
      if (error.statusCode === 404) {
        return notFound(error.message);
      }
      return badGateway(error.message);
    }
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return conflict("No se pudo registrar la orden. Inténtalo nuevamente.");
    }
    console.error("Error creating order", error);
    return internalServerError("No se pudo crear la orden.");
  }
}
