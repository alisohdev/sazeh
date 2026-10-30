import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  CombinedFinanceFilterSchema,
  FinanceDraftSchema,
  FinanceActionSchema,
  FinanceReverseSchema,
  FinanceDecisionSchema,
  AttachmentTicketSchema,
} from "@sazeh/contracts";
const schemas = {
  FinanceFilter: CombinedFinanceFilterSchema,
  FinanceDraft: FinanceDraftSchema,
  FinanceAction: FinanceActionSchema,
  FinanceReversal: FinanceReverseSchema,
  FinanceDecision: FinanceDecisionSchema,
  AttachmentTicket: AttachmentTicketSchema,
};
const paths: Record<string, unknown> = {};
for (const [path, name] of Object.entries({
  "/v1/finance/draft": "FinanceDraft",
  "/v1/finance/finalize": "FinanceAction",
  "/v1/finance/reverse": "FinanceReversal",
  "/v1/finance/decision": "FinanceDecision",
  "/v1/attachments/upload-ticket": "AttachmentTicket",
})) {
  paths[path] = {
    post: {
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/" + name } } },
      },
      responses: {
        "201": { description: "Persisted result; retries replay the same result" },
        "400": { description: "Validation failure" },
        "401": { description: "Authentication required" },
        "409": { description: "Version, identity, evidence or dependency conflict" },
      },
    },
  };
}
for (const path of ["/v1/finance/report", "/v1/finance/export", "/v1/finance/records"]) {
  paths[path] = {
    get: {
      security: [{ bearerAuth: [] }],
      parameters: ["projectId", "contactId", "from", "to"].map((name) => ({
        name,
        in: "query",
        schema: { type: "string" },
      })),
      responses: { "200": { description: "Filtered totals and source records" } },
    },
  };
}
for (const path of [
  "/v1/attachments/{id}/complete",
  "/v1/attachments/{id}/download",
  "/v1/attachments/record/{id}",
]) {
  const method = path.endsWith("complete") ? "post" : "get";
  paths[path] = {
    [method]: {
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      ],
      responses: {
        "200": { description: "Authorized attachment result" },
        "201": { description: "Idempotent verified completion" },
        "401": { description: "Authentication required" },
        "409": { description: "File not ready or dependency conflict" },
      },
    },
  };
}
writeFileSync(
  "../../specs/openapi-m4.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: "Sazeh M4 commands", version: "0.1.0" },
      paths,
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
        schemas: Object.fromEntries(
          Object.entries(schemas).map(([k, v]) => [k, z.toJSONSchema(v)]),
        ),
      },
    },
    null,
    2,
  ) + "\n",
);
