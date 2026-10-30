import type { User } from "@sazeh/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AppController } from "./useAppController";
import { AdminManagement } from "./admin-management";

type Props = Pick<
  AppController,
  | "showAdmins"
  | "setShowAdmins"
  | "showPasswordChange"
  | "setShowPasswordChange"
  | "changePassword"
  | "saving"
  | "locked"
  | "online"
  | "beginLogout"
> & { user: User | undefined };

export function AccountTools(props: Props) {
  const { user, showAdmins, showPasswordChange, saving, locked, online } = props;
  return (
    <>
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">حساب کاربری</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          گذرواژه، نشست فعلی و حساب‌های مدیریتی را از این بخش کنترل کنید.
        </p>
      </header>
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <h3 className="font-semibold">مشخصات نشست</h3>
        </CardHeader>
        <CardContent className="grid gap-2 pt-1 text-sm">
          <p className="font-medium">{user?.displayName}</p>
          <p className="text-muted-foreground" dir="ltr">
            @{user?.username}
          </p>
          <p className="text-muted-foreground">
            {user?.role === "SUPERUSER" ? "مدیر ارشد" : "مدیر"}
          </p>
        </CardContent>
      </Card>

      {user?.role === "SUPERUSER" && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="font-semibold">مدیران سامانه</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                ساخت حساب، غیرفعال‌سازی و بازنشانی گذرواژه
              </p>
            </div>
            <Button variant="outline" onClick={() => props.setShowAdmins((value) => !value)}>
              {showAdmins ? "بستن" : "مدیریت حساب‌ها"}
            </Button>
          </CardHeader>
          {showAdmins && (
            <CardContent className="pt-1">
              <AdminManagement />
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="font-semibold">گذرواژه</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              برای حساب فعلی یک گذرواژهٔ تازه تعیین کنید.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => props.setShowPasswordChange((value) => !value)}
            disabled={locked || !online}
          >
            {showPasswordChange ? "انصراف" : "تغییر گذرواژه"}
          </Button>
        </CardHeader>
        {showPasswordChange && (
          <CardContent className="pt-1">
            <form className="grid gap-4" onSubmit={(event) => void props.changePassword(event)}>
              <PasswordField
                id="current-password"
                name="currentPassword"
                label="گذرواژهٔ فعلی"
                autoComplete="current-password"
              />
              <PasswordField
                id="new-password"
                name="newPassword"
                label="گذرواژهٔ تازه، حداقل ۱۴ نویسه"
                autoComplete="new-password"
                minLength={14}
              />
              <PasswordField
                id="confirmation"
                name="confirmation"
                label="تکرار گذرواژهٔ تازه"
                autoComplete="new-password"
                minLength={14}
              />
              <Button type="submit" disabled={saving || locked || !online}>
                {saving ? "در حال ذخیره…" : "ذخیرهٔ گذرواژه"}
              </Button>
            </form>
          </CardContent>
        )}
      </Card>

      <Card className="border-destructive/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div>
            <h3 className="font-semibold">خروج از حساب</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              کارهای در انتظار پیش از خروج بررسی می‌شوند.
            </p>
          </div>
          <Button variant="destructive" onClick={() => void props.beginLogout()}>
            خروج از حساب
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function PasswordField(props: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={props.id}>
        {props.label}
      </label>
      <Input
        id={props.id}
        name={props.name}
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        type="password"
        required
        maxLength={256}
      />
    </div>
  );
}
