import type { DirectoryMutationKind } from "@sazeh/contracts";
import type { DirectoryRecord, WorkspaceDirectoryData } from "../business/types";
import { api, pages } from "./api";
type Entity = Record<string, unknown> & { id: string; version: number };
const resource = { PROJECT: "projects", CONTACT: "contacts", ENGAGEMENT: "engagements" };
function rows(type: DirectoryRecord["type"], data: Entity[]): DirectoryRecord[] {
  return data.map((entity) => ({ id: entity.id, version: entity.version, type, data: entity }));
}
export function directoryRepository(userId: string) {
  return {
    async loadDirectory(): Promise<WorkspaceDirectoryData> {
      const [projects, contacts, engagements, materials] = await Promise.all([
        Promise.all([
          pages<Entity>(userId, "projects"),
          pages<Entity>(userId, "projects?archived=true"),
        ]).then((groups) => groups.flat()),
        Promise.all([
          pages<Entity>(userId, "contacts"),
          pages<Entity>(userId, "contacts?archived=true"),
        ]).then((groups) => groups.flat()),
        pages<Entity>(userId, "engagements"),
        api<Entity[]>(userId, "procurement/materials"),
      ]);
      const budgets = (
        await Promise.all(
          projects.map((project) => pages<Entity>(userId, `projects/${project.id}/budgets`)),
        )
      ).flat();
      return {
        projects: rows("PROJECT", projects),
        contacts: rows("CONTACT", contacts),
        engagements: rows("ENGAGEMENT", engagements),
        budgets: rows("BUDGET", budgets),
        materials: rows("MATERIAL", materials),
      };
    },
    async saveDirectory(
      type: "PROJECT" | "CONTACT" | "ENGAGEMENT",
      kind: DirectoryMutationKind,
      payload: Record<string, unknown>,
      id?: string,
      version = 0,
    ) {
      const lifecycle = kind.endsWith("LIFECYCLE");
      const path = resource[type] + (id ? "/" + id : "") + (lifecycle ? "/lifecycle" : "");
      const result = await api<Entity>(
        userId,
        path,
        { ...payload, ...(id ? { expectedVersion: version } : {}) },
        lifecycle || !id ? "POST" : "PATCH",
      );
      return result.id;
    },
  };
}
