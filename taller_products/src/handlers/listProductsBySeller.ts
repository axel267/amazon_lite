import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import {
  internalServerError,
  notFound,
  success,
} from "../lib/response";

const productsTable = process.env.PRODUCTS_TABLE;

export async function listProductsBySeller(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudieron obtener los productos del vendedor.");
  }

  const sellerId = event.pathParameters?.sellerId;
  if (!sellerId) {
    return notFound("El id del vendedor es necesario en la ruta.");
  }

  try {
    const products: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await dynamoDb.send(
        new QueryCommand({
          TableName: productsTable,
          IndexName: "SellerIdIndex",
          KeyConditionExpression: "sellerId = :sellerId",
          ExpressionAttributeValues: {
            ":sellerId": sellerId,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      products.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return success(200, { products });
  } catch (error) {
    console.error("Error listing seller products", error);
    return internalServerError(
      "No se pudieron obtener los productos del vendedor.",
    );
  }
}
