export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export async function hasServicesEnabledAsync() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

export async function requestForegroundPermissionsAsync() {
  return { status: 'granted', granted: true };
}

export async function getLastKnownPositionAsync() {
  return null;
}

export async function getCurrentPositionAsync(options = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation not available');
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000, ...options }
    );
  });
}
