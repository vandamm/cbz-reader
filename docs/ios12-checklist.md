# Physical iPad acceptance checklist

Status: **not executed on a real iPad**. Desktop testing does not complete this checklist.

Record device/OS, URL, Safari tab vs Home Screen, archive compressed size, typical scan dimensions, duration and outcome. Use iPad mini 2 / iOS 12.5.7 / original Safari, a regular tab, and the same URL throughout. Use the generated fixture first, then a representative real 100+ page manga; the fixture repeats small scans and does not simulate a large real volume’s memory pressure.

## Opening and reading

- [ ] Open https://vandamm.github.io/cbz-reader/?v=9 in Safari on the iPad (or use the optional Mac/LAN server).
- [ ] Open the generated 120-page JPEG CBZ from On My iPad in Files.
- [ ] Open a 100+ page real JPEG manga, a PNG book, and an archive with nested folders.
- [ ] Open the mixed JPEG/WebP manga: all 190 images must appear, with the 10 JSON files skipped. Check both lossy/lossless WebP and transparency; static pages only. On Safari 12 this exercises the worker/canvas fallback.
- [ ] Repeat page 57 reload, lock, background and long-session tests with a WebP page. Verify the worker is released while hidden and the canvas restored on return.
- [ ] Verify filenames `1`, `2`, `10`, `57`, `100`, `120` through their visual content/order. Confirm macOS metadata does not appear as pages.
- [ ] Try invalid ZIP, password-protected CBZ, CBR, image-free ZIP and damaged image. Confirm useful errors and access to the library/reselection.
- [ ] Right taps advance; left taps go back; swipe right advances. Reverse swipes and verify only swipe mapping changes.
- [ ] At first and last pages, extra navigation stays in bounds.
- [ ] Rapidly swipe/tap and scrub the slider. The displayed page must match its counter, without an older load replacing it.
- [ ] Double tap at the center and both edges: enlarge the current page, then return to fit, without turning a page. Pinch between 1× and 4×, move the midpoint, and lift either finger first. Drag at enlarged scale in every direction; edges remain bounded. Side taps/swipes must not navigate while enlarged.
- [ ] Shrink to fit and verify normal taps/swipes return. Center taps still reveal/hide controls at any scale. Changing pages/rotating/resuming resets to fit without losing the saved page.
- [ ] Long presses do not select images; browser UI is not enlarged. Verify Safari’s reserved edge/system gestures are understood.
- [ ] VoiceOver can find previous/next, reveal controls, the slider and library. Controls are usable on the 7.9-inch screen.

## Checkpoints and restart

- [ ] Open the book and wait for **Local copy ready**. Navigate to page **57**, immediately reload: page **57** returns automatically without selecting the file.
- [ ] After the local copy is ready, navigate to page **57**, force-close Safari, relaunch the same URL: page **57** returns automatically. Repeat from the Home Screen icon, including long switching to another app.
- [ ] Repeat after rebooting the iPad. Also interrupt the initial copy save: if it did not finish, reselection must preserve page **57**.
- [ ] Exit to Library explicitly, close and relaunch: stay in Library. Tap Continue: restore the saved book without a picker. Remove file on one row: keep its history and request reselection next time; other saved books must still open.
- [ ] With local file storage refused/full, or a missing/corrupt copy, confirm a clear fallback and remembered page after reselection. Opening another book preserves earlier local copies and never resumes a mismatched file. When storage fills, older books still open and the new book explains that its copy was not saved.
- [ ] Open at least three books, visit different pages and return to Library: verify every title and current/total page. Close/relaunch from Library, then tap each saved book: it opens without a picker at its own page.
- [ ] Upgrade from the previous single-file version: the existing saved archive and history survive. Earlier metadata-only entries need one reselection to save their archive.
- [ ] Remove one local copy: its progress row stays and other books still Continue. Reselect it: its old page returns. Repeat file selection with changed modification metadata and confirm no accumulating duplicate copies.
- [ ] Reselect from iCloud Files after downloading locally. Modification-time drift must not reset a unique name+size match.
- [ ] Through a recent entry, choose a shorter revised file with the same filename. Restore the old page filename if present; otherwise clamp to its last page. Original checkpoint survives a failed selection or invalid archive.
- [ ] Cancel file selection; the existing checkpoint remains.
- [ ] In a context refusing localStorage, confirm a clear persistence warning and still-functional reading. Do not expect restart persistence there.

## Lock, background and resource recovery

Perform each case at page **57**, then check counter, page content, right/left navigation, toolbar, slider and touch zoom. After a ready local copy, an iOS page reload should automatically reopen the same book/page. File reselection is a fallback when storage or its copy is unavailable; losing the saved position is not acceptable.

- [ ] Lock for **30 seconds**, unlock and continue.
- [ ] Lock for **5 minutes**, unlock and continue.
- [ ] Lock for **30–60 minutes**, unlock and continue.
- [ ] Leave locked overnight, then resume/reselect as needed.
- [ ] Switch to another app for **30 seconds**, **5 minutes**, then **30 minutes** and return each time.
- [ ] Lock during archive opening, during a page load and immediately after navigation. Return to the latest saved destination.
- [ ] Cause memory pressure with other apps, return, and verify recovery or an explicit reselection prompt.
- [ ] Repeat a background/foreground cycle 20 times; no permanent blank page or inactive touch surface.

## Screen area

- [ ] Tap center repeatedly; controls hide/reveal without moving the page.
- [ ] The current/total counter stays at the top right with controls hidden or visible, on JPEG and WebP pages. Check after zoom, portrait/landscape rotation, lock/resume and automatic reopen from the Home Screen. The counter must remain above the image, below the status-bar safe area, and inside the visible screen. Taps through it retain normal right-side navigation when fitted.
- [ ] Share > Add to Home Screen; launch the icon and verify standalone mode and space available. Reselect the book as needed; test progress within that mode.
- [ ] Portrait/landscape rotations while controls are hidden/visible and after lock show the whole page, no distortion or clipping. Test a wide spread, a portrait scan and a very small image.

## Extended reading / memory

- [ ] Read sequentially through at least **120 pages** of a representative real manga, then reread it and switch books repeatedly.
- [ ] Use Safari’s remote Web Inspector from the Mac if available. Watch image/object URL retention over page changes; resource counts should remain bounded, not grow per page. OS allocation can fluctuate and delayed reclamation is expected.
- [ ] Zoom/pan repeatedly on JPEG and WebP pages, then change pages and return to the library; no accumulating canvases, workers or decoded page copies.
- [ ] Verify object URLs/images are released when returning to the library or backgrounding.
- [ ] Test an archive near the documented size limit and large scans; record failures/reloads and reduce source sizes as needed. Do not treat the limit as a memory guarantee.
- [ ] Disconnect Wi-Fi after opening a book; JPEG/PNG and native WebP pages remain readable while the tab survives. For the legacy WebP fallback, first load its self-hosted worker/wasm assets while online; after backgrounding the worker is recreated and browser caching is not an offline guarantee. Reconnect before reload. Offline relaunch is explicitly unsupported.

Only mark the original acceptance criteria complete after the relevant physical checks pass. Record any reload, timeout, mismatch or blank screen with exact steps and file sizes.
