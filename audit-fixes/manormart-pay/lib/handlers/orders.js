// FIXED lib/handlers/orders.js for manormart-pay
// Fixes:
// 1. Server-side validation of `storeOpen !== false` and geofence radius (`radiusKm`) in createOrder
// 2. Scoped delivery-boy endpoints (`GET ?boyKey=...` & `POST action=boyUpdateOrder`) so delivery boys
//    only access and update their own assigned orders instead of downloading the entire orders DB!

const {
  db,
  cors,
  parseBody,
  requireAdmin,
  verifyFirebaseToken,
  requireCustomerForPhone,
  isValidOrderId,
  computeServerTotal,
  safeError,
} = require('../common');
const { verifyCustomerSession } = require('../customer-auth');
const crypto = require('crypto');

function newId() { return `ord_${Date.now()}_${crypto.randomInt(0, 1000)}`; }
function cleanPhone(p) { return String(p || '').replace(/[^0-9]/g, '').trim(); }
async function isAdminToken(req) { const d = await verifyFirebaseToken(req); return !!(d && d.admin === true); }

function calcDistanceKm(lat1, lng1, lat2, lng2) {
  const cLat = Number(lat1), cLng = Number(lng1), hLat = Number(lat2), hLng = Number(lng2);
  if (!Number.isFinite(cLat) || !Number.isFinite(cLng) || !Number.isFinite(hLat) || !Number.isFinite(hLng)) return 0;
  const R = 6371;
  const dLat = (cLat - hLat) * (Math.PI / 180);
  const dLon = (cLng - hLng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(hLat * (Math.PI / 180)) * Math.cos(cLat * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

async function ordersManager(req, res) {
  cors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { phone, orderId } = req.query || {};
      const decodedToken = await verifyFirebaseToken(req);
      if (decodedToken && decodedToken.admin === true) {
        if (orderId) {
          if (!isValidOrderId(String(orderId))) return res.status(400).json({ error: 'Invalid order id.' });
          return res.status(200).json((await db.ref(`orders/${orderId}`).once('value')).val() || {});
        }
        return res.status(200).json((await db.ref('orders').once('value')).val() || {});
      }

      // Support Delivery Boy scoped order reads (returns ONLY orders assigned to this delivery partner)
      if (decodedToken && decodedToken.deliveryBoy === true) {
        const boySnap = await db.ref(`deliveryBoys/${decodedToken.boyKey}`).once('value');
        const boy = boySnap.val() || {};
        if (boy.status === 'Blocked') return res.status(403).json({ error: 'Account blocked.' });
        const allOrders = (await db.ref('orders').once('value')).val() || {};
        const filtered = {};
        const boyName = String(boy.name || decodedToken.boyName || '').trim();
        const boyPhone = cleanPhone(boy.phone || decodedToken.boyPhone || '');
        for (const [k, ord] of Object.entries(allOrders)) {
          if (!ord) continue;
          const matchesName = boyName && ord.assignedBoy === boyName;
          const matchesPhone = boyPhone && (cleanPhone(ord.deliveryBoyPhone) === boyPhone || cleanPhone(ord.assignedBoyPhone) === boyPhone);
          if (matchesName || matchesPhone) filtered[k] = ord;
        }
        return res.status(200).json(filtered);
      }

      const session = verifyCustomerSession(req);
      const decoded = session || decodedToken;
      if (!decoded) return res.status(401).json({ error: 'Customer authentication required.' });
      const ownPhones = session ? [session.phone] : [decoded.phone_number, decoded.phone, decoded.customerPhone].filter(Boolean).map(cleanPhone);

      if (phone) {
        const p = cleanPhone(phone);
        if (p.length !== 10) return res.status(400).json({ error: 'Valid mobile number required' });
        if (!ownPhones.includes(p)) return res.status(403).json({ error: 'You can only access your own orders.' });
        const snap = await db.ref('orders').orderByChild('phone').equalTo(p).once('value');
        return res.status(200).json(snap.val() || {});
      }
      if (orderId) {
        if (!isValidOrderId(String(orderId))) return res.status(400).json({ error: 'Invalid order id.' });
        const order = (await db.ref(`orders/${orderId}`).once('value')).val() || {};
        if (!ownPhones.includes(cleanPhone(order.phone))) return res.status(403).json({ error: 'You can only access your own order.' });
        return res.status(200).json(order);
      }
      return res.status(400).json({ error: 'Phone or orderId required.' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action, orderId, orderData, status, assignedBoy, boyPhone } = parseBody(req);

    if (action === 'cancelCustomerOrder') {
      const id = String(orderId || '');
      if (!isValidOrderId(id)) return res.status(400).json({ error: 'Invalid order id.' });
      const session = verifyCustomerSession(req);
      if (!session) return res.status(401).json({ error: 'Customer authentication required.' });
      const ref = db.ref(`orders/${id}`);
      const snap = await ref.once('value');
      const cur = snap.val();
      if (!cur || cleanPhone(cur.phone) !== session.phone) return res.status(403).json({ error: 'You can only cancel your own order.' });
      const st = String(cur.deliveryStatus || '');
      if (st === 'Delivered' || st === 'Out for Delivery' || st.includes('Cancelled')) {
        return res.status(409).json({ error: 'This order can no longer be cancelled.' });
      }
      const next = cur.payment === 'Online' && cur.paymentVerified === true
        ? '❌ Cancelled (Paid - Refundable)'
        : (cur.payment === 'Online' ? '❌ Cancelled (Unpaid)' : '❌ Order Cancelled (COD)');
      await ref.update({
        deliveryStatus: next,
        cancelledAt: Date.now(),
        updatedAt: Date.now(),
        ...(cur.payment === 'Online' && cur.paymentVerified === true ? { needsRefund: true } : {}),
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'createOrder' && orderData) {
      const id = isValidOrderId(String(orderData.id || '')) ? String(orderData.id) : newId();
      const secure = { ...orderData, id, timestamp: Date.now(), deliveryStatus: 'Pending' };
      if (!await requireCustomerForPhone(req, res, cleanPhone(secure.phone))) return;

      // Server-side storeOpen & geofence verification
      const storeSettings = (await db.ref('settings').once('value')).val() || {};
      if (storeSettings.storeOpen === false) {
        return res.status(403).json({ error: 'Store is currently closed. New orders are temporarily suspended.' });
      }
      const radiusKm = Number(storeSettings.radiusKm || 0);
      if (radiusKm > 0 && secure.lat && secure.lng && storeSettings.hubLat && storeSettings.hubLng) {
        const dist = calcDistanceKm(secure.lat, secure.lng, storeSettings.hubLat, storeSettings.hubLng);
        secure.distance = dist;
        if (dist > radiusKm) {
          return res.status(400).json({ error: `Out of delivery range (${dist} KM > ${radiusKm} KM limit).` });
        }
      }

      delete secure.paymentVerified;
      delete secure.razorpayPaymentId;
      delete secure.rzpOrderId;
      delete secure.serverTotal;
      delete secure.subtotal;
      delete secure.serverDeliveryFee;
      delete secure.paidAmount;
      delete secure.paidAt;
      delete secure.needsRefund;
      delete secure.duplicatePaymentId;
      delete secure.totalMismatch;

      if (!secure.name || !cleanPhone(secure.phone) || cleanPhone(secure.phone).length !== 10) {
        return res.status(400).json({ error: 'Valid customer details required.' });
      }
      const calc = await computeServerTotal(secure);
      if (Number(storeSettings.minOrd || 0) > 0 && calc.subtotal < Number(storeSettings.minOrd)) {
        return res.status(400).json({ error: `Minimum order amount is ₹${storeSettings.minOrd}.` });
      }
      secure.serverTotal = calc.total;
      secure.subtotal = calc.subtotal;
      secure.serverDeliveryFee = calc.deliveryFee;
      secure.totalMismatch = Math.abs(calc.total - Number(secure.total || 0)) > 0.5;
      secure.total = calc.total;
      if (secure.payment === 'Online') {
        secure.paymentVerified = false;
        secure.deliveryStatus = 'Payment Pending';
      }
      await db.ref(`orders/${id}`).set(secure);
      await db.ref('admin_ring').set(true);
      return res.status(200).json({ success: true, orderId: id, order: secure });
    }

    // Delivery boy status update (only allows 'Out for Delivery' or 'Delivered' on their own assigned order)
    if (action === 'boyUpdateOrder') {
      const id = String(orderId || '');
      if (!isValidOrderId(id)) return res.status(400).json({ error: 'Invalid order id.' });
      const decoded = await verifyFirebaseToken(req);
      if (!decoded || decoded.deliveryBoy !== true) return res.status(401).json({ error: 'Delivery authentication required.' });
      if (status !== 'Out for Delivery' && status !== 'Delivered') {
        return res.status(400).json({ error: 'Invalid status transition for delivery partner.' });
      }
      const ordSnap = await db.ref(`orders/${id}`).once('value');
      const ord = ordSnap.val();
      if (!ord) return res.status(404).json({ error: 'Order not found.' });
      if (status === 'Delivered' && ord.payment === 'Online' && ord.paymentVerified !== true && !ord.razorpayPaymentId) {
        return res.status(400).json({ error: 'Online payment is not verified yet.' });
      }
      const patch = {
        deliveryStatus: status,
        updatedAt: Date.now(),
        ...(status === 'Out for Delivery' ? { outForDeliveryAt: Date.now() } : { deliveredAt: Date.now() }),
      };
      await db.ref(`orders/${id}`).update(patch);
      return res.status(200).json({ success: true });
    }

    if (!await requireAdmin(req, res)) return;
    if (!orderId || !isValidOrderId(String(orderId))) return res.status(400).json({ error: 'Invalid order id.' });
    if (action === 'updateStatus' && status) {
      await db.ref(`orders/${orderId}`).update({ deliveryStatus: String(status).slice(0, 100), updatedAt: Date.now() });
      return res.status(200).json({ success: true });
    }
    if (action === 'assignBoy') {
      await db.ref(`orders/${orderId}`).update({
        assignedBoy: String(assignedBoy || '').slice(0, 120),
        deliveryBoyPhone: cleanPhone(boyPhone),
        updatedAt: Date.now(),
      });
      return res.status(200).json({ success: true });
    }
    if (action === 'cancelOrder') {
      await db.ref(`orders/${orderId}`).update({ deliveryStatus: 'Cancelled', cancelledAt: Date.now() });
      return res.status(200).json({ success: true });
    }
    if (action === 'deleteOrder') {
      await db.ref(`orders/${orderId}`).remove();
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid action or missing parameters' });
  } catch (e) {
    if (e.userFacing) return res.status(400).json({ error: e.message });
    return safeError(res, 500, 'Order processing failed.', e);
  }
}

module.exports = { ordersManager };
