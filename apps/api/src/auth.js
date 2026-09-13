import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const hash = value => createHash('sha256').update(value).digest('hex');
const cookieName = 'orlast_session';
export const publicUser = user => ({ id: user.id, name: user.name, email: user.email });
export const emailValue = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${(await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 })).toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const actual = await passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
export function cookieToken(req) {
  return req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
export function cookieOptions(production) {
  return { httpOnly: true, sameSite: 'lax', secure: production, path: '/api', maxAge: 30 * 86400000 };
}
export async function currentUser(db, req) {
  const token = cookieToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await db.query('SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [hash(token)]);
  return rows[0] || null;
}
export async function issueSession(db, req, res, user, production) {
  const token = randomBytes(32).toString('hex');
  const previous = cookieToken(req);
  if (previous) await db.query('DELETE FROM sessions WHERE token_hash=$1', [hash(previous)]);
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", [hash(token), user.id]);
  res.cookie(cookieName, token, cookieOptions(production));
}
export function registerAuth(app, { db, production, limiter }) {
  app.get('/api/auth/me', async (req, res) => res.json({ user: await currentUser(db, req) }));
  app.post('/api/auth/signup', limiter, async (req, res) => {
    const email = emailValue(req.body?.email);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const password = req.body?.password;
    if (!email || name.length < 2 || name.length > 80 || typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Enter your name, a valid email, and a password of 12–128 characters.' });
    let user;
    try {
      ({ rows: [user] } = await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email', [randomUUID(), name, email, await passwordHash(password)]));
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
      throw error;
    }
    await issueSession(db, req, res, user, production);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', limiter, async (req, res) => {
    const email = emailValue(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || password.length > 128) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const { rows: [user] } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    const stored = user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const matched = await passwordMatches(password, stored);
    if (!user || !matched) return res.status(401).json({ error: 'That email and password do not match. Please try again.' });
    await issueSession(db, req, res, user, production);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const token = cookieToken(req);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)]);
    const { maxAge, ...options } = cookieOptions(production);
    res.clearCookie(cookieName, options).json({ ok: true });
  });
}
