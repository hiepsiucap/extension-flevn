# FLENVN Interactive Video Subtitle Plan

## 1. Objective

Add an interactive subtitle mode that keeps captions in their original language. When enabled, FLENVN hides YouTube's native caption rendering and displays the same caption as clickable text. Clicking a word opens the existing contextual word-explanation card.

The MVP supports YouTube on Chrome and Edge. It does not translate complete subtitle cues.

## 2. Core User Flow

1. The user signs in to FLENVN and opens a YouTube video with captions.
2. The user enables **Interactive YouTube subtitles** in the extension popup.
3. FLENVN hides YouTube's visible caption layer and renders the same source-language caption in its own overlay.
4. Each word in the FLENVN caption is keyboard-focusable and clickable.
5. Clicking a word sends that word and the current caption sentence to `POST /api/v1/words/explain-in-context`.
6. The existing FLENVN word card shows meaning, pronunciation, examples, audio, images, and save controls.
7. Disabling the feature removes the FLENVN overlay and restores YouTube's native captions immediately.

## 3. MVP Scope

- Add an opt-in setting that is disabled by default.
- Detect visible YouTube caption cues.
- Combine caption segments into one normalized sentence.
- Replace the native visual caption with an interactive FLENVN overlay.
- Preserve whitespace, punctuation, apostrophes, hyphens, and Unicode letters.
- Make words usable with mouse and keyboard.
- Reuse the existing word-explanation and flashcard-saving flow.
- Pass the complete cue as context and the correct repeated-word occurrence index.
- Support normal, theater, and fullscreen player modes.
- Reset correctly when YouTube navigates between videos through its SPA router.
- Restore native captions and disconnect observers when disabled.

## 4. Out of Scope for the MVP

- Automatic full-sentence subtitle translation.
- Generating captions for videos that do not provide them.
- Speech-to-text from tab audio.
- Transcript history.
- Saving video title, timestamp, or URL in flashcards.
- Supporting every video website through one generic selector.

## 5. Architecture

```text
YouTube caption DOM
        |
        v
YouTube Caption Adapter
  - observe caption changes
  - join visible segments
  - normalize and deduplicate
        |
        v
Interactive Subtitle Overlay (Shadow DOM)
  - render original caption text
  - tokenize clickable words
  - preserve punctuation and spaces
        |
        | clicked word + full cue + occurrence index
        v
Existing Selection/Word Card
        |
        v
Background Service Worker
        |
        v
POST /api/v1/words/explain-in-context
```

Authentication tokens remain exclusively in the background service worker.

## 6. Technical Design

### YouTube Caption Adapter

- Run only on `www.youtube.com` and `m.youtube.com`.
- Observe DOM changes with `MutationObserver`.
- Read `.ytp-caption-segment` nodes that have layout and are not `display: none` or `visibility: hidden`.
- Group segments by visible `.caption-window` and use the active window.
- Debounce reads for approximately 100–200 ms so YouTube can finish updating a cue.
- Listen for `yt-navigate-finish`, `popstate`, and `fullscreenchange`.
- Do not retain caption DOM nodes because YouTube replaces them frequently.

### Native Caption Replacement

- Add a narrowly scoped page style while the feature is enabled.
- Set YouTube caption windows to `opacity: 0` and disable their pointer events.
- Continue reading the caption nodes even though their visual opacity is zero.
- Remove the style immediately when the feature is disabled so native captions return.
- Do not remove or rewrite YouTube's caption DOM.

### Interactive Overlay

- Mount the overlay inside `#movie_player` or `.html5-video-player` so it follows theater and fullscreen modes.
- Render the overlay inside Shadow DOM to avoid style conflicts.
- Keep the overlay container non-blocking while allowing individual words to receive pointer events.
- Render source text only; do not call the translation endpoint for complete cues.
- Highlight words on hover and keyboard focus.
- Provide an accessible name such as `Explain hello` for each word button.

### Tokenization and Context

- Treat Unicode letter sequences as words.
- Support internal apostrophes and hyphens, such as `don't` and `well-known`.
- Preserve all whitespace and punctuation as text nodes.
- Track repeated words in the same cue and send the correct `occurrenceIndex`.
- Pass the complete current cue as `contextText`.

