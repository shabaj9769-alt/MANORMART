import test from 'node:test';
import assert from 'node:assert/strict';
import {
  round2,
  sanitizeInput,
  isValidIndianMobile,
  isValidOrderId,
  resolveTrustedPaymentBaseUrl,
  calculateDistanceKm,
  evaluateGeoFence,
  isProductSoldOut,
  computeProductDiscountPercent,
  computeCartTotals,
  revalidateCartAgainstCatalog,
  resolveEffectiveOrderStatus,
} from './commerceRules';

test('round2 rounds floating point numbers accurately', () => {
  assert.equal(round2(19.999), 20);
  assert.equal(round2(10.555), 10.56);
  assert.equal(round2('45.1'), 45.1);
});

test('sanitizeInput strips control characters and collapses whitespace', () => {
  assert.equal(sanitizeInput('  Shabaj   Khan \n\t '), 'Shabaj Khan');
  assert.equal(sanitizeInput('House\u0000 12,  Manor'), 'House 12, Manor');
});

test('isValidIndianMobile validates 10-digit Indian mobile numbers starting with 6-9', () => {
  assert.equal(isValidIndianMobile('9876543210'), true);
  assert.equal(isValidIndianMobile('+91 98765-43210'), false); // 12 digits
  assert.equal(isValidIndianMobile('1234567890'), false); // starts with 1
  assert.equal(isValidIndianMobile('987654321'), false); // 9 digits
});

test('isValidOrderId validates server order ID format', () => {
  assert.equal(isValidOrderId('ord_1730119200123_452'), true);
  assert.equal(isValidOrderId('ord_123_1'), false);
  assert.equal(isValidOrderId('../orders/admin'), false);
});

test('resolveTrustedPaymentBaseUrl prevents open redirect attacks from tampered settings.upi', () => {
  assert.equal(
    resolveTrustedPaymentBaseUrl('https://evil-phishing.example.com/pay'),
    'https://shabaj9769-alt.github.io/manormart-pay/'
  );
  assert.equal(
    resolveTrustedPaymentBaseUrl('https://shabaj9769-alt.github.io/manormart-pay/?foo=1'),
    'https://shabaj9769-alt.github.io/manormart-pay/'
  );
});

test('evaluateGeoFence computes Haversine distance and checks delivery radius', () => {
  const sameSpot = evaluateGeoFence(19.728, 72.915, 19.728, 72.915, 2);
  assert.equal(sameSpot.distanceKm, 0);
  assert.equal(sameSpot.inRange, true);

  const farSpot = evaluateGeoFence(19.95, 72.915, 19.728, 72.915, 5);
  assert.equal(farSpot.distanceKm > 20, true);
  assert.equal(farSpot.inRange, false);
});

test('isProductSoldOut catches inStock=false, status=sold, and zero/negative priced items', () => {
  assert.equal(isProductSoldOut({ id: 'p1', name: 'Atta', price: 250, discount: 20, inStock: true, status: 'available' }), false);
  assert.equal(isProductSoldOut({ id: 'p2', name: 'Rice', price: 100, discount: 0, inStock: false, status: 'available' }), true);
  assert.equal(isProductSoldOut({ id: 'p3', name: 'Dal', price: 120, discount: 0, inStock: true, status: 'sold' }), true);
  assert.equal(isProductSoldOut({ id: 'p4', name: 'Bulk Imported Item', price: 0, discount: 0, inStock: true, status: 'available' }), true);
  assert.equal(isProductSoldOut({ id: 'p5', name: 'Bad Discount', price: 50, discount: 50, inStock: true }), true);
});

test('computeProductDiscountPercent prefers exact category discount percent', () => {
  assert.equal(computeProductDiscountPercent({ price: 200, discount: 20 }, 10), 10);
  assert.equal(computeProductDiscountPercent({ price: 100, discount: 25 }, 10), 25);
});

test('computeCartTotals calculates subtotal, free delivery threshold, and express fee', () => {
  const cart = {
    p1: { id: 'p1', effectivePrice: 150, qty: 2 },
    p2: { id: 'p2', effectivePrice: 50, qty: 1 },
  };
  const settings = { freeDel: '500', normCharge: '20', expCharge: '30' };

  const normalTotals = computeCartTotals(cart, 'Normal', settings);
  assert.equal(normalTotals.subtotal, 350);
  assert.equal(normalTotals.deliveryFee, 20);
  assert.equal(normalTotals.finalTotal, 370);
  assert.equal(normalTotals.itemCount, 3);

  const expressTotals = computeCartTotals(cart, 'Express', settings);
  assert.equal(expressTotals.deliveryFee, 50);
  assert.equal(expressTotals.finalTotal, 400);

  const freeDeliveryTotals = computeCartTotals(
    { p1: { id: 'p1', effectivePrice: 250, qty: 2 } },
    'Normal',
    settings
  );
  assert.equal(freeDeliveryTotals.subtotal, 500);
  assert.equal(freeDeliveryTotals.deliveryFee, 0);
  assert.equal(freeDeliveryTotals.finalTotal, 500);
});

test('revalidateCartAgainstCatalog removes sold-out items and updates changed prices', () => {
  const cart = {
    p1: { id: 'p1', catName: 'Grains', name: 'Basmati Rice', effectivePrice: 100, price: 100, discount: 0, qty: 2 },
    p2: { id: 'p2', catName: 'Grains', name: 'Toor Dal', effectivePrice: 140, price: 140, discount: 0, qty: 1 },
  };
  const liveCatalog = {
    Grains: {
      p1: { id: 'p1', name: 'Basmati Rice', price: 120, discount: 10, inStock: true, status: 'available', unit: '1 kg' },
      p2: { id: 'p2', name: 'Toor Dal', price: 140, discount: 0, inStock: true, status: 'sold', unit: '1 kg' },
    },
  };

  const { validated, notes } = revalidateCartAgainstCatalog(cart, liveCatalog);
  assert.equal(Object.keys(validated).length, 1);
  assert.equal(validated.p1.effectivePrice, 110);
  assert.equal(notes.length, 2);
});

test('resolveEffectiveOrderStatus flags unverified online orders and normalizes Pending', () => {
  assert.equal(
    resolveEffectiveOrderStatus({ payment: 'Online', paymentVerified: false, deliveryStatus: 'Pending' }),
    '⏳ Payment Pending'
  );
  assert.equal(
    resolveEffectiveOrderStatus({ payment: 'Online', paymentVerified: true, deliveryStatus: 'Order Successful' }),
    'Order Successful'
  );
  assert.equal(
    resolveEffectiveOrderStatus({ payment: 'COD', deliveryStatus: 'Pending' }),
    'Order Successful'
  );
});
