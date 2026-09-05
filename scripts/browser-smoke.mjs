import { chromium } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('store-assets');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'flenvn-store-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
});
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  // Controlled example responses: no real credentials, user data or live API calls.
  await worker.evaluate(() => {
    globalThis.testRequests = [];
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(url).pathname;
      const body = options.body ? JSON.parse(options.body) : null;
      globalThis.testRequests.push({ path, body });
      let data;
      if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'demo-access', refreshToken: 'demo-refresh' };
      else if (path.endsWith('/auth/logout')) data = {};
      else if (path.endsWith('/translation/translate')) data = { translatedText: body?.text === 'Hello world' ? 'Xin chào thế giới' : 'Mỗi ngày, một chút tò mò có thể mở ra một thế giới mới.', sourceLanguage: 'en', targetLanguage: 'vi' };
      else if (path.endsWith('/words/explain-in-context')) data = body?.word === 'Hello' ? {
        word: 'Hello', pronunciation: '/həˈloʊ/', partOfSpeech: 'interjection', translation: 'xin chào',
        definitions: [{ text: 'Used as a greeting.' }],
        examples: [{ text: 'Hello world.', translation: 'Xin chào thế giới.' }],
      } : {
        word: 'curious', pronunciation: '/ˈkjʊəriəs/', partOfSpeech: 'adjective', translation: 'tò mò, ham tìm hiểu',
        definitions: [{ text: 'Wanting to know or learn something.' }],
        examples: [{ text: 'She is curious about the world around her.', translation: 'Cô ấy tò mò về thế giới xung quanh.' }],
      };
      else if (path.endsWith('/books')) data = [{ id: 'demo-book', title: 'Everyday English' }];
      else if (path.endsWith('/flashcards')) data = { id: 'demo-card' };
      else throw new Error(`Unexpected API route: ${path}`);
      return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } });
    };
  });
  const popupEvent = context.waitForEvent('page');
  await worker.evaluate(() => chrome.action.openPopup());
  const popup = await popupEvent;
  await popup.waitForLoadState();
  await popup.getByLabel('Email', { exact: true }).fill('demo@example.com');
  await popup.getByLabel('Password', { exact: true }).fill('demo-password');
  await popup.getByRole('button', { name: 'Sign in', exact: true }).click();
  await popup.getByRole('heading', { name: 'FLENVN is ready' }).waitFor();

  await context.route('https://reading.example/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
  <html lang="en"><meta charset="utf-8"><title>A little curiosity · Reading sample</title>
  <style>body{margin:0;color:#20243a;background:#faf9f6;font-family:Georgia,serif}header{height:78px;border-bottom:1px solid #e7e4de;display:flex;align-items:center;justify-content:space-between;padding:0 80px;font:15px Arial,sans-serif}header strong{letter-spacing:2px}header span{color:#777b89;font-size:12px}main{max-width:820px;margin:66px auto}.eyebrow{color:#777b89;font:12px Arial;letter-spacing:2px}h1{font-size:48px;font-weight:400;margin:18px 0 14px}.intro{font-size:20px;color:#747889;line-height:1.6;margin-bottom:32px}p{font-size:24px;line-height:1.85}footer{position:fixed;bottom:30px;left:80px;color:#9396a1;font:12px Arial}::selection{background:#dce0ff}</style>
  <header><strong>READING NOTES</strong><span>ENGLISH PRACTICE · SAMPLE ARTICLE</span></header>
  <main><div class="eyebrow">LANGUAGE & EVERYDAY LIFE</div><h1>A little curiosity goes a long way</h1>
  <div class="intro">Small moments of learning, wherever the day takes you.</div>
  <p id="word">Stay curious about the world around you.</p>
  <p id="passage">Every day, a little curiosity can open up a new world.</p>
  </main><footer>Sample content for demonstrating FLENVN Translator</footer></html>` }));
  const page = await context.newPage();
  await page.goto('https://reading.example/curiosity');
  await page.locator('#flenvn-selection-root').waitFor({ state: 'attached' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  async function shadow(action) {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    function find(node) {
      if (node.attributes?.includes('flenvn-selection-root')) return node.shadowRoots?.[0];
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const result = find(child); if (result) return result; }
    }
    const node = find(root);
    assert(node, 'Extension shadow root exists');
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: node.backendNodeId });
    const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId, functionDeclaration: `function(){${action}}`, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
  }
  async function select(selector, word) {
    await page.evaluate(({ selector, word }) => {
      const node = document.querySelector(selector).firstChild;
      const range = document.createRange();
      const start = word ? node.textContent.indexOf(word) : 0;
      range.setStart(node, start); range.setEnd(node, word ? start + word.length : node.length);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    }, { selector, word });
    await page.waitForTimeout(200);
    assert.equal(await shadow('return this.querySelector(".trigger").hidden;'), false);
    await shadow('this.querySelector(".trigger").click();');
  }
  async function waitForText(text) {
    for (let i = 0; i < 50; i++) {
      if ((await shadow('return this.querySelector(".content").textContent;')).includes(text)) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`Missing translation: ${text}`);
  }
  await select('#word', 'curious');
  await waitForText('tò mò, ham tìm hiểu');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(output, '01-word-in-context-1280x800.png') });
  await shadow('this.querySelector(".save").click();');
  await page.waitForTimeout(200);
  assert(await worker.evaluate(() => globalThis.testRequests.some(r => r.path.endsWith('/flashcards') && r.body.bookId === 'demo-book')));
  await select('#passage');
  await waitForText('Mỗi ngày');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(output, '02-passage-translation-1280x800.png') });
  await popup.getByRole('switch', { name: /YouTube subtitles/i }).check();
  await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
  <html lang="en"><meta charset="utf-8"><title>Subtitle test - YouTube</title>
  <style>html,body{margin:0;width:100%;height:100%;background:#111}.html5-video-player{position:relative;width:960px;height:540px;margin:30px auto;background:#222}.caption-window{position:absolute;left:200px;bottom:55px;color:#fff;font:28px Arial}.ytp-caption-segment{display:inline-block}</style>
  <div id="movie_player" class="html5-video-player"><div class="caption-window ytp-caption-window-bottom"><div class="caption-visual-line"><span class="ytp-caption-segment">Hello</span><span class="ytp-caption-segment"> world</span></div></div></div></html>` }));
  const videoPage = await context.newPage();
  await videoPage.goto('https://www.youtube.com/watch?v=flenvn-test');
  await videoPage.locator('#flenvn-subtitle-root').waitFor({ state: 'attached' });
  const subtitleCdp = await context.newCDPSession(videoPage);
  await subtitleCdp.send('DOM.enable');
  async function subtitleShadow(action) {
    const { root } = await subtitleCdp.send('DOM.getDocument', { depth: -1, pierce: true });
    function find(node) {
      if (node.attributes?.includes('flenvn-subtitle-root')) return node.shadowRoots?.[0];
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const result = find(child); if (result) return result; }
    }
    const node = find(root);
    assert(node, 'Subtitle shadow root exists');
    const { object } = await subtitleCdp.send('DOM.resolveNode', { backendNodeId: node.backendNodeId });
    const { result, exceptionDetails } = await subtitleCdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId, functionDeclaration: `function(){${action}}`, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
  }
  for (let i = 0; i < 50; i++) {
    if ((await subtitleShadow('return this.querySelector(".caption").textContent;')).includes('Hello world')) break;
    if (i === 49) throw new Error('Missing interactive YouTube subtitle');
    await videoPage.waitForTimeout(100);
  }
  assert.equal(await subtitleShadow('return this.querySelector(".overlay").hidden;'), false);
  assert.equal(await subtitleShadow('return this.querySelectorAll(".word").length;'), 2);
  assert.equal(await videoPage.evaluate(() => getComputedStyle(document.querySelector('.caption-window')).opacity), '0', 'Native YouTube caption is hidden');
  assert.equal(await worker.evaluate(() => globalThis.testRequests.some(r => r.path.endsWith('/translation/translate') && r.body?.text === 'Hello world')), false, 'Subtitles are not translated automatically');
  await subtitleShadow('this.querySelector("[aria-label=\'Explain Hello\']").click();');
  for (let i = 0; i < 50; i++) {
    const explained = await worker.evaluate(() => globalThis.testRequests.some(r => r.path.endsWith('/words/explain-in-context') && r.body?.word === 'Hello' && r.body?.text === 'Hello world'));
    if (explained) break;
    if (i === 49) throw new Error('Subtitle word was not explained in context');
    await videoPage.waitForTimeout(100);
  }
  await videoPage.evaluate(() => document.querySelector('.ytp-caption-segment').textContent = 'Hello');
  await videoPage.waitForTimeout(400);
  assert.equal(await subtitleShadow('return this.querySelector(".caption").textContent;'), 'Hello world');
  await videoPage.evaluate(() => document.querySelector('.caption-window').remove());
  await videoPage.waitForTimeout(300);
  assert.equal(await subtitleShadow('return this.querySelector(".overlay").hidden;'), true);
  await popup.getByRole('switch', { name: /YouTube subtitles/i }).uncheck();
  await videoPage.locator('#flenvn-subtitle-root').waitFor({ state: 'detached' });
  const storageCheck = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://reading.example/*' });
    const results = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: async () => {
      try { const value = await chrome.storage.local.get('refreshToken'); return !value.refreshToken; }
      catch { return true; }
    } });
    return results[0].result;
  });
  assert.equal(storageCheck, true, 'Content scripts cannot read refresh tokens');
  await popup.getByRole('button', { name: 'Sign out', exact: true }).click();
  await popup.getByRole('heading', { name: 'Sign in to FLENVN' }).waitFor();
  const stored = await worker.evaluate(() => chrome.storage.local.get(null));
  assert.equal(stored.refreshToken, undefined);
  assert.equal(stored.latestSelection, undefined);
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'browser-check.json'), JSON.stringify({
    passed: true, date: new Date().toISOString(), browser: context.browser().version(),
    checks: ['load built extension', 'popup login', 'word explanation', 'flashcard save', 'passage translation', 'interactive YouTube subtitles', 'native caption replacement', 'subtitle word explanation', 'subtitle teardown', 'content-script token isolation', 'logout'],
    api: 'Controlled example responses; production backend was not tested.',
    screenshots: 'Actual built extension UI on a sample article using controlled example responses.',
  }, null, 2));
  console.log('Browser checks passed; two store screenshots saved in store-assets. API responses were controlled examples.');
} finally {
  await context.close();
}
