import type {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
} from "aws-lambda";
import { getCorsHeaders } from "../../common/cors";

export async function ping(
    event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
    console.log("Desde Lambda", event);
    console.log("Ping desde Lambda");

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders("OPTIONS,GET"),
        },
        body: JSON.stringify({ message: "Hola desde Lambda" }),
    };
}

export const handler = ping;