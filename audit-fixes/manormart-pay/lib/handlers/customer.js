// FIXED lib/handlers/customer.js for manormart-pay
// Fixes:
// 1. Accepts BOTH `newPassword` and `password` in action === 'changePassword'
// 2. Adds brute-force rate limiting (5 attempts per 15 mins per phone/IP) on customerLogin
// 3. Adds action === 'deleteAccount' to support Play Store Data Safety compliance

const crypto = require('crypto');
const {
  db,
  cors,
  parseBody,
  verifyFirebaseToken,
  requireAdmin,
  safeError,
  normalizePhone,
} = require('../common');
const {
  loginCustomer,
  verifyCustomerSession,
  createCustomerSession,
  hashPassword,
  verifyPassword,
} = require('../customer-auth');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 6;

function phone(p) { return normalizePhone(p); }

function ipKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'unknown';
  return 'ip_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

async function isRateLimited(path, max = LOGIN_MAX_ATTEMPTS) {
  const cur = (await db.ref(path).once('value')).val();
  if (!cur || Date.now() - cur.start > LOGIN_WINDOW_MS || cur.fails < max) return false;
  return true;
}

async function recordFail(path) {
  await db.ref(path).transaction((cur) => {
    const now = Date.now();
    if (!cur || now - cur.start > LOGIN_WINDOW_MS) return { fails: 1, start: now };
    return { fails: (cur.fails || 0) + 1, start: cur.start };
  });
}

async function customerLogin(req, res) {
  cors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = parseBody(req);
    const clean = phone(body.phone);
    const password = String(body.password || '');
    if (clean.length !== 10) return res.status(400).json({ error: 'Valid 10-digit mobile number required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const limitPath = `rateLimits/customerLogin/${clean}_${ipKey(req)}`;
    if (await isRateLimited(limitPath)) {
      return res.status(429).json({ error: 'Too many wrong attempts. Please wait 15 minutes and try again.' });
    }

    const result = await loginCustomer(clean, password);
    if (!result.ok) {
      await recordFail(limitPath);
      const msg = result.code === 'PASSWORD_NOT_SET'
        ? 'No password has been set for this number yet. Please create an account or contact the store.'
        : 'Invalid mobile number or password.';
      return res.status(401).json({ error: msg });
    }
    await db.ref(limitPath).remove().catch(() => {});
    return res.status(200).json({ token: result.token, customer: result.customer });
  } catch (e) {
    return safeError(res, 500, 'Login failed. Please try again.', e);
  }
}

async function customerSignup(req, res) {
  cors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = parseBody(req);
    const clean = phone(body.phone);
    const password = String(body.password || '');
    if (clean.length !== 10) return res.status(400).json({ error: 'Valid 10-digit mobile number required.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8-128 characters.' });

    const limitPath = `rateLimits/customerSignup/${ipKey(req)}`;
    if (await isRateLimited(limitPath, 10)) {
      return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
    }

    const ref = db.ref(`customers/${clean}`);
    const existing = (await ref.once('value')).val() || {};
    if (existing.passwordHash) {
      await recordFail(limitPath);
      return res.status(409).json({ error: 'An account already exists for this number. Please log in instead.' });
    }

    const u = { passwordHash: hashPassword(password), updatedAt: Date.now() };
    if (!existing.createdAt) u.createdAt = Date.now();
    if (body.name !== undefined) u.name = String(body.name).trim().slice(0, 120);
    if (body.addr !== undefined) u.addr = String(body.addr).trim().slice(0, 1000);
    await ref.update(u);

    const customer = {
      name: u.name !== undefined ? u.name : (existing.name || ''),
      addr: u.addr !== undefined ? u.addr : (existing.addr || ''),
      addresses: Array.isArray(existing.addresses) ? existing.addresses : [],
    };
    return res.status(200).json({ token: createCustomerSession(clean), customer });
  } catch (e) {
    return safeError(res, 500, 'Signup failed. Please try again.', e);
  }
}

