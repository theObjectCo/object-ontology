import type { Operation } from "../core/edit";
import type { HostMessage, WebviewMessage } from "../shared/protocol";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi = acquireVsCodeApi();

export function post(message: WebviewMessage): void {
  api.postMessage(message);
}

export function tabState<T>(): T | undefined {
  return api.getState() as T | undefined;
}

export function saveTabState(state: unknown): void {
  api.setState(state);
}

type Result = Extract<HostMessage, { type: "result" }>;
let nextId = 1;
const waiting = new Map<number, (r: Result) => void>();

/** Sends an edit and resolves with the host's answer. */
export function edit(operation: Operation): Promise<Result> {
  const requestId = nextId++;
  return new Promise((resolve) => {
    waiting.set(requestId, resolve);
    post({ type: "op", requestId, operation });
  });
}

export function settle(result: Result): void {
  waiting.get(result.requestId)?.(result);
  waiting.delete(result.requestId);
}
