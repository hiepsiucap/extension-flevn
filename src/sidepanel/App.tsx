import { useEffect, useState } from "react";
import { ArrowRight, ArrowSquareOut, BookOpen, CardsThree, CheckCircle, EnvelopeSimple, Eye, EyeSlash, GameController, LockKey, SignOut, Translate } from "@phosphor-icons/react";
import { sendMessage, unwrapEnvelope } from "../shared/messaging";
import type { Book, ExtensionState } from "../shared/types";

export function App() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  function loadState() {
    setError("");
    sendMessage<ExtensionState>("GET_STATE")
      .then(async (nextState) => { setState(nextState); setNotice(await activateCurrentTab(nextState)); })
      .catch((requestError) => setError(messageFor(requestError)));
  }
  useEffect(loadState, []);

  async function handleLogin(email: string, password: string) {
    setError("");
    const result = await sendMessage<{ user?: ExtensionState["user"] }>("LOGIN", { email, password });
    const nextState: ExtensionState = { authenticated: true, lastBookId: state?.lastBookId || "", targetLanguage: state?.targetLanguage || "vi", subtitleEnabled: state?.subtitleEnabled === true, user: result?.user || { email } };
    setState(nextState);
    setNotice(await activateCurrentTab(nextState));
  }

  async function handleLogout() {
    setError("");
    setSigningOut(true);
    try {
      await sendMessage("LOGOUT");
      await syncSubtitleSetting(false, state?.targetLanguage || "vi").catch(() => {});
      setState((current) => current ? { ...current, authenticated: false, lastBookId: "", user: null } : current);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSigningOut(false);
    }
  }

  if (!state && error) return <div className="popup"><main className="main"><div className="status error" role="alert">{error}</div><button className="button" type="button" onClick={loadState}>Try again</button></main></div>;
  if (!state) return <div className="popup loading"><img className="loading-logo" src="/logo-extension.png" alt="" /><span className="loading-text">Loading FLENVN…</span></div>;

  return <div className={`popup${state.authenticated ? " is-dashboard" : ""}`}>
    <header className="header"><div className="brand-lockup"><img className="brand-logo" src="/logo-extension.png" alt="" /><div className="brand" aria-label="FLEN VN">FLEN <span>VN</span></div></div><p className="tagline">Learn <i>•</i> Translate <i>•</i> Grow</p></header>
    {!state.authenticated ? <div className="hero" aria-hidden="true"><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span><div className="welcome">Welcome<br />back!</div><img src="/penguin-top.png" alt="" /></div> : null}
    <main className="main">
      {notice ? <p className="muted" role="status">{notice}</p> : null}
      {state.authenticated ? <Dashboard state={state} onStateChange={setState} error={error} onLogout={handleLogout} signingOut={signingOut} /> : <LoginView onLogin={handleLogin} error={error} />}
      {!state.authenticated ? <aside className="privacy-note"><img className="book-icon" src="/book-icon.png" alt="" /><p>Selected text and its surrounding sentence are sent to FLENVN when you translate. Saved words are added to your account.</p></aside> : null}
    </main>
  </div>;
}

function Dashboard({ state, onStateChange, error, onLogout, signingOut }: { state: ExtensionState; onStateChange: React.Dispatch<React.SetStateAction<ExtensionState | null>>; error: string; onLogout: () => Promise<void>; signingOut: boolean; }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookError, setBookError] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const [updatingSubtitles, setUpdatingSubtitles] = useState(false);
  useEffect(() => {
    let active = true;
    sendMessage<unknown>("GET_BOOKS").then((value) => { if (active) setBooks(normalizeBooks(value)); }).catch((requestError) => { if (active) setBookError(messageFor(requestError)); });
    return () => { active = false; };
  }, []);
  const links = [
    { title: "My books", description: "Manage your learning books", icon: <BookOpen size={23} weight="duotone" />, url: "https://flenvn.app/books" },
    { title: "Flashcards", description: "View all saved vocabulary", icon: <CardsThree size={23} weight="duotone" />, url: "https://flenvn.app/flashcards" },
    { title: "Game review", description: "Practice vocabulary on FLENVN", icon: <GameController size={23} weight="duotone" />, url: "https://flenvn.app/review" },
  ];
  return <section className="card dashboard launcher-dashboard">
    <div className="account-row"><img className="account-avatar" src="/default-ava.png" alt="" /><div className="account-copy"><h1>FLENVN is ready</h1><p>{state.user?.name || state.user?.email || "FLENVN learner"}</p></div><CheckCircle className="ready-check" size={23} weight="fill" /></div>
    <div className="default-book-field"><label htmlFor="default-book"><strong>Default save book</strong><small>New words from webpages will save here</small></label><select id="default-book" value={state.lastBookId} disabled={!books.length} onChange={async (event) => { const bookId = event.target.value; onStateChange((current) => current ? { ...current, lastBookId: bookId } : current); try { await sendMessage("SET_LAST_BOOK", { bookId }); setBookError(""); } catch (requestError) { setBookError(messageFor(requestError)); } }}><option value="">{books.length ? "Choose a book" : "No books available"}</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></div>
    <label className="subtitle-setting"><span><strong>Interactive YouTube subtitles</strong><small>Click an English word to see its meaning</small></span><input type="checkbox" role="switch" checked={state.subtitleEnabled} disabled={updatingSubtitles} onChange={async (event) => {
      const enabled = event.currentTarget.checked;
      const previous = state.subtitleEnabled;
      setSubtitleError("");
      setUpdatingSubtitles(true);
      onStateChange((current) => current ? { ...current, subtitleEnabled: enabled } : current);
      try {
        await sendMessage("SET_SUBTITLE_ENABLED", { enabled });
        await syncSubtitleSetting(enabled, state.targetLanguage);
      } catch (requestError) {
        onStateChange((current) => current ? { ...current, subtitleEnabled: previous } : current);
        setSubtitleError(messageFor(requestError));
      } finally {
        setUpdatingSubtitles(false);
      }
    }} /><span className="switch-track" aria-hidden="true"><span /></span></label>
    <p className="subtitle-privacy">When enabled, FLENVN replaces YouTube captions with clickable text. Only a word you click and its current sentence are sent for explanation.</p>
    <div className="launcher-list">{links.map((link) => <button key={link.title} className="launcher-link" type="button" onClick={() => openFlenvn(link.url)}><span className="launcher-icon">{link.icon}</span><span><strong>{link.title}</strong><small>{link.description}</small></span><ArrowSquareOut size={18} /></button>)}</div>
    {subtitleError || bookError || error ? <div className="status error" role="alert">{subtitleError || bookError || error}</div> : null}
    <p className="dashboard-tip">Select text on any webpage to translate and save new words.</p>
    <button className="button ghost full" type="button" onClick={onLogout} disabled={signingOut}><SignOut size={16} /> {signingOut ? "Signing out…" : "Sign out"}</button>
  </section>;
}

