import { HostMessage } from "../../shared/protocol";

export const send = (m: HostMessage) => window.postMessage(m, "*");
