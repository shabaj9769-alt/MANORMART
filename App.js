// --- MANOR MART ADVANCED INSTAMART-STYLE CUSTOMER APP (FULL ENGLISH + STRUCTURED PROFILE UI) ---
import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  ScrollView, Alert, SafeAreaView, Modal, Image, 
  Platform, BackHandler, Linking, Dimensions 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Customer App talks to the Vercel backend only. No direct Firebase client access.
const API_BASE = "https://manormart-pay.vercel.app/api";
const CUSTOMER_TOKEN_KEY = 'manor_customer_session';
const BANNER_W = Dimensions.get('window').width - 24;
// Bottom inset so our nav bar sits above the phone's Android navigation buttons
let SAFE_BOTTOM = 0;
try { SAFE_BOTTOM = require('react-native-safe-area-context').initialWindowMetrics?.insets?.bottom || 0; } catch (e) {}
if (Platform.OS === 'android' && SAFE_BOTTOM < 24) SAFE_BOTTOM = 48;

// Foreground Notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function CustomerApp() {
  const [storeSettings, setStoreSettings] = useState({
    store: 'MANOR MART',
    upi: '',
    minOrd: '0',
    expDeliveryTime: '45 Mins',
    normCharge: '0',
    expCharge: '30',
    freeDel: '0',
    hubLat: '19.7244',
    hubLng: '72.9097',
    radiusKm: '2',
    adminNote: '',
    bgImage: '',
    storeOpen: true,
    b1: '',
    b2: '',
    b3: '',
  });

  const [categories, setCategories] = useState({});
  const [selectedCat, setSelectedCat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState({});
  const [activeTab, setActiveTab] = useState('shop');

  const [termsAccepted, setTermsAccepted] = useState(true);
  const [showLegalModal, setShowLegalModal] = useState(false);

  const [custLat, setCustLat] = useState(19.7244);
  const [custLng, setCustLng] = useState(72.9097);
  const [distanceKm, setDistanceKm] = useState(0);
  const [inRange, setInRange] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('Locating...');

  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddr, setCustAddr] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPhoneInput, setLoginPhoneInput] = useState('');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [showSignup, setShowSignup] = useState(false);
  const [signupNameInput, setSignupNameInput] = useState('');
  const [signupPhoneInput, setSignupPhoneInput] = useState('');
  const [signupPasswordInput, setSignupPasswordInput] = useState('');
  const [signingUp, setSigningUp] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const [deliveryType, setDeliveryType] = useState('Normal');
  const [deliveryShift, setDeliveryShift] = useState('Morning (8 AM - 11 AM)');
  const [paymentMode, setPaymentMode] = useState('COD');

  const [myOrders, setMyOrders] = useState([]);
  const [deliveryBoysList, setDeliveryBoysList] = useState({});
  const [deleteStepOrder, setDeleteStepOrder] = useState(null);
  const [cancelStepOrder, setCancelStepOrder] = useState(null);

  const gpsFetchedRef = useRef(false);
  const myPushTokenRef = useRef('');
  const custLatRef = useRef(19.7244);
  const custLngRef = useRef(72.9097);
  const custPhoneRef = useRef('');
  const placingRef = useRef(false);
  const [placing, setPlacing] = useState(false);
  const [hiddenOrderIds, setHiddenOrderIds] = useState([]);
  useEffect(() => {
    AsyncStorage.getItem('manor_hidden_orders').then(v => { if (v) setHiddenOrderIds(JSON.parse(v)); }).catch(() => {});
  }, []);
  const bannerRef = useRef(null);
  const bannerIdxRef = useRef(0);
  const [bannerIdx, setBannerIdx] = useState(0);

  // Auto-slide banners every 3.5s
  useEffect(() => {
    const n = [storeSettings.b1, storeSettings.b2, storeSettings.b3].filter(b => b && b.trim().startsWith('http')).length;
    if (n < 2) return;
    const t = setInterval(() => {
      const next = (bannerIdxRef.current + 1) % n;
      bannerIdxRef.current = next;
      setBannerIdx(next);
      bannerRef.current?.scrollTo({ x: next * BANNER_W, animated: true });
    }, 3500);
    return () => clearInterval(t);
  }, [storeSettings.b1, storeSettings.b2, storeSettings.b3]);
  const sessionExpiredAlertShownRef = useRef(false);

  // Wraps fetch with a timeout so a slow/cold Vercel function fails fast
  // instead of leaving the UI looking "stuck" with no feedback.
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  // Every customer API request carries the signed customer session token.
  const customerFetch = async (endpoint, options = {}) => {
    const token = await AsyncStorage.getItem(CUSTOMER_TOKEN_KEY);
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetchWithTimeout(API_BASE + endpoint, { ...options, headers });
    if (res.status === 401) {
      // Token was rejected by the server (expired/invalid). Clear it and, if we
      // thought we were logged in, drop the user back to the login screen instead
      // of silently leaving every subsequent request failing with 401.
      await AsyncStorage.removeItem(CUSTOMER_TOKEN_KEY);
      if (token && !sessionExpiredAlertShownRef.current) {
        sessionExpiredAlertShownRef.current = true;
        setIsLoggedIn(false);
        Alert.alert('Session Expired', 'Please log in again.');
      }
    }
    return res;
  };

  // Always keep the latest phone in a ref so long-lived listeners never read a stale value
  useEffect(() => {
    custPhoneRef.current = custPhone;
  }, [custPhone]);

  // Geofence is derived from state: recalculates whenever GPS or hub settings change
  useEffect(() => {
    calcGeoFence(custLat, custLng, storeSettings.hubLat, storeSettings.hubLng, storeSettings.radiusKm);
  }, [custLat, custLng, storeSettings.hubLat, storeSettings.hubLng, storeSettings.radiusKm]);

  // If the cart becomes empty while the checkout modal is open, go back to the shop
  useEffect(() => {
    if (activeTab === 'cart' && Object.keys(cart || {}).length === 0) setActiveTab('shop');
  }, [cart, activeTab]);

  // One-time setup (mount only)
  useEffect(() => {
    checkInitialTermsAgreement();
    checkSavedCustomerSession();
    checkURLPaymentReturn();

    if (!gpsFetchedRef.current) {
      detectGPSAndLoadStore(false);
    }

    const handleUrl = async (url) => {
      if (!url) return;
      try {
        const getPhone = async () => custPhoneRef.current || (await AsyncStorage.getItem('manor_cust_phone'));
        if (url.includes('success') || url.includes('razorpay_payment_id')) {
          const pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await verifyAndConfirmOrder(pendingOrderId);
          } else {
            const phone = await getPhone();
            if (phone) fetchCustomerOrders(phone);
            setActiveTab('orders');
          }
        } else if (url.includes('orders')) {
          const phone = await getPhone();
          if (phone) fetchCustomerOrders(phone);
          setActiveTab('orders');
        } else if (url.includes('shop')) {
          setActiveTab('shop');
        }
      } catch (e) {}
    };

    const sub = Linking.addEventListener('url', (event) => handleUrl(event?.url));
    Linking.getInitialURL().then(handleUrl).catch(() => {});

    // Poll only the small nodes (settings / categories / deliveryBoys), not the whole DB
    const storeRefreshInterval = setInterval(() => {
      fetchStoreData().then(applyStoreData).catch(() => {});
    }, 6000);

    return () => {
      clearInterval(storeRefreshInterval);
      if (sub && sub.remove) sub.remove();
    };
  }, []);

  // Orders polling: restarts only when the logged-in phone changes
  useEffect(() => {
    if (!custPhone) return;
    fetchCustomerOrders(custPhone);
    const ordersInterval = setInterval(() => fetchCustomerOrders(custPhone), 6000);
    return () => clearInterval(ordersInterval);
  }, [custPhone]);

  const registerForPushNotifications = async (phoneOverride = '') => {
    if (Platform.OS === 'web') return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Orders & Offers Channel',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6a1b9a',
          sound: 'default',
          enableVibrate: true,
          showBadge: true
        });
      }

      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: "9fd5f86d-9fcb-4946-b620-765d0f2f828a"
        });

        if (tokenData?.data) {
          myPushTokenRef.current = tokenData.data;
          let activePhone = phoneOverride || custPhoneRef.current || await AsyncStorage.getItem('manor_cust_phone');
          saveCustomerPushToken(tokenData.data, activePhone);
        }
      }
    } catch (e) {
      console.log("Push Token Error:", e);
    }
  };

  const saveCustomerPushToken = async (token, phone) => {
    if (!token || !phone) return;
    try {
      await customerFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({ action: 'savePushToken', phone, token })
      });
    } catch (e) {}
  };

  // Admin notification is triggered server-side when an order is created.
  // The customer app never reads adminPushToken or sends notifications to admin.

  useEffect(() => {
    const backAction = () => {
      if (showLegalModal) {
        setShowLegalModal(false);
        return true;
      }
      if (activeTab === 'cart') {
        setActiveTab('shop');
        return true;
      }
      if (activeTab === 'orders' || activeTab === 'profile') {
        setActiveTab('shop');
        return true;
      }
      if (selectedCat || searchQuery) {
        setSelectedCat('');
        setSearchQuery('');
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showLegalModal, activeTab, selectedCat, searchQuery]);

  const checkInitialTermsAgreement = async () => {
    try {
      const accepted = await AsyncStorage.getItem('manor_terms_accepted');
      setTermsAccepted(accepted === 'true');
    } catch (e) {
      setTermsAccepted(true);
    }
  };

  const handleAcceptTerms = async () => {
    try {
      await AsyncStorage.setItem('manor_terms_accepted', 'true');
      setTermsAccepted(true);
    } catch (e) {
      setTermsAccepted(true);
    }
  };

  const checkURLPaymentReturn = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('status') === 'success' || urlParams.get('razorpay_payment_id')) {
          let pendingOrderId = urlParams.get('order_id') || await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await verifyAndConfirmOrder(pendingOrderId);
          }
        }
      }
    } catch(e) {}
  };

  // The app never marks an order as paid. Only the server (verify-payment / webhook) sets paymentVerified.
  const verifyAndConfirmOrder = async (orderId) => {
    try {
      const orderData = await customerFetch(`/orders-manager?orderId=${encodeURIComponent(orderId)}`).then(r => r.json());
      const verified = orderData && orderData.paymentVerified === true;
      
      let phone = custPhoneRef.current || await AsyncStorage.getItem('manor_cust_phone');
      if (phone) fetchCustomerOrders(phone);
      setActiveTab('orders');
      
      if (verified === true) {
        await AsyncStorage.removeItem('manor_pending_ord');
        Alert.alert("🎉 Payment Successful", "Payment verified and order confirmed successfully!");
      } else {
        Alert.alert("⏳ Confirming Payment", "We are confirming your payment. If it does not update in a minute, tap Check in Orders.");
      }
    } catch(e) {
      setActiveTab('orders');
    }
  };

  const checkSavedCustomerSession = async () => {
    try {
      const token = await AsyncStorage.getItem(CUSTOMER_TOKEN_KEY);
      if (!token) { registerForPushNotifications(); return; }
      const savedPhone = await AsyncStorage.getItem('manor_cust_phone');
      if (!savedPhone) { await AsyncStorage.removeItem(CUSTOMER_TOKEN_KEY); registerForPushNotifications(); return; }
      const res = await customerFetch(`/customers?phone=${encodeURIComponent(savedPhone)}`);
      const userData = await res.json().catch(() => null);
      if (!res.ok || !userData || userData.error) {
        await AsyncStorage.removeItem(CUSTOMER_TOKEN_KEY);
        await AsyncStorage.removeItem('manor_cust_phone');
        registerForPushNotifications();
        return;
      }
      setCustPhone(savedPhone);
      if (userData.name) { setCustName(userData.name); await AsyncStorage.setItem('manor_cust_name', userData.name); }
      if (userData.addr) { setCustAddr(userData.addr); await AsyncStorage.setItem('manor_cust_addr', userData.addr); }
      if (Array.isArray(userData.addresses)) { setSavedAddresses(userData.addresses); await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(userData.addresses)); }
      setIsLoggedIn(true);
      registerForPushNotifications(savedPhone);
    } catch(e) {
      await AsyncStorage.removeItem(CUSTOMER_TOKEN_KEY).catch(() => {});
      registerForPushNotifications();
    }
  };

  const detectGPSAndLoadStore = async (forceManual = false) => {
    try {
      setGpsStatus('Fetching GPS...');
      
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              gpsFetchedRef.current = true;
              custLatRef.current = pos.coords.latitude;
              custLngRef.current = pos.coords.longitude;
              setCustLat(pos.coords.latitude);
              setCustLng(pos.coords.longitude);
              setGpsStatus('Active');
              loadStoreConfig(pos.coords.latitude, pos.coords.longitude);
            },
            () => fallbackToNetworkLocation(),
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
          );
        } else {
          fallbackToNetworkLocation();
        }
      } else {
        let enabled = await Location.hasServicesEnabledAsync().catch(() => true);
        if (!enabled && forceManual) {
          setGpsStatus('GPS Off');
          return Alert.alert("📍 Location Service Off", "Please enable GPS in device settings.");
        }

        let { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
        
        if (status === 'granted') {
          let fastLoc = await Location.getLastKnownPositionAsync().catch(() => null);
          if (fastLoc?.coords) {
            gpsFetchedRef.current = true;
            custLatRef.current = fastLoc.coords.latitude;
            custLngRef.current = fastLoc.coords.longitude;
            setCustLat(fastLoc.coords.latitude);
            setCustLng(fastLoc.coords.longitude);
            setGpsStatus('Active');
            loadStoreConfig(fastLoc.coords.latitude, fastLoc.coords.longitude);
          }

          let liveLoc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise(resolve => setTimeout(() => resolve(null), 8000))
          ]).catch(() => null);

          if (liveLoc?.coords) {
            gpsFetchedRef.current = true;
            custLatRef.current = liveLoc.coords.latitude;
            custLngRef.current = liveLoc.coords.longitude;
            setCustLat(liveLoc.coords.latitude);
            setCustLng(liveLoc.coords.longitude);
            setGpsStatus('Active');
            loadStoreConfig(liveLoc.coords.latitude, liveLoc.coords.longitude);
            if (forceManual) Alert.alert("📍 Live GPS", "Phone location updated successfully!");
            return;
          }
          if (fastLoc?.coords) return;
        }

        if (forceManual) {
          Alert.alert(
            "📍 GPS Permission Required", 
            "Please allow location permissions to check delivery distance.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Settings", onPress: () => Linking.openSettings() }
            ]
          );
        }
        await fallbackToNetworkLocation();
      }
    } catch (e) {
      fallbackToNetworkLocation();
    }
  };

  const fallbackToNetworkLocation = async () => {
    gpsFetchedRef.current = true;
    setGpsStatus('Network');
    loadStoreConfig(custLatRef.current, custLngRef.current);
  };

  const fetchStoreData = async () => {
    const getAPI = (endpoint) => fetch(API_BASE + endpoint).then(r => r.json()).then(d => (d && d.error ? null : d));
    const [settings, cats] = await Promise.all([getAPI('/settings'), getAPI('/catalog')]);
    return { settings, categories: cats, deliveryBoys: {} };
  };

  const applyStoreData = (data) => {
    if (!data) return;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (data.settings) setStoreSettings(prev => { const next = { ...prev, ...data.settings }; return same(prev, next) ? prev : next; });
    if (data.categories) setCategories(prev => (same(prev, data.categories) ? prev : data.categories));
    if (data.deliveryBoys) setDeliveryBoysList(prev => (same(prev, data.deliveryBoys) ? prev : data.deliveryBoys));
  };

  const loadStoreConfig = () => {
    fetchStoreData().then(applyStoreData).catch(() => {});
  };

  const calcGeoFence = (lat, lng, hLat, hLng, rad) => {
    let customerLat = Number(lat) || 19.7244;
    let customerLng = Number(lng) || 72.9097;
    let hubLat = Number(hLat) || 19.7244;
    let hubLng = Number(hLng) || 72.9097;
    let allowedRadius = Number(rad) || 2;

    let R = 6371;
    let dLat = (customerLat - hubLat) * (Math.PI / 180);
    let dLon = (customerLng - hubLng) * (Math.PI / 180);
    let a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
      Math.cos(hubLat * (Math.PI / 180)) * Math.cos(customerLat * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c;

    let distRounded = isNaN(d) ? 0 : Number(d.toFixed(2));
    setDistanceKm(distRounded);

    const allowed = distRounded <= allowedRadius;
    setInRange(allowed);
  };

  const sanitizeInput = (str) => (str || '').replace(/\s+/g, ' ').trim();

  const formatOrderDateTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(Number(ts));
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch(e) {
      return '';
    }
  };

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const updateCartQty = (prod, delta) => {
    if (!prod || !prod.id) return;
    // Only block ADDING out-of-stock items; removing/decreasing must always work
    if (prod.inStock === false && delta > 0) {
      return Alert.alert("Out of Stock", "Sorry, this item is currently out of stock.");
    }
    let pKey = prod.id;
    let priceVal = Number(prod.price || 0);
    let discVal = Number(prod.discount || 0);
    let eff = priceVal - discVal;

    setCart(prev => {
      let up = { ...(prev || {}) };
      let curr = up[pKey]?.qty || 0;
      let next = curr + delta;
      
      if (next <= 0) {
        delete up[pKey];
      } else {
        up[pKey] = { 
          id: prod.id,
          catName: prod.catName || up[pKey]?.catName || '',
          name: prod.name || 'Item',
          unit: prod.unit || '',
          price: priceVal,
          discount: discVal,
          effectivePrice: eff,
          qty: next,
          image: prod.image || ''
        };
      }
      return up;
    });
  };

  const computeTotals = (itemsObj, delType) => {
    const list = Object.values(itemsObj || {});
    const sub = round2(list.reduce((sum, i) => sum + (Number(i.effectivePrice || 0) * Number(i.qty || 0)), 0));
    const freeThreshold = Number(storeSettings.freeDel || 0);
    const normFee = Number(storeSettings.normCharge || 0);
    const expExtra = Number(storeSettings.expCharge || 30);
    let fee = (freeThreshold > 0 && sub >= freeThreshold) ? 0 : normFee;
    if (delType === 'Express') fee += expExtra;
    return { subtotal: sub, deliveryFee: fee, finalTotal: round2(sub + (sub > 0 ? fee : 0)) };
  };

  let cartItemsList = Object.values(cart || {});
  const { subtotal, deliveryFee, finalTotal } = computeTotals(cart, deliveryType);

  // Compares the cart against the latest catalog (price / stock / availability)
  const revalidateCart = (latestCats) => {
    const validated = {};
    const notes = [];
    Object.values(cart || {}).forEach(item => {
      let live = latestCats?.[item.catName]?.[item.id];
      if (!live || !live.name) {
        for (const c of Object.keys(latestCats || {})) {
          const cand = latestCats[c] && typeof latestCats[c] === 'object' ? latestCats[c][item.id] : null;
          if (cand && cand.name) { live = cand; break; }
        }
      }
      if (!live || !live.name) { notes.push(`• ${item.name} is no longer available`); return; }
      if (live.inStock === false) { notes.push(`• ${item.name} is out of stock`); return; }
      const price = Number(live.price || 0);
      const disc = Number(live.discount || 0);
      const eff = price - disc;
      if (round2(eff) !== round2(item.effectivePrice)) notes.push(`• ${item.name}: price is now ₹${round2(eff)}`);
      validated[item.id] = { ...item, name: live.name || item.name, unit: live.unit || item.unit, price, discount: disc, effectivePrice: eff };
    });
    return { validated, notes };
  };

  const openPaymentPage = async (orderId) => {
    // Only ever open OUR payment page. A tampered settings.upi value can never redirect customers elsewhere.
    const TRUSTED_PAY_HOST = 'https://shabaj9769-alt.github.io/';
    const custom = (storeSettings.upi || '').trim();
    const base = custom.startsWith(TRUSTED_PAY_HOST) ? custom : TRUSTED_PAY_HOST + 'manormart-pay/';
    AsyncStorage.setItem('manor_pending_ord', orderId).catch(() => {});
    const token = await AsyncStorage.getItem(CUSTOMER_TOKEN_KEY);
    if (!token) {
      return Alert.alert("Please log in again", "Please log in and tap Pay Now again.");
    }
    const url = `${base}?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Unable to open payment checkout page.");
    });
  };

  const handleLogin = async () => {
    if (loggingIn) return; // guard against double-tap firing two requests
    const cleanPh = (loginPhoneInput || '').replace(/[^0-9]/g, '').trim();
    if (cleanPh.length !== 10) return Alert.alert("Invalid Phone", "Please enter a valid 10-digit mobile number.");
    if (!loginPasswordInput || loginPasswordInput.length < 8) return Alert.alert("Password Required", "Password must be at least 8 characters.");
    setLoggingIn(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/customer-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPh, password: loginPasswordInput })
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        // Server explicitly rejected the credentials.
        return Alert.alert("Login Failed", data.error || "Invalid mobile number or password.");
      }
      if (!res.ok || !data.token) {
        // Server reached, but something else went wrong (500, malformed response, etc.)
        // Don't tell the user their password is wrong when it's actually a server issue.
        return Alert.alert("Login Failed", data.error || "Something went wrong on our end. Please try again in a moment.");
      }

      await AsyncStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
      await AsyncStorage.setItem('manor_cust_phone', cleanPh);
      sessionExpiredAlertShownRef.current = false;
      setCustPhone(cleanPh);
      setIsLoggedIn(true);
      setLoginPasswordInput('');
      const userData = data.customer || {};
      if (userData.name) { setCustName(userData.name); await AsyncStorage.setItem('manor_cust_name', userData.name); }
      if (userData.addr) { setCustAddr(userData.addr); await AsyncStorage.setItem('manor_cust_addr', userData.addr); }
      if (Array.isArray(userData.addresses)) { setSavedAddresses(userData.addresses); await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(userData.addresses)); }
      registerForPushNotifications(cleanPh);
      fetchCustomerOrders(cleanPh);
      Alert.alert("Welcome", "Logged in successfully!");
    } catch (e) {
      if (e && e.name === 'AbortError') {
        Alert.alert("Timed Out", "The server took too long to respond. Please try again.");
      } else {
        Alert.alert("Network Error", "Unable to login. Please check your internet connection and try again.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSignup = async () => {
    if (signingUp) return; // guard against double-tap firing two requests
    const cleanName = sanitizeInput(signupNameInput);
    const cleanPh = (signupPhoneInput || '').replace(/[^0-9]/g, '').trim();
    if (!cleanName) return Alert.alert("Name Required", "Please enter your full name.");
    if (cleanPh.length !== 10) return Alert.alert("Invalid Phone", "Please enter a valid 10-digit mobile number.");
    if (!signupPasswordInput || signupPasswordInput.length < 8) return Alert.alert("Password Required", "Password must be at least 8 characters.");
    setSigningUp(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/customer-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPh, password: signupPasswordInput, name: cleanName })
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // Server says a password already exists for this number.
        return Alert.alert("Account Exists", data.error || "An account already exists for this number. Please log in instead.");
      }
      if (!res.ok || !data.token) {
        // Server reached, but something else went wrong (500, malformed response, etc.)
        return Alert.alert("Sign Up Failed", data.error || "Something went wrong on our end. Please try again in a moment.");
      }

      await AsyncStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
      await AsyncStorage.setItem('manor_cust_phone', cleanPh);
      sessionExpiredAlertShownRef.current = false;
      setCustPhone(cleanPh);
      setIsLoggedIn(true);
      setSignupPasswordInput('');
      const userData = data.customer || {};
      const finalName = userData.name || cleanName;
      if (finalName) { setCustName(finalName); await AsyncStorage.setItem('manor_cust_name', finalName); }
      if (userData.addr) { setCustAddr(userData.addr); await AsyncStorage.setItem('manor_cust_addr', userData.addr); }
      if (Array.isArray(userData.addresses)) { setSavedAddresses(userData.addresses); await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(userData.addresses)); }
      registerForPushNotifications(cleanPh);
      fetchCustomerOrders(cleanPh);
      setShowSignup(false);
      Alert.alert("Welcome", "Account created successfully!");
    } catch (e) {
      if (e && e.name === 'AbortError') {
        Alert.alert("Timed Out", "The server took too long to respond. Please try again.");
      } else {
        Alert.alert("Network Error", "Unable to sign up. Please check your internet connection and try again.");
      }
    } finally {
      setSigningUp(false);
    }
  };

  const fetchCustomerOrders = (phone) => {
    if (!phone) return;
    customerFetch(`/orders-manager?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(data => {
        if (!data || data.error) return setMyOrders([]);
        let mine = Object.keys(data).map(k => ({ id: k, ...data[k] }));
        mine.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
        setMyOrders(mine);
      }).catch(() => {});
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(CUSTOMER_TOKEN_KEY);
    await AsyncStorage.removeItem('manor_cust_phone');
    await AsyncStorage.removeItem('manor_cust_name');
    await AsyncStorage.removeItem('manor_cust_addr');
    await AsyncStorage.removeItem('manor_cust_addrs_list');
    setCustPhone('');
    setCustName('');
    setCustAddr('');
    setSavedAddresses([]);
    setIsLoggedIn(false);
    setCart({});
    setActiveTab('shop');
    Alert.alert("Logged Out", "You have been logged out successfully.");
  };

  const changeCustomerPassword = async () => {
    if (oldPasswordInput.length < 8 || newPasswordInput.length < 8) return Alert.alert('Invalid Password', 'Both passwords must be at least 8 characters.');
    if (oldPasswordInput === newPasswordInput) return Alert.alert('Invalid Password', 'New password must be different from the old password.');
    setSavingPassword(true);
    try {
      const res = await customerFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({ action: 'changePassword', phone: custPhone, oldPassword: oldPasswordInput, newPassword: newPasswordInput })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return Alert.alert('Password Change Failed', data.error || 'Unable to change password.');
      setOldPasswordInput(''); setNewPasswordInput(''); setShowChangePassword(false);
      Alert.alert('Password Changed', 'Your customer password has been updated successfully.');
    } catch (e) {
      Alert.alert('Network Error', 'Unable to change password right now.');
    } finally { setSavingPassword(false); }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account and saved addresses? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, Delete", onPress: handleLogout, style: "destructive" }
      ]
    );
  };

  const handleExitApp = () => {
    Alert.alert(
      "Exit App",
      "Are you sure you want to close Manor Mart?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Exit", onPress: () => {
            if (Platform.OS === 'android') {
              BackHandler.exitApp();
            }
          }, style: "destructive" }
      ]
    );
  };

  // Online orders are shown as paid ONLY if the server verified them (paymentVerified),
  // or they are old orders that carry a real Razorpay payment id. Anything else is shown as unpaid.
  const effectiveStatus = (ord) => {
    const s = ord.deliveryStatus || '';
    const progressed = /Cancelled|Assigned|Out for Delivery|Delivered/.test(s);
    const looksPaid = ord.paymentVerified === true || !!ord.razorpayPaymentId;
    if (ord.payment === 'Online' && !looksPaid && !progressed) return '⏳ Payment Pending';
    return s;
  };

  const handleCancelOrderAction = (orderId, currentStatus, paymentModeVal) => {
    if (currentStatus === 'Delivered' || currentStatus === 'Out for Delivery') {
      return Alert.alert("Notice", "Order cannot be cancelled once dispatched.");
    }

    if (cancelStepOrder === orderId) {
      setCancelStepOrder(null);
      let newCancelStatus = paymentModeVal === 'Online'
        ? (currentStatus?.includes('Payment Pending') ? '❌ Cancelled (Unpaid)' : '❌ Cancelled (Paid - Refundable)')
        : '❌ Order Cancelled (COD)';

      customerFetch('/orders-manager', {
        method: 'POST',
        body: JSON.stringify({ action: 'cancelCustomerOrder', orderId })
      }).then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Cancel failed');
        fetchCustomerOrders(custPhone);
        Alert.alert("Order Cancelled", paymentModeVal === 'Online' && !currentStatus?.includes('Payment Pending')
          ? "Your order has been cancelled. For online prepaid orders, the refund will be credited back to your original payment method within 5 to 7 business days."
          : "Your order has been cancelled successfully.");
      }).catch((e) => {
        if (e && e.name === 'AbortError') {
          // Server did not reply in time - it may still have processed the cancel, so re-check.
          fetchCustomerOrders(custPhone);
          Alert.alert("Server is slow", "Cancel request timed out. Please check the order status in a moment, and try again if it is still active.");
        } else {
          Alert.alert("Error", e.message || "Network error. Please try again.");
        }
      });
    } else {
      setCancelStepOrder(orderId);
      setTimeout(() => setCancelStepOrder(null), 4000);
    }
  };

  const confirmDeleteOrder = (orderId) => {
    if (deleteStepOrder === orderId) {
      setDeleteStepOrder(null);
      const ord = (myOrders || []).find(o => o.id === orderId);
      const st = ord?.deliveryStatus || '';
      if (!st.includes('Cancelled') && !st.includes('Delivered')) {
        return Alert.alert("Order is active", "Cancel the order first, or wait until it is delivered. Then you can remove it from your list.");
      }
      const updated = [...hiddenOrderIds, orderId];
      setHiddenOrderIds(updated);
      AsyncStorage.setItem('manor_hidden_orders', JSON.stringify(updated)).catch(() => {});
    } else {
      setDeleteStepOrder(orderId);
      setTimeout(() => setDeleteStepOrder(null), 4000);
    }
  };

  const saveCurrentAddress = async () => {
    let cleanAddr = sanitizeInput(custAddr);
    if (!cleanAddr) return Alert.alert("Required", "Please enter an address to save.");
    let updatedAddrs = [...savedAddresses];
    if (!updatedAddrs.includes(cleanAddr)) {
      updatedAddrs.push(cleanAddr);
      setSavedAddresses(updatedAddrs);
      await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(updatedAddrs));
      
      if (custPhone) {
        customerFetch('/customers', { method: 'POST', body: JSON.stringify({ action: 'saveAddresses', phone: custPhone, addresses: updatedAddrs }) }).catch(() => {});
      }
      Alert.alert("Address Saved", "Delivery address added to your saved list!");
    }
  };

  const deleteSavedAddress = async (indexToDelete) => {
    Alert.alert(
      "Delete Address",
      "Are you sure you want to remove this address from your saved list?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            let updated = savedAddresses.filter((_, idx) => idx !== indexToDelete);
            setSavedAddresses(updated);
            await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(updated));
            if (custPhone) {
              customerFetch('/customers', { method: 'POST', body: JSON.stringify({ action: 'saveAddresses', phone: custPhone, addresses: updated }) }).catch(() => {});
            }
          }
        }
      ]
    );
  };

  const saveProfileDetails = async () => {
    let cleanName = sanitizeInput(custName);
    if (!cleanName) return Alert.alert("Required", "Please enter your name.");
    await AsyncStorage.setItem('manor_cust_name', cleanName);
    if (custPhone) {
      customerFetch('/customers', { method: 'POST', body: JSON.stringify({ action: 'updateProfile', phone: custPhone, name: cleanName, addr: custAddr }) }).catch(() => {});
    }
    Alert.alert("Profile Updated", "Your profile details have been saved successfully!");
  };

  const placeOrder = async () => {
    if (placingRef.current) return; // double-tap guard

    if (storeSettings.storeOpen === false) {
      return Alert.alert("Store Closed", "Store is currently closed. New orders are temporarily suspended.");
    }
    if (cartItemsList.length === 0 || subtotal <= 0) {
      return Alert.alert("Cart Empty", "Please add items to your cart first.");
    }

    let cleanName = sanitizeInput(custName);
    let cleanAddr = sanitizeInput(custAddr);

    if (!cleanName) return Alert.alert("Name Required", "Please enter your full name in Profile or Checkout.");
    if (!cleanAddr) return Alert.alert("Address Required", "Please enter your delivery address.");
    if (!custPhone || custPhone.length !== 10) return Alert.alert("Phone Required", "Please enter a valid 10-digit mobile number.");

    // STRICT CHECK AT THE FINAL STEP
    if (!inRange) {
      return Alert.alert(
        "Out of Delivery Area", 
        `Sorry! We currently deliver within ${storeSettings.radiusKm} KM of our store hub. Your device GPS shows you are ${distanceKm} KM away.`
      );
    }

    let minOrd = Number(storeSettings.minOrd || 0);
    if (minOrd > 0 && subtotal < minOrd) {
      return Alert.alert("Minimum Order Limit", `Minimum order amount required is ₹${minOrd}.`);
    }

    placingRef.current = true;
    setPlacing(true);
    try {
      // Re-check live prices & stock before writing the order
      const latestCats = await fetch(API_BASE + "/catalog").then(r => r.json());
      if (latestCats && !latestCats.error) {
        const { validated, notes } = revalidateCart(latestCats);
        if (notes.length > 0) {
          setCart(validated);
          setCategories(latestCats);
          Alert.alert("Cart Updated", notes.join('\n') + "\n\nPlease review your cart and place the order again.");
          return;
        }
      }

      let currentTimestamp = Date.now();
      let orderId = 'ord_' + currentTimestamp + '_' + Math.floor(Math.random() * 1000);
      let initialStatus = paymentMode === 'Online' ? '⏳ Payment Pending' : 'Order Successful';

      let orderObj = {
        id: orderId, 
        name: cleanName, 
        phone: custPhone, 
        addr: cleanAddr,
        lat: custLatRef.current, 
        lng: custLngRef.current, 
        distance: distanceKm, 
        items: cart,
        subtotal, 
        deliveryFee, 
        total: finalTotal, 
        deliveryType, 
        deliveryShift,
        payment: paymentMode, 
        deliveryStatus: initialStatus, 
        assignedBoy: '',
        deliveryBoyPhone: '',
        timestamp: currentTimestamp
      };

      const res = await customerFetch('/orders-manager', {
        method: 'POST',
        body: JSON.stringify({ action: 'createOrder', orderData: orderObj })
      });
      if (!res.ok) throw new Error('Order write failed: ' + res.status);

      customerFetch('/customers', { method: 'POST', body: JSON.stringify({ action: 'updateProfile', phone: custPhone, name: cleanName, addr: cleanAddr }) }).catch(() => {});
      setCart({});

      if (paymentMode === 'Online') {
        // Order is saved as "Payment Pending"; the Orders tab has Pay Now / Check buttons
        setActiveTab('orders');
        fetchCustomerOrders(custPhone);
        openPaymentPage(orderId);
      } else {
        setActiveTab('orders');
        fetchCustomerOrders(custPhone);
        Alert.alert("Order Placed", `Order #${orderId.slice(-6)} placed successfully!`);
      }
    } catch (e) {
      Alert.alert("Network Error", "Unable to place order. Please check your internet connection and try again.");
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const renderTimelineTracker = (status, orderId, total) => {
    let steps = ['Order Successful', 'Assigned', 'Out for Delivery', 'Delivered'];
    let currentStepIdx = 0;
    if (status === 'Assigned') currentStepIdx = 1;
    else if (status === 'Out for Delivery') currentStepIdx = 2;
    else if (status === 'Delivered') currentStepIdx = 3;
    else if (status && status.includes('Payment Pending')) {
      return (
        <View style={{marginVertical: 6, backgroundColor: '#fff3e0', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ffb74d'}}>
          <Text style={{fontSize: 11, color: '#e65100', fontWeight: 'bold'}}>⏳ Awaiting Payment Completion</Text>
          <Text style={{fontSize: 9.5, color: '#666', marginTop: 2}}>Already paid? Tap Check. Not paid yet? Tap Pay Now.</Text>
          <View style={{flexDirection: 'row', marginTop: 6}}>
            <TouchableOpacity onPress={() => openPaymentPage(orderId)} style={{backgroundColor: '#2e7d32', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5, marginRight: 8}}>
              <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>💳 Pay Now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              customerFetch(`/orders-manager?orderId=${encodeURIComponent(orderId)}`).then(r => r.json()).then(ord => {
                if (ord && ord.paymentVerified === true) {
                  Alert.alert("Verified", "Payment verified and order confirmed!");
                  fetchCustomerOrders(custPhone);
                } else {
                  Alert.alert("Pending", "Payment is still unverified. Please try again in a few moments.");
                }
              }).catch(() => Alert.alert("Network Error", "Please check your internet connection."));
            }} style={{backgroundColor: '#e65100', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5}}>
              <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>🔄 Check</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    } else if (status && status.includes('Cancelled')) {
      return <Text style={{fontSize: 10, color: status.includes('Unpaid') ? '#757575' : '#c62828', fontWeight: 'bold', marginVertical: 4}}>{status}</Text>;
    }

    return (
      <View style={{marginVertical: 6, backgroundColor: '#f3e5f5', padding: 6, borderRadius: 6}}>
        <Text style={{fontSize: 9.5, fontWeight: 'bold', color: '#4a148c', marginBottom: 3}}>🚀 Live Order Progress:</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          {steps.map((st, idx) => {
            let isDone = idx <= currentStepIdx;
            return (
              <View key={st} style={{alignItems: 'center', flex: 1}}>
                <View style={{width: 18, height: 18, borderRadius: 9, backgroundColor: isDone ? '#6a1b9a' : '#ccc', justifyContent: 'center', alignItems: 'center'}}>
                  <Text style={{color: '#fff', fontSize: 9, fontWeight: 'bold'}}>{isDone ? '✓' : idx + 1}</Text>
                </View>
                <Text style={{fontSize: 8, color: isDone ? '#6a1b9a' : '#777', textAlign: 'center', marginTop: 2}}>{st}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderTermsModal = () => (
    <Modal visible={!termsAccepted && !showLegalModal} transparent={true} animationType="slide" onRequestClose={() => {}}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={{fontSize: 28, marginBottom: 4, textAlign: 'center'}}>📜✨</Text>
          <Text style={[s.modalTitle, {textAlign: 'center'}]}>Welcome to {storeSettings.store}</Text>
          <Text style={{fontSize: 11, color: '#444', textAlign: 'center', marginVertical: 8}}>
            Please review our Terms & Conditions, Privacy, and 5-7 Days Refund Policy before continuing.
          </Text>
          
          <TouchableOpacity onPress={() => setShowLegalModal(true)} style={s.policyInteractiveBtn}>
            <Text style={{fontSize: 11.5, color: '#fff', fontWeight: 'bold', textAlign: 'center'}}>
              📄 View Complete Terms & Refund Policies
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleAcceptTerms} style={[s.btn, {marginTop: 10}]}>
            <Text style={s.btnTxt}>✨ I Agree & Start Shopping</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderInAppLegalModal = () => (
    <Modal visible={showLegalModal} animationType="slide" transparent={false} onRequestClose={() => setShowLegalModal(false)}>
      <SafeAreaView style={{flex: 1, backgroundColor: '#ffffff'}}>
        <View style={s.policyHeader}>
          <Text style={{color: '#fff', fontSize: 14, fontWeight: 'bold'}}>📜 Store Legal Policies & Terms</Text>
        </View>

        <ScrollView style={{flex: 1, padding: 16}} contentContainerStyle={{paddingBottom: 150}}>
          <Text style={{fontSize: 15, fontWeight: 'bold', color: '#4a148c', marginBottom: 2}}>MANOR MART</Text>
          <Text style={{fontSize: 10, color: '#666', marginBottom: 14}}>Terms & Conditions, Privacy & Refund Policy (Last Updated: September 2026)</Text>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>1. About Our Service & Coverage</Text>
            <Text style={s.policyText}>• Manor Mart is a hyper-local quick-commerce grocery ordering and delivery platform serving Manor, Palghar, Maharashtra.</Text>
            <Text style={s.policyText}>• Deliveries operate strictly within designated geo-fenced boundaries set by the store admin.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>2. Cancellation & Refund Policy (5 to 7 Days)</Text>
            <Text style={s.policyText}>• Customers can cancel orders directly through the app before dispatch ("Out for Delivery").</Text>
            <Text style={s.policyText}>• In case of cancellation before dispatch, refunds for prepaid online payments (Razorpay, UPI) are credited back to the source account within 5 to 7 business days.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>3. Privacy & User Data Protection</Text>
            <Text style={s.policyText}>• We collect phone number, name, delivery address, and GPS coordinates solely for delivery routing and geofencing verification.</Text>
            <Text style={s.policyText}>• We never sell, rent, or trade personal data to third parties.</Text>
            <Text style={s.policyText}>• Users have full rights to wipe their saved details or delete their account in Profile.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>4. Grievance & Official Support</Text>
            <Text style={s.policyText}>• Business Name: Manor Mart</Text>
            <Text style={s.policyText}>• Operational Region: Manor, Palghar, Maharashtra - 401403</Text>
            <Text style={s.policyText}>• Official Support Email: shabaj9769@gmail.com</Text>
          </View>
        </ScrollView>

        <View style={s.policyBottomBar}>
          <TouchableOpacity onPress={() => setShowLegalModal(false)} style={s.policyCloseBtn}>
            <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 13}}>✓ Close & Return to App</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={s.loginCon}>
        {renderTermsModal()}
        {renderInAppLegalModal()}

        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, width: '100%'}}>
          <View style={s.loginCard}>
            <Text style={{fontSize: 40, marginBottom: 8, textAlign: 'center'}}>🛒✨</Text>
            <Text style={s.lockTitle}>{storeSettings.store}</Text>
            {!showSignup ? (
              <>
                <Text style={{fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 15}}>Login with your registered mobile number and password:</Text>
                <TextInput style={s.lockInput} placeholder="10-digit Phone" keyboardType="numeric" maxLength={10} value={loginPhoneInput} onChangeText={setLoginPhoneInput} />
                <View style={{width: '100%', justifyContent: 'center'}}>
                  <TextInput style={[s.lockInput, {paddingRight: 40}]} placeholder="Password (8+ characters)" secureTextEntry={!showLoginPassword} value={loginPasswordInput} onChangeText={setLoginPasswordInput} />
                  <TouchableOpacity onPress={() => setShowLoginPassword(v => !v)} style={{position: 'absolute', right: 10, top: 0, bottom: 12, justifyContent: 'center'}}>
                    <Text style={{fontSize: 16}}>{showLoginPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[s.lockBtn, loggingIn && { opacity: 0.6 }]} onPress={handleLogin} disabled={loggingIn}>
                  <Text style={s.lockBtnTxt}>{loggingIn ? "🔐 Logging In..." : "🔐 Login Securely"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Forgot Password', 'Please contact the store/admin to set a temporary password. The app does not allow password reset using only a mobile number.')} style={{padding: 10, alignItems: 'center'}}>
                  <Text style={{fontSize: 10.5, color: '#6a1b9a', fontWeight: 'bold'}}>Forgot Password?</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSignup(true)} style={{padding: 10, alignItems: 'center'}}>
                  <Text style={{fontSize: 11, color: '#2e7d32', fontWeight: 'bold'}}>New here? Create an Account</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 15}}>Create your account to start ordering:</Text>
                <TextInput style={s.lockInput} placeholder="Full Name" value={signupNameInput} onChangeText={setSignupNameInput} />
                <TextInput style={s.lockInput} placeholder="10-digit Phone" keyboardType="numeric" maxLength={10} value={signupPhoneInput} onChangeText={setSignupPhoneInput} />
                <View style={{width: '100%', justifyContent: 'center'}}>
                  <TextInput style={[s.lockInput, {paddingRight: 40}]} placeholder="Password (8+ characters)" secureTextEntry={!showSignupPassword} value={signupPasswordInput} onChangeText={setSignupPasswordInput} />
                  <TouchableOpacity onPress={() => setShowSignupPassword(v => !v)} style={{position: 'absolute', right: 10, top: 0, bottom: 12, justifyContent: 'center'}}>
                    <Text style={{fontSize: 16}}>{showSignupPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[s.lockBtn, signingUp && { opacity: 0.6 }]} onPress={handleSignup} disabled={signingUp}>
                  <Text style={s.lockBtnTxt}>{signingUp ? "✨ Creating Account..." : "✨ Create Account"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSignup(false)} style={{padding: 10, alignItems: 'center'}}>
                  <Text style={{fontSize: 11, color: '#6a1b9a', fontWeight: 'bold'}}>Already have an account? Log In</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => setShowLegalModal(true)} style={s.policyInteractiveBtnSec}>
              <Text style={{fontSize: 10.5, color: '#fff', fontWeight: 'bold', textAlign: 'center'}}>📄 Terms, Privacy & Refund Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  let itemsToDisplay = [];
  let bannerList = [storeSettings.b1, storeSettings.b2, storeSettings.b3].filter(b => b && b.trim().startsWith('http'));

  if (searchQuery) {
    Object.keys(categories || {}).forEach(cat => {
      Object.keys(categories[cat] || {}).forEach(pKey => {
        if (pKey !== 'status' && pKey !== 'image' && pKey !== 'discountPercent') {
          let pr = categories[cat][pKey];
          if (pr?.name && pr.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            itemsToDisplay.push({ ...pr, id: pKey, catName: cat });
          }
        }
      });
    });
  } else if (selectedCat && categories[selectedCat]) {
    Object.keys(categories[selectedCat] || {}).forEach(pKey => {
      if (pKey !== 'status' && pKey !== 'image' && pKey !== 'discountPercent') {
        let pr = categories[selectedCat][pKey];
        if (pr?.name) itemsToDisplay.push({ ...pr, id: pKey, catName: selectedCat });
      }
    });
  }

  return (
    <SafeAreaView style={s.con}>
      {renderTermsModal()}
      {renderInAppLegalModal()}

      <View style={[s.hdr, activeTab !== 'shop' && { borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingBottom: 16 }]}>
        <View style={s.hdrTop}>
          <View style={{flex: 1, paddingRight: 8}}>
            <Text style={s.hdrEta}>⚡ Delivery in {storeSettings.expDeliveryTime}</Text>
            <TouchableOpacity onPress={() => setActiveTab('profile')} activeOpacity={0.7}>
              <Text style={s.hdrAddr} numberOfLines={1}>{custAddr ? custAddr : 'Add delivery address'} ▾</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => detectGPSAndLoadStore(true)} style={s.gpsPill} activeOpacity={0.7}>
            <Text style={{fontSize: 10.5, color: '#4a148c', fontWeight: '800'}} numberOfLines={1}>📍 {gpsStatus}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.hdrStore}>{storeSettings.store}</Text>
      </View>

      {storeSettings.storeOpen === false && (
        <View style={{backgroundColor: '#c62828', padding: 10, alignItems: 'center', width: '100%'}}>
          <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 12}}>🔴 Store is Currently Closed! Orders are temporarily suspended.</Text>
        </View>
      )}

      {activeTab === 'shop' && (
        <View style={s.stickySearchContainer}>
          <View style={s.searchWrap}>
            <Text style={{fontSize: 15, marginRight: 8}}>🔍</Text>
            <TextInput 
              style={s.searchInput} 
              placeholder='Search "rice", "kaju", "tomato"' 
              placeholderTextColor="#9a9a9a"
              value={searchQuery} 
              onChangeText={setSearchQuery} 
            />
            {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery('')}><Text style={{fontSize: 16, color: '#888', paddingHorizontal: 4}}>✕</Text></TouchableOpacity> : null}
          </View>
        </View>
      )}

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 170 + SAFE_BOTTOM, width: '100%', paddingHorizontal: 8 }}>
        {activeTab === 'shop' && (
          <View style={{width: '100%'}}>
            {storeSettings.adminNote ? (
              <View style={s.announcementBox}>
                <Text style={{fontSize: 10.5, color: '#d84315', fontWeight: 'bold', textAlign: 'center'}}>📢 {storeSettings.adminNote}</Text>
              </View>
            ) : null}

            {!selectedCat && !searchQuery && bannerList.length > 0 ? (
              <View style={{marginTop: 10, marginBottom: 6}}>
                <ScrollView
                  ref={bannerRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={e => { bannerIdxRef.current = Math.round(e.nativeEvent.contentOffset.x / BANNER_W); setBannerIdx(bannerIdxRef.current); }}
                  style={{borderRadius: 18}}
                >
                  {bannerList.map((bannerUrl, idx) => (
                    <Image key={idx} source={{ uri: bannerUrl }} style={{width: BANNER_W, height: 150, borderRadius: 18, resizeMode: 'cover'}} />
                  ))}
                </ScrollView>
                {bannerList.length > 1 && (
                  <View style={s.dotsRow}>
                    {bannerList.map((_, i) => <View key={i} style={[s.dot, i === bannerIdx && s.dotAct]} />)}
                  </View>
                )}
              </View>
            ) : null}

            {!selectedCat && !searchQuery ? (
              <View style={{width: '100%', marginBottom: 12, marginTop: 8}}>
                <Text style={s.sectionHead}>Shop by category</Text>
                <View style={s.catGridContainer}>
                  {Object.keys(categories || {}).map((catName, idx) => {
                    const catObj = categories[catName];
                    const catImgUrl = catObj?.image && typeof catObj.image === 'string' && catObj.image.trim().startsWith('http') 
                      ? catObj.image.trim() 
                      : null;
                    return (
                      <TouchableOpacity key={idx} onPress={() => setSelectedCat(catName)} style={s.instamartCatCard} activeOpacity={0.7}>
                        <View style={s.instamartCatCircle}>
                          {catImgUrl ? (
                            <Image source={{ uri: catImgUrl }} style={s.catCircleImg} />
                          ) : (
                            <Text style={{fontSize: 28}}>🛍️</Text>
                          )}
                        </View>
                        <Text style={{fontSize: 10.5, fontWeight: '700', color: '#2b2b2b', textAlign: 'center', marginTop: 6}} numberOfLines={2}>{catName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {(selectedCat || searchQuery) ? (
              <View style={{width: '100%'}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <TouchableOpacity onPress={() => { setSelectedCat(''); setSearchQuery(''); }} style={s.backPill}>
                    <Text style={{color: '#4a148c', fontSize: 12, fontWeight: '800'}}>‹ Back</Text>
                  </TouchableOpacity>
                  <Text style={{fontWeight: 'bold', fontSize: 12, color: '#4a148c'}} numberOfLines={1}>
                    {searchQuery ? `Search: "${searchQuery}"` : `📁 ${selectedCat}`}
                  </Text>
                </View>

                <View style={{width: '100%'}}>
                  {itemsToDisplay.length === 0 ? (
                    <Text style={{textAlign: 'center', color: '#888', marginTop: 25, width: '100%', fontSize: 11}}>No products found.</Text>
                  ) : (
                    <View style={s.productsGridContainer}>
                      {itemsToDisplay.map((pr, idx) => {
                        let effPrice = round2(Number(pr.price || 0) - Number(pr.discount || 0));
                        let cartQty = cart[pr.id]?.qty || 0;
                        let isSoldOut = pr.inStock === false;

                        return (
                          <View key={`${pr.catName}_${pr.id}`} style={[s.gridCard, isSoldOut && {opacity: 0.55}]}>
                            {Number(pr.discount || 0) > 0 && Number(pr.price) > 0 && (
                              <View style={s.offBadge}>
                                <Text style={s.offBadgeTxt}>{Math.round((Number(pr.discount) / Number(pr.price)) * 100)}% OFF</Text>
                              </View>
                            )}
                            {pr.image && typeof pr.image === 'string' && pr.image.trim().startsWith('http') ? (
                              <Image source={{ uri: pr.image.trim() }} style={s.gridImg} />
                            ) : (
                              <View style={[s.gridImg, {justifyContent:'center', alignItems:'center'}]}>
                                <Text style={{fontSize: 30}}>📦</Text>
                              </View>
                            )}
                            <View style={s.etaChip}><Text style={s.etaChipTxt}>⚡ {storeSettings.expDeliveryTime}</Text></View>
                            <View style={{flex: 1, width: '100%', marginTop: 6}}>
                              <Text style={{fontWeight: '700', fontSize: 12.5, color: '#1c1c1c'}} numberOfLines={2}>{pr.name || 'Product'}</Text>
                              <Text style={{fontSize: 10.5, color: '#7a7a7a', marginTop: 2}}>{pr.unit || ''}</Text>
                              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6}}>
                                <Text style={{fontWeight: '800', color: '#1c1c1c', fontSize: 14}}>₹{effPrice}</Text>
                                {Number(pr.discount || 0) > 0 && <Text style={{fontSize: 10.5, color: '#9a9a9a', textDecorationLine: 'line-through', marginLeft: 6}}>₹{pr.price}</Text>}
                              </View>
                            </View>

                            {isSoldOut ? (
                              <View style={{backgroundColor: '#e53935', width: '100%', paddingVertical: 5, borderRadius: 6, alignItems: 'center', marginTop: 4}}>
                                <Text style={{color: '#fff', fontSize: 9.5, fontWeight: 'bold'}}>SOLD OUT</Text>
                              </View>
                            ) : storeSettings.storeOpen === false ? (
                              <View style={{backgroundColor: '#757575', width: '100%', paddingVertical: 5, borderRadius: 6, alignItems: 'center', marginTop: 4}}>
                                <Text style={{color: '#fff', fontSize: 9.5, fontWeight: 'bold'}}>STORE CLOSED</Text>
                              </View>
                            ) : cartQty === 0 ? (
                              <TouchableOpacity onPress={() => updateCartQty(pr, 1)} style={s.gridAddBtn} activeOpacity={0.7}>
                                <Text style={{color: '#1b8a3a', fontSize: 12, fontWeight: '800'}}>ADD</Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={s.qtyCon}>
                                <TouchableOpacity onPress={() => updateCartQty(pr, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 16}}>−</Text></TouchableOpacity>
                                <Text style={{color:'#fff', fontWeight: '800', fontSize: 13}}>{cartQty}</Text>
                                <TouchableOpacity onPress={() => updateCartQty(pr, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 16}}>+</Text></TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'orders' && (
          <View style={{width: '100%', marginTop: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
              <Text style={s.sectionHead}>Your orders</Text>
              <TouchableOpacity onPress={() => fetchCustomerOrders(custPhone)} style={s.backPill}>
                <Text style={{fontSize: 12, fontWeight: '800', color: '#4a148c'}}>🔄 Refresh</Text>
              </TouchableOpacity>
            </View>

            {myOrders.filter(o => !hiddenOrderIds.includes(o.id)).length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={{fontSize: 46}}>🛵</Text>
                <Text style={{fontSize: 16, fontWeight: '800', color: '#1c1c1c', marginTop: 8}}>No orders yet</Text>
                <Text style={{fontSize: 12, color: '#7a7a7a', marginTop: 4}}>Your orders and live tracking will show up here.</Text>
                <TouchableOpacity onPress={() => setActiveTab('shop')} style={[s.btn, {width: undefined, paddingHorizontal: 26, backgroundColor: '#1b8a3a'}]}>
                  <Text style={s.btnTxt}>Start shopping</Text>
                </TouchableOpacity>
              </View>
            ) : (
              myOrders.filter(o => !hiddenOrderIds.includes(o.id)).map(ord => {
                let isDeleting = deleteStepOrder === ord.id;
                let isCancelling = cancelStepOrder === ord.id;
                const effStat = effectiveStatus(ord);
                let isWaitingPayment = effStat.includes('Payment Pending');
                let isCancelled = ord.deliveryStatus && ord.deliveryStatus.includes('Cancelled');
                let orderTimeFormatted = formatOrderDateTime(ord.timestamp);

                let boy = deliveryBoysList[ord.assignedBoy] || 
                          Object.values(deliveryBoysList || {}).find(b => b?.name === ord.assignedBoy || b?.id === ord.assignedBoy);
                let boyPhone = ord.deliveryBoyPhone || ord.assignedBoyPhone || boy?.phone || '';
                let boyName = boy?.name || ord.assignedBoy;

                return (
                  <View key={ord.id} style={[s.card, {borderLeftColor: isWaitingPayment ? '#e65100' : isCancelled ? '#c62828' : '#1b8a3a', borderLeftWidth: 5, width: '100%'}]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', color: '#1c1c1c', fontSize: 14 }}>Order #{ord.id.slice(-6)}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <View style={{backgroundColor: ord.payment === 'Online' ? '#e1bee7' : '#c8e6c9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6}}>
                          <Text style={{fontSize: 9, fontWeight: 'bold', color: ord.payment === 'Online' ? '#4a148c' : '#1b5e20'}}>
                            {ord.payment === 'Online' ? '💳 Online' : '💵 COD'}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '800', color: '#1c1c1c', marginRight: 8, fontSize: 14 }}>₹{ord.total}</Text>
                        <TouchableOpacity onPress={() => confirmDeleteOrder(ord.id)} style={{backgroundColor: isDeleting ? '#b71c1c' : '#c62828', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                          <Text style={{color: '#fff', fontSize: 8.5, fontWeight: 'bold'}}>{isDeleting ? '⚠️ Tap' : '🗑️'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {orderTimeFormatted ? (
                      <Text style={{fontSize: 9.5, color: '#555', marginTop: 2, marginBottom: 4}}>
                        🕒 Placed on: <Text style={{fontWeight: 'bold', color: '#333'}}>{orderTimeFormatted}</Text>
                      </Text>
                    ) : null}
                    
                    {renderTimelineTracker(effStat, ord.id, ord.total)}

                    {ord.assignedBoy ? (
                      <View style={{backgroundColor: '#eefaf0', padding: 12, borderRadius: 14, marginVertical: 8, borderWidth: 1, borderColor: '#bfe6c7'}}>
                        <Text style={{fontSize: 10, fontWeight: 'bold', color: '#2e7d32'}}>🛵 Assigned Delivery Partner:</Text>
                        <Text style={{fontSize: 12, fontWeight: 'bold', color: '#1b5e20', marginTop: 2}}>
                          {boyName} {boyPhone ? `(${boyPhone})` : ''}
                        </Text>
                        {boyPhone ? (
                          <TouchableOpacity 
                            onPress={() => Linking.openURL(`tel:${boyPhone}`)}
                            style={{backgroundColor: '#1b8a3a', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, marginTop: 8, alignSelf: 'flex-start'}}
                          >
                            <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>📞 Call Delivery Partner</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}

                    {!isCancelled && !ord.deliveryStatus?.includes('Delivered') && !ord.deliveryStatus?.includes('Out for Delivery') && (
                      <TouchableOpacity 
                        onPress={() => handleCancelOrderAction(ord.id, effStat, ord.payment)} 
                        style={{backgroundColor: isCancelling ? '#c62828' : '#fff', borderWidth: 1.5, borderColor: '#c62828', padding: 10, borderRadius: 12, marginVertical: 4, alignItems: 'center'}}
                      >
                        <Text style={{color: isCancelling ? '#fff' : '#c62828', fontWeight: '800', fontSize: 12}}>
                          {isCancelling ? '⚠️ Tap Again to Confirm Cancel' : 'Cancel This Order'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View style={s.itemsBox}>
                      <Text style={{fontSize: 9.5, fontWeight: 'bold', color: '#6a1b9a', marginBottom: 2}}>🛒 Purchased Items:</Text>
                      {Object.values(ord.items || {}).map((it, idx) => (
                        <Text key={idx} style={{ fontSize: 10, color: '#333' }}>• {it.name} ({it.unit}) x {it.qty} = ₹{Number(it.effectivePrice || 0) * Number(it.qty || 0)}</Text>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* --- REORGANIZED & CLEAN PROFILE SETTINGS TAB --- */}
        {activeTab === 'profile' && (
          <View style={{width: '100%', marginTop: 10}}>
            <View style={[s.card, {flexDirection: 'row', alignItems: 'center'}]}>
              <View style={s.avatar}>
                <Text style={{fontSize: 22, fontWeight: '900', color: '#4a148c'}}>{(custName || 'U').trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={{fontSize: 17, fontWeight: '800', color: '#1c1c1c'}} numberOfLines={1}>{custName || 'Your name'}</Text>
                <Text style={{fontSize: 12, color: '#7a7a7a', marginTop: 2}}>+91 {custPhone}</Text>
              </View>
            </View>

            {/* SECTION 1: PERSONAL INFORMATION */}
            <View style={s.card}>
              <Text style={s.secTitle}>Personal information</Text>
              
              <Text style={s.lbl}>Your Name:</Text>
              <TextInput 
                style={s.i} 
                value={custName} 
                onChangeText={setCustName} 
                placeholder="Enter Full Name" 
              />
              
              <Text style={s.lbl}>Mobile Number (Registered):</Text>
              <TextInput 
                style={[s.i, {backgroundColor: '#f5f5f5', color: '#666'}]} 
                value={custPhone} 
                editable={false} 
              />
              
              <TouchableOpacity 
                style={[s.btn, {backgroundColor: '#6a1b9a', marginTop: 8, padding: 9}]} 
                onPress={saveProfileDetails}
              >
                <Text style={s.btnTxt}>💾 Save Profile Details</Text>
              </TouchableOpacity>
            </View>

            {/* SECTION 2: DELIVERY ADDRESSES */}
            <View style={s.card}>
              <Text style={s.secTitle}>Delivery addresses</Text>
              
              <Text style={s.lbl}>Delivery Address:</Text>
              <TextInput 
                style={[s.i, {height: 52}]} 
                value={custAddr} 
                onChangeText={setCustAddr} 
                placeholder="House No, Landmark, Area, Town" 
                multiline={true} 
              />
              
              <TouchableOpacity 
                style={{backgroundColor: '#f3e8fb', padding: 11, borderRadius: 12, alignItems: 'center', marginTop: 6}} 
                onPress={saveCurrentAddress}
              >
                <Text style={{color: '#4a148c', fontSize: 12.5, fontWeight: '800'}}>➕ Save this address</Text>
              </TouchableOpacity>

              {savedAddresses.length > 0 && (
                <View style={{marginTop: 10, borderTopWidth: 1, borderColor: '#eee', paddingTop: 8}}>
                  <Text style={{fontSize: 10, fontWeight: 'bold', color: '#4a148c', marginBottom: 4}}>
                    Saved Addresses (Tap to select | ✕ to delete):
                  </Text>
                  {savedAddresses.map((ad, i) => (
                    <View key={i} style={s.savedAddrRow}>
                      <TouchableOpacity 
                        onPress={() => setCustAddr(ad)} 
                        style={{flex: 1, paddingRight: 6}}
                      >
                        <Text style={{fontSize: 10, color: '#222'}} numberOfLines={2}>📍 {ad}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        onPress={() => deleteSavedAddress(i)} 
                        style={s.addrDeleteBtn}
                      >
                        <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* SECTION 3: PASSWORD SECURITY */}
            <View style={s.card}>
              <Text style={s.secTitle}>Password</Text>
              {!showChangePassword ? (
                <TouchableOpacity style={[s.btn, {backgroundColor: '#4a148c'}]} onPress={() => setShowChangePassword(true)}>
                  <Text style={s.btnTxt}>Change My Password</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <Text style={s.lbl}>Current Password:</Text>
                  <View style={{width: '100%', justifyContent: 'center'}}>
                    <TextInput style={[s.i, {paddingRight: 36}]} secureTextEntry={!showOldPassword} value={oldPasswordInput} onChangeText={setOldPasswordInput} placeholder="Current password" />
                    <TouchableOpacity onPress={() => setShowOldPassword(v => !v)} style={{position: 'absolute', right: 8, top: 0, bottom: 2, justifyContent: 'center'}}>
                      <Text style={{fontSize: 15}}>{showOldPassword ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.lbl}>New Password:</Text>
                  <View style={{width: '100%', justifyContent: 'center'}}>
                    <TextInput style={[s.i, {paddingRight: 36}]} secureTextEntry={!showNewPassword} value={newPasswordInput} onChangeText={setNewPasswordInput} placeholder="New password (8+ characters)" />
                    <TouchableOpacity onPress={() => setShowNewPassword(v => !v)} style={{position: 'absolute', right: 8, top: 0, bottom: 2, justifyContent: 'center'}}>
                      <Text style={{fontSize: 15}}>{showNewPassword ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#2e7d32', opacity: savingPassword ? 0.6 : 1}]} disabled={savingPassword} onPress={changeCustomerPassword}>
                    <Text style={s.btnTxt}>{savingPassword ? 'Updating...' : 'Update Password'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#777'}]} onPress={() => {setShowChangePassword(false); setOldPasswordInput(''); setNewPasswordInput('');}}>
                    <Text style={s.btnTxt}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={{fontSize: 9.5, color: '#777', marginTop: 5}}>Forgot your password? Please contact the store/admin. For security, the app does not reset a password using only a mobile number.</Text>
            </View>

            {/* SECTION 4: STORE POLICIES & LEGAL */}
            <View style={s.card}>
              <Text style={s.secTitle}>📜 Store Policies & Legal Terms</Text>
              <Text style={{fontSize: 9.5, color: '#666', marginBottom: 6}}>
                Review Manor Mart return, refund (5-7 days), and customer data protection policies.
              </Text>
              
              <TouchableOpacity onPress={() => setShowLegalModal(true)} style={s.policyInteractiveBtn}>
                <Text style={{fontSize: 11, color: '#fff', fontWeight: 'bold', textAlign: 'center'}}>
                  📄 View Terms, Privacy & Refund Policy
                </Text>
              </TouchableOpacity>
            </View>

            {/* SECTION 4: ACCOUNT ACTIONS (LOGOUT / EXIT / DELETE) */}
            <View style={[s.card, {borderColor: '#ffcdd2'}]}>
              <Text style={[s.secTitle, {color: '#c62828'}]}>🔒 Account Management</Text>
              
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 4}}>
                <TouchableOpacity 
                  style={[s.btn, {backgroundColor: '#e65100', flex: 1, marginRight: 4, padding: 9}]} 
                  onPress={handleLogout}
                >
                  <Text style={s.btnTxt}>🚪 Logout</Text>
                </TouchableOpacity>

                {Platform.OS === 'android' && (
                <TouchableOpacity 
                  style={[s.btn, {backgroundColor: '#555', flex: 1, marginLeft: 4, padding: 9}]} 
                  onPress={handleExitApp}
                >
                  <Text style={s.btnTxt}>🔴 Exit App</Text>
                </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity 
                style={[s.btn, {backgroundColor: '#c62828', marginTop: 8, padding: 9}]} 
                onPress={handleDeleteAccount}
              >
                <Text style={s.btnTxt}>⚠️ Delete My Account</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}
      </ScrollView>

      <View style={s.bottomNav}>
        {[
          { key: 'shop', icon: '🛍️', label: 'Shop' },
          { key: 'orders', icon: '📦', label: 'Orders' },
          { key: 'profile', icon: '👤', label: 'Profile' },
          { key: 'exit', icon: '🚪', label: 'Exit', action: handleExitApp }
        ].filter(t => t.key !== 'exit' || Platform.OS === 'android').map(t => (
          <TouchableOpacity key={t.key} onPress={t.action ? t.action : () => { setActiveTab(t.key); if (t.key === 'orders') fetchCustomerOrders(custPhone); }} style={s.navItem} activeOpacity={0.7}>
            <Text style={{fontSize: 20, opacity: activeTab === t.key || t.key === 'exit' ? 1 : 0.5}}>{t.icon}</Text>
            <Text style={[s.navLbl, activeTab === t.key && s.navLblAct]}>{t.label}</Text>
            {activeTab === t.key && <View style={s.navBar} />}
          </TouchableOpacity>
        ))}
      </View>
      {subtotal > 0 && activeTab === 'shop' && storeSettings.storeOpen !== false && (
        <View style={s.floatingCartBar}>
          <View style={{flex: 1, paddingRight: 6}}>
            <Text style={{color: '#fff', fontSize: 10.5, fontWeight: 'bold'}} numberOfLines={1}>{cartItemsList.reduce((sum, i) => sum + i.qty, 0)} Items | ₹{subtotal}</Text>
            <Text style={{color: '#d7f5de', fontSize: 9.5}} numberOfLines={1}>All taxes included</Text>
          </View>
          <TouchableOpacity onPress={() => setActiveTab('cart')} style={s.viewCartBtn}>
            <Text style={{color: '#1b8a3a', fontWeight: '800', fontSize: 12}} numberOfLines={1}>View Cart ➔</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={activeTab === 'cart'} animationType="slide" onRequestClose={() => setActiveTab('shop')}>
        <SafeAreaView style={{flex: 1, backgroundColor: '#f6f4f9', width: '100%'}}>
          <View style={[s.hdr, {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22}]}>
            <Text style={{color: '#fff', fontSize: 22, fontWeight: '900'}}>My cart</Text>
            <TouchableOpacity onPress={() => setActiveTab('shop')} style={s.gpsPill}>
              <Text style={{color: '#4a148c', fontSize: 12, fontWeight: '800'}}>‹ Back to store</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{padding: 10, width: '100%'}} contentContainerStyle={{paddingBottom: 35 + SAFE_BOTTOM}}>
            <View style={{backgroundColor: '#e3f6e8', borderRadius: 14, padding: 12, marginBottom: 10}}>
              <Text style={{color: '#1b8a3a', fontWeight: '800', fontSize: 13}}>⚡ Delivery in {storeSettings.expDeliveryTime}</Text>
              <Text style={{color: '#3d7a4d', fontSize: 11, marginTop: 2}}>{cartItemsList.reduce((sum, i) => sum + i.qty, 0)} items in your cart</Text>
            </View>
            <View style={s.card}>
              <Text style={s.secTitle}>Review your cart</Text>
              {cartItemsList.map(item => (
                <View key={item.id} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#eee'}}>
                  <View style={{flex: 1, paddingRight: 8}}>
                    <Text style={{fontWeight: '700', fontSize: 13, color: '#1c1c1c'}}>{item.name} ({item.unit})</Text>
                    <Text style={{fontSize: 9.5, color: '#666', marginTop: 2}}>₹{round2(item.effectivePrice)} x {item.qty} = ₹{round2(item.effectivePrice * item.qty)}</Text>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <View style={s.qtyConCart}>
                      <TouchableOpacity onPress={() => updateCartQty(item, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 16}}>−</Text></TouchableOpacity>
                      <Text style={{marginHorizontal: 6, fontWeight: '800', fontSize: 13, color: '#fff'}}>{item.qty}</Text>
                      <TouchableOpacity onPress={() => updateCartQty(item, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 14}}>+</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setCart(prev => { let u = {...prev}; delete u[item.id]; return u; })} style={{backgroundColor: '#fdecea', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, marginLeft: 8}}>
                      <Text style={{color: '#c62828', fontSize: 11, fontWeight: '800'}}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={{marginTop: 8, borderTopWidth: 1, borderColor: '#ddd', paddingTop: 6}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{fontSize: 10.5}}>Subtotal:</Text><Text style={{fontSize: 10.5, fontWeight: 'bold'}}>₹{subtotal}</Text></View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{fontSize: 10.5}}>Delivery Fee ({deliveryType}):</Text><Text style={{fontSize: 10.5, fontWeight: 'bold'}}>₹{deliveryFee}</Text></View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 3}}><Text style={{fontSize: 12, fontWeight: 'bold', color: '#6a1b9a'}}>Grand Total:</Text><Text style={{fontSize: 12, fontWeight: 'bold', color: '#6a1b9a'}}>₹{finalTotal}</Text></View>
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.secTitle}>Delivery details</Text>
              <Text style={s.lbl}>Full Name:</Text>
              <TextInput style={s.i} placeholder="Enter Full Name (Required)" value={custName} onChangeText={v => setCustName(v)} />
              <Text style={s.lbl}>Mobile Number:</Text>
              <TextInput style={[s.i, {backgroundColor: '#f5f5f5'}]} value={custPhone} editable={false} />
              
              <Text style={s.lbl}>Delivery Address:</Text>
              <TextInput 
                style={[s.i, {height: 55}]} 
                placeholder="House No, Landmark, Area, Town" 
                multiline={true} 
                value={custAddr} 
                onChangeText={v => setCustAddr(v)} 
              />

              {savedAddresses.length > 0 && (
                <View style={{marginVertical: 3}}>
                  <Text style={{fontSize: 9.5, fontWeight: 'bold', color: '#6a1b9a'}}>Quick Select Saved Address:</Text>
                  <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={{marginTop: 2}}>
                    {savedAddresses.map((ad, i) => (
                      <TouchableOpacity key={i} onPress={() => setCustAddr(ad)} style={{backgroundColor: '#f3e5f5', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginRight: 4}}>
                        <Text style={{fontSize: 9, color: '#4a148c'}}>{ad}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={s.lbl}>Select Delivery Speed:</Text>
              <View style={{flexDirection: 'row', marginVertical: 3}}>
                {['Normal', 'Express'].map(spd => (
                  <TouchableOpacity key={spd} onPress={() => setDeliveryType(spd)} style={[s.catChip, deliveryType === spd && s.catChipAct]}>
                    <Text style={{fontSize: 10, fontWeight: 'bold', color: deliveryType === spd ? '#fff' : '#6a1b9a'}}>{spd === 'Express' ? `⚡ Express (${storeSettings.expDeliveryTime})` : '📦 Normal Delivery'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.lbl}>Select Delivery Shift:</Text>
              <View style={{flexDirection: 'row', marginVertical: 3}}>
                {['Morning (8 AM - 11 AM)', 'Evening (4 PM - 8 PM)'].map(sh => (
                  <TouchableOpacity key={sh} onPress={() => setDeliveryShift(sh)} style={[s.catChip, deliveryShift === sh && s.catChipAct]}>
                    <Text style={{fontSize: 9.5, fontWeight: 'bold', color: deliveryShift === sh ? '#fff' : '#6a1b9a'}}>{sh}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.lbl}>Payment Mode:</Text>
              <View style={{flexDirection: 'row', marginVertical: 3}}>
                <TouchableOpacity onPress={() => setPaymentMode('COD')} style={[s.catChip, paymentMode === 'COD' && s.catChipAct]}>
                  <Text style={{fontSize: 10, fontWeight: 'bold', color: paymentMode === 'COD' ? '#fff' : '#6a1b9a'}}>💵 Cash on Delivery</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setPaymentMode('Online')} style={[s.catChip, paymentMode === 'Online' && s.catChipAct]}>
                  <Text style={{fontSize: 10, fontWeight: 'bold', color: paymentMode === 'Online' ? '#fff' : '#6a1b9a'}}>💳 Pay Online (Razorpay / UPI)</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={[s.btn, {marginTop: 14, backgroundColor: '#1b8a3a', padding: 15, borderRadius: 14, opacity: placing ? 0.6 : 1}]} 
                onPress={placeOrder}
                disabled={placing}
              >
                <Text style={{color: '#fff', fontWeight: '800', fontSize: 14.5, textAlign: 'center'}}>
                  {placing ? 'Placing order...' : paymentMode === 'Online' ? `Pay ₹${finalTotal} & Place Order` : `Place COD Order (₹${finalTotal})`}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  loginCon: { flex: 1, backgroundColor: '#4a148c', width: '100%' },
  loginCard: { width: '100%', maxWidth: '100%', backgroundColor: '#ffffff', padding: 20, borderRadius: 14, elevation: 6 },
  lockTitle: { fontSize: 21, fontWeight: 'bold', color: '#4a148c', marginBottom: 4, textAlign: 'center' },
  lockInput: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#f3e5f5', padding: 10, borderRadius: 8, fontSize: 14, textAlign: 'center', letterSpacing: 2, marginBottom: 12 },
  lockBtn: { backgroundColor: '#6a1b9a', padding: 12, borderRadius: 8, alignItems: 'center' },
  lockBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 12.5 },
  con: { flex: 1, backgroundColor: '#f6f4f9', width: '100%' },
  hdr: { backgroundColor: '#4a148c', paddingHorizontal: 14, paddingBottom: 10, paddingTop: 45, width: '100%' },
  hdrTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hdrEta: { color: '#ffd54f', fontSize: 20, fontWeight: '900' },
  hdrAddr: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 2 },
  hdrStore: { color: '#ce93d8', fontSize: 10.5, fontWeight: '700', marginTop: 4 },
  gpsPill: { backgroundColor: '#ffd54f', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, maxWidth: 130 },
  ht: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  headerTabBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#7b1fa2', marginHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  headerTabAct: { backgroundColor: '#ffd54f' },
  body: { padding: 4, width: '100%', flex: 1 },
  announcementBox: { backgroundColor: '#fbe9e7', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ffccbc', width: '100%' },
  warningBox: { backgroundColor: '#ffebee', padding: 8, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#ef9a9a', width: '100%' },
  stickySearchContainer: { backgroundColor: '#4a148c', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 2, width: '100%', borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 13.5, color: '#1c1c1c', paddingVertical: 0 },
  searchBar: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 10, borderRadius: 12, fontSize: 12, width: '100%', elevation: 1 },
  bannerVerticalContainer: { width: '100%', marginBottom: 8, marginTop: 4 },
  bannerVerticalImg: { width: '100%', height: 135, borderRadius: 12, resizeMode: 'cover', marginBottom: 6, borderWidth: 1, borderColor: '#e1bee7' },
  catGridContainer: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  sectionHead: { fontSize: 16, fontWeight: '800', color: '#1c1c1c', marginBottom: 10 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d1c4e9', marginHorizontal: 3 },
  dotAct: { width: 18, backgroundColor: '#6a1b9a' },
  backPill: { backgroundColor: '#f3e5f5', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  offBadge: { position: 'absolute', top: 0, left: 10, backgroundColor: '#2e7d32', paddingHorizontal: 6, paddingVertical: 3, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, zIndex: 2 },
  offBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  etaChip: { backgroundColor: '#f1f1f1', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start' },
  etaChipTxt: { fontSize: 9, fontWeight: '700', color: '#444' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 62 + SAFE_BOTTOM, backgroundColor: '#fff', flexDirection: 'row', borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 16, paddingBottom: 4 + SAFE_BOTTOM },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navLbl: { fontSize: 10.5, fontWeight: '600', color: '#8a8a8a', marginTop: 1 },
  navLblAct: { color: '#4a148c', fontWeight: '800' },
  navBar: { position: 'absolute', top: 0, width: 28, height: 3, borderRadius: 2, backgroundColor: '#4a148c' },
  instamartCatCard: { width: '25%', paddingHorizontal: 4, alignItems: 'center', marginBottom: 14 },
  instamartCatCircle: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: '#f3e8fb', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  catCircleImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  productsGridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 15, width: '100%' },
  gridCard: { width: '48.5%', backgroundColor: '#fff', padding: 10, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#ececec', alignItems: 'flex-start', minHeight: 230, justifyContent: 'space-between' },
  gridImg: { width: '100%', height: 115, borderRadius: 10, backgroundColor: '#f7f5fa', marginBottom: 8, resizeMode: 'contain' },
  gridAddBtn: { backgroundColor: '#f1fbf3', borderWidth: 1.5, borderColor: '#1b8a3a', width: '100%', paddingVertical: 7, borderRadius: 10, alignItems: 'center', marginTop: 2 },
  qtyCon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b8a3a', padding: 3, borderRadius: 10, marginTop: 2, justifyContent: 'space-between', width: '100%' },
  qtyConCart: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b8a3a', padding: 2, borderRadius: 10, justifyContent: 'space-between' },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#ffd54f', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  qtyBtn: { width: 30, height: 28, justifyContent: 'center', alignItems: 'center' },
  floatingCartBar: { position: 'absolute', bottom: 72 + SAFE_BOTTOM, left: 12, right: 12, backgroundColor: '#1b8a3a', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8 },
  viewCartBtn: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#ece7f2', width: '100%' },
  secTitle: { fontSize: 15, fontWeight: '800', color: '#1c1c1c', marginVertical: 4 },
  itemsBox: { backgroundColor: '#faf8fc', padding: 10, borderRadius: 12, marginVertical: 6, borderWidth: 1, borderColor: '#eee', width: '100%' },
  lbl: { fontSize: 11.5, fontWeight: '700', color: '#555', marginTop: 8 },
  i: { borderWidth: 1, borderColor: '#e3daee', backgroundColor: '#faf8fc', padding: 11, borderRadius: 12, fontSize: 13, marginVertical: 3, width: '100%' },
  btn: { backgroundColor: '#6a1b9a', padding: 13, borderRadius: 12, alignItems: 'center', marginTop: 10, width: '100%' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: '#f3e8fb', marginRight: 6, marginBottom: 6, borderWidth: 1.5, borderColor: '#f3e8fb' },
  catChipAct: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  savedAddrRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#faf8fc', borderWidth: 1, borderColor: '#eee', padding: 10, borderRadius: 12, marginVertical: 3, justifyContent: 'space-between' },
  addrDeleteBtn: { backgroundColor: '#c62828', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 15, width: '100%' },
  modalCard: { width: '100%', maxWidth: 350, backgroundColor: '#fff', padding: 15, borderRadius: 14, elevation: 8 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#4a148c' },
  policyHeader: { backgroundColor: '#4a148c', paddingHorizontal: 15, paddingVertical: 12, paddingTop: 45, width: '100%', elevation: 4 },
  policyBlock: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#eeeeee' },
  policyBlockTitle: { fontSize: 12, fontWeight: 'bold', color: '#4a148c', marginBottom: 4 },
  policyText: { fontSize: 11, color: '#333', lineHeight: 16, marginBottom: 3 },
  policyBottomBar: { position: 'absolute', bottom: 60, left: 15, right: 15, zIndex: 999 },
  policyCloseBtn: { backgroundColor: '#6a1b9a', paddingVertical: 12, borderRadius: 10, alignItems: 'center', elevation: 6 },
  policyInteractiveBtn: { backgroundColor: '#6a1b9a', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, marginVertical: 4, alignItems: 'center' },
  policyInteractiveBtnSec: { backgroundColor: '#7b1fa2', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginTop: 10, alignItems: 'center' }
});
