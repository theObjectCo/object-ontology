import { Messages } from "../../shared/i18n";
import { Model } from "../../core/model";
import { EditorLink, EditorLinkKind } from "../../core/links";
import { SchemaFile } from "../../shared/protocol";

export interface InspectorProps {
  t: Messages;
  language: string;
  model: Model;
  ids: string[];
  link?: EditorLink;
  schemas: SchemaFile[];
  onLess: () => void;
  onShowJson: (id: string) => void;
  onOpenZoom: (id: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRename: (oldId: string, newId: string) => Promise<string | undefined>;
  onAddState: (id: string, state?: string) => void;
  onRenameState: (id: string, oldState: string, newState: string) => void;
  onDeleteState: (id: string, state: string) => void;
  onMoveState: (id: string, state: string, index: number) => void;
  onUpdateLink: (id: string, patch: { kind?: EditorLinkKind; fromState?: string | null; toState?: string | null; tag?: string; reverse?: boolean; note?: string | null }) => void;
  onOpenLink: (href: string) => void;
  onDelete: () => void;
  onCopy: () => void;
  onSaveView: () => void;
}
