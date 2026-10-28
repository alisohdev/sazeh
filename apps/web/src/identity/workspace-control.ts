import Dexie, { type EntityTable } from "dexie";
import type { User } from "@sazeh/contracts";

export type ControlPhase = "signed-out" | "active" | "departing" | "logout-pending";
export type DepartureChoice = "keep" | "discard";
export type IdentityControl = {
  key: "identity";
  epoch: number;
  phase: ControlPhase;
  explicitLoginRequired?: boolean;
  syncAuthentication?: "required";
  user?: User;
  lastUser?: User;
  departure?: { id: string; choice?: DepartureChoice; localApplied: boolean };
};

const environment = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;
const origin = window.location.origin;

class ControlDatabase extends Dexie {
  identity!: EntityTable<IdentityControl, "key">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ identity: "&key", leases: "&key" });
    this.version(2)
      .stores({ identity: "&key", leases: null })
      .upgrade(async (transaction) => {
        const current = await transaction.table("identity").get("identity");
        if (!current) return;
        if (current.phase === "departing" && !current.departure?.id) {
          await transaction.table("identity").put({
            ...current,
            departure: { id: crypto.randomUUID(), localApplied: false },
          });
        } else if (current.phase === "logout-pending") {
          await transaction.table("identity").put({
            key: "identity",
            epoch: (current.epoch ?? 0) + 1,
            phase: "active",
            ...(current.lastUser ? { user: current.lastUser, lastUser: current.lastUser } : {}),
          });
        }
      });
  }
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (part) => part.toString(16).padStart(2, "0")).join("");
}

const scopeHash = await digest(`${environment}\0${origin}`);
const control = new ControlDatabase(`sazeh-m1a-control-${scopeHash}`);
const channel = new BroadcastChannel("sazeh-m1a-identity");
const listeners = new Set<() => void>();
channel.addEventListener("message", () => listeners.forEach((listener) => listener()));

function requireWebLocks(): LockManager {
  if (!navigator.locks) {
    throw new Error(
      "This browser does not support safe multi-tab session control. Update it and try again.",
    );
  }
  return navigator.locks;
}

