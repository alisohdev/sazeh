import type { DirectorySelection, WorkspaceTab } from "./types";

export type WorkspaceState = {
  tab: WorkspaceTab;
  filter: string;
  showArchivedProjects: boolean;
  showArchivedContacts: boolean;
  selection?: DirectorySelection | undefined;
  selectedBudgetId?: string | undefined;
};

export type WorkspaceAction =
  | { type: "tab"; tab: WorkspaceTab }
  | { type: "filter"; value: string }
  | { type: "archived-projects"; value: boolean }
  | { type: "archived-contacts"; value: boolean }
  | {
      type: "select";
      selection: DirectorySelection;
      tab?: WorkspaceTab | undefined;
      budgetId?: string | undefined;
    }
  | { type: "clear-selection" };

export const initialWorkspaceState: WorkspaceState = {
  tab: "projects",
  filter: "",
  showArchivedProjects: false,
  showArchivedContacts: false,
};

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "tab":
      return { ...state, tab: action.tab };
    case "filter":
      return { ...state, filter: action.value };
    case "archived-projects":
      return { ...state, showArchivedProjects: action.value };
    case "archived-contacts":
      return { ...state, showArchivedContacts: action.value };
    case "select":
      return {
        ...state,
        selection: action.selection,
        selectedBudgetId: action.budgetId,
        tab: action.tab ?? state.tab,
      };
    case "clear-selection":
      return { ...state, selection: undefined, selectedBudgetId: undefined };
  }
}
