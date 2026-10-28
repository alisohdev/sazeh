import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../src/vercel-handler.js";

export const config = { api: { bodyParser: false } };

export default function api(request: IncomingMessage, response: ServerResponse): Promise<void> {
  return handler(request, response);
}
