# Changelog

## Unreleased

- `dist/mcp.js`, also started as `opm mcp`, is an MCP server over stdio with 17 tools that list, validate, query, render and edit OPM models. Edits go through the edit engine of the diagram editor and return the diagnostics they introduced. See [MCP server](README.md#mcp-server).
- An entry written on one line that grows past 120 characters after an edit is written again with one field per line.
- A new top-level section such as `stories` is inserted in the order of the format, before `layout`.

## 0.1.0

First release on the Visual Studio Marketplace, marked as preview.

- `*.opm.json` files open in a diagram editor with ISO 19450 shapes and link symbols. Every change on the diagram is one undoable edit of the JSON text, and the text editor can stay open beside it.
- The right and middle mouse buttons pan the view. A left drag on the empty canvas draws a selection rectangle, and a right click opens the context menu of a thing, a link or the canvas.
- Objects, processes and links can have a note in Markdown. Web links in a note open in the browser, and relative paths open files next to the model.
- **Arrange** lays out a view with one of seven ELK algorithms and saves the positions in the model.
- **OPM: Create JSON Schema** writes definitions for the informatical objects and links the objects to them.
- **OPM: New Model** creates a model that passes the validator, from the command palette, the side bar or a folder in the explorer.
- The OPM side bar lists the models of the workspace, the objects and processes of the open model, and its views.
- The validator reports structure errors and OPM rule violations in the Problems panel, and **OPM: Export Markdown** writes Mermaid diagrams and OPL text.
