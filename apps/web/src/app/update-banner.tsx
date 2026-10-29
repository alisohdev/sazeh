import type { AppController } from "./useAppController";
type Props = Pick<AppController, "updateReady" | "applyUpdate">;
export function UpdateBanner({ updateReady, applyUpdate }: Props) {
  return (
    <>
      {updateReady && (
        <div className="update-banner" role="status">
          <span>نسخهٔ تازهٔ برنامه آماده است.</span>
          <button type="button" onClick={applyUpdate}>
            بارگذاری نسخهٔ تازه
          </button>
        </div>
      )}
    </>
  );
}
