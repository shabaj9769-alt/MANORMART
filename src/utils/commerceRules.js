// Pure business logic, security validations, geofencing, and cart calculations
// Shared across App.js (React Native / Web) and unit tests.

export const TRUSTED_PAY_HOST = 'https://shabaj9769-alt.github.io/';
export const ORDER_ID_REGEX = /^ord_\d{10,16}_\d{1,3}$/;
export const PHONE_REGEX = /^[6-9]\d{9}$/;

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function sanitizeInput(str) {
  return String(str || '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
}

export function cleanPhoneNumber(phone) {
  return String(phone || '').replace(/[^0-9]/g, '').trim();
}

export function isValidIndianMobile(phone) {
  const clean = cleanPhoneNumber(phone);
  return clean.length === 10 && PHONE_REGEX.test(clean);
}

export function isValidOrderId(orderId) {
  return typeof orderId === 'string' && ORDER_ID_REGEX.test(orderId);
}

export function resolveTrustedPaymentBaseUrl(customUpiUrl, trustedHost = TRUSTED_PAY_HOST) {
  const trimmed = String(customUpiUrl || '').trim();
  if (trimmed.startsWith(trustedHost)) {
    return trimmed.split('?')[0].split('#')[0];
  }
  return trustedHost + 'manormart-pay/';
}

export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const customerLat = Number(lat1);
  const customerLng = Number(lng1);
  const hubLat = Number(lat2);
  const hubLng = Number(lng2);

  if (
    !Number.isFinite(customerLat) ||
    !Number.isFinite(customerLng) ||
    !Number.isFinite(hubLat) ||
    !Number.isFinite(hubLng)
  ) {
    return 0;
  }

  const R = 6371;
  const dLat = (customerLat - hubLat) * (Math.PI / 180);
  const dLon = (customerLng - hubLng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(hubLat * (Math.PI / 180)) *
      Math.cos(customerLat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Number.isNaN(d) ? 0 : Number(d.toFixed(2));
}

export function evaluateGeoFence(custLat, custLng, hubLat = 19.728, hubLng = 72.915, radiusKm = 2) {
  const cLat = Number(custLat) || Number(hubLat) || 19.728;
  const cLng = Number(custLng) || Number(hubLng) || 72.915;
  const hLat = Number(hubLat) || 19.728;
  const hLng = Number(hubLng) || 72.915;
  const allowedRadius = Number(radiusKm) > 0 ? Number(radiusKm) : 2;

  const distanceKm = calculateDistanceKm(cLat, cLng, hLat, hLng);
  const inRange = distanceKm <= allowedRadius;
  return { distanceKm, inRange, allowedRadius };
}

/**
 * Matches server-side computeServerTotal rules in manormart-pay/lib/common.js:
 * An item is sold out / unavailable if:
 * - inStock === false
 * - status === 'sold'
 * - price <= 0
 * - effectivePrice (price - discount) <= 0
 */
export function isProductSoldOut(prod) {
  if (!prod || typeof prod !== 'object') return true;
  if (prod.inStock === false || prod.status === 'sold') return true;
  const price = Number(prod.price || 0);
  const discount = Number(prod.discount || 0);
  const effectivePrice = round2(price - discount);
  if (!(price > 0) || !(effectivePrice > 0)) return true;
  return false;
}

export function computeProductDiscountPercent(prod, categoryDiscountPercent = 0) {
  const price = Number(prod?.price || 0);
  const discount = Number(prod?.discount || 0);
  if (!(price > 0) || !(discount > 0)) return 0;
  const catPct = Number(categoryDiscountPercent || 0);
  const expected = Math.round((price * catPct) / 100);
  if (catPct > 0 && discount === expected) return catPct;
  return Math.max(0, Math.min(99, Math.round((discount / price) * 100)));
}

export function computeCartTotals(itemsObj, deliveryType = 'Normal', storeSettings = {}) {
  const list = Object.values(itemsObj || {});
  const subtotal = round2(
    list.reduce((sum, i) => {
      const qty = Math.max(0, Math.floor(Number(i?.qty || 0)));
      const eff = Number(i?.effectivePrice || 0);
      return sum + (eff > 0 ? eff * qty : 0);
    }, 0)
  );
  const itemCount = list.reduce((sum, i) => sum + Math.max(0, Math.floor(Number(i?.qty || 0))), 0);
  const freeThreshold = Number(storeSettings?.freeDel || 0);
  const normFee = Number(storeSettings?.normCharge || 0);
  const expExtra = Number(storeSettings?.expCharge ?? 30);

  let deliveryFee = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : normFee;
  if (deliveryType === 'Express') deliveryFee += expExtra;

  const finalTotal = round2(subtotal + (subtotal > 0 ? deliveryFee : 0));
  return { subtotal, deliveryFee, finalTotal, itemCount };
}

export function revalidateCartAgainstCatalog(cartObj, latestCats) {
  const validated = {};
  const notes = [];

  Object.values(cartObj || {}).forEach((item) => {
    if (!item || !item.id) return;
    let live = latestCats?.[item.catName]?.[item.id];
    let resolvedCat = item.catName || '';
    if (!live || !live.name) {
      for (const c of Object.keys(latestCats || {})) {
        const cand = latestCats[c] && typeof latestCats[c] === 'object' ? latestCats[c][item.id] : null;
        if (cand && cand.name) {
          live = cand;
          resolvedCat = c;
          break;
        }
      }
    }
    if (!live || !live.name) {
      notes.push(`• ${item.name} is no longer available`);
      return;
    }
    if (isProductSoldOut(live)) {
      notes.push(`• ${live.name || item.name} is currently out of stock`);
      return;
    }
    const price = Number(live.price || 0);
    const disc = Number(live.discount || 0);
    const eff = round2(price - disc);
    const qty = Math.min(100, Math.max(1, Math.floor(Number(item.qty || 1))));
    if (round2(eff) !== round2(item.effectivePrice)) {
      notes.push(`• ${live.name}: price updated to ₹${eff}`);
    }
    validated[item.id] = {
      ...item,
      catName: resolvedCat,
      name: live.name || item.name,
      unit: live.unit || item.unit,
      price,
      discount: disc,
      effectivePrice: eff,
      qty,
      image: live.image || item.image || '',
    };
  });

  return { validated, notes };
}

export function resolveEffectiveOrderStatus(ord) {
  if (!ord || typeof ord !== 'object') return '';
  const s = String(ord.deliveryStatus || '');
  const progressed = /Cancelled|Assigned|Out for Delivery|Delivered/.test(s);
  const looksPaid = ord.paymentVerified === true || Boolean(ord.razorpayPaymentId);
  if (ord.payment === 'Online' && !looksPaid && !progressed) {
    return '⏳ Payment Pending';
  }
  if (s === 'Pending' || !s) {
    return 'Order Successful';
  }
  return s;
}
