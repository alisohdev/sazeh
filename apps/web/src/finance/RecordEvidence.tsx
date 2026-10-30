import { createContext, useContext } from "react";
import type { DraftWorkspace } from "@/drafts/draft-repository";
import { EvidenceControl } from "./EvidenceControl";
export const EvidenceRepository = createContext<DraftWorkspace | null>(null);
export function RecordEvidence({
  recordId,
  parentType,
}: {
  recordId: string;
  parentType: "PROJECT" | "WORKFORCE" | "PROCUREMENT";
}) {
  const repository = useContext(EvidenceRepository);
  return repository ? (
    <div className="min-w-0 w-full" data-evidence-parent={recordId} data-evidence-type={parentType}>
      <EvidenceControl repository={repository} recordId={recordId} parentType={parentType} />
    </div>
  ) : null;
}
