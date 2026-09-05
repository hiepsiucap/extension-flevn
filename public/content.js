(() => {
  if (window.__flenvnSelectionInstalled) return;
  window.__flenvnSelectionInstalled = true;

  const host = document.createElement("div");
  host.id = "flenvn-selection-root";
  const shadow = host.attachShadow({ mode: "closed" });
  const trigger = document.createElement("button");
  trigger.className = "trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Translate selection with FLENVN");
  trigger.hidden = true;
  const logo = document.createElement("img");
  logo.src = chrome.runtime.getURL("logo-extension.png");
  logo.alt = "";
  trigger.append(logo);
  const card = document.createElement("section");
  card.setAttribute("role", "status");
  card.hidden = true;
  const closeButton = document.createElement("button");
  closeButton.className = "close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close translation");
  closeButton.textContent = "×";
  const content = document.createElement("div");
  content.className = "content";
  const nunitoLatinUrl = chrome.runtime.getURL("fonts/nunito-latin.woff2");
  const nunitoVietnameseUrl = chrome.runtime.getURL("fonts/nunito-vietnamese.woff2");
  registerNunitoFonts();

  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: "FLENVN Nunito"; font-style: normal; font-weight: 400 700; font-display: swap;
      src: url("${nunitoVietnameseUrl}") format("woff2");
      unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
    }
    @font-face {
      font-family: "FLENVN Nunito"; font-style: normal; font-weight: 400 700; font-display: swap;
      src: url("${nunitoLatinUrl}") format("woff2");
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    :host { all: initial; }
    .trigger {
      all: initial; position: fixed; z-index: 2147483647; width: 42px; height: 42px;
      box-sizing: border-box; display: grid; place-items: center; border: 1px solid rgba(33,49,220,.2);
      border-radius: 50%; background: #fff; box-shadow: 0 7px 22px rgba(17,19,34,.24); cursor: pointer;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .trigger:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 9px 26px rgba(17,19,34,.3); }
    .trigger:focus-visible { outline: 3px solid #9da5f5; outline-offset: 2px; }
    .trigger[hidden] { display: none; }
    .trigger img { display: block; width: 36px; height: 36px; object-fit: contain; pointer-events: none; }
    section {
      all: initial; position: fixed; z-index: 2147483647; width: min(390px, calc(100vw - 16px));
      max-height: min(620px, calc(100vh - 16px)); overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable;
      box-sizing: border-box; padding: 15px; border: 1px solid #d8daf7;
      border-radius: 14px; background: #fff; color: #111322;
      box-shadow: 0 12px 36px rgba(17,19,34,.22); font: 14px/1.45 "FLENVN Nunito", Arial, sans-serif;
    }
    section[hidden] { display: none; }
    .close { all: initial; position: absolute; top: 7px; right: 8px; width: 26px; height: 26px;
      border-radius: 50%; color: #616684; cursor: pointer; font: 22px/24px Arial, sans-serif; text-align: center; }
    .close:hover { background: #f0f1ff; color: #111322; }
    .label { margin: 0 30px 5px 0; color: #2131dc; font: 700 11px/1.2 "FLENVN Nunito", Arial, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
    .translation { color: #111322; font: 700 17px/1.45 "FLENVN Nunito", Arial, sans-serif; overflow-wrap: anywhere; }
    .detail { margin-top: 7px; color: #51587a; font: 13px/1.45 "FLENVN Nunito", Arial, sans-serif; overflow-wrap: anywhere; }
    .word-head { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; padding-right: 30px; }
    .word { color: #111322; font: 700 20px/1.3 "FLENVN Nunito", Arial, sans-serif; overflow-wrap: anywhere; }
    .meta { color: #69708f; font: 12px/1.4 "FLENVN Nunito", Arial, sans-serif; }
    .section-title { margin-top: 11px; color: #2131dc; font: 700 11px/1.2 "FLENVN Nunito", Arial, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
    .list { margin: 5px 0 0; padding-left: 19px; color: #353a55; font: 13px/1.5 "FLENVN Nunito", Arial, sans-serif; }
    .list li + li { margin-top: 5px; }
    .example-translation { display: block; margin-top: 1px; color: #69708f; font-style: italic; }
    .save { all: initial; box-sizing: border-box; border-radius: 999px; cursor: pointer; text-align: center;
      font: 700 12px/1.2 "FLENVN Nunito", Arial, sans-serif; }
    .audio-icon { all: initial; display: grid; place-items: center; box-sizing: border-box; width: 32px; height: 32px;
      margin-left: auto; border: 1px solid #d0d2fd; border-radius: 50%; color: #2131dc; background: #f8f8ff; cursor: pointer; }
    .audio-icon:hover { border-color: #737efa; background: #eceefe; }
    .audio-icon:focus-visible { outline: 3px solid rgba(115,126,250,.25); outline-offset: 2px; }
    .audio-icon svg { width: 17px; height: 17px; }
    .audio-icon.playing { color: #fff; background: #2131dc; animation: audio-pulse 1s ease-in-out infinite; }
    .audio-icon.loading { cursor: wait; opacity: .7; }
    .audio-icon.unavailable { color: #b42318; border-color: #f4b4ae; background: #fff1f0; }
    .image-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 6px; }
    .image-choice { all: initial; position: relative; display: block; box-sizing: border-box; overflow: hidden;
      aspect-ratio: 4 / 3; border: 2px solid transparent; border-radius: 10px; background: #f4f5fd; cursor: pointer; }
    .image-choice:hover { border-color: #9da5f5; }
    .image-choice.selected { border-color: #2131dc; box-shadow: 0 0 0 2px rgba(33,49,220,.12); }
    .image-choice.selected::after { content: "✓"; position: absolute; top: 4px; right: 4px; display: grid; place-items: center;
      width: 18px; height: 18px; border-radius: 50%; background: #2131dc; color: #fff;
      font: 700 11px/1 "FLENVN Nunito", Arial, sans-serif; }
    .image { display: block; width: 100%; height: 100%; object-fit: cover; }
    .save-area { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 13px; padding-top: 12px; border-top: 1px solid #eceefe; }
    .book { appearance: auto; -webkit-appearance: menulist; display: block; box-sizing: border-box; width: 100%; min-width: 0;
      height: 40px; margin: 0; padding: 0 10px; border: 1px solid #d0d2fd; border-radius: 9px;
      background-color: #fff; color: #111322; font: 13px/normal "FLENVN Nunito", Arial, sans-serif; cursor: pointer; }
    .book:focus { outline: 3px solid rgba(115,126,250,.22); border-color: #737efa; }
    .book:disabled { cursor: not-allowed; opacity: .6; }
    .book option { background: #fff; color: #111322; font: 13px "FLENVN Nunito", Arial, sans-serif; }
    .save { min-width: 76px; padding: 9px 13px; background: #2131dc; color: #fff; }
    .save:disabled { cursor: not-allowed; opacity: .55; }
    .save.is-saving:disabled { min-width: 106px; opacity: 1; color: #fff;
      background: linear-gradient(110deg, #2131dc 15%, #5968f2 45%, #2131dc 75%); background-size: 220% 100%;
      animation: save-gradient 1.25s linear infinite; }
    .save-loader { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; vertical-align: middle; }
    .save-loader i { display: block; width: 4px; height: 4px; border-radius: 50%; background: currentColor;
      animation: save-dot .9s ease-in-out infinite; }
    .save-loader i:nth-child(2) { animation-delay: .12s; }
    .save-loader i:nth-child(3) { animation-delay: .24s; }
    .save-status { grid-column: 1 / -1; color: #18794e; font: 700 12px/1.4 "FLENVN Nunito", Arial, sans-serif; }
    .save-status.error { color: #b42318; }
    .error { color: #b42318; font: 600 13px/1.4 "FLENVN Nunito", Arial, sans-serif; }
    .loading-shell { display: grid; grid-template-columns: 46px 1fr; align-items: center; gap: 12px; min-height: 64px; padding-right: 30px; }
    .loading-logo { width: 44px; height: 44px; object-fit: contain; animation: logo-float 1.15s ease-in-out infinite; }
    .loading-copy { display: grid; gap: 8px; }
    .loading-text { color: #51587a; font: 700 12px/1.3 "FLENVN Nunito", Arial, sans-serif; }
    .skeleton { position: relative; height: 7px; overflow: hidden; border-radius: 999px; background: #eceefe; }
    .skeleton.short { width: 68%; }
    .skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, rgba(115,126,250,.38), transparent); animation: shimmer 1.15s ease-in-out infinite; }
    @keyframes logo-float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.04); } }
    @keyframes shimmer { 100% { transform: translateX(100%); } }
    @keyframes save-gradient { 100% { background-position: -220% 0; } }
    @keyframes save-dot { 0%, 60%, 100% { transform: translateY(0); opacity: .55; } 30% { transform: translateY(-3px); opacity: 1; } }
    @keyframes audio-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(33,49,220,.22); } 50% { box-shadow: 0 0 0 5px rgba(33,49,220,0); } }
  `;
  card.append(closeButton, content);
  shadow.append(style, trigger, card);
  document.documentElement.append(host);

  let selectionTimer;
  let requestSequence = 0;
  let lastCaptured = null;
  let activeAudio = null;
  let activeUtterance = null;
  let activeAnchorRect = null;
  let positionFrame = 0;

  document.addEventListener("mouseup", (event) => {
    if (!event.composedPath().includes(host)) scheduleTranslation();
  }, true);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") hideAll();
    else scheduleTrigger();
  }, true);
  document.addEventListener("mousedown", (event) => {
    if (!event.composedPath().includes(host)) hideAll();
  }, true);
  window.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("scroll", handleViewportChange);
  new ResizeObserver(() => {
    if (!card.hidden) scheduleCardPosition();
  }).observe(card);
  closeButton.addEventListener("click", hideCard);
  trigger.addEventListener("mousedown", (event) => event.preventDefault());
  trigger.addEventListener("click", () => {
    if (!lastCaptured) return;
    trigger.hidden = true;
    translateCaptured(lastCaptured);
  });

  window.__flenvnExplainSubtitleWord = ({ word, contextText, occurrenceIndex = 0, rect }) => {
    const normalizedWord = normalizeText(word || "");
    const normalizedContext = normalizeText(contextText || "");
    if (!isSavableWord(normalizedWord) || !normalizedContext || !rect) return;
    translateCaptured({
      snapshot: {
        text: normalizedWord,
        contextText: normalizedContext,
        occurrenceIndex: Number.isInteger(occurrenceIndex) && occurrenceIndex >= 0 ? occurrenceIndex : 0,
      },
      rect,
    });
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CAPTURE_SELECTION") {
      sendResponse({ ok: true, selection: captureSelection()?.snapshot || null });
      return;
    }
    if (message?.type === "TRANSLATE_CURRENT_SELECTION") {
      const captured = captureSelection() || (message.text ? {
        snapshot: { text: normalizeText(message.text), contextText: normalizeText(message.text), occurrenceIndex: 0 },
        rect: { left: 16, top: 16, right: 16, bottom: 16, width: 0, height: 0 },
      } : null);
      if (captured) translateCaptured(captured);
      sendResponse({ ok: true, selection: captured?.snapshot || null });
    }
  });

  function scheduleTranslation() {
    scheduleTrigger();
  }

  function scheduleTrigger() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const captured = captureSelection();
      if (!captured) {
        trigger.hidden = true;
        lastCaptured = null;
        return;
      }
      lastCaptured = captured;
      card.hidden = true;
      positionTrigger(captured.rect);
    }, 120);
  }

  function captureSelection() {
    if (isEditableTarget(document.activeElement)) return null;
    const selection = window.getSelection();
    const text = normalizeText(selection?.toString() || "");
    if (!selection || selection.rangeCount === 0 || !text) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return null;

    const context = getSelectionContext(selection, text);
    const snapshot = {
      text,
      contextText: context.text,
      occurrenceIndex: context.occurrenceIndex,
    };
    return { snapshot, rect };
  }

  async function translateCaptured({ snapshot, rect }) {
    const sequence = ++requestSequence;
    positionCard(rect);
    showLoading();
    try {
      const state = await sendRequest("GET_STATE");
      if (!state.authenticated) throw new Error("Click the FLENVN icon in the Chrome toolbar to sign in.");

      const isWord = isSavableWord(snapshot.text);
      if (isWord) {
        const resultResponse = await sendRequest("EXPLAIN_WORD", {
          text: snapshot.contextText,
          word: snapshot.text,
          targetLanguage: state.targetLanguage || "vi",
          occurrenceIndex: snapshot.occurrenceIndex,
          imageLimit: 3,
        });
        if (sequence !== requestSequence) return;
        const wordResult = unwrapEnvelope(resultResponse);
        const booksResponse = await sendRequest("GET_BOOKS").catch(() => []);
        if (sequence !== requestSequence) return;
        renderWordResult(
          wordResult,
          unwrapEnvelope(booksResponse),
          state.lastBookId,
          snapshot.text,
        );
        return;
      }

      const result = await sendRequest("TRANSLATE", {
            text: snapshot.text,
            targetLanguage: state.targetLanguage || "vi",
          });
      if (sequence !== requestSequence) return;
      renderTranslationResult(unwrapEnvelope(result));
    } catch (error) {
      if (sequence !== requestSequence) return;
      renderError(error instanceof Error ? error.message : "Unable to translate this selection.");
    }
  }

  function renderTranslationResult(result) {
    const translation = extractTranslation(result);
    content.replaceChildren();
    content.append(makeElement("div", "label", "Translation"));
    content.append(makeElement("div", "translation", translation || "No translation available."));
    card.hidden = false;
  }

  function renderWordResult(result, booksValue, lastBookId, selectedWord) {
    const word = result?.word || selectedWord;
    const translation = extractTranslation(result);
    const pronunciation = firstString(result?.pronunciation, result?.phonetic, result?.pronunciation?.text);
    const definitions = normalizeDefinitions(result);
    const examples = normalizeExamples(result);
    const partOfSpeech = firstString(
      result?.partOfSpeech,
      result?.meaning?.partOfSpeech,
      result?.definitions?.[0]?.partOfSpeech,
      result?.explanation?.partOfSpeech,
    );
    const audioUrl = safeMediaUrl(result?.audio?.url || result?.audioUrl);
    const images = normalizeImages(result);
    const imageUrl = images[0]?.url || "";
    const books = Array.isArray(booksValue) ? booksValue : [];
    const existing = result?.existing === true;
    const draft = {
      word,
      partOfSpeech: normalizePartOfSpeech(partOfSpeech),
      pronunciation,
      definition: definitions[0] || "",
      translation,
      example: examples[0]?.text || "",
      exampleTranslation: examples[0]?.translation || "",
      audioUrl,
      imageUrl,
    };

    content.replaceChildren();
    const heading = makeElement("div", "word-head", "");
    heading.append(makeElement("span", "word", word));
    if (pronunciation) heading.append(makeElement("span", "meta", pronunciation));
    if (partOfSpeech) heading.append(makeElement("span", "meta", `• ${partOfSpeech}`));
    heading.append(createAudioPlayer(audioUrl, word));
    content.append(heading);
    content.append(makeElement("div", "translation", translation || "No translation available."));

    if (definitions.length) {
      content.append(makeElement("div", "section-title", "Definitions"));
      const list = makeElement("ol", "list", "");
      definitions.forEach((definition) => list.append(makeElement("li", "", definition)));
      content.append(list);
    }

    if (examples.length) {
      content.append(makeElement("div", "section-title", "Examples"));
      const list = makeElement("ul", "list", "");
      examples.forEach((example) => {
        const item = makeElement("li", "", example.text);
        if (example.translation) item.append(makeElement("span", "example-translation", example.translation));
        list.append(item);
      });
      content.append(list);
    }

    if (images.length) {
      content.append(makeElement("div", "section-title", "Images"));
      content.append(createImageGallery(images, word, (selectedUrl) => {
        draft.imageUrl = selectedUrl;
      }));
    }

    content.append(createSaveArea({
      books,
      lastBookId,
      existing,
      draft,
    }));
    card.hidden = false;
  }

  function createSaveArea({ books, lastBookId, existing, draft }) {
    const area = makeElement("div", "save-area", "");
    const select = document.createElement("select");
    select.className = "book";
    select.setAttribute("aria-label", "Choose a book");
    const validLastBook = books.some((book) => String(book.id || book._id) === String(lastBookId));

    if (!books.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No books available";
      select.append(option);
      select.disabled = true;
    } else {
      books.forEach((book) => {
        const option = document.createElement("option");
        option.value = String(book.id || book._id || "");
        option.textContent = book.title || book.name || "Untitled book";
        select.append(option);
      });
      select.value = validLastBook ? String(lastBookId) : String(books[0].id || books[0]._id || "");
    }

    const saveButton = makeElement("button", "save", existing ? "Saved" : "Save");
    saveButton.type = "button";
    saveButton.disabled = existing || !books.length || !select.value;
    const status = makeElement("div", "save-status", "");
    select.addEventListener("change", () => {
      saveButton.disabled = existing || !select.value;
      status.textContent = "";
      if (select.value) sendRequest("SET_LAST_BOOK", { bookId: select.value }).catch(() => {});
    });
    saveButton.addEventListener("click", async () => {
      if (!select.value) return;
      saveButton.disabled = true;
      saveButton.classList.add("is-saving");
      const loader = makeElement("span", "save-loader", "");
      loader.append(makeElement("i", "", ""), makeElement("i", "", ""), makeElement("i", "", ""));
      saveButton.replaceChildren(loader, document.createTextNode("Saving"));
      status.textContent = "";
      status.className = "save-status";
      try {
        await sendRequest("SAVE_FLASHCARD", compactPayload({ ...draft, bookId: select.value }));
        await sendRequest("SET_LAST_BOOK", { bookId: select.value }).catch(() => {});
        hideAll();
      } catch (error) {
        saveButton.disabled = false;
        saveButton.classList.remove("is-saving");
        saveButton.textContent = "Save";
        status.className = "save-status error";
        status.textContent = error instanceof Error ? error.message : "Unable to save this word.";
      }
    });

    area.append(select, saveButton, status);
    return area;
  }

  function createAudioPlayer(audioUrl, word) {
    if (activeAudio) activeAudio.pause();
    const player = audioUrl ? document.createElement("audio") : null;
    if (player) {
      player.preload = "none";
      player.crossOrigin = "anonymous";
      player.src = audioUrl;
    }
    activeAudio = player;

    const button = makeElement("button", "audio-icon", "");
    button.type = "button";
    button.setAttribute("aria-label", "Play pronunciation");
    button.title = "Play pronunciation";
    button.append(createVolumeIcon());
    button.addEventListener("click", async () => {
      if (activeUtterance && speechSynthesis.speaking) {
        speechSynthesis.cancel();
        activeUtterance = null;
        setAudioButtonState(button, "idle");
        return;
      }
      if (player && !player.paused) {
        player.pause();
        player.currentTime = 0;
        setAudioButtonState(button, "idle");
        return;
      }
      if (!player) {
        playBrowserPronunciation(word, button);
        return;
      }
      setAudioButtonState(button, "loading");
      try {
        player.currentTime = 0;
        await player.play();
      } catch {
        button.title = "Using the browser voice because the audio file could not be played.";
        playBrowserPronunciation(word, button);
      }
    });
    if (player) {
      player.addEventListener("playing", () => {
        setAudioButtonState(button, "playing");
      });
      player.addEventListener("ended", () => {
        setAudioButtonState(button, "idle");
      });
      player.addEventListener("error", () => {
        setAudioButtonState(button, "idle");
        button.title = "The API audio is unavailable; browser voice will be used.";
      });
    }
    return button;
  }

  function playBrowserPronunciation(word, button) {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
      setAudioButtonState(button, "unavailable");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    activeUtterance = utterance;
    utterance.onstart = () => {
      setAudioButtonState(button, "playing");
    };
    utterance.onend = () => {
      activeUtterance = null;
      setAudioButtonState(button, "idle");
    };
    utterance.onerror = () => {
      activeUtterance = null;
      setAudioButtonState(button, "unavailable");
    };
    speechSynthesis.speak(utterance);
  }

  function setAudioButtonState(button, state) {
    button.disabled = state === "loading";
    button.classList.toggle("loading", state === "loading");
    button.classList.toggle("playing", state === "playing");
    button.classList.toggle("unavailable", state === "unavailable");
    button.title = state === "playing"
      ? "Stop pronunciation"
      : state === "loading"
        ? "Loading pronunciation"
        : state === "unavailable"
          ? "Audio unavailable"
          : "Play pronunciation";
  }

  function createVolumeIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", "M3 9v6h4l5 4V5L7 9H3Zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.32a3.5 3.5 0 0 0 2-3.16Zm-2-7.25v2.06a6 6 0 0 1 0 10.38v2.06a8 8 0 0 0 0-14.5Z");
    svg.append(path);
    return svg;
  }

  function createImageGallery(images, word, onSelect) {
    const grid = makeElement("div", "image-grid", "");
    images.forEach((item, index) => {
      const choice = makeElement("button", `image-choice${index === 0 ? " selected" : ""}`, "");
      choice.type = "button";
      choice.setAttribute("aria-label", `Use image ${index + 1}`);
      const image = document.createElement("img");
      image.className = "image";
      image.src = item.url;
      image.alt = item.description || `${word} image ${index + 1}`;
      image.referrerPolicy = "no-referrer";
      image.loading = "lazy";
      choice.append(image);
      choice.addEventListener("click", () => {
        grid.querySelectorAll(".image-choice").forEach((element) => element.classList.remove("selected"));
        choice.classList.add("selected");
        onSelect(item.url);
      });
      grid.append(choice);
    });
    return grid;
  }

  function normalizeDefinitions(result) {
    const source = result?.definitions || result?.senses || result?.explanation?.definitions || result?.definition || result?.meaning?.definition || result?.explanation?.definition || [];
    const values = Array.isArray(source) ? source : [source];
    return values
      .map((item) => typeof item === "string" ? item : item?.text || item?.definition || item?.meaning || "")
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  function normalizeExamples(result) {
    const source = result?.examples || result?.meaning?.examples || result?.explanation?.examples || result?.example || [];
    const values = Array.isArray(source) ? source : [source];
    return values
      .map((item) => typeof item === "string"
        ? { text: item, translation: "" }
        : {
            text: item?.text || item?.example || item?.sentence || "",
            translation: item?.translation || item?.translatedText || "",
          })
      .filter((item) => item.text);
  }

  function safeMediaUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function normalizeImages(result) {
    const source = Array.isArray(result?.images) ? result.images : result?.imageUrl ? [result.imageUrl] : [];
    return source
      .map((item) => typeof item === "string"
        ? { url: safeMediaUrl(item), description: "" }
        : { url: safeMediaUrl(item?.url), description: item?.description || item?.alt || "" })
      .filter((item) => item.url);
  }

  function extractTranslation(result) {
    return firstString(
      result?.translatedText,
      result?.translation,
      result?.meaning,
      result?.meaning?.translation,
      result?.meaning?.text,
      result?.contextMeaning,
      result?.explanation?.translation,
      result?.explanation?.meaning,
    );
  }

  function firstString(...values) {
    return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
  }

  function normalizePartOfSpeech(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "determiner"].includes(normalized)
      ? normalized
      : "";
  }

  function compactPayload(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "string" || item.trim().length > 0));
  }

  function showLoading() {
    const shell = makeElement("div", "loading-shell", "");
    const image = document.createElement("img");
    image.className = "loading-logo";
    image.src = chrome.runtime.getURL("logo-extension.png");
    image.alt = "";
    const copy = makeElement("div", "loading-copy", "");
    copy.append(
      makeElement("div", "loading-text", "Finding the best meaning…"),
      makeElement("div", "skeleton", ""),
      makeElement("div", "skeleton short", ""),
    );
    shell.append(image, copy);
    content.replaceChildren(shell);
    card.hidden = false;
    scheduleCardPosition();
  }

  function renderError(message) {
    content.replaceChildren(makeElement("div", "error", message));
    card.hidden = false;
    scheduleCardPosition();
  }

  function positionCard(rect) {
    activeAnchorRect = rect;
    card.hidden = false;
    scheduleCardPosition();
  }

  function scheduleCardPosition() {
    if (positionFrame) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      keepCardInView();
    });
  }

  function keepCardInView() {
    if (card.hidden || !activeAnchorRect) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const margin = 8;
    const gap = 8;
    const maxHeight = Math.max(120, Math.min(620, viewportHeight - margin * 2));
    card.style.maxHeight = `${maxHeight}px`;

    const cardWidth = Math.min(card.offsetWidth, viewportWidth - margin * 2);
    const cardHeight = Math.min(card.offsetHeight, maxHeight);
    const minLeft = viewportLeft + margin;
    const maxLeft = viewportLeft + viewportWidth - cardWidth - margin;
    const desiredLeft = activeAnchorRect.left + activeAnchorRect.width / 2 - cardWidth / 2;
    const left = Math.min(Math.max(minLeft, desiredLeft), Math.max(minLeft, maxLeft));

    const minTop = viewportTop + margin;
    const maxTop = viewportTop + viewportHeight - cardHeight - margin;
    const belowTop = activeAnchorRect.bottom + gap;
    const aboveTop = activeAnchorRect.top - cardHeight - gap;
    const fitsBelow = belowTop <= maxTop;
    const fitsAbove = aboveTop >= minTop;
    const desiredTop = fitsBelow ? belowTop : fitsAbove ? aboveTop : minTop;
    const top = Math.min(Math.max(minTop, desiredTop), Math.max(minTop, maxTop));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function handleViewportChange() {
    if (!card.hidden) scheduleCardPosition();
    else if (!trigger.hidden && lastCaptured) positionTrigger(lastCaptured.rect);
  }

  function positionTrigger(rect) {
    const size = 42;
    const left = Math.min(window.innerWidth - size - 8, Math.max(8, rect.right + 7));
    const fitsRight = rect.right + size + 15 < window.innerWidth;
    trigger.style.left = `${fitsRight ? left : Math.max(8, rect.left - size - 7)}px`;
    trigger.style.top = `${Math.min(window.innerHeight - size - 8, Math.max(8, rect.top + rect.height / 2 - size / 2))}px`;
    trigger.hidden = false;
  }

  function hideCard() {
    requestSequence += 1;
    if (activeAudio) activeAudio.pause();
    if (globalThis.speechSynthesis) speechSynthesis.cancel();
    card.hidden = true;
    activeAnchorRect = null;
  }

  function hideAll() {
    clearTimeout(selectionTimer);
    requestSequence += 1;
    if (activeAudio) activeAudio.pause();
    if (globalThis.speechSynthesis) speechSynthesis.cancel();
    trigger.hidden = true;
    card.hidden = true;
    activeAnchorRect = null;
    lastCaptured = null;
  }

  async function sendRequest(type, payload) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) throw new Error(response?.error?.message || "FLENVN did not respond.");
    return response.data;
  }

  function unwrapEnvelope(value) {
    return value && typeof value === "object" && "data" in value ? value.data : value;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function getSelectionContext(selection, selectedText) {
    const range = selection.getRangeAt(0);
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const root = element?.closest("p, li, blockquote, figcaption, td, th, dt, dd, h1, h2, h3, h4, h5, h6") || element;
    if (!root?.textContent) return { text: selectedText, occurrenceIndex: 0 };

    let selectionStart = 0;
    try {
      const prefixRange = document.createRange();
      prefixRange.selectNodeContents(root);
      prefixRange.setEnd(range.startContainer, range.startOffset);
      selectionStart = prefixRange.toString().length;
    } catch {
      return { text: selectedText, occurrenceIndex: 0 };
    }

    const sentence = sentenceAround(root.textContent, selectionStart);
    const prefix = sentence.text.slice(0, Math.max(0, selectionStart - sentence.start));
    return {
      text: normalizeText(sentence.text) || selectedText,
      occurrenceIndex: countWholeWordOccurrences(prefix, selectedText),
    };
  }

  function sentenceAround(text, offset) {
    let start = 0;
    const boundary = /[.!?\u2026\u3002\uFF01\uFF1F]["'\u201D\u2019)]*\s+/gu;
    for (const match of text.matchAll(boundary)) {
      const nextStart = match.index + match[0].length;
      if (nextStart > offset) break;
      start = nextStart;
    }
    const tail = text.slice(offset);
    const endMatch = /[.!?\u2026\u3002\uFF01\uFF1F]["'\u201D\u2019)]*(?=\s|$)/u.exec(tail);
    const end = endMatch ? offset + endMatch.index + endMatch[0].length : text.length;
    return { text: text.slice(start, end), start };
  }

  function countWholeWordOccurrences(text, word) {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordCharacter = "\\p{L}\\p{N}'\\u2019-";
    return Array.from(text.matchAll(new RegExp(`(^|[^${wordCharacter}])${escapedWord}(?![${wordCharacter}])`, "giu"))).length;
  }

  function isSavableWord(value) {
    return value.length > 0 && value.length <= 100 && /^[\p{L}]+(?:['\u2019-][\p{L}]+)*$/u.test(value);
  }

  function normalizeText(value) {
    return String(value).replace(/\s+/g, " ").trim().slice(0, 5000);
  }

  async function registerNunitoFonts() {
    if (!globalThis.FontFace || !document.fonts) return;
    const subsets = [
      {
        url: nunitoLatinUrl,
        range: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
      },
      {
        url: nunitoVietnameseUrl,
        range: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
      },
    ];

    try {
      await Promise.all(subsets.map(async ({ url, range }) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cannot load font: ${response.status}`);
        const bytes = await response.arrayBuffer();
        await Promise.all(["400", "500", "700"].map(async (weight) => {
          const face = new FontFace("FLENVN Nunito", bytes.slice(0), {
            style: "normal",
            weight,
            display: "swap",
            unicodeRange: range,
          });
          await face.load();
          document.fonts.add(face);
        }));
      }));
      host.dataset.fontLoaded = "true";
    } catch {
      host.dataset.fontLoaded = "false";
    }
  }

  function isEditableTarget(element) {
    if (!(element instanceof HTMLElement)) return false;
    return element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement || Boolean(element.closest("[contenteditable='true']"));
  }
})();
