export type User = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

export type Product = {
  productId: string;
  sellerId: string;
  name: string;
  description: string;
  price: number;
  stock: number;
};

export type Order = {
  orderId: string;
  userId: string;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  total: number;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
};

export type LoginResponse = {
  accessToken: string;
  user: User;
};

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl = (
  configuredApiUrl ??
  "http://localhost:4566/restapis/zzc2yntndk/local/_user_request_"
).replace(/\/+$/, "");

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
};

function getApiMessage(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("message" in payload)) {
    return undefined;
  }
  return typeof payload.message === "string" ? payload.message : undefined;
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const responseText = await response.text();
  let payload: unknown;

  try {
    payload = responseText.length === 0 ? undefined : JSON.parse(responseText);
  } catch {
    if (response.ok) {
      throw new Error("La API devolvió una respuesta que no es JSON válido.");
    }
    throw new Error(`La solicitud falló (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(getApiMessage(payload) ?? `La solicitud falló (HTTP ${response.status}).`);
  }
  if (payload === undefined) {
    throw new Error("La API devolvió una respuesta vacía.");
  }

  return payload as T;
}
