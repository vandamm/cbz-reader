# Physical iPad acceptance checklist

Status: **not executed on a real iPad**. Desktop testing does not complete this checklist.

Record device/OS, URL, Safari tab vs Home Screen, archive compressed size, typical scan dimensions, duration and outcome. Use iPad mini 2 / iOS 12.5.7 / original Safari, a regular tab, and the same URL throughout. Use the generated fixture first, then a representative real 100+ page manga; the fixture repeats small scans and does not simulate a large real volume’s memory pressure.

## Opening and reading

- [ ] Start the server on the Mac; open the LAN URL on the iPad.
- [ ] Open the generated 120-page JPEG CBZ from On My iPad in Files.
- [ ] Open a 100+ page real JPEG manga, a PNG book, and an archive with nested folders.
- [ ] Open the mixed JPEG/WebP manga: all 190 images must appear, with the 10 JSON files skipped. Check both lossy/lossless WebP and transparency; static pages only. On Safari 12 this exercises the worker/canvas fallback.
- [ ] Repeat page 57 reload, lock, background and long-session tests with a WebP page. Verify the worker is released while hidden and the canvas restored on return.
- [ ] Verify filenames `1`, `2`, `10`, `57`, `100`, `120` through their visual content/order. Confirm macOS metadata does not appear as pages.
- [ ] Try invalid ZIP, password-protected CBZ, CBR, image-free ZIP and damaged image. Confirm useful errors and access to the library/reselection.
- [ ] Right taps advance; left taps go back; swipe right advances. Reverse swipes and verify only swipe mapping changes.
- [ ] At first and last pages, extra navigation stays in bounds.
- [ ] Rapidly swipe/tap and scrub the slider. The displayed page must match its counter, without an older load replacing it.
- [ ] Taps, double taps, long presses and two-finger contact do not accidentally select/drag/zoom the page. Verify Safari’s reserved edge gesture behavior is understood.
- [ ] VoiceOver can find previous/next, reveal controls, the slider, fullscreen and library. Controls are usable on the 7.9-inch screen.

## Checkpoints and restart

- [ ] Navigate to page **57**, immediately reload, select the same file: page **57** returns.
- [ ] Navigate to page **57**, force-close Safari immediately, relaunch, open the same URL, select the file: page **57** returns.
- [ ] Repeat after rebooting the iPad.
- [ ] Open a second book and move elsewhere; reopening each book restores its own page.
- [ ] Reselect from iCloud Files after downloading locally. Modification-time drift must not reset a unique name+size match.
- [ ] Through a recent entry, choose a shorter revised file with the same filename. Restore the old page filename if present; otherwise clamp to its last page. Original checkpoint survives a failed selection or invalid archive.
- [ ] Cancel file selection; the existing checkpoint remains.
- [ ] In a context refusing localStorage, confirm a clear persistence warning and still-functional reading. Do not expect restart persistence there.

## Lock, background and resource recovery

Perform each case at page **57**, then check counter, page content, right/left navigation, toolbar, slider and fullscreen. If iOS reloads the page, file reselection is acceptable; losing the saved position is not.

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
- [ ] Toggle Fullscreen; the top-right Exit fullscreen button remains visible while the toolbar is hidden. Tap it in portrait/landscape: current page unchanged. Repeat after revealing the toolbar, and try Escape with a button focused if a keyboard is available.
- [ ] If native fullscreen is exposed and enabled, verify actual browser behavior and exit affordance. If absent/refused, verify the immersive-mode explanation is accurate.
- [ ] In a Safari tab, confirm immersive mode does not claim to remove Safari bars.
- [ ] Share > Add to Home Screen; launch the icon and verify standalone mode and space available. Reselect the book as needed; test progress within that mode.
- [ ] Portrait/landscape rotations while controls are hidden/visible and after lock show the whole page, no distortion or clipping. Test a wide spread, a portrait scan and a very small image.

## Extended reading / memory

- [ ] Read sequentially through at least **120 pages** of a representative real manga, then reread it and switch books repeatedly.
- [ ] Use Safari’s remote Web Inspector from the Mac if available. Watch image/object URL retention over page changes; resource counts should remain bounded, not grow per page. OS allocation can fluctuate and delayed reclamation is expected.
- [ ] Verify object URLs/images are released when returning to the library or backgrounding.
- [ ] Test an archive near the documented size limit and large scans; record failures/reloads and reduce source sizes as needed. Do not treat the limit as a memory guarantee.
- [ ] Disconnect Wi-Fi after opening a book; JPEG/PNG and native WebP pages remain readable while the tab survives. For the legacy WebP fallback, first load its self-hosted worker/wasm assets while online; after backgrounding the worker is recreated and browser caching is not an offline guarantee. Reconnect before reload. Offline relaunch is explicitly unsupported.

Only mark the original acceptance criteria complete after the relevant physical checks pass. Record any reload, timeout, mismatch or blank screen with exact steps and file sizes.
