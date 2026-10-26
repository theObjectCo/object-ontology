import { Operation } from "../../core/edit";
import { Model, StoryDef } from "../../core/model";
import { Messages } from "../../shared/i18n";
import { ElementDiagnostic } from "../../shared/protocol";

export interface MakigamiProps {
  t: Messages;
  model: Model;
  id: string;
  story: StoryDef;
  /** Diagnostics of this story only. */
  diagnostics: ElementDiagnostic[];
  onBack: () => void;
  /** Selects an object or a process in the diagram. */
  onShow: (id: string) => void;
  /** Runs an edit operation on the model. */
  onRun?: (op: Operation) => Promise<unknown>;
  /** Deletes this story and returns to the diagram. */
  onDeleteStory?: () => void;
}
