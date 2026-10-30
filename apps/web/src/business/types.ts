export type DirectoryKind = "PROJECT" | "CONTACT" | "ENGAGEMENT" | "BUDGET" | "MATERIAL";
export type WorkspaceTab = "projects" | "contacts" | "engagements";
export type DirectorySaveResult = { ok: true } | { ok: false; error: string };

export type DirectoryRecord = {
  id: string;
  type: DirectoryKind;
  data: Record<string, unknown>;
  version: number;
};

export type DirectorySelection = { type: DirectoryKind; id: string };

export type WorkspaceDirectoryData = {
  projects: DirectoryRecord[];
  contacts: DirectoryRecord[];
  engagements: DirectoryRecord[];
  budgets: DirectoryRecord[];
  materials: DirectoryRecord[];
};
