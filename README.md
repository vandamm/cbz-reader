# Manga reader for iOS 12

A buildless, touch-friendly CBZ reader for an iPad mini 2 running Safari on iOS 12.5.7. Files are opened and extracted in the browser. Nothing is uploaded. JSZip 3.10.1 and a portable WebP decoder are included locally; there is no CDN, framework, account, or runtime dependency on an external service.

## Open directly on the iPad

Open **https://vandamm.github.io/cbz-reader/** in Safari and tap **Open CBZ** to select a manga from Files. No installation, build, developer tools, Mac or local server is needed. Use Share > Add to Home Screen for more reading space.

Keep using this same URL to retain your reading history. Progress from a previous localhost/LAN URL belongs to that different browser origin and does not transfer automatically. Internet access is needed to launch/reload the site; selected manga still stays on your device.

If a book appears to contain only one page, return to Library and tap **Check CBZ**, then select the same file. The report lists file formats, the JPEG/PNG/WebP page count and sample paths. Send that short text or a screenshot instead of the large CBZ. Inspection stays on the device, does not decompress images or change saved progress, and uses the same 200 MiB archive safety limit. The report uses ZIP filenames/extensions; it does not verify the contents of unsupported images.

## Run on macOS

From this folder:

```sh
python3 -m http.server 8080 --bind 0.0.0.0 --directory .
```

Open **http://localhost:8080/** on the Mac. Python 3 is needed only to serve files. If it is missing, install Python 3 from [python.org](https://www.python.org/downloads/macos/). Node.js is optional and only needed for the tests and fixture generator. `npm start` runs the same server.

To use the iPad:

1. Connect the Mac and iPad to the same trusted Wi-Fi network. Allow incoming connections to Python if macOS asks.
2. Find the Mac’s local IP address in System Settings > Wi-Fi > Details > TCP/IP. On many Macs, `ipconfig getifaddr en0` also prints it.
3. In the iPad’s original Safari, open `http://YOUR-MAC-IP:8080/`.
4. Tap **Open CBZ**, browse Files, and select a `.cbz`. Download iCloud files to the device first if the provider cannot supply them reliably.
5. Keep the Mac awake with the server running whenever you need to launch/reload the app. Reading an already-open archive needs no server requests.

The file picker deliberately has no `accept` filter: older Files providers may classify `.cbz` as an unknown type and disable it when filtered. Archive contents are validated after selection.

This development server exposes this project folder to your Wi-Fi network. Serve this folder, not a folder containing private files. Your selected manga can live elsewhere in Files; selecting it does not copy it to the server. Stop the server with Control-C.

For deployment, copy `index.html`, `styles.css`, `core.js`, `archive.js`, `app.js`, `webp.js`, `webp-runtime.js`, `webp-worker.js`, `apple-touch-icon.png`, and the `vendor` directory to any static host. No build step is required.

## Reading

- **Tap right:** next page. **Tap left:** previous page.
- **Swipe right:** next page by default. Change “Next page” in the toolbar to reverse swipes. Tap directions stay unchanged.
- **Tap center:** reveal or hide the toolbar.
- Use the page slider to jump. Its page position is saved immediately on every change.
- **Library** closes the archive and releases image resources. Recent entries let you select the file again and resume.
- Arrow keys navigate; Space shows controls when the page surface has keyboard focus. Buttons, select and slider also support keyboard/VoiceOver.

The whole image fits the usable viewport without cropping or stretching. Black space is expected when image and screen proportions differ. Double taps, pinches, long-press selection and dragging on the reading surface are intercepted to prevent accidental navigation/zoom. Library and toolbar keep ordinary browser accessibility behavior; Safari may still reserve its own edge/system gestures.

## Progress and reselection

Progress is written synchronously to `localStorage` **before** image loading begins, on every page change. It is also saved on visibility loss, `pagehide`, window blur and returning to the library. Each checkpoint contains filename, byte size, available `lastModified`, zero-based page index, page filename and page count. No image or archive is saved in browser storage.

A reload or terminated Safari process cannot automatically reopen a local file. The library names the last book and page, and asks you to select it again. Selecting the same file restores its checkpoint. A unique filename+size match tolerates a Files provider changing the modification timestamp. Exact name/size/metadata matches remain independent.

