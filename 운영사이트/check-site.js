// site/ 점검 : 옛 서버 주소가 남았는지, 사이트 안 링크·그림이 실제 파일로 이어지는지 확인합니다.
// 실행: node 운영사이트/check-site.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(path.dirname(__dirname), 'site');

const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    if (fs.statSync(f).isDirectory()) walk(f); else files.push(f);
  }
})(OUT);

const exists = url => {
  const p = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (p === '/' || p === '') return true;
  const f = path.join(OUT, p);
  return (p.endsWith('/') ? fs.existsSync(path.join(f, 'index.html')) : fs.existsSync(f));
};

const problems = {};
const add = (k, v) => ((problems[k] = problems[k] || new Set()).add(v));
for (const f of files.filter(f => f.endsWith('.html'))) {
  const h = fs.readFileSync(f, 'utf8');
  const rel = '/' + path.relative(OUT, f).replace(/\\/g, '/');
  for (const m of h.matchAll(/(?:happykiz\.kr|fxfile\.drline\.net)[^"'\s)]*/g)) add('old server url', `${rel}: ${m[0].slice(0, 90)}`);
  for (const m of h.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (m[1].startsWith('//')) continue;
    if (!exists(m[1])) add('broken internal link', `${rel}: ${m[1]}`);
  }
  for (const m of h.matchAll(/url\((['"]?)(\/[^'")]+)\1\)/g)) if (!exists(m[2])) add('broken css url', `${rel}: ${m[2]}`);
}
let bad = 0;
for (const [k, s] of Object.entries(problems)) {
  bad += s.size;
  console.log(`\n[${k}] ${s.size}`);
  [...s].slice(0, 15).forEach(x => console.log('  ' + x));
}
console.log(bad ? `\n${bad} problems` : 'OK: no problems');
