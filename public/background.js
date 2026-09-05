const DEFAULT_API_BASE_URL = "https://api.flenvn.app";
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
let refreshPromise = null;
let authGeneration = 0;
let authWrites = Promise.resolve();
const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
]).then(() => chrome.storage.local.remove(["latestSelection", "apiBaseUrl"]));
// Register listeners synchronously, but gate their work on storage initialization.
storageReady.catch(() => {});

function withAuthWrite(operation) {
  const result = authWrites.then(operation);
  authWrites = result.catch(() => {});
  return result;
}

function assertGeneration(generation) {
  if (generation !== authGeneration) throw new ApiError(401, "Your session changed. Please try again.");
}

async function clearTokens() {
  await Promise.all([
    chrome.storage.session.remove(ACCESS_TOKEN_KEY),
    chrome.storage.local.remove([REFRESH_TOKEN_KEY, "lastBookId", "latestSelection", "userProfile"]),
  ]);
}

async function storeTokens(tokens, generation) {
  return withAuthWrite(async () => {
    assertGeneration(generation);
    try {
      await Promise.all([
        chrome.storage.session.set({ accessToken: tokens.accessToken }),
        chrome.storage.local.set({ refreshToken: tokens.refreshToken }),
      ]);
    } catch (error) {
      await clearTokens();
      throw error;
    }
    assertGeneration(generation);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "flenvn-translate-selection",
    title: "Translate with FLENVN",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "flenvn-translate-selection" || !tab?.id) return;

  try {
    await storageReady;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["subtitles.js", "content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, {
      type: "TRANSLATE_CURRENT_SELECTION",
      text: normalizeText(info.selectionText || ""),
    }, { frameId: 0 });
  } catch {
    // Chrome does not allow content scripts on restricted pages.
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: serializeError(error),
      }),
    );
  return true;
});

async function handleMessage(message, sender) {
  await storageReady;
  if (sender.id !== chrome.runtime.id) throw new ApiError(403, "Invalid message sender");
  if (["LOGIN", "LOGOUT"].includes(message?.type) &&
      (sender.tab || sender.url !== chrome.runtime.getURL("index.html"))) {
    throw new ApiError(403, "Use the FLENVN toolbar popup to manage your account");
  }
  switch (message?.type) {
    // Discard snapshots from older tabs after an extension update.
    case "SELECTION_CHANGED":
      return null;
    case "GET_STATE":
      return getState();
    case "LOGIN":
      return login(message.payload);
    case "LOGOUT":
      return logout();
    case "TRANSLATE":
      return apiRequest("/api/v1/translation/translate", {
        method: "POST",
        body: message.payload,
      });
    case "GET_BOOKS":
      return apiRequest("/api/v1/books");
    case "EXPLAIN_WORD":
      return apiRequest("/api/v1/words/explain-in-context", {
        method: "POST",
        body: {
          text: normalizeText(message.payload.text || ""),
          word: normalizeText(message.payload.word || ""),
          targetLanguage: message.payload.targetLanguage || "vi",
          occurrenceIndex: normalizeOccurrenceIndex(message.payload.occurrenceIndex),
          imageLimit: normalizeImageLimit(message.payload.imageLimit),
        },
      });
    case "SAVE_FLASHCARD":
      return apiRequest("/api/v1/flashcards", {
        method: "POST",
        body: message.payload,
      });
    case "SET_LAST_BOOK":
      await chrome.storage.local.set({ lastBookId: message.payload.bookId });
      return null;
    case "SET_SUBTITLE_ENABLED": {
      const subtitleEnabled = message.payload?.enabled === true;
      await chrome.storage.local.set({ subtitleEnabled });
      return { subtitleEnabled };
    }
    default:
      throw new Error("Unsupported extension message");
  }
}

async function getState() {
  const [session, local] = await Promise.all([
    chrome.storage.session.get([ACCESS_TOKEN_KEY]),
    chrome.storage.local.get([
      REFRESH_TOKEN_KEY,
      "lastBookId",
      "targetLanguage",
      "subtitleEnabled",
      "userProfile",
    ]),
  ]);

  return {
    authenticated: Boolean(session[ACCESS_TOKEN_KEY] || local[REFRESH_TOKEN_KEY]),
    lastBookId: local.lastBookId || "",
    targetLanguage: local.targetLanguage || "vi",
    subtitleEnabled: local.subtitleEnabled === true,
    user: local.userProfile || null,
  };
}

