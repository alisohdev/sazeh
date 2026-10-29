import type { AppController } from "./useAppController";
type Props = Pick<
  AppController,
  "departure" | "exportBeforeLogout" | "finishLogout" | "discardAndLogout" | "cancelDeparture"
>;
export function DepartureDialog({
  departure,
  exportBeforeLogout,
  finishLogout,
  discardAndLogout,
  cancelDeparture,
}: Props) {
  return (
    <>
      {departure && (
        <div className="modal-backdrop">
          <section
            className="departure-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="departure-title"
          >
            <h2 id="departure-title">پیش از خروج از حساب</h2>
            <p>{departure.count} یادداشت در صف همگام‌سازی است. تکلیف آن‌ها را مشخص کنید.</p>
            <div className="departure-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void exportBeforeLogout()}
              >
                دریافت خروجی
              </button>
              {departure.exported && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void finishLogout()}
                >
                  خروج پس از دریافت خروجی
                </button>
              )}
              <button
                type="button"
                className="danger-button"
                onClick={() => void discardAndLogout()}
              >
                حذف یادداشت‌های در انتظار و خروج
              </button>
              <button type="button" className="quiet-button" onClick={() => void cancelDeparture()}>
                لغو و بازگشت
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
