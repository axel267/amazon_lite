import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb } from "../lib/dynamodb";
import { internalServerError, success } from "../lib/response";

const productsTable = process.env.PRODUCTS_TABLE;

export async function listAllProducts(
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  if (!productsTable) {
    console.error("PRODUCTS_TABLE is not configured");
    return internalServerError("No se pudieron obtener los productos.");
  }

  try {
    const products: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await dynamoDb.send(
        new ScanCommand({
          TableName: productsTable,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      products.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return success(200, { products });
  } catch (error) {
    console.error("Error listing products", error);
    return internalServerError("No se pudieron obtener los productos.");
  }
}
