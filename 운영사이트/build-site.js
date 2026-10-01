// 아임웹 위젯 파일(.html.txt)로 실제 운영용 정적 사이트를 만듭니다.  →  ../site/
// 실행:  node 운영사이트/build-site.js
// 위젯 · 게시판 데이터(board/*.json)를 고친 뒤에는 다시 실행하고 GitHub에 올리면 됩니다.
//
// 도메인을 연결하면 아래 SITE_URL 을 그 주소로 바꾸세요. (검색엔진 · 카톡 공유 주소에 쓰임)
const SITE_URL = (process.env.SITE_URL || 'https://happykiz-imweb.netlify.app').replace(/\/$/, '');

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.dirname(HERE);
const OUT = path.join(ROOT, 'site');
const CAPTURE_IMAGES = path.join(ROOT, '..', 'happykiz_캡쳐', '원본소스', 'Resources', 'images');
const SITE_NAME = '행복한어린이병원';
const DEFAULT_DESC = '부산 강서구 명지 행복한어린이병원 — 소아청소년과 · 달빛어린이병원. 평일 밤 11시, 토·일·공휴일 오후 6시까지 진료합니다. 예방접종 · 영유아검진 · 성장클리닉 · 호흡기 · 알레르기 · 아동발달.';

const read = f => fs.readFileSync(f, 'utf8');
const write = (rel, text) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text, 'utf8');
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);
const dirOf = prefix => {
  const d = fs.readdirSync(ROOT).find(n => n.startsWith(prefix) && fs.statSync(path.join(ROOT, n)).isDirectory());
  if (!d) throw new Error('folder not found: ' + prefix);
  return path.join(ROOT, d);
};

fs.rmSync(OUT, { recursive: true, force: true });

// ── 위젯 읽기 ────────────────────────────────────────────────
const D1 = dirOf('1_'), D2 = dirOf('2_'), D3 = dirOf('3_'), D4 = dirOf('4_');
const W = {};
for (const f of fs.readdirSync(D1)) {
  const m = f.match(/^(\d)-/);
  if (m) W[m[1]] = read(path.join(D1, f));
}
for (let n = 0; n <= 9; n++) if (!W[n]) throw new Error('widget missing: ' + n);

const pages = [];   // { slug, title, parts, desc }
for (const f of fs.readdirSync(D2).sort()) {
  const m = f.match(/^\d+-(.+?)\s*\(([a-z0-9-]+)\)\.html\.txt$/);
  if (m) pages.push({ slug: m[2], title: m[1], body: read(path.join(D2, f)) });
}
const heroes = {};
for (const f of fs.readdirSync(D3)) {
  const m = f.match(/\(([a-z0-9-]+)\)\.html\.txt$/);
  if (m) heroes[m[1]] = read(path.join(D3, f));
}

// ── 게시판 데이터 ────────────────────────────────────────────
const BOARDS = {
  notice: { name: '공지사항', posts: JSON.parse(read(path.join(HERE, 'board', 'notice.json'))) },
  news: { name: '우리병원 소식', posts: JSON.parse(read(path.join(HERE, 'board', 'news.json'))) },
};
for (const b of Object.values(BOARDS)) b.posts.sort((a, c) => (c.date + c.id).localeCompare(a.date + a.id));
const todayKST = new Date(Date.now() + 9 * 3600e3);
const isNew = d => (todayKST - new Date(d + 'T00:00:00Z')) / 864e5 <= 30;

// ── 공통 변환 ────────────────────────────────────────────────
const SLUGS = new Set([...pages.map(p => p.slug), 'notice', 'news', 'privacy', 'terms']);
const usedImages = new Set();
function finalize(html) {
  // 위젯 맨 위 아임웹 안내 주석은 운영 사이트에 필요 없음
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  // 기존 사이트 사진 → 사이트 안 /images/
  html = html.replace(/https?:\/\/(?:www\.)?happykiz\.kr\/Resources\/images\/([^"')\s]+)/gi, (_, p) => {
    usedImages.add(p);
    return '/images/' + p;
  });
  // /about → /about/  (/sickzone#resp → /sickzone/#resp)
  html = html.replace(/href="\/([a-z][a-z0-9-]*)(#[^"]*)?"/g, (all, slug, hash) =>
    SLUGS.has(slug) ? `href="/${slug}/${hash || ''}"` : all);
  return html;
}