For a revised archive whose size changed, tap its **recent entry** and select the same filename. This explicitly associates the revision with that saved position. If the old page filename exists, it is restored; otherwise the saved index is clamped to the new last page. Opening a different-sized file through **Open CBZ** treats it as a separate edition. A different filename cannot be selected for a recent entry.

Two distinct files with identical filename, size and modification time cannot be distinguished without reading/hashing their contents; this small reader uses metadata identity as specified. Renaming a book creates a different identity.

Storage belongs to the exact origin (scheme, hostname and port). Use the same URL every time: switching between localhost, an IP address, HTTP/HTTPS or another port creates a different library. Home Screen mode may have separate website storage on old iOS; begin and continue a book in the same mode. Private browsing, clearing website data, OS eviction or refusing storage can prevent persistence. A visible warning appears if reads/writes fail; the app keeps working but cannot promise recovery. No web app can guarantee retention after the browser/OS deletes its data.

## Locking and backgrounding

When hidden or receiving `pagehide`, the reader checkpoints, invalidates pending display requests and releases the visible image and object URL. On `pageshow`, visibility return or window focus, it rebuilds the current page from the compressed archive, even if an old URL would appear valid. Image errors offer retry and file reselection. A timed-out load is recoverable. Viewport resize and rotation recompute the usable image area from `innerHeight`.

If iOS terminates the process, the last successful checkpoint is used after launch and file reselection. The app cannot prevent iOS from killing a tab or force suspended JavaScript to run. Real short/extended screen locks and memory pressure still require device testing; use [the manual checklist](docs/ios12-checklist.md).

## Fullscreen and Home Screen mode

The accessible Fullscreen button detects both standard and WebKit-prefixed element fullscreen methods **and their enabled flags**. It attempts native fullscreen only when supported; rejection falls back to an immersive reader. A dedicated **Exit fullscreen** button stays visible at the top right while fullscreen/immersive mode is active; tap it to exit without moving the page. Tapping the center still shows/hides the toolbar. Escape also exits when a button has focus. Legacy WebKit fullscreen element/flag properties are recognized.

