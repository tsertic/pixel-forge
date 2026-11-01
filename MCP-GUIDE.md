# Drawing with Pixel Forge MCP

The user sees your edits live in a shared pixel art editor. Read `pixel_get_project` first. A new character or separate asset must start a **new project** using `pixel_create_character`; additional animation groups and edits of the same character stay in its existing project. The previous project is saved automatically and can be reopened under Projects. `pixel_get_preview` returns the composited PNG you can inspect visually.

## Example: a wizard after a skeleton

If Skeleton is open and the user asks for a wizard, call **pixel_create_character**:

```json
{ "name": "Wizard", "width": 32, "height": 32, "expectedProjectId": "SKELETON_PROJECT_ID" }
```

This always opens a new Wizard project/tab. Then read its IDs and draw with `projectId: "WIZARD_PROJECT_ID"`, `intent: "edit_character"`, and `characterName: "Wizard"`. Do not create a Wizard layer or Wizard Idle animation inside Skeleton. Idle and Run of the **same wizard** belong together in the Wizard project.

Advanced clients may use a `pixel_draw` batch with `intent: "new_character"` and `characterName` matching a single `new_project` operation placed first. A new-character declaration without that operation is rejected rather than drawing in the old project.

**Upgrade:** refresh the MCP tool list or restart the client after updating. Older calls without the required identity fields are rejected. Re-reading a stale tool schema does not create a character project automatically.

## Default language

English is the default language for the editor, documentation, and MCP instructions. Use English for activity labels and generated project or layer names unless the user requests another language. Preserve user-provided names as written. Tool names, operation types, and JSON field names remain the same in every language.

## Coordinates and targets

Coordinates are integer pixels with `(0,0)` at top-left. X grows right, Y grows down. Colors are `#RRGGBB`, `#RRGGBBAA` or `null` to erase. All drawing clips at canvas edges. Flood fill applies to a single cel and compares exact colors, including alpha.

Every `pixel_draw` and `pixel_paint_sprite` call requires `projectId`, `intent`, and `characterName`. For existing-character edits, use `intent: "edit_character"` and that character's project name. If the requested character differs, call `pixel_create_character` first. The server rejects missing declarations, stale project IDs, and mismatched character names. It validates declared identity; it does not recognize characters from pixel content. Supply `projectId` from the current project for edits. Frame and layer IDs come from `pixel_get_project`. Explicit targets prevent a human's frame/layer selection change from redirecting your drawing. Without explicit targets, operations use the currently active frame/layer at application time. Invalid/locked targets reject the complete batch. Hidden layers can be edited but won't appear in the composite.

## Efficient sprites

Call `pixel_paint_sprite`:

```json
{
  "projectId": "ID_FROM_GET_PROJECT",
  "intent": "edit_character",
  "characterName": "Dog",
  "frameId": "FRAME_ID",
  "layerId": "LAYER_ID",
  "x": 3,
  "y": 4,
  "rows": ["..oooo..", ".obbbbo.", "obwbbwbo", "obebbebo", ".obbbbo.", "..oooo.."],
  "colors": { "o": "#27382b", "b": "#b7956b", "w": "#f4e3bd", "e": "#151b2e" },
  "label": "Dog face · base colors"
}
```

`.` skips pixels rather than erasing. A symbol mapped to `null` erases. Rows can have different lengths. Use one-character ASCII symbols. Set `transparent` to a different single character if needed. Break a drawing into a few meaningful tool calls when the user wants to watch progress; do not send one tool call per pixel.

## Batch operations

`pixel_draw` accepts `operations`, required `projectId`, `intent`, `characterName`, and a human-readable `label`. A drawing batch is one undo step within its project. Changes validate on a cloned project; failure commits nothing. Commands execute sequentially within the batch. Opening an empty new project creates a tab rather than an undo step. A batch that creates a new project and draws in it can undo the drawing inside that new tab.

```json
{
  "projectId": "ID_FROM_GET_PROJECT",
  "intent": "edit_character",
  "characterName": "Dog",
  "label": "Sprite silhouette and highlights",
  "operations": [
    { "type": "rect", "x": 6, "y": 8, "width": 12, "height": 10, "color": "#b7956b", "filled": true },
    { "type": "line", "x1": 7, "y1": 8, "x2": 15, "y2": 8, "color": "#f4e3bd" },
    { "type": "pixels", "pixels": [{ "x": 10, "y": 12, "color": "#151b2e" }] }
  ]
}
```

Every raster operation also accepts optional `frameId` and `layerId`:

| `type`            | Fields                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `pixels`          | `pixels: [{x,y,color}]`                                                                      |
| `line`            | `x1,y1,x2,y2,color`                                                                          |
| `rect`, `ellipse` | `x,y,width,height,color,filled` (filled defaults true)                                       |
| `fill`            | `x,y,color`                                                                                  |
| `clear`           | Erases one cel only                                                                          |
| `sprite`          | Same row/color inputs as `pixel_paint_sprite`                                                |
| `transform`       | `direction`: `flip_x`, `flip_y`, `left`, `right`, `up`, `down`; shifts clip without wrapping |

Project operations:

| `type`         | Fields                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `new_project`  | `name,width,height`; starts a new character project with Idle; project/layer/frame/animation IDs change            |
| `add_layer`    | `name`; creates blank cels in all frames and selects new layer                                                     |
| `update_layer` | `layerId`, optional `name,visible,locked,opacity` (0–1), `move` (`up`/`down`)                                      |
| `delete_layer` | `layerId`; removes it from all frames, last layer cannot be deleted                                                |
| `add_frame`    | `duplicate` (default false), optional source `frameId` and `animationId`; inserts in the source/selected animation |
| `delete_frame` | `frameId`; last frame of any animation cannot be deleted                                                           |
| `select`       | `animationId`, `frameId`, and/or `layerId`; a frame selects its owning animation                                   |
| `settings`     | Optional `name,fps,palette`; FPS changes the active animation                                                      |

