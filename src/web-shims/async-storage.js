const AsyncStorage = {
  async getItem(key) {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(String(key)) : null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(String(key), String(value));
      }
    } catch {}
  },
  async removeItem(key) {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(String(key));
      }
    } catch {}
  },
  async multiRemove(keys) {
    try {
      if (typeof window !== 'undefined' && Array.isArray(keys)) {
        keys.forEach((k) => window.localStorage.removeItem(String(k)));
      }
    } catch {}
  },
};

export default AsyncStorage;