CSS immersive mode hides the toolbar while retaining the exit button; **it cannot remove Safari’s browser chrome**. When falling back, the revealed toolbar explains this. For more space on iOS 12, use Safari > Share > **Add to Home Screen**, then launch the icon. Apple web-app meta tags are included and `navigator.standalone` is detected. Native fullscreen availability varies by browser, device and context; Home Screen launch is a separate mode. See [Apple’s Safari Web Content Guide](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

## Memory and archive limits

Only the requested page is decompressed. There is no prefetch or decoded-page cache. Extraction is serialized; fast navigation retains only the latest pending destination and discards stale results. Displayed images have their `src` removed and object URLs revoked when replaced, suspended or closed. Header dimensions are checked before browser decoding.

Safety limits for this old 1 GB device:

- **Archive:** at most 200 MiB compressed.
- **Page:** at most 24 MiB decompressed JPEG/PNG/WebP data, 16 megapixels, and 16,384 pixels on either axis.

These limits reduce risk; they cannot guarantee a particular archive fits Safari’s available memory. JSZip retains the **entire compressed archive** in memory, with temporary buffers during opening and extraction; this is not a disk-streaming ZIP reader. Split large volumes into smaller CBZs and downsize oversized scans. The browser controls when released image memory is reclaimed. See [JSZip’s documented limitations](https://stuk.github.io/jszip/documentation/limitations.html).

Folders and hidden/macOS metadata are ignored. Paths and filenames are sorted numerically without locale-dependent sorting, including `1.jpg`, `2.jpg`, `10.jpg`. JPEG, PNG and WebP signatures/dimensions are validated, with decoding errors reported. Encrypted/multi-volume ZIPs, CBR/RAR, 7z, GIF, animated WebP and HEIC are unsupported. Legacy non-UTF-8 ZIP filenames may display incorrectly. Full-archive CRC checking is disabled to avoid eagerly extracting every page; corrupt pages are reported when extraction or decoding fails, but this is not an archive integrity verifier.

## WebP on old Safari

JPEG, PNG and static WebP pages are counted together in natural filename order. JSON sidecars are ignored. This fixes books with a JPEG cover and WebP content pages that previously appeared as one-page books. Existing checkpoints and the same website origin are retained.

Native WebP decoding is used when the browser can display the page. Otherwise a classic Web Worker loads a bundled scalar libwebp 1.3.2 decoder, validates dimensions, decodes one page, and transfers its pixels to a single canvas. Lossy, lossless and alpha WebP are supported. The wasm uses baseline WebAssembly MVP instructions, with no SIMD, threads, BigInt or bulk-memory requirement. The fallback heap has a hard 128 MiB maximum and each C input/output buffer is explicitly freed. Workers are terminated on backgrounding, closing/replacing the archive or cancellation; canvases are cleared when replaced.

The decoder and worker files come from this same site, with no CDN or uploads. Their first use needs access to the hosted files. WebAssembly is needed only when native WebP is unavailable. Full hardware/performance validation on the iPad remains pending. Build provenance, pinned input hashes, ABI and licenses are in [vendor/WebP-BUILD.md](vendor/WebP-BUILD.md).

## Offline and browser compatibility

Core reading, localStorage, Files selection and CSS immersive mode need no HTTPS. LAN HTTP works. Service workers require a secure context (HTTPS or localhost on the device); a Mac’s LAN HTTP address is not that exception. This version has **no service worker or guaranteed offline launch**, even after Add to Home Screen. Ordinary HTTP caching is not an offline guarantee. An open, in-memory archive can be read while disconnected until iOS discards the page.

Runtime JavaScript uses ES5 syntax and Safari 12-compatible APIs: Promise, FileReader (through JSZip), Blob, typed arrays, object URLs, touch events and localStorage. It does not require Blob.arrayBuffer, modules, async functions, pointer events, ResizeObserver, dynamic viewport units or the File System Access API.

## Tests

With Node.js 18 or newer, no package installation is needed:

```sh
npm test
npm run fixture
```

The fixture command creates `tests/fixtures/reader-test-120.cbz`, containing 120 JPEG pages plus folders/macOS metadata. Copy it to the iPad’s Files app to check the reading flow. All fixture images are original generated test graphics; their reuse is intentional. Unit tests additionally create a 120-page PNG ZIP and check natural ordering, filtering, independent progress, metadata drift, revised archives, navigation, failed storage and serialized/stale asynchronous loads.

Optional desktop browser integration checks require Playwright and Chromium. Install them in a temporary tooling directory rather than adding a runtime dependency:

```sh
mkdir -p /tmp/cbz-reader-checks
npm install --prefix /tmp/cbz-reader-checks playwright
/tmp/cbz-reader-checks/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/cbz-reader-checks/node_modules/playwright node tests/browser.cjs
```

Also run `node tests/browser-webp.cjs` with the same Playwright environment to check a 190-page JPEG/WebP book in both native and forced fallback modes, including decoded pixels, checkpoint restoration, lifecycle recovery and worker cleanup.

Run the HTTP server first. `READER_URL` defaults to `http://127.0.0.1:8080/`; `BROWSER_EXECUTABLE` can select an existing Chromium executable. The script checks 120 JPEG page changes, navigation, reload/reselection, lifecycle event recovery, CSS fullscreen fallback, rotation, URL release, rapid jumps, revised archives and storage refusal. It creates screenshots in `tests/`. Desktop lifecycle events and viewport changes are simulations, not proof of iOS screen-lock behavior.

**Verification status:** automated checks and desktop results are recorded in [verification.md](docs/verification.md). Real iOS 12 acceptance remains pending until the physical-device checklist is completed.

## Files and licensing

`core.js` contains testable ordering, checkpoint and navigation state; `archive.js` bounds ZIP page extraction and validates image headers; `app.js` handles the DOM, touch, fullscreen and lifecycle. `webp.js`, `webp-runtime.js` and `webp-worker.js` provide the local legacy-browser fallback. JSZip is pinned to 3.10.1; its upstream license is in `vendor/JSZip-LICENSE.markdown` and the distribution includes bundled dependency notices. No reader code sends file content over the network.