async function login(payload) {
  const generation = ++authGeneration;
  refreshPromise = null;
  await withAuthWrite(clearTokens);
  assertGeneration(generation);
  const result = await rawRequest("/api/v1/auth/login", {
    method: "POST",
    body: payload,
  });
  const tokens = result?.data || result;

  if (!tokens?.accessToken || !tokens?.refreshToken) {
    throw new ApiError(502, "Authentication service returned invalid tokens");
  }

  await storeTokens(tokens, generation);

  const user = tokens.user || { email: String(payload?.email || "").trim() };
  await chrome.storage.local.set({ userProfile: user });

  return { user: tokens.user || null };
}

async function logout() {
  ++authGeneration;
  refreshPromise = null;
  const previous = await withAuthWrite(async () => {
    const [session, local] = await Promise.all([
      chrome.storage.session.get(ACCESS_TOKEN_KEY),
      chrome.storage.local.get(REFRESH_TOKEN_KEY),
    ]);
    await clearTokens();
    return { accessToken: session[ACCESS_TOKEN_KEY], refreshToken: local[REFRESH_TOKEN_KEY] };
  });

  if (previous.accessToken) {
    try {
      await rawRequest("/api/v1/auth/logout", {
        method: "POST",
        accessToken: previous.accessToken,
        body: { refreshToken: previous.refreshToken },
      });
    } catch {
      // Local sign-out must still complete when the API is unavailable.
    }
  }

  return null;
}

async function apiRequest(path, options = {}) {
  const generation = authGeneration;
  let { accessToken } = await chrome.storage.session.get(ACCESS_TOKEN_KEY);
  assertGeneration(generation);

  if (!accessToken) {
    accessToken = await refreshAccessToken(generation);
  }
  assertGeneration(generation);

  try {
    const result = await rawRequest(path, { ...options, accessToken });
    assertGeneration(generation);
    return result;
  } catch (error) {
    assertGeneration(generation);
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    accessToken = await refreshAccessToken(generation);
    assertGeneration(generation);
    const result = await rawRequest(path, { ...options, accessToken });
    assertGeneration(generation);
    return result;
  }
}

function refreshAccessToken(generation = authGeneration) {
  assertGeneration(generation);
  if (!refreshPromise) {
    const pending = performRefresh(generation).finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    });
    refreshPromise = pending;
  }
  return refreshPromise;
}

async function performRefresh(generation = authGeneration) {
  const { refreshToken } = await chrome.storage.local.get(REFRESH_TOKEN_KEY);
  assertGeneration(generation);
  if (!refreshToken) throw new ApiError(401, "Please sign in to FLENVN");

  try {
    const result = await rawRequest("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });
    assertGeneration(generation);
    const tokens = result?.data || result;
    if (!tokens?.accessToken || !tokens?.refreshToken) {
      throw new ApiError(502, "Authentication service returned invalid tokens");
    }
    await storeTokens(tokens, generation);
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
      await withAuthWrite(async () => {
        if (generation === authGeneration) await clearTokens();
      });
    }
    throw error;
  }
}

async function rawRequest(path, options = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.accessToken) headers.set("Authorization", `Bearer ${options.accessToken}`);

  let response;
  try {
    response = await fetch(new URL(path, DEFAULT_API_BASE_URL), {
      method: options.method || "GET",
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the FLENVN service");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message || `Request failed with ${response.status}`;
    throw new ApiError(response.status, message, data);
  }
  return data;
}

function normalizeText(value) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 5000);
}

function normalizeOccurrenceIndex(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function normalizeImageLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 3;
}

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function serializeError(error) {
  return {
    status: error instanceof ApiError ? error.status : 0,
    message: error instanceof Error ? error.message : "Unexpected extension error",
    details: error instanceof ApiError ? error.details : undefined,
  };
}
