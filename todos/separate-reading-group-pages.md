# Separate reading and group pages

- [x] Give Your reading and Group study separate main navigation destinations.
- [x] Give group entry a full-page layout; keep the meeting pane beside Scripture during active groups.
- [x] Keep Plans & circles accessible from Your reading without mixing in group entry.
- [x] Improve page headings, start/join choices, touch targets, and narrow-screen navigation.
- [x] Render desktop and mobile flows, verify navigation and scrolling, and run checks.
- [x] Publish and verify the live build.

The existing reconnect and resume fixes on this branch are preserved. This pass changes navigation and presentation only.

Verified actual renders at 1400x800, 390x844, and 320x740. Tested direct destinations, Plans & circles, close controls, scrolling, and starting/leaving an unlisted group. The active meeting retains Scripture with the right pane. Progress bars stack on phones and group join/start controls remain reachable. All 109 tests pass.

Published in PR #11, commit 17af792. Live desktop Group study and mobile Your reading renders verified. CI typecheck, all 109 tests, and production build passed.
