import { NavLink } from "react-router-dom";
import { Button } from "../components/ui/button";
import type { User } from "@sazeh/contracts";
import { WorkspaceAccount } from "./workspace-account";

export const navigation = [
  { to: "/projects", label: "پروژه‌ها" },
  { to: "/people", label: "افراد و تأمین‌کنندگان" },
  { to: "/engagements", label: "همکاری‌ها" },
  { to: "/workforce", label: "کارکرد و پرداخت" },
  { to: "/procurement", label: "خرید و موجودی" },
  { to: "/analytics", label: "گزارش‌ها و تحلیل‌ها" },
  { to: "/account", label: "حساب کاربری" },
];

export function WorkspaceNavigation({ sidebar = false }: { sidebar?: boolean }) {
  return (
    <nav
      aria-label="بخش‌های اصلی"
      className={sidebar ? "min-h-0 overflow-y-auto p-4" : "-mx-1 overflow-x-auto px-1 lg:hidden"}
    >
      <div className={sidebar ? "flex flex-col gap-2" : "flex min-w-max gap-1"}>
        {navigation.map((item) => (
          <NavLink key={item.to} to={item.to} className={sidebar ? "block" : "shrink-0"}>
            {({ isActive }) => (
              <Button
                asChild
                variant={isActive ? "default" : "ghost"}
                className={
                  sidebar
                    ? "min-h-11 w-full justify-start whitespace-normal text-start"
                    : "min-h-11"
                }
              >
                <span>{item.label}</span>
              </Button>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function WorkspaceSidebar({ user, online }: { user: User | undefined; online: boolean }) {
  return (
    <aside
      className="sticky top-0 hidden h-dvh min-h-0 flex-col border-e border-border/80 bg-card lg:flex"
      aria-label="منوی فضای کاری"
    >
      <div className="flex h-24 shrink-0 items-center gap-3 border-b border-border/80 px-6">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground"
          aria-hidden="true"
        >
          س
        </div>
        <span className="text-xl font-semibold text-foreground">سازه</span>
      </div>
      <WorkspaceNavigation sidebar />
      <footer className="mt-auto border-t border-border p-4">
        <WorkspaceAccount user={user} online={online} />
      </footer>
    </aside>
  );
}
