import { createRoot, type Root } from "react-dom/client";
import { CloudDialog } from "./CloudDialog";

let root: Root | undefined;
let open = false;
export function toggleCloudModal(force?: boolean) {
  open = force ?? !open;
  if (!root) {
    const mount = document.createElement("div");
    mount.id = "opm-webapp-cloud-root";
    document.body.appendChild(mount);
    root = createRoot(mount);
  }
  root.render(open ? <CloudDialog onClose={() => toggleCloudModal(false)} /> : null);
}
