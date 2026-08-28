// Portal access gate.
// Runs before static file serving, so every asset is covered, not just routes.
import { next } from '@vercel/functions';

const COOKIE = '__nf_gate';
const LOGIN_PATH = '/__gate';
const TTL_SEC = 60 * 60 * 24 * 30;
const enc = new TextEncoder();

const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function sign(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}

// Compare digests rather than raw secrets so length and content do not leak via timing.
async function safeEqual(a, b) {
  const salt = crypto.randomUUID();
  return (await sign(salt, String(a))) === (await sign(salt, String(b)));
}

async function mintToken(password) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  return `${exp}.${await sign(password, `v1:${exp}`)}`;
}

async function tokenValid(token, password) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const idx = token.indexOf('.');
  const exp = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, await sign(password, `v1:${exp}`));
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// Only same-origin absolute paths, so the gate cannot be used as an open redirect.
function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loginPage({ title, dest, error }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fbfbfa;--fg:#1a1a19;--mut:#6b6b68;--line:#e3e3e0;--card:#fff;--accent:#2f6f5e}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ededeb;--mut:#9a9a96;--line:#2c2c2a;--card:#1c1c1b}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px}
.card{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
h1{margin:0 0 6px;font-size:17px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 20px;color:var(--mut);font-size:13.5px}
label{display:block;font-size:12.5px;font-weight:500;margin-bottom:6px}
input{width:100%;padding:9px 11px;font-size:14px;border:1px solid var(--line);border-radius:7px;
background:var(--bg);color:var(--fg)}
input:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
button{width:100%;margin-top:14px;padding:9px;font-size:14px;font-weight:500;border:0;border-radius:7px;
background:var(--accent);color:#fff;cursor:pointer}
button:hover{filter:brightness(1.08)}
.err{margin-top:12px;font-size:13px;color:#c0392b}
@media(prefers-color-scheme:dark){.err{color:#f08a7e}}
</style></head><body>
<form class="card" method="POST" action="${esc(LOGIN_PATH)}">
<h1>${esc(title)}</h1>
<p>This portal is private. Enter the access password you were sent.</p>
<input type="hidden" name="next" value="${esc(dest)}">
<label for="p">Password</label>
<input id="p" name="p" type="password" autocomplete="current-password" autofocus required>
<button type="submit">View portal</button>
${error ? `<div class="err">${esc(error)}</div>` : ''}
</form></body></html>`;
}

const GATE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow',
};

export default async function middleware(request) {
  const password = process.env.GATE_PASSWORD;
  const title = process.env.GATE_TITLE || 'Portal access';

  // Fail closed: a missing password locks the portal instead of opening it.
  if (!password) {
    return new Response('Portal access is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const url = new URL(request.url);

  if (url.pathname === LOGIN_PATH && request.method === 'POST') {
    const form = await request.formData();
    const dest = safeNext(form.get('next'));
    if (await safeEqual(form.get('p') ?? '', password)) {
      const token = await mintToken(password);
      return new Response(null, {
        status: 303,
        headers: {
          location: dest,
          'cache-control': 'no-store',
          'set-cookie': `${COOKIE}=${token}; Path=/; Max-Age=${TTL_SEC}; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    return new Response(loginPage({ title, dest, error: 'Incorrect password.' }), {
      status: 401, headers: GATE_HEADERS,
    });
  }

  if (await tokenValid(readCookie(request, COOKIE), password)) {
    return next({ headers: { 'x-robots-tag': 'noindex, nofollow' } });
  }

  return new Response(loginPage({ title, dest: url.pathname + url.search, error: null }), {
    status: 401, headers: GATE_HEADERS,
  });
}
