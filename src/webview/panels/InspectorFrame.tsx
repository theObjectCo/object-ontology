import type { ReactNode } from "react";
import { StudioPanel } from "../../../vendor/object-kit/components/studio/StudioPanel";

/** Keep diagram shortcuts out of editable inspector controls in both hosts. */
export function InspectorFrame({ title, lessLabel, onLess, children }: {
  title: string;
  lessLabel?: string;
  onLess?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="opm-inspector-frame" onKeyDown={(event) => event.stopPropagation()}>
      <StudioPanel title={title} className="opm-drawer" testId="opm-inspector"
        actions={onLess && <button className="link" onClick={onLess}>{lessLabel}</button>}>
        {children}
      </StudioPanel>
    </div>
  );
}
