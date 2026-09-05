# FLENVN Browser Extension Implementation Plan

## Goal

Build a Chromium Manifest V3 extension for Chrome and Edge that lets a signed-in FLENVN user select text on a webpage, see a live Vietnamese translation, choose one of their books, and save a selected English word as a flashcard.

The production API origin is `https://api.flenvn.app`. Local development may override it with `http://localhost:5000`.

## User flow

1. The user activates FLENVN on the current tab from the toolbar.
2. The user selects text on the page.
3. A small FLENVN action appears beside the selection.
4. An inline popup beside the selection displays its live translation.
5. When the selection is a single word, FLENVN loads pronunciation, definitions, examples, audio, and image suggestions.
6. The user selects a destination book and saves the word.

## Existing API mapping

| Capability | Endpoint |
| --- | --- |
| Sign in | `POST /api/v1/auth/login` |
| Refresh session | `POST /api/v1/auth/refresh` |
| Sign out | `POST /api/v1/auth/logout` |
| List books | `GET /api/v1/books` |
| Translate text | `POST /api/v1/translation/translate` |
| Enrich one word in its sentence context | `POST /api/v1/words/explain-in-context` |
| Save flashcard | `POST /api/v1/flashcards` |

## Architecture

- `background/service-worker`: the only extension context that handles tokens and calls FLENVN APIs.
- `content/selection-listener`: captures page selections and renders a small Shadow DOM action.
- `toolbar popup`: React UI used only for authentication and account status.
- `content/selection-listener`: captures selections and renders translations beside them.
- `chrome.storage.session`: short-lived access token.
- `chrome.storage.local`: refresh token, last selected book, language preference, and latest selection.

## Delivery phases

### Phase 1: backend hardening

- Require JWT authentication for translation.
- Add a translation-specific throttle.
- Reject flashcard book IDs not owned by the authenticated user.
- Return `409 Conflict` for a word the user already saved.
- Add integration/unit coverage and regenerate OpenAPI.

### Phase 2: extension foundation

- Create a Manifest V3 React and TypeScript project.
- Add a toolbar popup, service worker, content script injection, shared message types, and FLENVN theme tokens.
- Start with privacy-first `activeTab` activation rather than permanent access to every website.

### Phase 3: authentication and API layer

- Sign in with the existing endpoint.
- Keep credentials outside content scripts.
- Refresh once on `401`, retry the request, and clear the session when refresh fails.
- Support sign out and session restoration.

### Phase 4: selection and translation

- Capture mouse and keyboard selection.
- Ignore empty selections, password inputs, and editable controls.
- Debounce translation, cancel stale UI updates, and cache recent results.
- Default to automatic source detection and Vietnamese output.

### Phase 5: vocabulary saving

- Load and cache the user's books.
- Require a destination book and remember the last choice.
- Enrich only single-word selections.
- Let the user review/edit fields before saving.
- Handle duplicates, subscription limits, expired authentication, and empty-book states.

### Phase 6: verification and release

- Unit test selection normalization, word detection, auth refresh, and response handling.
- Test the unpacked extension against Chrome and Edge.
- Verify keyboard navigation, focus, contrast, loading states, and restricted-page behavior.
- Configure the production API origin and create store icons/screenshots.

## Design system

- Font: Nunito, 400/500/700.
- Primary: `#2131dc`.
- Secondary: `#ffd83d`.
- Background: `#f4f5fd`.
- Cards: white with subtle borders and rounded corners.
- Buttons: compact, rounded pills.
- Use the raw FLENVN logo without a decorative wrapper.

## MVP product rules

- Translation supports words, sentences, and paragraphs up to the backend limit.
- Saving is enabled only for one normalized word of at most 100 characters.
- A destination book is required.
- The current global per-user duplicate-word rule remains in place for the MVP; an existing word is reported as already saved.