function LoginView({ onLogin, error }: { onLogin: (email: string, password: string) => Promise<void>; error: string; }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  return <section className="card"><div className="title-row"><span className="title-icon"><Translate size={26} weight="duotone" /></span><h1>Sign in to <strong>FLENVN</strong></h1></div><form className="stack" onSubmit={async (event) => { event.preventDefault(); setLocalError(""); setSubmitting(true); try { await onLogin(email.trim(), password); } catch (requestError) { setLocalError(messageFor(requestError)); } finally { setSubmitting(false); } }}>
    <div className="field"><label htmlFor="email">Email</label><div className="input-wrap"><EnvelopeSimple size={21} aria-hidden="true" /><input id="email" className="input" type="email" autoComplete="email" required autoFocus placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>
    <div className="field"><label htmlFor="password">Password</label><div className="input-wrap"><LockKey size={21} aria-hidden="true" /><input id="password" className="input" type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={8} required placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="reveal" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash size={21} /> : <Eye size={21} />}</button></div></div>
    {localError || error ? <div className="status error" role="alert">{localError || error}</div> : null}<button className="button full" type="submit" disabled={submitting}>{submitting ? <span className="button-dots" aria-hidden="true"><i /><i /><i /></span> : null}{submitting ? "Signing in…" : <><span>Sign in</span><ArrowRight size={21} weight="bold" /></>}</button>
  </form></section>;
}

function normalizeList(value: unknown): unknown[] { const unwrapped = unwrapEnvelope(value); if (Array.isArray(unwrapped)) return unwrapped; if (unwrapped && typeof unwrapped === "object") { const record = unwrapped as Record<string, unknown>; for (const key of ["items", "books", "results"]) if (Array.isArray(record[key])) return record[key] as unknown[]; } return []; }
function normalizeBooks(value: unknown): Book[] { return normalizeList(value).map((item) => { const book = item as Record<string, unknown>; return { id: String(book.id || book._id || ""), title: String(book.title || book.name || "Untitled book"), totalCards: Number(book.totalCards || book.flashcardCount || 0) }; }).filter((book) => book.id); }
async function activateCurrentTab(state?: ExtensionState) { try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return "Open a regular webpage to use inline translation."; await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["subtitles.js", "content.js"] }); if (state && /^https?:\/\/(?:www\.|m\.)?youtube\.com\//i.test(tab.url)) await chrome.tabs.sendMessage(tab.id, { type: "SUBTITLE_SETTINGS_CHANGED", payload: state }); return ""; } catch { return "Translation is unavailable on this page. Try a regular webpage or reload the tab."; } }
async function syncSubtitleSetting(enabled: boolean, targetLanguage: string) { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !tab.url || !/^https?:\/\/(?:www\.|m\.)?youtube\.com\//i.test(tab.url)) return; await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["subtitles.js"] }); await chrome.tabs.sendMessage(tab.id, { type: "SUBTITLE_SETTINGS_CHANGED", payload: { subtitleEnabled: enabled, authenticated: true, targetLanguage } }); }
function openFlenvn(url: string) { void chrome.tabs.create({ url }); }
function messageFor(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
