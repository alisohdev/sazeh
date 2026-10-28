import type { IncomingMessage, ServerResponse } from "node:http";
import type { Request, Response } from "express";
import { createApplication } from "./application.js";

let application: ReturnType<typeof createApplication> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  application ??= createApplication();
  const app = await application;
  const server = app.getHttpAdapter().getInstance();
  server(request as Request, response as Response);
}
