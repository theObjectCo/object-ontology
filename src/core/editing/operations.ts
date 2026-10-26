import { Model } from "../model";
import { clipboardOperations } from "./clipboard";
import { EditResult, Operation } from "./contracts";
import { Doc } from "./document";
import { elementOperations } from "./elements";
import { layoutOperations } from "./layout";
import { linkOperations } from "./links";
import { stateOperations } from "./states";
import { storyOperations } from "./stories";
import { subprocessOperations } from "./subprocesses";

export function run(doc: Doc, model: Model, op: Operation): Partial<EditResult> {
  switch (op.op) {
    case "addElement":
    case "updateElement":
    case "renameId":
    case "setLabel":
    case "deleteElements":
    case "setSchemas":
      return elementOperations(doc, model, op);
    case "addState":
    case "renameState":
    case "deleteState":
    case "moveState":
      return stateOperations(doc, model, op);
    case "addLink":
    case "updateLink":
      return linkOperations(doc, model, op);
    case "moveElements":
    case "setLayout":
    case "openZoom":
    case "saveView":
    case "removeStaleLayout":
      return layoutOperations(doc, model, op);
    case "reorderSubprocess":
    case "addSubprocess":
    case "removeSubprocess":
      return subprocessOperations(doc, model, op);
    case "setStory":
    case "syncStory":
      return storyOperations(doc, model, op);
    case "paste":
      return clipboardOperations(doc, model, op);
  }
}
