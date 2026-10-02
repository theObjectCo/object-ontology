/** Text of a new model: one agent, one process, an input it consumes and a result it yields in a state. */
export function starterModel(name: string): string {
  return `{
  "name": ${JSON.stringify(name)},
  "description": "",
  "objects": {
    "user": { "essence": "physical" },
    "request": {},
    "result": { "states": ["draft", "approved"] }
  },
  "processes": {
    "handling": {
      "handledBy": ["user"],
      "consumes": ["request"],
      "yields": [{ "object": "result", "state": "draft" }]
    }
  }
}
`;
}

/** The model name for a file name: order-flow.opm.json -> Order flow. */
export function modelName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.opm\.json$/i, "").replace(/[-_]+/g, " ").trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "New model";
}
