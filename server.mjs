import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MATRIX_SERVER = process.env.MATRIX_SERVER || 'https://matrix.greact.online';
const MATRIX_SPACE_ID = process.env.MATRIX_SPACE_ID;
const REGISTRATION_TOKEN = process.env.REGISTRATION_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const PORT = parseInt(process.env.PORT || '3000', 10);

const sessions = new Map();
const host = new URL(MATRIX_SERVER).hostname;
const qrLink = `https://mobile.element.io/element?account_provider=${host}`;
let qrBuffer = null;

async function getQrBuffer() {
  if (!qrBuffer) qrBuffer = await QRCode.toBuffer(qrLink, { type: 'png' });
  return qrBuffer;
}

function getBearerToken(request) {
  const auth = request.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

function checkAuth(request, reply) {
  const sid = getBearerToken(request);
  if (!sid || !sessions.has(sid)) {
    reply.status(401).send({ errcode: 'M_UNAUTHORIZED', error: 'Login required' });
    return false;
  }
  return true;
}

const app = Fastify();
await app.register(fastifyStatic, { root: join(__dirname, 'public'), index: 'index.html' });

app.get('/api/config', async () => ({ host }));

app.post('/api/login', async (request, reply) => {
  const { secret } = request.body || {};
  if (secret !== ADMIN_SECRET) {
    return reply.status(401).send({ errcode: 'M_FORBIDDEN', error: 'Invalid secret' });
  }
  const sid = randomBytes(32).toString('hex');
  sessions.set(sid, true);
  return { ok: true, token: sid };
});

app.get('/api/generate-password', async (request, reply) => {
  if (!checkAuth(request, reply)) return reply;
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const password = Array.from(randomBytes(6), (b) => chars[b % chars.length]).join('');
  return { password };
});

app.post('/api/register', async (request, reply) => {
  if (!checkAuth(request, reply)) return reply;
  const { username, password } = request.body || {};
  if (!username || !password) {
    return reply.status(400).send({ errcode: 'M_MISSING_PARAM', error: 'username and password required' });
  }
  if (!/^[a-z0-9._=-]+$/i.test(username)) {
    return reply.status(400).send({ errcode: 'M_INVALID_USERNAME', error: 'Invalid username' });
  }
  if (!REGISTRATION_TOKEN) {
    return reply.status(500).send({ errcode: 'M_UNKNOWN', error: 'REGISTRATION_TOKEN not configured' });
  }

  const url = `${MATRIX_SERVER.replace(/\/$/, '')}/_matrix/client/v3/register`;
  const res1 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const data1 = await res1.json();
  const session = data1.session;
  if (!session) {
    return reply.status(res1.status).send(data1);
  }

  const body = JSON.stringify({
    username,
    password,
    auth: { type: 'm.login.registration_token', token: REGISTRATION_TOKEN, session },
  });
  const res2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const data2 = await res2.json();
  if (!res2.ok) {
    return reply.status(res2.status).send(data2);
  }

  if (MATRIX_SPACE_ID && data2.access_token) {
    await fetch(
      `${MATRIX_SERVER.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(MATRIX_SPACE_ID)}/join`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data2.access_token}`,
        },
        body: '{}',
      }
    );
  }

  return data2;
});

app.get('/api/qr', async (request, reply) => {
  if (!checkAuth(request, reply)) return reply;
  const buf = await getQrBuffer();
  reply.header('Content-Type', 'image/png');
  return buf;
});

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  console.log(`Matrix Admin Panel: http://localhost:${PORT}`);
});
