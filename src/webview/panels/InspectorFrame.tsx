import type { ReactNode } from "react";
import { StudioPanel } from "../../../vendor/object-kit/components/studio/StudioPanel";

/** Keep diagram shortcuts out of editable inspector controls in both hosts. */
export function InspectorFrame({ title, lessLabel, onLess, isolateKeys = true, children }: {
  title: string;
  lessLabel?: string;
  onLess?: () => void;
  isolateKeys?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="opm-inspector-frame" onKeyDown={isolateKeys ? (event) => event.stopPropagation() : undefined}>
      <StudioPanel title={title} className="opm-drawer" testId="opm-inspector"
        actions={onLess && <button className="link" onClick={onLess}>{lessLabel}</button>}>
        {children}
      </StudioPanel>
    </div>
  );
}
