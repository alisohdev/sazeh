import type { User } from "@sazeh/contracts";
import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function WorkspaceAccount({ user, online }: { user: User | undefined; online: boolean }) {
  const ConnectionIcon = online ? Wifi : WifiOff;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="حساب و وضعیت اتصال">
      {user && (
        <>
          <span className="w-full truncate text-sm font-medium">{user.displayName}</span>
          <Badge variant="outline" className="max-w-full">
            <span className="truncate" dir="ltr">
              @{user.username}
            </span>
          </Badge>
          <Badge variant="secondary">{user.role === "SUPERUSER" ? "مدیر کل" : "مدیر"}</Badge>
        </>
      )}
      <Badge variant={online ? "secondary" : "outline"} role="status">
        <ConnectionIcon className="size-3" aria-hidden="true" />
        {online ? "آنلاین" : "آفلاین"}
      </Badge>
    </div>
  );
}
