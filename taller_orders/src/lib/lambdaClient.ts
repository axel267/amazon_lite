import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

export interface ProductSnapshot {
  productId: string;
  name: string;
  price: number;
  stock: number;
}

export class ProductLookupError extends Error {
  constructor(
    message: string,
    readonly statusCode: 404 | 502,
  ) {
    super(message);
    this.name = "ProductLookupError";
  }
}

const endpoint = process.env.LAMBDA_ENDPOINT;
const productFunction = process.env.GET_PRODUCT_FUNCTION;
const sellerProductsFunction = process.env.LIST_PRODUCTS_BY_SELLER_FUNCTION;
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  ...(endpoint ? { endpoint } : {}),
});

export async function getProduct(productId: string): Promise<ProductSnapshot> {
  if (!productFunction) {
    throw new Error("GET_PRODUCT_FUNCTION is not configured");
  }

  const result = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: productFunction,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(
        JSON.stringify({
          pathParameters: { id: productId },
          headers: {},
          requestContext: {},
        }),
      ),
    }),
  );

  if (result.FunctionError) {
    throw new ProductLookupError(
      "El servicio de productos no pudo consultar el producto.",
      502,
    );
  }

  let invocation: { statusCode?: number; body?: string };
  try {
    invocation = JSON.parse(
      Buffer.from(result.Payload ?? []).toString("utf8"),
    ) as { statusCode?: number; body?: string };
  } catch {
    throw new ProductLookupError(
      "El servicio de productos devolvió una respuesta inválida.",
      502,
    );
  }

  if (invocation.statusCode === 404) {
    throw new ProductLookupError("Producto no encontrado.", 404);
  }
  if (invocation.statusCode !== 200 || typeof invocation.body !== "string") {
    throw new ProductLookupError(
      "No se pudo consultar el producto.",
      502,
    );
  }

  let body: { product?: unknown };
  try {
    body = JSON.parse(invocation.body) as { product?: unknown };
  } catch {
    throw new ProductLookupError(
      "El servicio de productos devolvió una respuesta inválida.",
      502,
    );
  }

  if (
    typeof body.product !== "object" ||
    body.product === null ||
    Array.isArray(body.product)
  ) {
    throw new ProductLookupError(
      "El servicio de productos devolvió una respuesta inválida.",
      502,
    );
  }

  const product = body.product as Record<string, unknown>;
  if (
    typeof product.productId !== "string" ||
    typeof product.name !== "string" ||
    typeof product.price !== "number" ||
    !Number.isFinite(product.price) ||
    typeof product.stock !== "number" ||
    !Number.isInteger(product.stock)
  ) {
    throw new ProductLookupError(
      "El servicio de productos devolvió datos inválidos.",
      502,
    );
  }

  return {
    productId: product.productId,
    name: product.name,
    price: product.price,
    stock: product.stock,
  };
}

export async function listSellerProductIds(
  sellerId: string,
): Promise<Set<string>> {
  if (!sellerProductsFunction) {
    throw new Error("LIST_PRODUCTS_BY_SELLER_FUNCTION is not configured");
  }

  const result = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: sellerProductsFunction,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(
        JSON.stringify({
          pathParameters: { sellerId },
          headers: {},
          requestContext: {},
        }),
      ),
    }),
  );

  if (result.FunctionError) {
    throw new ProductLookupError(
      "El servicio de productos no pudo consultar los productos del vendedor.",
      502,
    );
  }

  let invocation: { statusCode?: number; body?: string };
  try {
    invocation = JSON.parse(
      Buffer.from(result.Payload ?? []).toString("utf8"),
    ) as { statusCode?: number; body?: string };
  } catch {
    throw new ProductLookupError(
      "El servicio de productos devolvió una respuesta inválida.",
      502,
    );
  }

  if (invocation.statusCode !== 200 || typeof invocation.body !== "string") {
    throw new ProductLookupError(
      "No se pudieron consultar los productos del vendedor.",
      502,
    );
  }

  let body: { products?: unknown };
  try {
    body = JSON.parse(invocation.body) as { products?: unknown };
  } catch {
    throw new ProductLookupError(
      "El servicio de productos devolvió una respuesta inválida.",
      502,
    );
  }

  if (!Array.isArray(body.products)) {
    throw new ProductLookupError(
      "El servicio de productos devolvió una respuesta inválida.",
      502,
    );
  }

  const productIds = new Set<string>();
  for (const product of body.products) {
    if (
      typeof product !== "object" ||
      product === null ||
      Array.isArray(product) ||
      typeof (product as Record<string, unknown>).productId !== "string"
    ) {
      throw new ProductLookupError(
        "El servicio de productos devolvió datos inválidos.",
        502,
      );
    }
    productIds.add((product as Record<string, unknown>).productId as string);
  }
  return productIds;
}
