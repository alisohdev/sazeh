import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  DraftCreateCommandSchema,
  ProjectInputSchema,
  FinanceDraftSchema,
  WorkforceDraftCommandSchema,
  ProcurementSaveCommandSchema,
} from "@sazeh/contracts";

export async function installApi(page: Page, signedIn = true) {
  const user = {
    id: randomUUID(),
    username: "testadmin",
    displayName: "مدیر آزمون",
    role: "SUPERUSER",
    active: true,
    mustChangePassword: false,
  };
  const project = {
    id: randomUUID(),
    name: "پروژه نمونه",
    lifecycle: "ACTIVE",
    contractInitialToman: "10000000",
    startsOn: null,
    endsOn: null,
    ownerContactId: null,
    version: 1,
  };
  const worker = {
    id: randomUUID(),
    displayName: "نیروی نمونه",
    isWorker: true,
    isOwner: false,
    isSupplier: false,
    archived: false,
    version: 1,
  };
  const projects = [project];
  const notes: Array<{ id: string; text: string; projectId: string; createdAt: string }> = [];
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  let failProject = false;
  let failNote = false;
  let holdProject: Promise<void> | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/", "");
    const body = request.postDataJSON() as Record<string, unknown> | null;
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (body && !path.startsWith("auth/")) requests.push({ path, body });
    if (path === "auth/csrf") return json({ csrfToken: "test-csrf" });
    if (path === "auth/logout") {
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "auth/login") signedIn = true;
    if (path === "auth/refresh" || path === "auth/login")
      return signedIn
        ? json({ user, accessToken: "test-access-token", expiresAt: Date.now() + 3_600_000 })
        : json({ code: "AUTH_REQUIRED" }, 401);
    if (!signedIn) return json({ code: "AUTH_REQUIRED" }, 401);
    if (path === "projects" && request.method() === "POST") {
      if (holdProject) await holdProject;
      if (failProject) return json({ message: "ثبت پروژه انجام نشد" }, 503);
      const input = ProjectInputSchema.parse(body);
      const row = { ...project, ...input, id: randomUUID() };
      projects.push(row);
      return json(row, 201);
    }
    if (path === "projects")
      return json({
        items: new URL(request.url()).searchParams.has("archived") ? [] : projects,
        nextCursor: null,
      });
    if (/^projects\/[^/]+\/budgets$/.test(path)) return json({ items: [], nextCursor: null });
    if (path === "contacts")
      return json({
        items: new URL(request.url()).searchParams.has("archived") ? [] : [worker],
        nextCursor: null,
      });
    if (path === "engagements")
      return json({
        items: [
          {
            id: randomUUID(),
            workerId: worker.id,
            projectId: project.id,
            type: "DAILY",
            defaultRateToman: "100000",
            startsOn: "2026-01-01",
            endsOn: null,
            archived: false,
            version: 1,
          },
        ],
        nextCursor: null,
      });
    if (path === "procurement/materials") {
      if (body) ProcurementSaveCommandSchema.parse(body);
      return json(body ? { id: body.entityId } : []);
    }
    if (path === "drafts") {
      const note = DraftCreateCommandSchema.parse(body);
      if (failNote) return json({ message: "ثبت یادداشت انجام نشد" }, 503);
      notes.push({
        id: note.entityId,
        text: note.text,
        projectId: note.projectId!,
        createdAt: new Date().toISOString(),
      });
      return json({});
    }
    if (path.startsWith("drafts/project/")) return json(notes);
    if (path === "workforce/drafts") {
      const command = WorkforceDraftCommandSchema.parse(body);
      return json({ record: { id: command.recordId, version: 1 } }, 201);
    }
    if (path === "procurement/drafts") {
      ProcurementSaveCommandSchema.parse(body);
      return json({}, 201);
    }
    if (path === "finance/draft") {
      FinanceDraftSchema.parse(body);
      return json({}, 201);
    }
    if (path === "finance/records") return json({ entries: [], totals: {} });
    if (path.startsWith("attachments/record/")) return json([]);
    if (path === "workforce/analytics") return json([]);
    return json({
      entries: [],
      totals: {},
      pending: { count: 0 },
      stock: [],
      purchasesBySupplier: [],
      purchasesByMaterial: [],
      consumptionTrend: [],
    });
  });
  return {
    project,
    worker,
    projects,
    requests,
    notes,
    errors,
    failProjects: () => {
      failProject = true;
    },
    failNotes: () => {
      failNote = true;
    },
    holdProjects: (pending: Promise<void>) => {
      holdProject = pending;
    },
  };
}