### Existing Word Card Integration

- Expose a small content-script bridge that accepts `word`, `contextText`, `occurrenceIndex`, and the clicked word's viewport rectangle.
- Validate and normalize all bridge inputs.
- Reuse the existing `EXPLAIN_WORD` request and word-card renderer.
- Keep the existing book selector and flashcard-saving behavior unchanged.

### Settings and Privacy

- Store `subtitleEnabled` in `chrome.storage.local` through the background service worker.
- Include the preference in `GET_STATE`.
- Synchronize setting changes with the active YouTube tab without requiring a reload.
- Keep the feature disabled by default.
- Do not send a cue automatically. Send data only after the user clicks a word.
- Send only the clicked word and current cue for contextual explanation.
- Never persist captions or transcripts.

## 7. Expected File Changes

| File | Change |
| --- | --- |
| `public/subtitles.js` | Caption adapter, native-caption hiding, tokenization, and interactive overlay |
| `public/content.js` | Bridge subtitle word clicks into the existing word card |
| `public/manifest.json` | Load the subtitle module before the existing content script |
| `public/background.js` | Persist and return `subtitleEnabled` |
| `src/shared/types.ts` | Add `subtitleEnabled` to extension state |
| `src/sidepanel/App.tsx` | Add the opt-in switch and active-tab synchronization |
| `src/sidepanel/theme.css` | Style the accessible switch and privacy notice |
| `tests/background.test.js` | Test default and normalized setting persistence |
| `scripts/browser-smoke.mjs` | Test replacement, click-to-explain, and teardown |
| `README.md` | Document usage, privacy, and limitations |

## 8. Implementation Steps

1. Add the persisted setting and popup switch.
2. Capture and normalize YouTube cues.
3. Hide native captions and render the original text in Shadow DOM.
4. Tokenize words and add accessible interactions.
5. Connect word clicks to the existing contextual explanation card.
6. Restore YouTube captions on disable, sign-out, and teardown.
7. Add automated tests and update documentation.

## 9. Test Plan

### Unit and Integration Tests

- `GET_STATE` returns `subtitleEnabled: false` when no preference exists.
- `SET_SUBTITLE_ENABLED` stores a normalized boolean.
- Empty and repeated cues do not cause unnecessary re-rendering.
- Unicode words, apostrophes, and hyphenated words are tokenized correctly.
- Repeated words receive the correct occurrence index.
- Invalid bridge inputs do not call the word API.

### Browser Tests

- Enabling the switch activates the current YouTube tab without reload.
- Multiple YouTube caption segments are combined in DOM order.
- Native captions become visually hidden while the mode is active.
- The FLENVN overlay displays the original English text, not a translation.
- No automatic `TRANSLATE` request is sent for a cue.
- Clicking a word sends the word and full cue to `EXPLAIN_WORD`.
- The existing word card appears and can still save a flashcard.
- Removing the source caption hides the FLENVN overlay.
- Disabling the switch removes the FLENVN overlay and restores native captions.
- Existing webpage selection translation continues to work.

### Manual Tests

- Human-authored and auto-generated YouTube captions.
- Fast-changing and multi-line captions.
- Contractions, punctuation, accented words, and repeated words.
- Pause, seek, playback-speed changes, and SPA video navigation.
- Normal, theater, and fullscreen modes.
- Network failure, token expiration, and sign-out during playback.
- Supported Chrome and Edge versions.

## 10. Acceptance Criteria

- YouTube captions stay in their original language.
- Native YouTube captions are hidden only while Interactive Subtitle Mode is active.
- FLENVN displays the same cue as readable, clickable text.
- Clicking a word opens its contextual meaning through the existing word card.
- Caption cues do not trigger automatic translation requests.
- Disabling the feature restores native captions immediately.
- No captions or transcripts are persisted.
- Existing selection translation and flashcard saving have no regressions.
- `npm run build`, `npm test`, and the browser smoke test pass.

## 11. Post-MVP Priorities

1. Optionally pause the video when a word is opened.
2. Save video URL, title, and timestamp with a flashcard.
3. Show the last three to five caption cues for review.
4. Add configurable font size and overlay position.
5. Add a generic HTML5 text-track adapter.
6. Add dedicated adapters for other video platforms.

