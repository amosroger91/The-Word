# Voice and group reliability pass

## Fixed

- [x] Reproduced five failures before fixing: replaced-tab reconnect fights, stale hello packets, unrelated media errors tearing down the hub, silent audio continuing after synthesis failure, and stale play rejection interrupting Resume.
- [x] Retired tabs receive a replacement notice and stop reconnecting. Old data/open/close callbacks cannot alter replacement connections.
- [x] Media-peer errors preserve a healthy hub connection. Failed media attempts back off from 1 second to a maximum 30 seconds, resetting after a stream succeeds.
- [x] Remote stream cleanup retains its original member id even after the roster removes it. Retired channels, timers, and presence entries are released.
- [x] Voice-generation failure stops the silent gesture loop. Rejected older play attempts cannot interrupt a newer Resume.
- [x] Full automated suite: 116 passing tests; TypeScript passes. Seven new regression tests added.
- [x] Publish and verify deployed revision.

## Review coverage and limits

Existing tests cover 200 sequential verses with zero remaining playback timers/blob URLs after each verse, synthesis timeout/retry/cancel, lost end events, pause/resume, queue completion versus Stop, chapter rollover, follower backlog, five-member media refresh, host handoff/election, and broker disruption. The new tests inject failure events deterministically; this is not an overnight physical-device soak.

Remaining operational risks:

- Mobile screen lock/background suspension may stop JavaScript, audio, or WebRTC regardless of app timers. Verify on actual iOS and Android devices with screen off and after returning to the app.
- Rooms depend on the original data hub and a public signaling broker. Existing connections can survive broker trouble, but new joins and replacement host discovery still depend on network reachability. Host loss intentionally pauses narration during election.
- Direct WebRTC connectivity is network-dependent; the app constructs PeerJS peers without an application-managed TURN relay. Restrictive networks require a real multi-network test and potentially relay infrastructure.
- A listener slower than the host accumulates queued verses by design to avoid skipping Scripture. Returning to the host resets that backlog; multi-hour tests should measure how far slow devices fall behind.
- Mixed old/new open tabs cannot be assumed to understand the replacement notice. Refresh clients to receive the new protocol behavior.

Suggested physical soak: 2–8 participants for 2+ hours, multiple chapter transitions, slow device, repeated refreshes, Wi-Fi changes, screen lock, host handoff and host closure. Verify no duplicate seats, preserved Resume position, bounded resource growth, and recovery without rapid reconnect loops.

Browser verification: created an unlisted room, joined from a second tab, refreshed and rejoined that guest, and confirmed People (2) on the host and Group 2 on the guest. Both sessions were then left and the temporary guest tab closed. Microphone/camera capture was not enabled.

Published from main after PR #12. The web suite was re-run first: 116 tests passed. GitHub Pages is serving `index-BiF4PFUj.js`, which contains the `session-replaced` recovery. A phone screen-lock soak and a multi-network room were not run.