Layers are stored bottom to top. Adding a layer puts it at the top. `move: up` brings a layer toward the viewer. Layer visibility, lock and opacity apply to every frame; cel pixel data is independent per frame. Adding a frame copies or blanks all layers together.

After structural changes, read `pixel_get_project` again to get new IDs. Selection operations are broadcast without adding an undo step. Undo can affect another client's recent change, so use it deliberately.

## New character workflow

Projects have persistent editor tabs. `new_project` opens a new selected tab while previous characters keep their tabs. Opening a saved project selects its existing tab or adds it once. Closing a tab keeps its artwork in Projects. All browser windows and MCP clients share the selected tab; if the user changes it, read the project again and use its current ID. Each project's Undo/Redo is separate and survives tab navigation during the server session; it resets on server restart.

1. Read the current project and preview. When the request is for a **new character or separate asset**, call `pixel_create_character` with a meaningful `name`, `width`, and `height` (defaults: 32 × 32). You may pass `expectedProjectId` to protect against a concurrent tab change. This is the required default for a new character; do not hide the previous character on a layer and reuse its project.
2. Read `pixel_get_project` again. Use the new project, animation, frame, and layer IDs for further edits, with `intent: "edit_character"` and the new character name. The default group is Idle.
3. Draw in several calls and inspect the preview. The previous character stays saved under Projects. For changes to the same character, keep its project.

## Animation groups

`pixel_get_project` returns `animations` (ID, name, FPS, frame count), `activeAnimationId`, and `animationId` on each frame. Layers and palette are shared, while frame cels and timing belong to each group.

| Operation          | Fields                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_animation`    | `name`, optional `duplicate` (default false); selects the new group. False creates one blank frame, true independently copies all frames of the selected group. |
| `update_animation` | `animationId`, optional `name` and `fps` (1–60). Idle can be renamed.                                                                                           |
| `delete_animation` | `animationId`; removes the group and its frames. The last group cannot be deleted.                                                                              |
| `select`           | `animationId` selects its first frame; optionally supply a frame belonging to it. Selecting a frame alone selects its owning group.                             |

For a Run animation based on the current Idle poses:

```json
{
  "projectId": "CURRENT_PROJECT_ID",
  "intent": "edit_character",
  "characterName": "CURRENT_PROJECT_NAME",
  "label": "Create Run animation from Idle",
  "operations": [
    { "type": "select", "animationId": "IDLE_ANIMATION_ID" },
    { "type": "add_animation", "name": "Run", "duplicate": true },
    { "type": "settings", "fps": 12 }
  ]
}
```

Read the new IDs before editing. Do not modify Idle's frames when asked for Run. Duplicate names that normalize to the same export suffix are rejected. `add_frame` without an explicit source belongs to the selected animation. Drawing with an explicit frame ID changes that frame but does not change the user's selected animation.

## Animation workflow

1. Read project and preview. Select or create the requested animation group.
2. Complete the initial sprite on explicit frame/layer targets.
3. `add_frame` with `duplicate: true`.
4. Read new active frame ID, edit that cel to produce the next pose.
5. Repeat; set `settings.fps` to the desired integer (1–60).
6. Inspect previews by `frameId`.
7. `pixel_export` with `sheet: true, scale: 1` returns a horizontal PNG sheet for the selected animation and matching metadata, including millisecond durations. Supply `animationId` to export another group without changing selection. Metadata includes the animation ID/name/FPS and a filename such as `forest-familiar-idle.png`. A supplied `frameId` must belong to the requested animation.

`pixel_export` returns image content, not a path saved on the user's computer. The user can download PNGs and full projects from the editor. If the user has enabled automatic export in **Project info**, edits also trigger a PNG export to that project's Unity or Unreal source folder. The user configures the engine, folder, and filename in the editor; the drawing tools do not change export settings.

## Game engine export workflow

When automatic export is enabled in **Project info**, keep drawing through the existing MCP tools. Manual edits and MCP edits both reach the same export listener. The selected frame and visible layers are exported at 1× into a single PNG. Hidden layers are excluded. Frame selection changes also update the PNG. Settings are stored locally per project ID. The **Use this as the main export folder for all projects** checkbox shares a persistent destination across projects, with an unchecked project retaining its own override. New projects inherit the main folder and a distinct suggested filename, but start with automatic export disabled. Reopening a project restores its local export setting and filename. Changing the main destination updates projects that use it; filenames and enabled states are never shared. Existing files owned by another project cannot be overwritten.

Keep the current project and configured asset filename when adjusting an existing game sprite. For a separate character or game asset, create a new project. For the same character's additional action, add an animation group. Automatic export adds the animation suffix to the configured filename prefix: `forest-familiar-idle.png` or `forest-familiar-run.png`. Changing frames updates only the selected group's PNG. Renaming a group creates a new filename and leaves the previous export on disk. Export does not create animation clips or automatically slice sprite sheets. The Unity importer configures marked PNGs as Sprite (Single) with Point filtering, no compression, and the user's pixels-per-unit value. Unreal receives PNG source files; its Auto Reimport configuration and Paper 2D sprite creation are handled in Unreal, and Pixel Forge does not generate `.uasset` files.
