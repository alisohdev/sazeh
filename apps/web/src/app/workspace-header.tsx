import { useEffect } from "react";
import type { User } from "@sazeh/contracts";
import { NavLink, useLocation } from "react-router-dom";

type Props = { user: User | undefined; online: boolean };

const navigation = [
  { to: "/projects", label: "پروژه‌ها" },
  { to: "/people", label: "افراد و تأمین‌کنندگان" },
  { to: "/engagements", label: "همکاری‌ها" },
  { to: "/workforce", label: "کارکرد و پرداخت" },
  { to: "/procurement", label: "خرید و موجودی" },
  { to: "/account", label: "حساب کاربری" },
];

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
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-[0_8px_24px_rgba(23,56,79,0.16)]"
            aria-hidden="true"
          >
            س
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {user?.displayName} <span dir="ltr">@{user?.username}</span>
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <span
            className="ms-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground"
            role="status"
          >
            <span className={`size-2 rounded-full ${online ? "bg-emerald-600" : "bg-amber-600"}`} />
            {online ? "آنلاین" : "آفلاین"}
          </span>
        </div>
        <nav className="-mx-1 overflow-x-auto px-1" aria-label="بخش‌های اصلی">
          <div className="flex min-w-max gap-1">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
