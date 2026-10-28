// FIXED src/services/orders.js for delivery-boy app
// Uses the scoped /api/orders-manager backend route so a delivery partner only
// receives their own assigned orders (instead of downloading all customer orders in orders.json)
// and only updates status via server-validated transitions ('Out for Delivery' / 'Delivered').

import { API_BASE, FIREBASE_DB } from '../config/constants';
import { getToken, setAuthRejectedHandler } from './api';

export async function fetchAllOrders() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/orders-manager`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401 || res.status === 403) {
    return null;
  }
  return res.json().catch(() => null);
}

export async function fetchBoyStatus(boyKey) {
  if (!boyKey) return null;
  const res = await fetch(
    FIREBASE_DB + `deliveryBoys/${encodeURIComponent(boyKey)}/status.json?auth=${encodeURIComponent(getToken())}`
  ).catch(() => null);
  return res && res.ok ? res.json().catch(() => null) : null;
}

export async function patchOrder(orderId, body) {
  const token = getToken();
  return fetch(`${API_BASE}/orders-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'boyUpdateOrder',
      orderId,
      status: body.deliveryStatus,
    }),
  });
}
