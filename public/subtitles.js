(() => {
  if (window.__flenvnSubtitlesInstalled) return;
  window.__flenvnSubtitlesInstalled = true;

  if (!isYouTubePage()) return;

  const CUE_SETTLE_MS = 120;
  const MIN_CUE_DISPLAY_MS = 650;
  let enabled = false;
  let authenticated = false;
  let observer = null;
  let cueTimer = 0;
  let renderTimer = 0;
  let lastCue = "";
  let pendingCue = "";
  let lastRenderedAt = 0;
  let lastRenderedLines = [];
  let lastUrl = location.href;

  const nativeCaptionStyle = document.createElement("style");
  nativeCaptionStyle.id = "flenvn-hide-youtube-captions";
  nativeCaptionStyle.textContent = `
    .caption-window.ytp-caption-window-bottom,
    .caption-window.ytp-caption-window-rollup,
    .ytp-caption-window-container .caption-window {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  const host = document.createElement("div");
  host.id = "flenvn-subtitle-root";
  const shadow = host.attachShadow({ mode: "closed" });
  const overlay = document.createElement("section");
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "FLENVN interactive subtitles");
  const caption = document.createElement("div");
  caption.className = "caption";
  const captionText = document.createElement("span");
  captionText.className = "caption-text";
  caption.append(captionText);
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "FLENVN";
  overlay.append(caption, badge);

  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial; position: absolute; z-index: 2147483646; left: 0; right: 0; bottom: 8%;
      display: flex; justify-content: center; box-sizing: border-box; padding: 0 20px; pointer-events: none;
    }
    .overlay {
      all: initial; width: min(960px, 94%); box-sizing: border-box; display: flex;
      position: relative; align-items: center; justify-content: center; pointer-events: none;
      font-family: Arial, "Helvetica Neue", sans-serif; text-align: left;
    }
    .overlay[hidden] { display: none; }
    .caption {
      width: min(620px, calc(100% - 40px)); height: calc(2.8em + 10px); box-sizing: border-box;
      padding: 5px 10px; overflow: hidden; border-radius: 6px; background: rgba(8,10,18,.82);
      color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.28); font-size: clamp(19px, 2.35vw, 30px);
      font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; text-shadow: 0 1px 2px #000;
      pointer-events: auto; display: flex; align-items: flex-end; justify-content: flex-start; text-align: left;
    }
    .caption-text { display: grid; grid-template-rows: repeat(2, 1.4em); width: 100%; height: 2.8em; text-align: left; }
    .caption-row {
      width: 100%; min-width: 0; height: 1.4em; box-sizing: border-box; overflow: hidden;
      white-space: nowrap; text-align: left; text-overflow: clip;
    }
    .caption-row:empty { visibility: hidden; }
    .word {
      all: unset; display: inline; border-radius: 4px; color: inherit; font: inherit; cursor: pointer;
      text-shadow: inherit; transition: color .12s, background .12s;
    }
    .word:hover { background: #ffd83d; color: #111322; text-shadow: none; }
    .word:focus-visible { background: #ffd83d; color: #111322; outline: 3px solid #737efa; outline-offset: 2px; text-shadow: none; }
    .badge {
      position: absolute; right: 0; bottom: 3px; padding: 3px 5px; border-radius: 4px; background: #2131dc; color: #fff;
      font: 700 8px/1 Arial, sans-serif; letter-spacing: .04em;
    }
    @media (max-width: 600px) {
      :host { bottom: 10%; padding: 0 10px; }
      .overlay { width: 97%; }
      .caption { width: min(620px, calc(100% - 30px)); font-size: clamp(17px, 4.6vw, 22px); }
    }
  `;
  shadow.append(style, overlay);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SUBTITLE_SETTINGS_CHANGED") return;
    applySettings(message.payload || {});
    sendResponse({ ok: true });
  });

  void initialize();

  async function initialize() {
    try {
      applySettings(await sendRequest("GET_STATE"));
    } catch {
      applySettings({ subtitleEnabled: false, authenticated: false });
    }
  }

  function applySettings(settings) {
    enabled = settings.subtitleEnabled === true;
    authenticated = settings.authenticated === true;
    if (enabled && authenticated) start();
    else stop();
  }

  function start() {
    mountHost();
    if (!nativeCaptionStyle.isConnected) document.documentElement.append(nativeCaptionStyle);
    if (!observer) {
      observer = new MutationObserver(scheduleCueRead);
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
      document.addEventListener("yt-navigate-finish", handleNavigation, true);
      document.addEventListener("fullscreenchange", mountHost);
      window.addEventListener("popstate", handleNavigation);
    }
    scheduleCueRead();
  }

  function stop() {
    clearTimeout(cueTimer);
    clearTimeout(renderTimer);
    cueTimer = 0;
    renderTimer = 0;
    lastCue = "";
    pendingCue = "";
    lastRenderedAt = 0;
    lastRenderedLines = [];
    overlay.hidden = true;
    observer?.disconnect();
    observer = null;
    document.removeEventListener("yt-navigate-finish", handleNavigation, true);
    document.removeEventListener("fullscreenchange", mountHost);
    window.removeEventListener("popstate", handleNavigation);
    nativeCaptionStyle.remove();
    host.remove();
  }

  function mountHost() {
    if (!enabled || !authenticated) return;
    const player = document.querySelector("#movie_player, .html5-video-player");
    const parent = player || document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
  }

  function handleNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastCue = "";
      pendingCue = "";
      lastRenderedAt = 0;
      lastRenderedLines = [];
      clearTimeout(renderTimer);
      overlay.hidden = true;
    }
    mountHost();
    scheduleCueRead();
  }

  function scheduleCueRead() {
    if (!enabled || !authenticated) return;
    clearTimeout(cueTimer);
    cueTimer = setTimeout(readCurrentCue, CUE_SETTLE_MS);
  }

  function readCurrentCue() {
    if (!enabled || !authenticated) return;
    mountHost();
    const cue = currentYouTubeCue();
    if (!cue) {
      lastCue = "";
      pendingCue = "";
      lastRenderedLines = [];
      clearTimeout(renderTimer);
      overlay.hidden = true;
      return;
    }
    if (cue === lastCue || cue === pendingCue) return;
    pendingCue = cue;
    clearTimeout(renderTimer);
    const wait = Math.max(0, MIN_CUE_DISPLAY_MS - (Date.now() - lastRenderedAt));
    renderTimer = setTimeout(() => commitCue(cue), wait);
  }

  function commitCue(cue) {
    renderTimer = 0;
    if (!enabled || !authenticated || cue !== pendingCue) return;
    const currentCue = currentYouTubeCue();
    if (currentCue !== cue) {
      pendingCue = "";
      readCurrentCue();
      return;
    }
    pendingCue = "";
    lastCue = cue;
    lastRenderedAt = Date.now();
    renderInteractiveCue(cue);
  }

  function renderInteractiveCue(cue) {
    captionText.replaceChildren();
    const lines = cue.split("\n").map(normalizeText).filter(Boolean).slice(-2);
    const rollsForward = lines.length === 2 && (
      (lastRenderedLines.length === 1 && lastRenderedLines[0] === lines[0]) ||
      (lastRenderedLines.length === 2 && lastRenderedLines[1] === lines[0])
    );
    const contextText = normalizeText(lines.join(" "));
    const occurrences = new Map();
    const rows = [document.createElement("span"), document.createElement("span")];
    rows.forEach((row) => { row.className = "caption-row"; });
    const firstRow = lines.length === 1 ? 1 : 0;
    lines.forEach((line, lineIndex) => {
      const row = rows[firstRow + lineIndex];
      const tokens = line.match(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*|\s+|[^\s]+/gu) || [line];
      for (const token of tokens) {
        if (!isWord(token)) {
          row.append(document.createTextNode(token));
          continue;
        }
        const normalizedWord = token.toLocaleLowerCase();
        const occurrenceIndex = occurrences.get(normalizedWord) || 0;
        occurrences.set(normalizedWord, occurrenceIndex + 1);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "word";
        button.textContent = token;
        button.setAttribute("aria-label", `Explain ${token}`);
        button.addEventListener("click", () => explainWord(button, token, contextText, occurrenceIndex));
        row.append(button);
      }
    });
    captionText.append(...rows);
    if (rollsForward && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      captionText.animate(
        [{ transform: "translateY(1.4em)" }, { transform: "translateY(0)" }],
        { duration: 190, easing: "cubic-bezier(.2,.75,.25,1)" },
      );
    }
    lastRenderedLines = lines;
    overlay.hidden = false;
  }

  function explainWord(button, word, contextText, occurrenceIndex) {
    const rect = button.getBoundingClientRect();
    if (typeof window.__flenvnExplainSubtitleWord !== "function") return;
    window.__flenvnExplainSubtitleWord({
      word,
      contextText,
      occurrenceIndex,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    });
  }

  function currentYouTubeCue() {
    const windows = Array.from(document.querySelectorAll(".caption-window")).filter(hasLayout);
    const roots = windows.length ? windows : [document];
    const cues = roots.map((root) => {
      const visualLines = Array.from(root.querySelectorAll(".caption-visual-line")).filter(hasLayout);
      if (visualLines.length) {
        return visualLines.map((line) => Array.from(line.querySelectorAll(".ytp-caption-segment"))
          .filter(hasLayout)
          .map((node) => node.textContent || "")
          .join(""))
          .map(normalizeText)
          .filter(Boolean)
          .slice(-2)
          .join("\n");
      }
      return Array.from(root.querySelectorAll(".ytp-caption-segment"))
        .filter(hasLayout)
        .map((node) => node.textContent || "")
        .join("");
    })
      .map(normalizeCue)
      .filter(Boolean);
    return cues.at(-1) || "";
  }

  function hasLayout(node) {
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const computed = node.ownerDocument.defaultView?.getComputedStyle(node);
    return computed?.visibility !== "hidden" && computed?.display !== "none";
  }

  function isWord(value) {
    return value.length <= 100 && /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(value);
  }

  function normalizeText(value) {
    return String(value).replace(/\s+/g, " ").trim().slice(0, 5000);
  }

  function normalizeCue(value) {
    return String(value).split(/\r?\n/).map(normalizeText).filter(Boolean).slice(-2).join("\n").slice(0, 5000);
  }

  function isYouTubePage() {
    return location.hostname === "www.youtube.com" || location.hostname === "m.youtube.com";
  }

  async function sendRequest(type, payload) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) throw new Error(response?.error?.message || "FLENVN did not respond.");
    return response.data;
  }
})();
