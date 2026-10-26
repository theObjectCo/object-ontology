import { Viewport } from "@xyflow/react";
import { EditorLinkKind } from "../../core/links";
import { edit } from "../vscode";

export interface TabState {
  viewId: string;
  drawer: boolean;
  oplExpanded: boolean;
  oplMode: "view" | "selection";
  labelsOn: boolean;
  viewports: Record<string, Viewport>;
  drawerWidth?: number;
  oplHeight?: number;
  /** The user story shown as a makigami over the diagram, if any. */
  storyId?: string | null;
}

export interface MenuState {
  x: number;
  y: number;
  from: string;
  to: string;
  fromState?: string;
  toState?: string;
  kinds: EditorLinkKind[];
  effectTargets?: string[];
}

export type Result = Awaited<ReturnType<typeof edit>>;
