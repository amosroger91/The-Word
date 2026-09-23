# Group reading pane

Branch: `codex/group-reading-layout`

Goal: Keep Group Study visible beside Scripture for the duration of an active group reading and remove the nested scrollbar from that mode.

## To-do

- [x] Pin Group Study to the right while a room is active, including when the reader opens or reloads the reading view.
- [x] Let the group workspace use one page scroll surface instead of a second pane scrollbar.
- [x] Keep solo reading, search, settings, and leaving a room unchanged.
- [x] Verify the active room layout in the local browser, plus typecheck, build, and regression tests.

Verification: `npm test --prefix apps/web` (90 passing), `npm run typecheck --prefix apps/web`, `npm run build --prefix apps/web`, and a local browser check confirmed the Group Study pane remains visible after Search and Back to reading actions. The pane and reader report `overflow: visible`; the shared workspace body owns the scroll surface.

## Follow-up: scroll treatment

- [x] Use the workspace light/dark tokens for the shared group-reading scrollbar and any supporting library/participant rails.
- [x] Keep mobile group reading on one thin, touch-friendly scroll surface with the meeting pane stacked below Scripture.

Verification: desktop and active-room browser checks confirm the shared scrollbar uses the workspace line/muted colors; the mobile rules keep the same treatment at a smaller width without adding a nested pane scrollbar.
