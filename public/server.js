// Golf Creator - servidor sin dependencias (solo Node 18+). Guarda niveles y rankings en data.json
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const DB = process.env.DB_FILE || path.join(__dirname, 'data.json');
const PUB = path.join(__dirname, 'public');
let db = { levels: {}, scores: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
let dirty = false;
const save = () => { dirty = true; };
setInterval(() => { if (dirty) { dirty = false; fs.writeFile(DB, JSON.stringify(db), () => {}); } }, 2000);
process.on('SIGINT', () => { fs.writeFileSync(DB, JSON.stringify(db)); process.exit(); });

const ID = /^[0-9A-Z]{6}$/;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const hits = {};
function limited(ip) { // 120 peticiones por minuto y por IP
  const m = Math.floor(Date.now() / 60000), k = ip + '|' + m;
  hits[k] = (hits[k] || 0) + 1;
  if (Math.random() < 0.01) for (const x in hits) if (!x.endsWith('|' + m)) delete hits[x];
  return hits[k] > 120;
}

function api(req, res, p, u, j) {
  const m = p.split('/').filter(Boolean); // ['api','levels',id,'play']
  if (m[1] === 'levels') {
    if (req.method === 'GET' && !m[2]) {
      const q = (u.searchParams.get('q') || '').toLowerCase(), s = u.searchParams.get('sort');
      const a = Object.values(db.levels).filter(l => !q || l.id.toLowerCase() === q || l.n.toLowerCase().includes(q) || l.a.toLowerCase().includes(q));
      a.sort((x, y) => s === 'r' ? y.ts - x.ts : y.plays - x.plays);
      return send(res, 200, a.slice(0, 200));
    }
    if (req.method === 'GET') return db.levels[m[2]] ? send(res, 200, db.levels[m[2]]) : send(res, 404, { error: 'no existe' });
    if (req.method === 'POST' && !m[2]) {
      if (!ID.test(j.id) || typeof j.d !== 'string' || j.d.length > 20000) return send(res, 400, { error: 'nivel no valido' });
      if (!db.levels[j.id]) db.levels[j.id] = { id: j.id, n: clean(j.n, 30) || 'Sin titulo', a: clean(j.a, 16) || 'Anonimo', d: j.d, plays: 0, ts: Date.now() };
      save(); return send(res, 200, { ok: 1 });
    }
    if (req.method === 'POST' && m[3] === 'play') {
      const l = db.levels[m[2]]; if (l) { l.plays++; save(); }
      return send(res, 200, { ok: 1 });
    }
  }
  if (m[1] === 'scores' && ID.test(m[2] || '')) {
    const a = db.scores[m[2]] = db.scores[m[2]] || [];
    if (req.method === 'GET') return send(res, 200, a.slice().sort((x, y) => x.s - y.s || x.t - y.t).slice(0, 200));
    if (req.method === 'POST') {
      const s = +j.s, t = +j.t;
      if (!(s >= 1 && s <= 200 && t >= 0.5 && t <= 36000)) return send(res, 400, { error: 'resultado no valido' });
      a.push({ n: clean(j.n, 16) || 'Anonimo', s, t: Math.round(t * 10) / 10, ts: Date.now() });
      a.sort((x, y) => x.s - y.s || x.t - y.t); a.length = Math.min(a.length, 500);
      save(); return send(res, 200, { ok: 1 });
    }
  }
  send(res, 404, { error: 'no encontrado' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p.startsWith('/api/')) {
    if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'demasiadas peticiones' });
    let b = ''; req.on('data', d => { b += d; if (b.length > 40000) req.destroy(); });
    req.on('end', () => { let j = {}; try { j = b ? JSON.parse(b) : {}; } catch (e) { return send(res, 400, { error: 'json' }); } api(req, res, p, u, j); });
    return;
  }
  const f = path.join(PUB, path.normalize(p === '/' ? '/index.html' : p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, data) => {
    if (e) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(PORT, () => console.log('Golf Creator en http://localhost:' + PORT));
