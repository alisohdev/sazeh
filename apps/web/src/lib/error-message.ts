const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "نام کاربری یا گذرواژه نادرست است.",
  INVALID_LOGIN: "نام کاربری و گذرواژه را به‌درستی وارد کنید.",
  AUTH_REQUIRED: "نشست شما منقضی شده است؛ دوباره وارد شوید.",
  ACCOUNT_DISABLED: "این حساب غیرفعال شده است. با مدیر کل تماس بگیرید.",
  SESSION_REVOKED: "دسترسی این نشست لغو شده است؛ دوباره وارد شوید.",
  LOGIN_THROTTLED: "تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.",
  PASSWORD_CHANGE_REQUIRED: "پیش از ادامه، گذرواژهٔ اولیه را تغییر دهید.",
  INVALID_PASSWORD: "گذرواژهٔ فعلی یا اطلاعات گذرواژهٔ تازه معتبر نیست.",
  PASSWORD_UNCHANGED: "گذرواژهٔ تازه باید با گذرواژهٔ فعلی متفاوت باشد.",
  USERNAME_TAKEN: "این نام کاربری قبلاً استفاده شده است.",
  SUPERUSER_REQUIRED: "این عملیات فقط برای مدیر کل مجاز است.",
  CSRF_REJECTED: "اعتبار امنیتی درخواست منقضی شده است. صفحه را تازه کنید و دوباره تلاش کنید.",
  ORIGIN_REJECTED: "دسترسی از این نشانی مجاز نیست.",
  ORIGIN_NOT_CONFIGURED: "نشانی برنامه در سرور تنظیم نشده است. با مدیر سامانه تماس بگیرید.",
  NETWORK_ERROR: "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
  STALE_VERSION: "این اطلاعات تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.",
  COMMAND_ID_CONFLICT: "این درخواست با اطلاعات دیگری ثبت شده است. صفحه را تازه کنید.",
  PROJECT_NOT_FOUND: "پروژه پیدا نشد.",
  CONTACT_NOT_FOUND: "فرد یا تأمین‌کننده پیدا نشد.",
  ADMIN_NOT_FOUND: "حساب مدیر پیدا نشد.",
  MATERIAL_NOT_FOUND: "مصالح پیدا نشد.",
  PROJECT_ARCHIVED: "پروژه بایگانی شده است و ثبت اطلاعات تازه برای آن مجاز نیست.",
  CONTACT_UNAVAILABLE: "فرد انتخاب‌شده فعال نیست یا نقش لازم را ندارد.",
  CONTACT_ROLE_REQUIRED: "حداقل یک نقش برای فرد انتخاب کنید.",
  ENGAGEMENT_OVERLAP: "برای این نیرو در همین پروژه، همکاری هم‌زمان دیگری ثبت شده است.",
  INITIAL_CONTRACT_LOCKED: "برای تغییر مبلغ قرارداد، اصلاح قرارداد را با دلیل ثبت کنید.",
  REASON_REQUIRED: "دلیل انجام عملیات را وارد کنید.",
  INVALID_LIFECYCLE: "وضعیت این رکورد تغییر کرده است. صفحه را تازه کنید.",
  INVALID_BUDGET: "عنوان ردیف بودجه و مبلغ صحیح به تومان را وارد کنید.",
  INVALID_DATE_RANGE: "تاریخ پایان باید پس از تاریخ شروع باشد.",
  INVALID_DIRECTORY_INPUT: "اطلاعات فرم معتبر نیست. فیلدهای واردشده را بررسی کنید.",
  INVALID_DRAFT: "اطلاعات پیش‌نویس معتبر نیست. فیلدهای واردشده را بررسی کنید.",
  INVALID_FINANCE_COMMAND: "اطلاعات سند مالی معتبر نیست. فیلدهای واردشده را بررسی کنید.",
  INVALID_QUANTITY: "مقدار را به‌صورت عدد معتبر و بزرگ‌تر از صفر وارد کنید.",
  PENDING_EVIDENCE: "بعضی پیوست‌ها کامل بارگذاری نشده‌اند. وضعیت پیوست‌ها را بررسی کنید.",
  REASSIGNMENT_NOT_ALLOWED: "پروژه یا نیروی یک رکورد ثبت‌شده را نمی‌توان تغییر داد.",
};

export function errorMessage(problem: unknown, status?: number): string {
  const value =
    problem && typeof problem === "object"
      ? (problem as { code?: unknown; message?: unknown; name?: unknown })
      : {};
  if (typeof value.code === "string" && messages[value.code]) return messages[value.code]!;
  if (value.name === "ZodError") return "اطلاعات واردشده معتبر نیست. فیلدهای فرم را بررسی کنید.";
  if (
    typeof value.message === "string" &&
    /[\u0600-\u06ff]/.test(value.message) &&
    !/[A-Za-z]/.test(value.message)
  )
    return value.message;
  if (problem instanceof TypeError || status === 0) return messages.NETWORK_ERROR!;
  if (status === 401) return messages.AUTH_REQUIRED!;
  if (status === 403) return "اجازهٔ انجام این عملیات را ندارید.";
  if (status === 404) return "اطلاعات درخواستی پیدا نشد.";
  if (status === 409) return messages.STALE_VERSION!;
  if (status === 429) return "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.";
  if (status && status >= 500) return "سرور در حال حاضر پاسخ‌گو نیست. کمی بعد دوباره تلاش کنید.";
  if (status === 400 || status === 422)
    return "اطلاعات واردشده معتبر نیست. فیلدهای فرم را بررسی کنید.";
  return "انجام عملیات ناموفق بود. دوباره تلاش کنید.";
}
