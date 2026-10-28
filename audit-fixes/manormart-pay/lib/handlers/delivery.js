// FIXED lib/handlers/delivery.js for manormart-pay
// Fixes:
// 1. Adds brute-force rate limiting on `boyLogin` (5 wrong attempts per 15 mins)
// 2. Uses timing-safe secret comparison (`sameSecret`) instead of plain `===`
// 3. Prevents blocked delivery boys from minting new tokens at login

const crypto = require('crypto');
const {
  db,
  admin,
  cors,
  parseBody,
  requireAdmin,
  verifyFirebaseToken,
  safeError,
} = require('../common');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_IP = 5;

function ipKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'unknown';
  return 'ip_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '').trim()).digest();
  const hb = crypto.createHash('sha256').update(String(b || '').trim()).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function isRateLimited(path) {
  const cur = (await db.ref(path).once('value')).val();
  return Boolean(cur && Date.now() - cur.start <= LOGIN_WINDOW_MS && cur.fails >= LOGIN_MAX_PER_IP);
}

async function recordFail(path) {
  await db.ref(path).transaction((cur) => {
    const now = Date.now();
    if (!cur || now - cur.start > LOGIN_WINDOW_MS) return { fails: 1, start: now };
    return { fails: (cur.fails || 0) + 1, start: cur.start };
  });
}

async function requireDeliveryBoy(req, res, boyId) {
  const decoded = await verifyFirebaseToken(req);
  if (!decoded) {
    res.status(401).json({ error: 'Delivery partner authentication required.' });
    return null;
  }
  const allowed = decoded.admin === true || (decoded.deliveryBoy === true && decoded.boyKey === boyId);
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden.' });
    return null;
  }
  return decoded;
}

async function deliveryAreas(req, res) {
  cors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') return res.status(200).json((await db.ref('deliveryAreas').once('value')).val() || {});
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!await requireAdmin(req, res)) return;
    const { action, areaId, areaData } = parseBody(req);
    const cleanId = String(areaId || '').replace(/[.#$\[\]/]/g, '');
    if (action === 'saveArea' && cleanId && areaData && typeof areaData === 'object') {
      await db.ref(`deliveryAreas/${cleanId}`).set(areaData);
      return res.status(200).json({ success: true });
    }
    if (action === 'deleteArea' && cleanId) {
      await db.ref(`deliveryAreas/${cleanId}`).remove();
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid action.' });
  } catch (e) {
    return safeError(res, 500, 'Delivery-area operation failed.', e);
  }
}

async function deliveryPartners(req, res) {
  cors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      if (!await requireAdmin(req, res)) return;
      const boys = (await db.ref('deliveryBoys').once('value')).val() || {};
      const out = {};
      for (const [k, v] of Object.entries(boys)) {
        const { secretCode, ...safe } = v || {};
        out[k] = safe;
      }
      return res.status(200).json(out);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action, boyId, phone, secretCode, pushToken, boyData } = parseBody(req);

    if (action === 'boyLogin') {
      if (!phone || !secretCode) return res.status(400).json({ error: 'Phone and secret code required' });
      const cleanPh = String(phone).replace(/[^0-9]/g, '').trim();
      const ratePath = `rateLimits/boyLogin/${cleanPh}_${ipKey(req)}`;
      if (await isRateLimited(ratePath)) {
        return res.status(429).json({ error: 'Too many wrong attempts. Please wait 15 minutes and try again.' });
      }

      const boys = (await db.ref('deliveryBoys').once('value')).val() || {};
      const pair = Object.entries(boys).find(
        ([, b]) =>
          String(b?.phone || '').replace(/[^0-9]/g, '').trim() === cleanPh &&
          b?.secretCode &&
          sameSecret(b.secretCode, secretCode)
      );
      if (!pair) {
        await recordFail(ratePath);
        return res.status(401).json({ error: 'Invalid phone number or secret code' });
      }

      const [key, boy] = pair;
      if (boy.status === 'Blocked') {
        return res.status(403).json({ error: 'Your delivery account has been blocked by the admin.' });
      }

      await db.ref(ratePath).remove().catch(() => {});
      const { secretCode: _, ...safeBoyData } = boy;

      if (!process.env.FIREBASE_WEB_API_KEY) {
        return res.status(500).json({ error: 'Server is not configured yet.' });
      }

      const uid = `delivery-${key}`;
      const claims = { deliveryBoy: true, boyKey: key, boyName: String(boy.name || ''), boyPhone: cleanPh };
      let idToken = null, refreshToken = null;
      try {
        try {
          await admin.auth().setCustomUserClaims(uid, claims);
        } catch (claimErr) {
          if (claimErr.code === 'auth/user-not-found') {
            await admin.auth().createUser({ uid });
            await admin.auth().setCustomUserClaims(uid, claims);
          } else {
            throw claimErr;
          }
        }
        const customToken = await admin.auth().createCustomToken(uid, claims);
        const r = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.FIREBASE_WEB_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
          }
        );
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.idToken) {
          idToken = d.idToken;
          refreshToken = d.refreshToken || null;
        }
      } catch (e) {
        console.error('deliveryPartners: delivery token error', e);
      }

      if (!idToken) return res.status(500).json({ error: 'Login service error. Please try again.' });
      return res.status(200).json({ success: true, boyKey: key, boy: safeBoyData, idToken, refreshToken });
    }

    if (action === 'updateBoyPushToken' && boyId && pushToken) {
      const cleanBoyId = String(boyId).replace(/[.#$\[\]/]/g, '');
      const decoded = await requireDeliveryBoy(req, res, cleanBoyId);
      if (!decoded) return;
      await db.ref(`deliveryBoys/${cleanBoyId}/pushToken`).set(String(pushToken).slice(0, 4096));
      return res.status(200).json({ success: true });
    }

    if (!await requireAdmin(req, res)) return;
    const cleanBoyId = String(boyId || '').replace(/[.#$\[\]/]/g, '');
    if (action === 'saveBoy' && cleanBoyId && boyData && typeof boyData === 'object') {
      await db.ref(`deliveryBoys/${cleanBoyId}`).update(boyData);
      return res.status(200).json({ success: true });
    }
    if (action === 'deleteBoy' && cleanBoyId) {
      await db.ref(`deliveryBoys/${cleanBoyId}`).remove();
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid action or missing parameters' });
  } catch (e) {
    return safeError(res, 500, 'Delivery-partner operation failed.', e);
  }
}

module.exports = { deliveryAreas, deliveryPartners };
