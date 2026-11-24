// 使い方: node validate-mermaid.mjs <ファイルかフォルダー> [...]
// .md の ```mermaid ブロックを、Mermaid 10.9.3 と 11.4.1 でヘッドレスの Chromium に描かせて確かめる。
// 失敗したブロックを 1 行ずつ出し、1 つでも失敗したら終了コード 1。
// Playwright は、このリポジトリの node_modules（npm install で入る）のものを使う。環境変数 PLAYWRIGHT_INDEX で変えられる。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const playwrightIndex =
  process.env.PLAYWRIGHT_INDEX ||
  [path.join(repo, 'node_modules/playwright/index.mjs'), path.join(repo, 'frontend/node_modules/playwright/index.mjs')].find((p) =>
    fs.existsSync(p),
  );
if (!playwrightIndex) {
  console.error('Playwright が見つかりません。リポジトリで npm install するか、PLAYWRIGHT_INDEX に playwright/index.mjs の場所を指定してください。');
  process.exit(2);
}
const { chromium } = await import(pathToFileURL(playwrightIndex).href);

// Mermaid の本体（mermaid-10.9.3.min.js と mermaid-11.4.1.min.js）はリポジトリに入れていない。
// 環境変数 MERMAID_DIR のフォルダー、なければ PC のスキル（~/.claude/skills/kusakari-sequence/scripts/mermaid）から読む。
const mermaidDir = [process.env.MERMAID_DIR, path.join(os.homedir(), '.claude/skills/kusakari-sequence/scripts/mermaid')]
  .filter(Boolean)
  .find((dir) => fs.existsSync(path.join(dir, 'mermaid-11.4.1.min.js')));
if (!mermaidDir) {
  console.error(
    'Mermaid の本体が見つかりません。mermaid-10.9.3.min.js と mermaid-11.4.1.min.js（npm の mermaid の dist/mermaid.min.js）を置いたフォルダーを MERMAID_DIR に指定してください。',
  );
  process.exit(2);
}
const libs = {
  '10.9.3': path.join(mermaidDir, 'mermaid-10.9.3.min.js'),
  '11.4.1': path.join(mermaidDir, 'mermaid-11.4.1.min.js'),
};

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const n of fs.readdirSync(p)) walk(path.join(p, n), out);
  else if (p.endsWith('.md')) out.push(p);
  return out;
}

const files = process.argv.slice(2).flatMap((a) => walk(a, []));
if (files.length === 0) {
  console.error('確かめる .md のファイルかフォルダーを指定してください。');
  process.exit(2);
}
const blocks = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let inBlock = false, start = 0, buf = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inBlock && /^```mermaid\s*$/.test(l)) { inBlock = true; start = i + 1; buf = []; continue; }
    if (inBlock && /^```\s*$/.test(l)) { inBlock = false; blocks.push({ file: f, line: start, code: buf.join('\n') }); continue; }
    if (inBlock) buf.push(l);
  }
  if (inBlock) blocks.push({ file: f, line: start, code: buf.join('\n'), unclosed: true });
}

const browser = await chromium.launch();
let failures = 0;
for (const [ver, lib] of Object.entries(libs)) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.setContent('<!doctype html><html><body><div id="c"></div></body></html>');
  await page.addScriptTag({ path: lib });
  await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', maxTextSize: 100000 }));
  let n = 0, ok = 0;
  for (const b of blocks) {
    n++;
    if (b.unclosed) { console.log(`FAIL [${ver}] ${b.file}:${b.line} mermaid のブロックが閉じていない`); failures++; continue; }
    const res = await page.evaluate(async ({ code, id }) => {
      try {
        const { svg } = await window.mermaid.render(id, code, document.getElementById('c'));
        return /aria-roledescription="error"|>Syntax error in text</.test(svg) ? { ok: false, msg: 'エラーの図が描かれた' } : { ok: true };
      } catch (e) {
        return { ok: false, msg: String(e && (e.message || e)).split('\n').slice(0, 6).join(' | ') };
      } finally {
        document.querySelectorAll('[id^="dmmd"]').forEach((x) => x.remove());
      }
    }, { code: b.code, id: `mmd${n}` });
    if (res.ok) ok++;
    else { failures++; console.log(`FAIL [${ver}] ${b.file}:${b.line} ${res.msg}`); }
  }
  console.log(`mermaid ${ver}: ${ok}/${blocks.length} ブロックを描けた`);
  await page.close();
}
await browser.close();
console.log(`${files.length} ファイルの ${blocks.length} ブロックを確かめた。失敗 ${failures}`);
process.exit(failures ? 1 : 0);
