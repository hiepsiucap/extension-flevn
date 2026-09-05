# FLENVN Browser Extension

Translate selected webpage text directly beside the selection.

## Requirements

- Node.js 20 or newer
- A FLENVN account
- Chrome 116+ or a current Chromium-based Edge release

## Build

```powershell
npm install
npm run build
```

The unpacked extension is generated in `dist`.

## Install locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project's `dist` directory.
5. Pin FLENVN to the browser toolbar.

## Use

1. Open a normal webpage.
2. Click the FLENVN toolbar icon and sign in from the small toolbar popup.
3. Select a word or passage; click the FLENVN logo that appears beside it.
4. The translation appears beside the selection.
5. You can also use the **Translate with FLENVN** selection context menu.

### Interactive YouTube subtitles

1. Sign in and open a YouTube video that has captions.
2. Open the FLENVN toolbar popup and enable **Interactive YouTube subtitles**.
3. Turn on captions in the YouTube player. FLENVN hides the native caption rendering and displays the same English subtitle with clickable words.
4. Click a word to see its contextual meaning, pronunciation, examples, and save options.
5. Disable **Interactive YouTube subtitles** to restore YouTube's native captions immediately.

Interactive subtitles are opt-in and disabled by default. Caption text remains
in its original language. Only a word the user clicks and its current subtitle
sentence are sent to FLENVN for explanation; the extension does not store
captions or the full transcript. The initial release supports YouTube only and
requires YouTube captions to be available and enabled.

FLENVN cannot inject translations into restricted browser pages such as
`chrome://` pages.

## API configuration

Production requests use `https://api.flenvn.app` by default. The manifest also
permits `http://localhost:5000` for development.

To switch a development installation to the local API, open the extension's
service-worker developer tools and run:

```js
chrome.storage.local.set({ apiBaseUrl: "http://localhost:5000" });
```

Restore production with:

```js
chrome.storage.local.remove("apiBaseUrl");
```

After editing the extension, run `npm run build` and reload it from the browser's
extensions page.

## Security model

- Content scripts send selected text and page metadata, but never receive tokens.
- Access and refresh tokens are handled by the background service worker.
- Access tokens use `chrome.storage.session`; refresh tokens use
  `chrome.storage.local`.
- The selection listener runs on regular HTTP/HTTPS pages so inline translation
  remains available across tabs and page navigations.
