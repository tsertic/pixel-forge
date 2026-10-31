# Maintaining Pixel Forge

Pixel Forge uses native JavaScript modules in the browser and Node.js. There is no build step. `public/app.js` wires UI modules to the server; `src/server.js` wires HTTP, MCP, live events, and project export to the same store.

## Drawing flow

1. A module in `public/tools/` describes a tool's icon, shortcut, preview, and drawing operation. Each tool has its own file, registered in `public/tools/index.js`.
2. `public/editor/drawing-controller.js` handles pointer capture, stroke state, cancellation, and committing one undoable operation. `canvas-view.js` handles compositing, thumbnails, zoom, grid, and onion skin.
3. Human actions and MCP tools both use `Store.apply()`. The store validates and clones the project, applies the entire batch, then commits, autosaves, and broadcasts it. A failed operation commits nothing.
4. Project changes live in `src/model.js`. Pixel operations dispatch through `src/drawing/index.js` to separate handlers in `src/drawing/tools/`. The model checks the frame, layer, and lock before handing over the cel.
5. `shared/raster.js` contains pure geometry used by both browser previews and server handlers. Keep this module free of DOM, filesystem, and Node-specific imports.

To add a tool using an existing operation, add a browser tool module and register it. For a new operation, also add its Zod schema in `src/project/schema.js`, a server handler, and an entry in `src/drawing/index.js`. Cover resulting pixels, clipping, or transaction behavior in a model test. Avoid copying geometry into the browser.

## UI panels and MCP

`public/ui/` separates layers, palette, timeline, files, connection help, activity, and Project info. Factories receive narrow callbacks such as `getProject`, `action`, and `toast`; they do not import mutable application state. Pass dependencies explicitly when moving code between modules.

Each MCP tool has one registration module under `src/mcp/tools/`. `src/mcp.js` provides shared registration, activity tracking, and error handling. Shared inputs and client instructions live next to the tool directory. Preserve tool names and operation JSON fields when reorganizing code, as external clients depend on them.

## Destination profiles and export

`src/export/profiles.js` loads, migrates, resolves, and persists local destination settings. It stages changes before committing them. Version 3 of `data/unity-sync.json` contains:

- `mainFolder`: a shared engine, folder, pixels-per-unit value, and importer option, or `null`.
- `projects`: profiles keyed by project ID, each with its own filename, enabled flag, destination fields, and `useMainFolder` flag.

A following profile resolves destination fields from `mainFolder`; an override uses its own fields. New projects follow the main destination when available, use the project name as their suggested filename prefix, and start with export disabled. Setting the first main destination opts existing profiles into it. Unchecking the checkbox creates an override for the current project. It does not delete the saved main destination.

`sync-service.js` coordinates settings changes, project activation, and debounced exports. `png-exporter.js` checks asset ownership and writes PNGs and sidecars. `folders.js` validates paths, and `unity-importer.js` installs the optional Unity script. Atomic writes are shared through `src/fs/atomic-write.js`. The old `src/unity-sync.js` module is retained as a compatibility entry point.

Legacy single-profile and version 2 settings migrate to version 3 with the shared destination unset. User export destinations stay local and are not embedded into portable `.pixel.json` artwork files.

## Verification

Run `npm test` for drawing, history, persistence, export, migrations, and real MCP integration. Run `npm run test:browser` for pointer drawing, live views, UI panels, main-folder inheritance, overrides, and file round trips. Both use isolated test state. Run `npm run format` before delivering changes.

## Animation model and saved projects

Open project tabs are managed by `src/project/tabs.js`. `data/workspace.json` stores only an ordered list of project IDs, while the autosave stores the active project and the library stores each project's artwork. Missing or invalid saved projects are skipped when restoring tabs; the current project always remains open. Tab metadata is part of the Store snapshot and reaches all views through SSE.

`public/ui/project-tabs.js` renders tab names, selection, close buttons, and keyboard navigation; its stylesheet is beside it. It avoids replacing DOM nodes on pixel-only updates, preserving focus and horizontal scroll. New projects and imports touch the tab list; opening an existing project ID selects its tab. Closing a tab saves the project and removes only the tab reference. The last tab cannot close.

Store switches per-project in-memory history when the active project ID changes. Opening or closing tabs does not add drawing history. A `new_project` batch with subsequent drawing gets a blank new-project baseline for Undo, so Undo cannot move the user into a different character. Ordinary drawing and structural edits remain atomic and undoable within the selected project.

Projects retain their flat `frames` array for IDs, drawing targets, and global pixel limits. Every frame has an `animationId`; `animations` stores group IDs, names, and FPS, with `activeAnimationId` identifying the selected group. The top-level FPS mirrors the active group's value for compatibility. `src/project/animations.js` handles group operations and selection. `shared/animations.js` resolves groups, filters frames, and constructs safe project-animation filenames. Old v1 files without groups migrate to Idle through the project schema preprocessor.

Canvas rendering, frame thumbnails, onion skin, and playback filter by active animation. PNG sheets and metadata resolve one animation through `exportSelection()` in `src/png.js`. An explicit group/frame mismatch is rejected. Automatic exports remain single-frame PNGs, with the configured prefix and animation suffix; existing un-suffixed exports are retained. Sidecars identify both project and animation ownership.

`src/project/library.js` stores independent project files in `data/projects/` using hashed IDs as safe filenames. Store saves each project and archives the previous character before switching IDs. A failed archive rejects the switch. The Projects panel lists and opens saved characters, including after restarts. Tests without a data file use an in-memory library.
