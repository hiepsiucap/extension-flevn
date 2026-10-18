import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

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
      else if (path.endsWith('/translation/translate')) data = body?.text === '你好，世界！'
        ? { translatedText: 'Xin chào, thế giới!', sourceLanguage: 'zh', targetLanguage: 'vi', sourcePinyin: 'nǐ hǎo, shì jiè' }
        : body?.targetLanguage === 'zh'
          ? { translatedText: '你好，世界！', sourceLanguage: 'en', targetLanguage: 'zh', translatedPinyin: 'nǐ hǎo, shì jiè' }
          : { translatedText: body?.text === 'Hello world' ? 'Xin chào thế giới' : 'Mỗi ngày, một chút tò mò có thể mở ra một thế giới mới.', sourceLanguage: 'en', targetLanguage: 'vi' };
      else if (path.endsWith('/words/explain-in-context')) data = body?.word === 'Hello' ? {
        word: 'Hello', pronunciation: '/həˈloʊ/', partOfSpeech: 'interjection', translation: 'xin chào',
        definitions: [{ text: 'Used as a greeting.' }],
        examples: [{ text: 'Hello world.', translation: 'Xin chào thế giới.' }],
      } : body?.word === '银行' ? {
        word: '银行', pronunciation: 'yín háng', partOfSpeech: 'noun', translation: 'ngân hàng',
        definitions: [{ text: '金融机构' }],
        examples: [{ text: '我去了银行。', translation: 'Tôi đã đến ngân hàng.' }],
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
  await worker.evaluate(async () => {
    await chrome.storage.session.set({ accessToken: 'demo-access' });
    await chrome.storage.local.set({ refreshToken: 'demo-refresh', lastBookId: 'demo-book' });
  });
  await context.route('https://reading.example/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
  <html lang="en"><meta charset="utf-8"><title>A little curiosity · Reading sample</title>
  <style>body{margin:0;color:#20243a;background:#faf9f6;font-family:Georgia,serif}header{height:78px;border-bottom:1px solid #e7e4de;display:flex;align-items:center;justify-content:space-between;padding:0 80px;font:15px Arial,sans-serif}header strong{letter-spacing:2px}header span{color:#777b89;font-size:12px}main{max-width:820px;margin:66px auto}.eyebrow{color:#777b89;font:12px Arial;letter-spacing:2px}h1{font-size:48px;font-weight:400;margin:18px 0 14px}.intro{font-size:20px;color:#747889;line-height:1.6;margin-bottom:32px}p{font-size:24px;line-height:1.85}footer{position:fixed;bottom:30px;left:80px;color:#9396a1;font:12px Arial}::selection{background:#dce0ff}</style>
  <header><strong>READING NOTES</strong><span>ENGLISH PRACTICE · SAMPLE ARTICLE</span></header>
  <main><div class="eyebrow">LANGUAGE & EVERYDAY LIFE</div><h1>A little curiosity goes a long way</h1>
  <div class="intro">Small moments of learning, wherever the day takes you.</div>
  <p id="word">Stay curious about the world around you.</p>
  <p id="passage">Every day, a little curiosity can open up a new world.</p>
  <p id="chinese-word">我去了银行。</p>
  <p id="chinese-passage">你好，世界！</p>
  <p id="english-passage">Hello, world!</p>
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
  await shadow('this.querySelector(".save").click();');
  await page.waitForTimeout(200);
  assert(await worker.evaluate(() => globalThis.testRequests.some(r => r.path.endsWith('/flashcards') && r.body.bookId === 'demo-book')));
  await select('#passage');
  await waitForText('Mỗi ngày');
  await page.waitForTimeout(300);
  await select('#chinese-word', '银行');
  await waitForText('Pinyin: yín háng');
  await shadow('this.querySelector(".save").click();');
  await page.waitForTimeout(200);
  assert(await worker.evaluate(() => globalThis.testRequests.some(r => r.path.endsWith('/flashcards') && r.body.word === '银行' && r.body.pronunciation === 'yín háng')));
  await select('#chinese-passage');
  await waitForText('Source Pinyin: nǐ hǎo, shì jiè');
  await worker.evaluate(() => chrome.storage.local.set({ targetLanguage: 'zh' }));
  await select('#english-passage');
  await waitForText('Translation Pinyin: nǐ hǎo, shì jiè');
  assert.deepEqual(errors, []);
  console.log('Chinese Pinyin browser checks passed.');
} finally {
  await context.close();
}
