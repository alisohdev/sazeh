import { useEffect } from "react";
import type { User } from "@sazeh/contracts";
import { useLocation } from "react-router-dom";

import { WorkspaceAccount } from "./workspace-account";
import { navigation, WorkspaceNavigation } from "./workspace-navigation";

type Props = { user: User | undefined; online: boolean };

function pageTitle(pathname: string) {
  if (/^\/projects\/[^/]+$/.test(pathname)) return "پروندهٔ پروژه";
  return navigation.find((item) => pathname.startsWith(item.to))?.label ?? "فضای کاری سازه";
}

export function WorkspaceHeader({ user, online }: Props) {
  const location = useLocation();
  const title = pageTitle(location.pathname);
  useEffect(() => {
    document.title = `${title} | سازه`;
  }, [title]);
  return (
    <header className="border-b border-border/80 bg-card/95" dir="rtl">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-3 pt-4 sm:px-6 lg:h-24 lg:content-center lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-[0_8px_24px_rgba(23,56,79,0.16)] lg:hidden"
            aria-hidden="true"
          >
            س
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
        </div>
        <WorkspaceNavigation />
        <div className="lg:hidden">
          <WorkspaceAccount user={user} online={online} />
        </div>
      </div>
    </header>
  );
}