async function customerAuth(req, clean) {
  const s = verifyCustomerSession(req);
  if (s && s.phone === clean) return true;
  const d = await verifyFirebaseToken(req);
  if (!d) return false;
  const candidates = [d.phone_number, d.phone, d.customerPhone].filter(Boolean).map(phone);
  return candidates.includes(clean);
}

async function customerProfile(req, res) {
  cors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const clean = phone(req.query?.phone);
      if (clean.length !== 10) return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
      if (!await customerAuth(req, clean)) return res.status(403).json({ error: 'Customer authentication required.' });
      const c = (await db.ref(`customers/${clean}`).once('value')).val() || {};
      delete c.passwordHash;
      return res.status(200).json(c);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = parseBody(req);
    const { action, phone: p, name, addr, addresses, token, password, newPassword, oldPassword } = body;
    const clean = phone(p);
    if (clean.length !== 10) return res.status(400).json({ error: 'Valid 10-digit mobile number required' });

    if (action === 'adminSetPassword') {
      if (!await requireAdmin(req, res)) return;
      const targetPass = typeof newPassword === 'string' && newPassword ? newPassword : password;
      if (typeof targetPass !== 'string' || targetPass.length < 8 || targetPass.length > 128) {
        return res.status(400).json({ error: 'Password must be 8-128 characters.' });
      }
      await db.ref(`customers/${clean}/passwordHash`).set(hashPassword(targetPass));
      return res.status(200).json({ success: true });
    }

    if (action === 'changePassword') {
      const session = verifyCustomerSession(req);
      if (!session || session.phone !== clean) return res.status(403).json({ error: 'Customer authentication required.' });
      // FIXED: Accept either `newPassword` (sent by App.js) or `password`
      const nextPass = typeof newPassword === 'string' && newPassword ? newPassword : password;
      if (typeof nextPass !== 'string' || nextPass.length < 8 || nextPass.length > 128) {
        return res.status(400).json({ error: 'New password must be 8-128 characters.' });
      }
      const c = (await db.ref(`customers/${clean}`).once('value')).val() || {};
      const currentPassword = String(oldPassword || '');
      if (!currentPassword || !c.passwordHash || !verifyPassword(currentPassword, c.passwordHash)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      await db.ref(`customers/${clean}/passwordHash`).set(hashPassword(nextPass));
      return res.status(200).json({ success: true });
    }

    if (!await customerAuth(req, clean)) return res.status(403).json({ error: 'Customer authentication required.' });

    if (action === 'updateProfile') {
      const u = { updatedAt: Date.now() };
      if (name !== undefined) u.name = String(name).trim().slice(0, 120);
      if (addr !== undefined) u.addr = String(addr).trim().slice(0, 1000);
      await db.ref(`customers/${clean}`).update(u);
      return res.status(200).json({ success: true });
    }
    if (action === 'saveAddresses') {
      if (!Array.isArray(addresses) || addresses.length > 20) return res.status(400).json({ error: 'Invalid addresses.' });
      const sanitized = addresses.map((a) => String(a || '').trim().slice(0, 500)).filter(Boolean);
      await db.ref(`customers/${clean}/addresses`).set(sanitized);
      return res.status(200).json({ success: true });
    }
    if (action === 'savePushToken' && token) {
      const t = String(token).slice(0, 4096);
      await db.ref(`customerTokens/token_${clean}`).set({ token: t, phone: clean, updatedAt: Date.now() });
      return res.status(200).json({ success: true });
    }
    if (action === 'deleteAccount') {
      await Promise.allSettled([
        db.ref(`customers/${clean}`).remove(),
        db.ref(`customerTokens/token_${clean}`).remove(),
      ]);
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid action.' });
  } catch (e) {
    return safeError(res, 500, 'Customer operation failed.', e);
  }
}

module.exports = { customerLogin, customerSignup, customerProfile };