const CLINIC_LD = {
  '@context': 'https://schema.org',
  '@type': 'MedicalClinic',
  name: SITE_NAME,
  url: SITE_URL + '/',
  image: SITE_URL + '/og-image.png',
  logo: SITE_URL + '/images/logo_m.png',
  telephone: '+82-51-264-9500',
  faxNumber: '+82-51-264-9100',
  medicalSpecialty: 'Pediatric',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '명지국제1로 25 우진메디컬프라자 8~9층',
    addressLocality: '강서구',
    addressRegion: '부산광역시',
    addressCountry: 'KR',
  },
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '23:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '09:00', closes: '18:00' },
  ],
};

const sitemap = [];
function page(url, { title, desc, parts, extraHead = '', noindex = false, file }) {
  const full = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | 부산 강서구 명지 소아청소년과 · 달빛어린이병원`;
  const description = cut(text(desc || DEFAULT_DESC), 150);
  const canonical = SITE_URL + url;
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : `<link rel="canonical" href="${esc(canonical)}">\n`}<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE_URL}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#3FA7E6">
<meta name="format-detection" content="telephone=no">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/site.webmanifest">
${extraHead}<style>html,body{margin:0;padding:0;background:#fff;}</style>
</head>
<body>
${finalize(parts.join('\n\n'))}
</body>
</html>
`;
  write(file || (url === '/' ? 'index.html' : url.replace(/^\//, '') + 'index.html'), html);
  if (!noindex) sitemap.push(url);
}

const SITE_CSS = `<style>\n${read(path.join(HERE, 'parts', 'site.css'))}\n</style>`;
const leadOf = html => {
  const m = html.match(/class="hk_hlead[^"]*">([\s\S]*?)<\/span>/);
  return m ? text(m[1]) : '';
};

// ── 홈 : 공지 · 소식 최근 글을 게시판 데이터로 채움 ─────────
function latest(key) {
  return BOARDS[key].posts.slice(0, 5).map(p =>
    `          <a class="hk_item" href="/${key}/${p.id}/"><span class="hk_tt">${esc(p.title)}${isNew(p.date) ? '<span class="hk_new">NEW</span>' : ''}</span><span class="hk_dt">${p.date.replace(/-/g, '.')}</span></a>`
  ).join('\n');
}
let w7 = W[7];
w7 = w7.replace(/(<div class="hk_panel[^"]*" data-p="0">)[\s\S]*?(\s*<a class="hk_more")/, (_, a, b) => `${a}\n${latest('notice')}${b}`);
w7 = w7.replace(/(<div class="hk_panel[^"]*" data-p="1">)[\s\S]*?(\s*<a class="hk_more")/, (_, a, b) => `${a}\n${latest('news')}${b}`);
if (w7 === W[7]) throw new Error('widget 7 latest lists not replaced');

page('/', {
  desc: DEFAULT_DESC,
  parts: [W[1], W[2], W[3], W[4], W[5], W[6], w7, W[8], W[9]],
  extraHead: `<script type="application/ld+json">${JSON.stringify(CLINIC_LD)}</script>\n`,
});

// ── 세부페이지 ───────────────────────────────────────────────
for (const p of pages) {
  page(`/${p.slug}/`, { title: p.title, desc: leadOf(p.body) || DEFAULT_DESC, parts: [W[1], W[0], p.body, W[8], W[9]] });
}

// ── 게시판 ───────────────────────────────────────────────────
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const ICON_CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5l-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.3-8.3"/></svg>';
const ICON_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';

const BOARD_JS = `<script>
(function () {
  var root = document.getElementById('hkBoard');
  if (!root || !root.querySelector('.hk_list')) return;
  var rows = [].slice.call(root.querySelectorAll('.hk_row'));
  var input = root.querySelector('.hk_search input');
  var pager = root.querySelector('.hk_pager');
  var empty = root.querySelector('.hk_empty');
  var countEl = root.querySelector('.hk_count b');
  var PER = 10, page = parseInt(new URLSearchParams(location.search).get('page'), 10) || 1;
  function render() {
    var q = (input.value || '').trim().toLowerCase();
    var hits = rows.filter(function (r) { return !q || r.getAttribute('data-q').indexOf(q) > -1; });
    var pages = Math.max(1, Math.ceil(hits.length / PER));
    if (page > pages) page = pages;
    rows.forEach(function (r) { r.hidden = true; });
    hits.slice((page - 1) * PER, page * PER).forEach(function (r) { r.hidden = false; });
    countEl.textContent = hits.length;
    empty.hidden = hits.length > 0;
    pager.innerHTML = '';
    if (pages < 2) return;
    function btn(label, p, on, dis) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      if (on) b.className = 'hk_on';
      if (dis) b.disabled = true;
      b.addEventListener('click', function () { page = p; render(); sync(); root.scrollIntoView({ behavior: 'smooth' }); });
      pager.appendChild(b);
    }
    btn('‹', page - 1, false, page === 1);
    var s = Math.max(1, Math.min(page - 2, pages - 4)), e = Math.min(pages, s + 4);
    for (var i = s; i <= e; i++) btn(String(i), i, i === page);
    btn('›', page + 1, false, page === pages);
  }
  function sync() {
    var u = new URL(location.href);
    if (page > 1) u.searchParams.set('page', page); else u.searchParams.delete('page');
    history.replaceState(null, '', u);
  }
  input.addEventListener('input', function () { page = 1; render(); sync(); });
  render();
})();
</script>`;

function heroFor(key) {
  if (!heroes[key]) throw new Error('board hero missing: ' + key);
  return heroes[key];
}

function cleanBody(body) {
  return body
    .replace(/font-family\s*:[^;"]*;?/gi, '')
    .replace(/\s(?:korean|noto|sans)=""/g, '')
    .replace(/<img /gi, '<img loading="lazy" ');
}

for (const [key, b] of Object.entries(BOARDS)) {
  const hero = heroFor(key);
  const n = b.posts.length;
  const rows = b.posts.map((p, i) => `      <li class="hk_row" data-q="${esc(p.title.toLowerCase())}"><a href="/${key}/${p.id}/"><span class="hk_no">${n - i}</span><span class="hk_tt">${esc(p.title)}${p.attach.length ? `<span class="hk_clip" title="첨부파일">${ICON_CLIP}</span>` : ''}${isNew(p.date) ? '<span class="hk_new">NEW</span>' : ''}</span><span class="hk_dt">${p.date.replace(/-/g, '.')}</span></a></li>`).join('\n');
  const list = `<section id="hkBoard" aria-label="${b.name} 목록">
  <div class="hk_wrap">
    <div class="hk_bar">
      <span class="hk_count">전체 <b>${n}</b>건</span>
      <label class="hk_search"><input type="search" placeholder="제목으로 찾기" aria-label="${b.name} 제목 검색">${ICON_SEARCH}</label>
    </div>
    <ul class="hk_list">
${rows}
    </ul>
    <p class="hk_empty" hidden>찾는 글이 없습니다.</p>
    <nav class="hk_pager" aria-label="페이지"></nav>
  </div>
</section>
${BOARD_JS}`;
  page(`/${key}/`, { title: b.name, desc: leadOf(hero), parts: [W[1], W[0], hero, list, W[8], W[9]], extraHead: SITE_CSS + '\n' });

  b.posts.forEach((p, i) => {
    const newer = b.posts[i - 1], older = b.posts[i + 1];
    const navRow = (label, q) => q ? `<a href="/${key}/${q.id}/"><em>${label}</em><span>${esc(q.title)}</span><i>${q.date.replace(/-/g, '.')}</i></a>` : '';
    const files = p.attach.length ? `<div class="hk_files"><b>첨부파일</b>${p.attach.map(a => `<a href="${esc(a.file)}" download="${esc(a.name)}">${ICON_CLIP}${esc(a.name)}</a>`).join('')}</div>` : '';
    const view = `<section id="hkBoard" aria-label="${b.name} 글보기">
  <div class="hk_wrap">
    <article class="hk_post">
      <header class="hk_phead">
        <h2>${esc(p.title)}</h2>
        <div class="hk_meta"><span>${b.name}</span><time datetime="${p.date}">${p.date.replace(/-/g, '.')}</time></div>
      </header>
      <div class="hk_body">
${cleanBody(p.body)}
      </div>
      ${files}
    </article>
    <nav class="hk_nav" aria-label="이전 · 다음 글">${navRow('다음 글', newer)}${navRow('이전 글', older)}</nav>
    <div class="hk_back"><a class="hk_btn" href="/${key}/">${ICON_LIST}목록으로</a></div>
  </div>
</section>`;
    page(`/${key}/${p.id}/`, {
      title: `${p.title} - ${b.name}`,
      desc: text(p.body) || p.title,
      parts: [W[1], W[0], hero, view, W[8], W[9]],
      extraHead: SITE_CSS + '\n',
    });
  });
}

// ── 약관 · 404 ───────────────────────────────────────────────
function docPage(url, { eyebrow, title, lead, inner, noindex, file }) {
  const block = `<div id="hkDoc">
  <section class="hk_dhero"><div class="hk_wrap">
    <span class="hk_eyebrow">${eyebrow}</span>
    <h1>${title}</h1>
    ${lead ? `<p class="hk_lead">${lead}</p>` : ''}
  </div></section>
  ${inner ? `<section class="hk_text"><div class="hk_wrap">\n${inner}\n</div></section>` : ''}
</div>`;
  page(url, { title, desc: lead || title, parts: [W[1], W[0], block, W[9]], extraHead: SITE_CSS + '\n', noindex, file });
}
docPage('/privacy/', { eyebrow: 'PRIVACY POLICY', title: '개인정보처리방침', lead: `${SITE_NAME}은 개인정보보호법 등 관련 법규에 따라 이용자의 개인정보를 보호합니다.`, inner: read(path.join(HERE, 'pages', 'privacy.body.html')) });
docPage('/terms/', { eyebrow: 'TERMS OF USE', title: '이용약관', lead: `${SITE_NAME} 홈페이지 이용에 관한 약관입니다.`, inner: read(path.join(HERE, 'pages', 'terms.body.html')) });
docPage('/404/', {
  eyebrow: '404 NOT FOUND', title: '페이지를 찾을 수 없습니다',
  lead: '주소가 바뀌었거나 없어진 페이지입니다. 아래 버튼으로 이동해 주세요.<span class="hk_btns" style="display:flex"><a class="hk_btn" href="/">홈으로</a><a class="hk_btn hk_lt" href="/schedule/">진료시간표</a><a class="hk_btn hk_lt" href="tel:051-264-9500">051-264-9500</a></span>',
  noindex: true, file: '404.html',
});

// ── 이미지 · 아이콘 ──────────────────────────────────────────
const IMG_SRC = path.join(HERE, 'images');
for (const rel of usedImages) {
  const keep = path.join(IMG_SRC, rel);
  if (!fs.existsSync(keep)) {
    const cap = path.join(CAPTURE_IMAGES, rel);
    if (!fs.existsSync(cap)) throw new Error('image not found: ' + rel);
    fs.mkdirSync(path.dirname(keep), { recursive: true });
    fs.copyFileSync(cap, keep);
  }
  fs.mkdirSync(path.dirname(path.join(OUT, 'images', rel)), { recursive: true });
  fs.copyFileSync(keep, path.join(OUT, 'images', rel));
}
fs.mkdirSync(path.join(OUT, 'board-files'), { recursive: true });
for (const f of fs.readdirSync(path.join(HERE, 'board', 'files'))) {
  fs.copyFileSync(path.join(HERE, 'board', 'files', f), path.join(OUT, 'board-files', f));
}
const icons = { 'favicon.ico': 'favicon.ico', '파비콘_192.png': 'icon-192.png', '파비콘_512.png': 'icon-512.png', '대표이미지_OG_1200x630.png': 'og-image.png' };
for (const [from, to] of Object.entries(icons)) fs.copyFileSync(path.join(D4, from), path.join(OUT, to));
write('site.webmanifest', JSON.stringify({
  name: SITE_NAME, short_name: SITE_NAME, start_url: '/', display: 'browser', theme_color: '#3FA7E6', background_color: '#ffffff',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 1));

// ── 검색엔진 ────────────────────────────────────────────────
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(u => `  <url><loc>${esc(SITE_URL + u)}</loc></url>`).join('\n')}
</urlset>
`);

console.log(`Done: ${sitemap.length} pages, ${usedImages.size} images -> ${OUT}`);
