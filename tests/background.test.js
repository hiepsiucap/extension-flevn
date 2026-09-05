import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/background.js", import.meta.url), "utf8");
const popup = { id: "test-extension", url: "chrome-extension://test-extension/index.html" };
const tab = { id: "test-extension", url: "https://example.com/", tab: { id: 1 } };
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => data,
});
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
async function setup(initial = {}) {
  const local = { ...initial };
  const session = {};
  const area = data => ({
    setAccessLevel: vi.fn(async () => {}),
    get: vi.fn(async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]]))),
    set: vi.fn(async values => { Object.assign(data, values); }),
    remove: vi.fn(async keys => { for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]; }),
  });
  const event = () => ({ addListener: vi.fn() });
  const fetch = vi.fn(async () => response({}));
  const chrome = {
    runtime: { id: popup.id, getURL: p => `chrome-extension://${popup.id}/${p}`, onInstalled: event(), onMessage: event() },
    contextMenus: { onClicked: event(), create: vi.fn() },
    storage: { local: area(local), session: area(session) },
  };
  const context = vm.createContext({ chrome, fetch, URL, Headers, AbortSignal });
  vm.runInContext(source, context);
  await vm.runInContext("storageReady", context);
  const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const send = (type, payload, sender = popup) => new Promise(resolve => listener({ type, payload }, sender, resolve));
  return { local, session, chrome, fetch, send };
}

describe("production background security and authentication", () => {
  it("restricts token storage and deletes legacy selection and API overrides", async () => {
    const h = await setup({ latestSelection: { text: "private" }, apiBaseUrl: "https://untrusted.example", refreshToken: "refresh" });
    expect(h.chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(h.chrome.storage.session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(h.local).toEqual({ refreshToken: "refresh" });
    const state = await h.send("GET_STATE", undefined, tab);
    expect(state.data).toEqual({ authenticated: true, lastBookId: "", targetLanguage: "vi", subtitleEnabled: false, user: null });
    await h.send("SELECTION_CHANGED", { text: "private", pageUrl: "https://private.example" }, tab);
    expect(h.local).not.toHaveProperty("latestSelection");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("rejects account commands from content scripts and messages from other extensions", async () => {
    const h = await setup();
    for (const type of ["LOGIN", "LOGOUT"]) {
      expect((await h.send(type, {}, tab)).error.status).toBe(403);
    }
    expect((await h.send("GET_STATE", undefined, { ...popup, id: "other" })).error.status).toBe(403);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("persists an opt-in subtitle setting as a normalized boolean", async () => {
    const h = await setup();
    expect((await h.send("GET_STATE", undefined, tab)).data.subtitleEnabled).toBe(false);
    expect(await h.send("SET_SUBTITLE_ENABLED", { enabled: true }, tab)).toEqual({ ok: true, data: { subtitleEnabled: true } });
    expect(h.local.subtitleEnabled).toBe(true);
    expect((await h.send("GET_STATE", undefined, tab)).data.subtitleEnabled).toBe(true);
    await h.send("SET_SUBTITLE_ENABLED", { enabled: "yes" }, tab);
    expect(h.local.subtitleEnabled).toBe(false);
  });

  it("sends credentials only to production and never returns tokens", async () => {
    const h = await setup();
    h.local.apiBaseUrl = "http://localhost:5000";
    h.fetch.mockResolvedValue(response({ data: { accessToken: "access", refreshToken: "refresh" } }));
    expect(await h.send("LOGIN", { email: "test@example.com", password: "test-only" })).toEqual({ ok: true, data: { user: null } });
    const [url, options] = h.fetch.mock.calls[0];
    expect(url.href).toBe("https://api.flenvn.app/api/v1/auth/login");
    expect(options).toMatchObject({ redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not restore tokens when a refresh finishes after logout", async () => {
    const h = await setup({ refreshToken: "old" });
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise);
    const request = h.send("GET_BOOKS", undefined, tab);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    expect((await h.send("LOGOUT")).ok).toBe(true);
    pending.resolve(response({ accessToken: "late-access", refreshToken: "late-refresh" }));
    expect((await request).ok).toBe(false);
    expect(h.local).not.toHaveProperty("refreshToken");
    expect(h.session).not.toHaveProperty("accessToken");
    expect((await h.send("GET_STATE")).data.authenticated).toBe(false);
  });

  it("does not restore tokens when a login finishes after logout", async () => {
    const h = await setup();
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise);
    const request = h.send("LOGIN", { email: "test@example.com", password: "test-only" });
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    await h.send("LOGOUT");
    pending.resolve(response({ accessToken: "late-access", refreshToken: "late-refresh" }));
    expect((await request).ok).toBe(false);
    expect((await h.send("GET_STATE")).data.authenticated).toBe(false);
  });

  it("does not let an old refresh failure clear a newer login", async () => {
    const h = await setup({ refreshToken: "old" });
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise);
    const old = h.send("GET_BOOKS", undefined, tab);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    h.fetch.mockResolvedValueOnce(response({ accessToken: "new-access", refreshToken: "new-refresh" }));
    expect((await h.send("LOGIN", {})).ok).toBe(true);
    pending.resolve(response({ message: "expired" }, 401));
    expect((await old).ok).toBe(false);
    expect(h.session.accessToken).toBe("new-access");
    expect(h.local.refreshToken).toBe("new-refresh");
  });

  it("shares a refresh across concurrent requests", async () => {
    const h = await setup({ refreshToken: "old" });
    const pending = deferred();
    h.fetch.mockReturnValueOnce(pending.promise).mockResolvedValue(response([]));
    const first = h.send("GET_BOOKS", undefined, tab);
    const second = h.send("GET_BOOKS", undefined, tab);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    pending.resolve(response({ accessToken: "access", refreshToken: "refresh" }));
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(h.fetch.mock.calls.filter(([url]) => url.pathname.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("refreshes the access token after a 401 and retries the original request", async () => {
    const h = await setup({ refreshToken: "old-refresh" });
    h.session.accessToken = "expired-access";
    h.fetch
      .mockResolvedValueOnce(response({ message: "expired" }, 401))
      .mockResolvedValueOnce(response({ accessToken: "new-access", refreshToken: "new-refresh" }))
      .mockResolvedValueOnce(response([{ id: "book-1", title: "My book" }]));

    const result = await h.send("GET_BOOKS", undefined, tab);

    expect(result).toEqual({ ok: true, data: [{ id: "book-1", title: "My book" }] });
    expect(h.fetch.mock.calls.map(([url]) => url.pathname)).toEqual([
      "/api/v1/books",
      "/api/v1/auth/refresh",
      "/api/v1/books",
    ]);
    expect(h.session.accessToken).toBe("new-access");
    expect(h.local.refreshToken).toBe("new-refresh");
    expect(h.fetch.mock.calls[2][1].headers.get("Authorization")).toBe("Bearer new-access");
  });

  it("clears local credentials when logout revocation is offline", async () => {
    const h = await setup({ refreshToken: "refresh", lastBookId: "book" });
    h.session.accessToken = "access";
    h.fetch.mockRejectedValue(new Error("offline"));
    expect((await h.send("LOGOUT")).ok).toBe(true);
    expect(h.session).toEqual({});
    expect(h.local).toEqual({});
  });

  it("clears expired credentials after refresh rejection", async () => {
    const h = await setup({ refreshToken: "expired" });
    h.fetch.mockResolvedValue(response({ message: "expired" }, 401));
    expect((await h.send("GET_BOOKS", undefined, tab)).error.status).toBe(401);
    expect((await h.send("GET_STATE")).data.authenticated).toBe(false);
  });
});
