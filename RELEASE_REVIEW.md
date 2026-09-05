# Chrome Web Store release review

Reviewed September 5, 2026. Verdict: not ready to submit yet.

## Findings

1. **High — token storage is accessible to extension content scripts.** `public/background.js:135` stores the refresh token in `chrome.storage.local`, but the worker never sets its access level to `TRUSTED_CONTEXTS`. Chrome exposes local storage to this extension's content scripts by default. This contradicts the README security model; it does not mean ordinary website JavaScript can directly read extension storage. Restrict local storage before handling requests. Also restrict the `apiBaseUrl` override (`background.js:221`) to explicitly allowed environments; it currently accepts an arbitrary URL for requests containing credentials or tokens.

2. **High — an in-flight refresh can undo logout.** `public/background.js:141` removes tokens, but `performRefresh` at line 191 can write them back afterwards. Reproduced with the actual background script in a Node VM using mocked Chrome storage and a deferred refresh response: start refresh, complete logout, resolve refresh, then `getState().authenticated` returns true. Use an authentication generation/cancellation guard so stale login/refresh work cannot write credentials after logout or an account change.

3. **Medium — selections are persisted before translation is requested.** `public/content.js:211` sends `SELECTION_CHANGED` while merely showing the trigger. `background.js:252` saves the latest selected text, surrounding sentence, full page URL and title to disk, including when signed out. This is one overwritten snapshot, not a history of every selection. Logout does not clear it, and `GET_STATE` shares it with other extension content scripts. Keep selection state in the originating tab unless explicitly needed elsewhere; remove unnecessary persistence and clear legacy data. The translation requests themselves send text/context, not the page URL/title.

4. **Medium — popup failure handling can hide errors.** `src/sidepanel/App.tsx:16` records initial state errors, but line 36 always renders Loading while state is null, so the error never appears. Render an error/retry state. Also handle injection failures separately from authentication: `activateCurrentTab` can fail on restricted HTTPS pages such as the Chrome Web Store after login has already succeeded. Handle logout failures in the UI as well.

5. **Release cleanup — localhost permission is in the production manifest.** `public/manifest.json:8` includes `http://localhost:5000/*`. Remove it from the store build and keep development configuration separate. The other declared permissions have visible uses: storage for authentication/preferences, contextMenus for selection translation, and activeTab/scripting for injection after toolbar/context-menu actions. Broad HTTP/HTTPS content-script access supports the automatic inline trigger; justify that behavior clearly in the store privacy form.

6. **Assets — the icon is 100 x 99 pixels.** The manifest uses this same file for 16, 32, 48 and 128 pixel icons. Supply proper square assets, including a 128 x 128 store icon, and visually check toolbar sizes. The repository contains no store screenshots or promotional tile. Bundled Nunito font files also have no accompanying font license; confirm their source and include the required license and third-party notices.

## Store information still to prepare or verify

- A publicly accessible privacy policy URL. No privacy policy or link was found in the reviewed project. It must accurately describe account credentials, tokens, selected text/context sent to FLENVN, saved flashcards, media providers, and any backend processors/retention/deletion practices. Backend behavior was not available for review, so do not claim that no user data is collected.
- Complete the store single-purpose description, permission justifications and data-use disclosures, consistently with actual behavior and the privacy policy.
- Prepare listing text, screenshots, store graphics, support details, and reviewer test instructions/account access because the features require login. Explain any account/payment requirements.
- Confirm developer account setup and two-step verification in the dashboard.
- Test a clean unpacked installation against production: login failure/success, restart and token refresh, logout during a request, selected word and passage translation, context menu, image/audio display, saving cards, empty books, API/offline errors, and restricted pages. Inspect Chrome extension errors. Browser interaction and authenticated production API workflows were not tested in this review.

## Checks completed

- Read manifest, background/content scripts, React popup, shared helpers/types/tests, styles, build configuration, README and package metadata.
- `npm run build`: passed TypeScript checking and production build.
- `npm test`: all 11 tests passed. These cover selection helpers; they do not cover authentication or live browser workflows.
- `node --check public/background.js` and `node --check public/content.js`: passed.
- `npm audit` and production-only audit: zero reported known vulnerabilities.
- Referenced background, popup, content-script and icon files exist in the build.
- No remote executable code loading or dynamic evaluation was found in the application source. API image/audio URLs are loaded as media.
- Reproduced the logout/refresh race with mocked storage/network timing.

The build regenerated `dist`; no application source was changed by this review.

## Which folder to ZIP

Build first, then ZIP **the contents of `dist`**, located at:

`C:\Users\billh\OneDrive\Desktop\extension\dist`

After resolving the release findings, run from the project directory:

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Compress-Archive -Path .\dist\* -DestinationPath .\flenvn-translator-0.1.0.zip -Force
```

The ZIP root must contain `manifest.json`, `background.js`, `content.js`, `index.html`, icons, `assets/`, and `fonts/`. It must not contain an outer `dist/` directory. Do not ZIP the whole project, `src`, `public`, or `node_modules`. Update the ZIP filename when the manifest version changes. No submission ZIP was created during this review.

## Official references

- [Chrome storage access levels](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Prepare the extension and ZIP layout](https://developer.chrome.com/docs/webstore/prepare)
- [Store listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Privacy disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [User data policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
