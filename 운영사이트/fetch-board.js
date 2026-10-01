// 기존 사이트(www.happykiz.kr) 게시판 글을 받아 board/*.json 과 board/files/ 에 저장합니다.
// 실행: node fetch-board.js   (한 번만 하면 됩니다. 이미 받은 그림은 다시 받지 않습니다)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = 'https://www.happykiz.kr';
const BOARDS = [
  { key: 'notice', moduleId: 1 },
  { key: 'news', moduleId: 7 },
];
const OUT = path.join(__dirname, 'board');
const FILES = path.join(OUT, 'files');
fs.mkdirSync(FILES, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, asBuffer) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1000);
    }
  }
}

const decode = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

function cleanTitle(t) {
  return decode(t).replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '').trim();
}

// 그림·첨부파일을 board/files 로 받아 오고 새 주소(/board-files/...)로 바꿉니다.
async function localize(url) {
  const abs = decode(url).startsWith('http') ? decode(url) : BASE + decode(url);
  let name = '';
  const m = abs.match(/FileName=([^&]+)/i);
  if (m) name = decodeURIComponent(m[1].replace(/\+/g, ' '));
  else name = decodeURIComponent(abs.split('?')[0].split('/').pop());
  const ext = (path.extname(name) || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const hash = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12);
  const file = hash + ext;
  const dest = path.join(FILES, file);
  if (!fs.existsSync(dest)) {
    const buf = await get(abs, true);
    fs.writeFileSync(dest, buf);
  }
  return { file, name };
}

async function fetchBoard({ key, moduleId }) {
  // 목록은 한 페이지에 10개씩이라 새 글이 안 나올 때까지 페이지를 넘깁니다.
  const rows = [];
  for (let page = 1; page < 50; page++) {
    const list = await get(`${BASE}/Module/Board/Board.asp?page=${page}&ModuleID=${moduleId}&PageSize=10&Key=&Keyword=&sCategory=&sIsNotice=`);
    const found = [...list.matchAll(/href='(\/Module\/Board\/Board\.asp\?[^']*Mode=V[^']*IDX=(\d+))'[^>]*title='([^']*)'/g)];
    const fresh = found.filter(f => !rows.some(r => r[2] === f[2]));
    if (!fresh.length) break;
    rows.push(...fresh);
  }
  const seen = new Set();
  const posts = [];
  for (const [, href, idx] of rows) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    const html = await get(BASE + decode(href));
    const title = cleanTitle((html.match(/<h2 class="pt-4 view_tit[^"]*">([\s\S]*?)<\/h2>/) || [])[1] || '');
    const date = (html.match(/vdatecreated">[\s\S]*?<dd[^>]*>\s*([\d-]{10})/) || [])[1] || '';
    let body = (html.match(/<div class="col contents view_con[^"]*">([\s\S]*?)<!-- \/\/ Content body -->/) || [])[1] || '';
    body = body.replace(/\s*<\/div>\s*$/, '').trim();

    // 본문 그림
    const imgs = [...body.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(x => x[1]);
    for (const src of imgs) {
      if (src.startsWith('data:')) continue;
      const { file } = await localize(src);
      body = body.split(src).join('/board-files/' + file);
    }
    // 첨부파일
    const attach = [];
    const att = (html.match(/<strong class="Attachedfile">[\s\S]*?<ul class="list-unstyled">([\s\S]*?)<\/ul>/) || [])[1] || '';
    for (const a of att.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const { file, name } = await localize(a[1]);
      attach.push({ file: '/board-files/' + file, name: decode(a[2].replace(/<[^>]+>/g, '')).trim() || name });
    }
    posts.push({ id: idx, title, date, body, attach });
    process.stdout.write(`  ${key} ${posts.length}/${seen.size}  ${date} ${title}\n`);
    await sleep(150);
  }
  fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify(posts, null, 1), 'utf8');
  console.log(`${key}: ${posts.length} posts`);
}

(async () => {
  for (const b of BOARDS) await fetchBoard(b);
})().catch(e => { console.error(e); process.exit(1); });
