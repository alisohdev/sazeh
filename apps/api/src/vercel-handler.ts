import type { IncomingMessage, ServerResponse } from "node:http";
import { NodeRequest, NodeResponse } from "@nestjs/platform-node";
import { createApplication } from "./application.js";

let application: ReturnType<typeof createApplication> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  application ??= createApplication();
  const app = await application;
  const server = app.getHttpServer();
  Object.setPrototypeOf(request, NodeRequest.prototype);
  Object.setPrototypeOf(response, NodeResponse.prototype);
  server.emit("request", request, response);
}
