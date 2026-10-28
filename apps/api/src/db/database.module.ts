import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export const DATABASE = Symbol("DATABASE");
export const POSTGRES_CLIENT = Symbol("POSTGRES_CLIENT");
export type Database = PostgresJsDatabase<typeof schema>;

class DatabaseShutdown implements OnApplicationShutdown {
  constructor(private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      useFactory: (): Sql => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is required");
        return postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
      },
    },
    {
      provide: DATABASE,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: Sql): Database => drizzle(client, { schema }),
    },
    {
      provide: DatabaseShutdown,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: Sql): DatabaseShutdown => new DatabaseShutdown(client),
    },
  ],
  exports: [DATABASE, POSTGRES_CLIENT],
})
export class DatabaseModule {}