export const workspaceControl = {
  async state(): Promise<IdentityControl> {
    return (
      (await control.identity.get("identity")) ?? { key: "identity", epoch: 0, phase: "signed-out" }
    );
  },

  async workspaceName(userId: string): Promise<string> {
    return `sazeh-m1a-workspace-${await digest(`${environment}\0${origin}\0${userId}`)}`;
  },

  async activityLockName(userId: string): Promise<string> {
    return `sazeh-m1a-activity-${await digest(`${environment}\0${origin}\0${userId}`)}`;
  },

  async withLifecycleLock<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const locks = requireWebLocks();
    const controller = new AbortController();
    return locks.request(`sazeh-m1a-lifecycle-${scopeHash}`, { mode: "exclusive" }, async () => {
      return operation(controller.signal);
    });
  },

  async activate(user: User): Promise<IdentityControl> {
    const state = await control.transaction("rw", control.identity, async () => {
      const previous = (await control.identity.get("identity")) ?? {
        key: "identity" as const,
        epoch: 0,
        phase: "signed-out" as const,
      };
      if (previous.phase === "departing" || previous.phase === "logout-pending") {
        throw new Error("Finish the current logout before signing in again.");
      }
      if (previous.phase === "active" && previous.user?.id !== user.id) {
        throw new Error("The current browser workspace must be left before changing accounts.");
      }
      const next: IdentityControl =
        previous.phase === "active" && previous.user?.id === user.id
          ? { ...previous, user, lastUser: user }
          : {
              key: "identity" as const,
              epoch: previous.epoch + 1,
              phase: "active" as const,
              user,
              lastUser: user,
            };
      delete next.syncAuthentication;
      await control.identity.put(next);
      return next;
    });
    announce();
    return state;
  },

  async beginDeparture(userId: string): Promise<IdentityControl> {
    const state = await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (!current || current.phase !== "active" || current.user?.id !== userId) {
        throw new Error("This browser workspace is no longer active.");
      }
      const next: IdentityControl = {
        ...current,
        epoch: current.epoch + 1,
        phase: "departing",
        departure: { id: crypto.randomUUID(), localApplied: false },
      };
      await control.identity.put(next);
      return next;
    });
    announce();
    return state;
  },

  async cancelDeparture(userId: string, departureId: string): Promise<IdentityControl> {
    const state = await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (
        !current ||
        current.phase !== "departing" ||
        current.user?.id !== userId ||
        current.departure?.id !== departureId
      ) {
        throw new Error("This browser workspace is no longer active.");
      }
      const next: IdentityControl = {
        key: "identity",
        epoch: current.epoch + 1,
        phase: "active",
        ...(current.user ? { user: current.user } : {}),
        ...(current.lastUser ? { lastUser: current.lastUser } : {}),
      };
      await control.identity.put(next);
      return next;
    });
    announce();
    return state;
  },

  async markLogoutPending(departureId: string, choice: DepartureChoice): Promise<void> {
    await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (
        !current ||
        current.phase !== "departing" ||
        current.departure?.id !== departureId ||
        !current.user
      ) {
        throw new Error("Logout was not prepared for this browser workspace.");
      }
      await control.identity.put({
        key: "identity",
        epoch: current.epoch + 1,
        phase: "logout-pending",
        user: current.user,
        ...(current.lastUser ? { lastUser: current.lastUser } : {}),
        departure: { id: departureId, choice, localApplied: false },
      });
    });
    announce();
  },

  async markLocalDepartureApplied(departureId: string): Promise<void> {
    await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (
        !current ||
        current.phase !== "logout-pending" ||
        current.departure?.id !== departureId ||
        !current.departure.choice
      ) {
        throw new Error("The pending logout action does not match this operation.");
      }
      await control.identity.put({
        ...current,
        departure: { ...current.departure, localApplied: true },
      });
    });
    announce();
  },

  async resolveDeparture(): Promise<
    | { status: "unchanged" | "recovered"; state: IdentityControl }
    | { status: "another-tab"; state: IdentityControl }
  > {
    const lock = requireWebLocks();
    let result:
      | { status: "unchanged" | "recovered"; state: IdentityControl }
      | { status: "another-tab"; state: IdentityControl }
      | undefined;
    await lock.request(
      `sazeh-m1a-lifecycle-${scopeHash}`,
      { mode: "exclusive", ifAvailable: true },
      async (held) => {
        const current = await this.state();
        if (!held && (current.phase === "departing" || current.phase === "logout-pending")) {
          result = { status: "another-tab", state: current };
          return;
        }
        if (current.phase !== "departing") {
          result = { status: "unchanged", state: current };
          return;
        }
        result = { status: "recovered", state: current };
      },
    );
    if (!result) throw new Error("Could not resolve the browser session state.");
    if (result.status === "recovered") announce();
    return result;
  },

  async completeLogout(departureId: string): Promise<void> {
    await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (
        !current ||
        current.phase !== "logout-pending" ||
        current.departure?.id !== departureId ||
        !current.departure.localApplied
      ) {
        throw new Error("There is no locally completed logout for this operation.");
      }
      await control.identity.put({
        key: "identity",
        epoch: current.epoch + 1,
        phase: "signed-out",
        ...(current.lastUser ? { lastUser: current.lastUser } : {}),
        ...(current.explicitLoginRequired ? { explicitLoginRequired: true } : {}),
      });
    });
    announce();
  },

  async requireExplicitLogin(): Promise<void> {
    await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (!current) return;
      await control.identity.put({ ...current, explicitLoginRequired: true });
    });
    announce();
  },

  async completePasswordChange(userId: string): Promise<void> {
    await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (current?.phase !== "active" || current.user?.id !== userId) {
        throw new Error("The browser workspace changed during password update.");
      }
      await control.identity.put({
        key: "identity",
        epoch: current.epoch + 1,
        phase: "signed-out",
        ...(current.user ? { lastUser: { ...current.user, mustChangePassword: false } } : {}),
      });
    });
    announce();
  },

  async isCurrent(userId: string, epoch: number): Promise<boolean> {
    const current = await this.state();
    return current.phase === "active" && current.epoch === epoch && current.user?.id === userId;
  },

  async canSync(userId: string, epoch: number): Promise<boolean> {
    const current = await this.state();
    return (
      current.phase === "active" &&
      current.epoch === epoch &&
      current.user?.id === userId &&
      current.syncAuthentication !== "required"
    );
  },

  async pauseSync(userId: string, epoch: number): Promise<void> {
    await control.transaction("rw", control.identity, async () => {
      const current = await control.identity.get("identity");
      if (current?.phase !== "active" || current.epoch !== epoch || current.user?.id !== userId)
        return;
      await control.identity.put({ ...current, syncAuthentication: "required" });
    });
    announce();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function announce(): void {
  channel.postMessage({ changed: true });
  listeners.forEach((listener) => listener());
}
