# Simplify the reader UI

Branch: `codex/simplify-reader-ui`

Goal: Make reading and study easy without arranging panels or navigating collapsible menus. Preserve group sessions, narration, verse actions and drafts.

## Work checklist

- [x] Replace movable, resizable tool panes with one contextual panel; retain drafts while switching views.
- [x] Use consistent labeled navigation and predictable desktop/tablet/mobile layouts, with full pages for larger tasks.
- [x] Group verse actions and related study tools; simplify settings and defer group-profile onboarding.
- [x] Verify types, build, automated regressions and browser flows at desktop, tablet and phone sizes.
- [x] Record results, limitations and remaining work here and in the daily tracker.

## Constraints

- Preserve pre-existing edits to web development scripts.
- Origin is GitHub; the user's global instructions permit pushes and PRs only to Gitea. Keep this implementation local unless that instruction changes or a confirmed Gitea destination is supplied.
- Do not deploy or start a public group for UI verification.

## Verification results

- Web TypeScript check: passed.
- Production build: passed. Existing Piper eval and large-chunk warnings remain.
- Automated tests: 90 passed, 0 failed (87 existing + 3 tool lifecycle regressions).
- Browser: desktop 1366×900, tablet 900×900, phone 390×844, plus viewport boundaries 320/700/701/950/951/1190px. No horizontal document overflow or unnamed visible buttons in the tested reader states.
- Verified Search → Settings → Search preserves the query and replaces the visible surface; Escape returns focus to Read.
- Verified Context → Related verses retains the selected passage; Share → Create image uses a full page and retains image background edits after switching away.
- Verified unsent plan answers survive leaving/reopening Study, and plan passage links return to the reader.
- Group transport and speech regressions pass; live multi-device calls, camera/microphone and screen sharing were not exercised in the browser.
- Existing script changes were preserved. The build-generated daily verse change was discarded.

## Delivered behavior

- One fixed contextual panel with Back to reading; no split slider, expand/restore, pane-moving controls or open-tool tab stacks.
- Consistent Read / Search / Saved / Study / Settings navigation, with localized new labels in all five supported languages.
- Settings, plans, progress and image creation use full-page views; settings has flat Reading / Audio / Profile / Backup categories.
- Bookmark / Note / Share / Study form the compact selection bar. Copy and image creation live under Share; Context / Related verses / Explanation share a study navigation row.
- Audio keeps voice, volume and reading speed together. Read from here moves to the persistent listening control.
- Group profile onboarding is deferred until opening Group study. Participant layout is fixed and the roster is directly visible.

## Remaining validation / publishing

- A real multi-device group session should be exercised before release, including follow/host transfer, microphone/camera and screen sharing.
- Legacy browser e2e scripts targeting removed workspace controls may need updated selectors before being used as a release gate.
- No deployment, push or PR was performed. Publishing requires a confirmed Gitea destination or a user instruction allowing this repository's GitHub origin.
