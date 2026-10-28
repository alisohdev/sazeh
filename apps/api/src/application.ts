import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  NodeAdapter,
  type NestNodeApplication,
  type NodeRequest,
  type NodeResponse,
} from "@nestjs/platform-node";
import { AppModule } from "./app.module.js";

export async function createApplication(): Promise<NestNodeApplication> {
  const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
    logger: ["error", "warn"],
  });
  app.setGlobalPrefix("api");
  app.use((_request: NodeRequest, response: NodeResponse, next: () => void) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.enableShutdownHooks();
  return app;
}
