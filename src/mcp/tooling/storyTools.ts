import { StoryDef } from "../../core/model";
import { stories } from "../../core/stories";
import { need } from "./arguments";
import { Tool, ToolError } from "./contracts";
import { edit } from "./editing";
import { ID_ARG, PATH, STORY_SCHEMA } from "./schemas";
import { Parsed, structureErrors } from "../../core/load";

export const storyTools: Tool[] = [

  {
    name: "opm_add_story",
    title: "Add a user story",
    readOnly: false,
    description: `Adds a user story (a makigami) to the "stories" section and writes the file. The story must match the format: the edit is refused when it does not.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the story key, camelCase, not used by another story.
- story: the whole story object:
  - story (required): the sentence, "As a ... I want ..., so that ...".
  - lanes (required): agents (physical objects) or modules of the model, top to bottom.
  - steps (required, in time order): {lane, does, process?, handsOver?: {object, state?, to}, waits?, problem?, note?}. lane and handsOver.to are among the lanes; process is a process of the model; object is an object of the model, state one of its states.
  - title, doneWhen (list of sentences), note: optional.
- sync (optional, default false): when true, also generates and wires any missing OPM objects, states, processes and links implied by the story.

The validator then checks the references against the model; its findings are in the returned diagnostics.

Returns the same JSON as every edit tool.

Example: {"path": "...", "id": "orderWindow", "story": {"story": "As a user I want to order the priced window.", "lanes": ["user", "ui"], "steps": [{"lane": "user", "does": "Presses Order.", "process": "configuring", "handsOver": {"object": "configuration", "to": "ui"}}]}}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Story key, camelCase."),
        story: STORY_SCHEMA,
        sync: { type: "boolean", description: "Also generate/wire missing OPM elements and links from the story." },
      },
      required: ["path", "id", "story"],
      additionalProperties: false,
    },
    handler: (args) => {
      const id = need(args, "id", "the story key");
      return edit(args.path, (s, model) => {
        if (stories(model)[id]) throw new ToolError(`Story "${id}" already exists; use opm_set_story to replace it.`);
        s.apply({ op: "setStory", id, story: args.story as StoryDef });
        if (args.sync === true) s.apply({ op: "syncStory", id });
        return { ids: [id] };
      }, storyGuard(id));
    },
  },

  {
    name: "opm_set_story",
    title: "Replace or delete a user story",
    readOnly: false,
    destructive: true,
    description: `Replaces a whole user story, or deletes it, and writes the file. Read the current story with opm_get first, change it, and pass the whole object back. The new story must match the format (see opm_add_story); the edit is refused when it does not.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the key of an existing story.
- story: the whole new story object. Omit it and pass "delete": true to remove the story.
- delete (optional): true removes the story.
- sync (optional, default false): when true, also generates and wires any missing OPM objects, states, processes and links implied by the story.

Returns the same JSON as every edit tool.

Example: {"path": "...", "id": "getPrice", "delete": true}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Key of an existing story."),
        story: STORY_SCHEMA,
        delete: { type: "boolean", description: "true removes the story." },
        sync: { type: "boolean", description: "Also generate/wire missing OPM elements and links from the story." },
      },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => {
      const id = need(args, "id", "the story key");
      return edit(args.path, (s, model) => {
        if (!stories(model)[id]) throw new ToolError(`No story "${id}". Stories: ${Object.keys(stories(model)).join(", ") || "none"}; opm_add_story adds one.`);
        if (args.delete === true) {
          if (args.story !== undefined) throw new ToolError("Give either \"story\" or \"delete\": true, not both.");
          s.apply({ op: "setStory", id, story: null });
          return { message: `Story ${id} deleted.` };
        }
        if (!args.story) throw new ToolError("Give the whole new \"story\", or \"delete\": true.");
        s.apply({ op: "setStory", id, story: args.story as StoryDef });
        if (args.sync === true) s.apply({ op: "syncStory", id });
        return { ids: [id] };
      }, storyGuard(id));
    },
  },

  {
    name: "opm_sync_story",
    title: "Sync story to OPM model",
    readOnly: false,
    description: `Materialises a Makigami user story into the OPM model: creates any missing lane objects (modules or physical agents), handed-over objects and states, step processes, enabler links (handledBy/requires), transformation links (yields/changes/affects) and receiving step links (requires).

Parameters:
- path: absolute path of the *.opm.json file.
- id: the key of an existing story.

Returns the same JSON as every edit tool, with the created/updated element ids in "ids".

Example: {"path": "...", "id": "orderWindow"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Key of an existing story to sync into the OPM model."),
      },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => {
      const id = need(args, "id", "the story key");
      return edit(args.path, (s, model) => {
        if (!stories(model)[id]) throw new ToolError(`No story "${id}". Stories: ${Object.keys(stories(model)).join(", ") || "none"}.`);
        const r = s.apply({ op: "syncStory", id });
        return { ids: r.select ?? [id] };
      });
    },
  }
];

/** Refuses a story that does not match the format, so a broken story is never written. */
export function storyGuard(id: string) {
  return (after: Parsed) => {
    const bad = structureErrors(after.model).filter((d) => d.path[0] === "stories" && d.path[1] === id);
    if (bad.length) throw new ToolError(`Refused: the story does not match the format, nothing was written. ${bad.map((d) => d.message).join(" ")}`);
  };
}
