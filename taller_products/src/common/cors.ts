const allowedHeaders =
  "Content-Type, Authorization, X-Api-Key, X-Amz-Date, X-Amz-Security-Token";

export function getCorsHeaders(methods: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGINS ?? "*",
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Allow-Methods": methods,
  };
}
