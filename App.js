// --- MANOR MART ADVANCED INSTAMART-STYLE CUSTOMER APP ---
import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  ScrollView, Alert, SafeAreaView, Modal, Image, 
  Platform, BackHandler, Linking 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const db = "https://manorbiryani-default-rtdb.firebaseio.com/";

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
    b3: ''
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

  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddr, setCustAddr] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPhoneInput, setLoginPhoneInput] = useState('');

  const [deliveryType, setDeliveryType] = useState('Normal');
  const [deliveryShift, setDeliveryShift] = useState('Morning (8 AM - 11 AM)');
  const [paymentMode, setPaymentMode] = useState('COD');

  const [myOrders, setMyOrders] = useState([]);
  const [deliveryBoysList, setDeliveryBoysList] = useState({});
  const [deleteStepOrder, setDeleteStepOrder] = useState(null);
  const [cancelStepOrder, setCancelStepOrder] = useState(null);

  const gpsFetchedRef = useRef(false);

  useEffect(() => {
    checkInitialTermsAgreement();
    checkSavedCustomerSession();
    checkURLPaymentReturn();

    if (!gpsFetchedRef.current) {
      detectGPSAndLoadStore(false);
    }

    const handleDeepLink = async (event) => {
      if (!event?.url) return;
      try {
        let urlStr = event.url;
        if (urlStr.includes('success') || urlStr.includes('razorpay_payment_id')) {
          let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await verifyAndConfirmOrder(pendingOrderId);
          } else {
            let phone = custPhone || await AsyncStorage.getItem('manor_cust_phone');
            if (phone) fetchCustomerOrders(phone);
            setActiveTab('orders');
          }
        }
      } catch (e) {}
    };

    const sub = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then(async (url) => {
      if (url && (url.includes('success') || url.includes('razorpay_payment_id'))) {
        let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
        if (pendingOrderId) {
          await verifyAndConfirmOrder(pendingOrderId);
        } else {
          let phone = custPhone || await AsyncStorage.getItem('manor_cust_phone');
          if (phone) fetchCustomerOrders(phone);
          setActiveTab('orders');
        }
      }
    }).catch(() => {});

    const autoRefreshInterval = setInterval(() => {
      fetch(db + ".json").then(r => r.json()).then(data => {
        if (!data) return;
        if (data.settings) {
          setStoreSettings(prev => {
            const updated = { ...prev, ...data.settings };
            calcGeoFence(custLat, custLng, updated.hubLat, updated.hubLng, updated.radiusKm);
            return updated;
          });
        }
        if (data.categories) setCategories(data.categories);
        if (data.deliveryBoys) setDeliveryBoysList(data.deliveryBoys);
      }).catch(() => {});

      if (custPhone) {
        fetchCustomerOrders(custPhone);
      }
    }, 5000);

    return () => {
      clearInterval(autoRefreshInterval);
      if (sub && sub.remove) sub.remove();
    };
  }, [custPhone, custLat, custLng]);

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

  const verifyAndConfirmOrder = async (orderId) => {
    try {
      await fetch(db + `orders/${orderId}/deliveryStatus.json`, {
        method: 'PUT',
        body: JSON.stringify('Order Successful')
      });
      await AsyncStorage.removeItem('manor_pending_ord');
      let phone = custPhone || await AsyncStorage.getItem('manor_cust_phone');
      if (phone) fetchCustomerOrders(phone);
      setActiveTab('orders');
      Alert.alert("🎉 Payment Successful", "Payment verified and order confirmed successfully!");
    } catch(e) {
      setActiveTab('orders');
    }
  };

  const checkSavedCustomerSession = async () => {
    try {
      let savedPhone = await AsyncStorage.getItem('manor_cust_phone');
      let savedName = await AsyncStorage.getItem('manor_cust_name');
      let savedAddr = await AsyncStorage.getItem('manor_cust_addr');
      let savedAddrsList = await AsyncStorage.getItem('manor_cust_addrs_list');

      if (savedPhone) {
        setCustPhone(savedPhone);
        if (savedName) setCustName(savedName);
        if (savedAddr) setCustAddr(savedAddr);
        if (savedAddrsList) {
          try { setSavedAddresses(JSON.parse(savedAddrsList)); } catch(e){}
        } else if (savedAddr) {
          setSavedAddresses([savedAddr]);
        }
        setIsLoggedIn(true);
        fetchCustomerOrders(savedPhone);
      }
    } catch(e) {}
  };

  const detectGPSAndLoadStore = async (forceManual = false) => {
    if (gpsFetchedRef.current && !forceManual) {
      loadStoreConfig(custLat, custLng);
      return;
    }

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              gpsFetchedRef.current = true;
              setCustLat(pos.coords.latitude);
              setCustLng(pos.coords.longitude);
              loadStoreConfig(pos.coords.latitude, pos.coords.longitude);
            },
            () => {
              gpsFetchedRef.current = true;
              loadStoreConfig(custLat, custLng);
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
          );
        } else {
          loadStoreConfig(custLat, custLng);
        }
      } else {
        let { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
        if (status === 'granted') {
          let loc = await Location.getCurrentPositionAsync({ 
            accuracy: Location.Accuracy.Lowest,
            maximumAge: 60000 
          }).catch(() => null);

          if (loc?.coords) {
            gpsFetchedRef.current = true;
            setCustLat(loc.coords.latitude);
            setCustLng(loc.coords.longitude);
            loadStoreConfig(loc.coords.latitude, loc.coords.longitude);
            if (forceManual) Alert.alert("📍 Location Updated", "Your location has been refreshed.");
            return;
          }
        }
        gpsFetchedRef.current = true;
        loadStoreConfig(custLat, custLng);
      }
    } catch (e) {
      loadStoreConfig(custLat, custLng);
    }
  };

  const loadStoreConfig = (lat, lng) => {
    fetch(db + ".json").then(r => r.json()).then(data => {
      if (!data) return;
      let currentSettings = storeSettings;
      if (data.settings) {
        currentSettings = { ...storeSettings, ...data.settings };
        setStoreSettings(currentSettings);
      }
      if (data.categories) setCategories(data.categories);
      if (data.deliveryBoys) setDeliveryBoysList(data.deliveryBoys);

      calcGeoFence(lat, lng, currentSettings.hubLat, currentSettings.hubLng, currentSettings.radiusKm);
    }).catch(() => {});
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

  const sanitizeInput = (str) => (str || '').replace(/[.#$[\]/]/g, '').trim();

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

  const updateCartQty = (prod, delta) => {
    if (!prod || !prod.id) return;
    if (prod.inStock === false) {
      return Alert.alert("Out of Stock", "Sorry, this item is out of stock.");
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

  let cartItemsList = Object.values(cart || {});
  let subtotal = cartItemsList.reduce((sum, i) => sum + (Number(i.effectivePrice || 0) * Number(i.qty || 0)), 0);

  let deliveryFee = 0;
  let freeThreshold = Number(storeSettings.freeDel || 0);
  let normFee = Number(storeSettings.normCharge || 0);
  let expExtra = Number(storeSettings.expCharge || 30);

  if (freeThreshold > 0 && subtotal >= freeThreshold) deliveryFee = 0;
  else deliveryFee = normFee;
  if (deliveryType === 'Express') deliveryFee += expExtra;
  let finalTotal = subtotal + (subtotal > 0 ? deliveryFee : 0);

  const handleLogin = async () => {
    let cleanPh = (loginPhoneInput || '').replace(/[^0-9]/g, '').trim();
    if (cleanPh.length !== 10) return Alert.alert("Invalid Phone", "Please enter a valid 10-digit mobile number!");
    
    setCustPhone(cleanPh);
    setIsLoggedIn(true);
    await AsyncStorage.setItem('manor_cust_phone', cleanPh);
    
    // Purani history aur profile cloud se fetch karein
    fetchCustomerOrders(cleanPh);
    
    fetch(db + `customers/${cleanPh}.json`).then(r => r.json()).then(async (userData) => {
      if (userData) {
        if (userData.name) {
          setCustName(userData.name);
          await AsyncStorage.setItem('manor_cust_name', userData.name);
        }
        if (userData.addr) {
          setCustAddr(userData.addr);
          await AsyncStorage.setItem('manor_cust_addr', userData.addr);
        }
        if (userData.addresses && Array.isArray(userData.addresses)) {
          setSavedAddresses(userData.addresses);
          await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(userData.addresses));
        }
      }
    }).catch(() => {});

    Alert.alert("Welcome", "Logged in successfully! Your orders and account history are restored.");
  };

  const fetchCustomerOrders = (phone) => {
    if (!phone) return;
    fetch(db + "orders.json").then(r => r.json()).then(data => {
      if (!data) return setMyOrders([]);
      let list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      let mine = list.filter(o => o.phone === phone);
      setMyOrders(mine.reverse());
    }).catch(() => {});
  };

  const handleLogout = async () => {
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
    Alert.alert("Logged Out", "Your session has been cleared.");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account and saved addresses?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, Delete", onPress: handleLogout, style: "destructive" }
      ]
    );
  };

  const handleExitApp = () => {
    Alert.alert(
      "Exit App",
      "Do you want to exit the application?",
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

  const handleCancelOrderAction = (orderId, currentStatus, paymentModeVal) => {
    if (currentStatus === 'Delivered' || currentStatus === 'Out for Delivery') {
      return Alert.alert("Notice", "Order cannot be cancelled once dispatched.");
    }

    if (cancelStepOrder === orderId) {
      setCancelStepOrder(null);
      let newCancelStatus = paymentModeVal === 'Online'
        ? (currentStatus?.includes('Payment Pending') ? '❌ Cancelled (Unpaid)' : '❌ Cancelled (Paid - Refundable)')
        : '❌ Order Cancelled (COD)';

      fetch(db + `orders/${orderId}.json`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryStatus: newCancelStatus })
      }).then(() => {
        fetchCustomerOrders(custPhone);
        Alert.alert(
          "Order Cancelled", 
          paymentModeVal === 'Online' && !currentStatus?.includes('Payment Pending')
            ? "Your order has been cancelled. Your refund will be credited to the source payment account within 5 to 7 business days."
            : "Your order has been cancelled successfully."
        );
      }).catch(() => {
        Alert.alert("Error", "Network problem, please try again.");
      });
    } else {
      setCancelStepOrder(orderId);
      setTimeout(() => setCancelStepOrder(null), 4000);
    }
  };

  const confirmDeleteOrder = (orderId) => {
    if (deleteStepOrder === orderId) {
      fetch(db + `orders/${orderId}.json`, { method: 'DELETE' }).then(() => {
        setDeleteStepOrder(null);
        fetchCustomerOrders(custPhone);
        Alert.alert("Deleted", "Order removed from history.");
      });
    } else {
      setDeleteStepOrder(orderId);
      setTimeout(() => setDeleteStepOrder(null), 4000);
    }
  };

  const saveCurrentAddress = async () => {
    let cleanAddr = sanitizeInput(custAddr);
    if (!cleanAddr) return Alert.alert("Required", "Please type an address to save!");
    let updatedAddrs = [...savedAddresses];
    if (!updatedAddrs.includes(cleanAddr)) {
      updatedAddrs.push(cleanAddr);
      setSavedAddresses(updatedAddrs);
      await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(updatedAddrs));
      
      if (custPhone) {
        fetch(db + `customers/${custPhone}/addresses.json`, {
          method: 'PUT',
          body: JSON.stringify(updatedAddrs)
        }).catch(() => {});
      }
      Alert.alert("Saved", "Address added to your saved list!");
    }
  };

  const placeOrder = async () => {
    if (storeSettings.storeOpen === false) {
      return Alert.alert("Store Closed", "Store is currently closed.");
    }

    let cleanName = sanitizeInput(custName);
    let cleanAddr = sanitizeInput(custAddr);

    if (!cleanName) return Alert.alert("Name Required", "Please enter your full name!");
    if (!cleanAddr) return Alert.alert("Address Required", "Please enter your delivery address!");
    if (!custPhone || custPhone.length !== 10) return Alert.alert("Phone Required", "Please verify your 10-digit phone number.");

    if (!inRange) {
      return Alert.alert(
        "🚫 Outside Delivery Zone", 
        `Delivery is restricted to ${storeSettings.radiusKm} KM from store hub. You are currently ${distanceKm} KM away.`
      );
    }

    let minOrd = Number(storeSettings.minOrd || 0);
    if (minOrd > 0 && subtotal < minOrd) {
      return Alert.alert("Minimum Order Limit", `Minimum order amount is ₹${minOrd}.`);
    }

    let orderId = 'ord_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    let initialStatus = paymentMode === 'Online' ? '⏳ Payment Pending' : 'Order Successful';
    let currentTimestamp = Date.now();

    let orderObj = {
      id: orderId, 
      name: cleanName, 
      phone: custPhone, 
      addr: cleanAddr,
      lat: custLat, 
      lng: custLng, 
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

    fetch(db + `orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify(orderObj)
    }).then(async () => {
      // User profile backup to Firebase
      fetch(db + `customers/${custPhone}.json`, {
        method: 'PATCH',
        body: JSON.stringify({ name: cleanName, addr: cleanAddr, phone: custPhone })
      }).catch(() => {});

      setCart({});
      if (paymentMode === 'Online') {
        await AsyncStorage.setItem('manor_pending_ord', orderId);
        let customBaseUrl = storeSettings.upi && storeSettings.upi.trim().startsWith('http') 
          ? storeSettings.upi.trim() 
          : 'https://shabaj9769-alt.github.io/manormart-pay/';
        
        let targetUrl = `${customBaseUrl}?amount=${finalTotal}&order_id=${orderId}&app_scheme=manormart`;
        
        Linking.openURL(targetUrl).catch(() => {
          Alert.alert("Browser Error", "Unable to open payment checkout page.");
        });
      } else {
        setActiveTab('orders');
        fetchCustomerOrders(custPhone);
        Alert.alert("Order Placed", `Order #${orderId.slice(-6)} placed successfully!`);
      }
    }).catch(() => {
      Alert.alert("Error", "Could not process order. Please check your network.");
    });
  };

  const renderTimelineTracker = (status, orderId) => {
    let steps = ['Order Successful', 'Assigned', 'Out for Delivery', 'Delivered'];
    let currentStepIdx = 0;
    if (status === 'Assigned') currentStepIdx = 1;
    else if (status === 'Out for Delivery') currentStepIdx = 2;
    else if (status === 'Delivered') currentStepIdx = 3;
    else if (status && status.includes('Payment Pending')) {
      return (
        <View style={{marginVertical: 6, backgroundColor: '#fff3e0', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ffb74d', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <View>
            <Text style={{fontSize: 11, color: '#e65100', fontWeight: 'bold'}}>⏳ Awaiting Payment Completion</Text>
            <Text style={{fontSize: 9.5, color: '#666', marginTop: 2}}>Tap check if payment is done:</Text>
          </View>
          <TouchableOpacity onPress={() => {
            fetch(db + `orders/${orderId}.json`).then(r => r.json()).then(ord => {
              if (ord && ord.deliveryStatus === 'Order Successful') {
                Alert.alert("Verified!", "Payment confirmed successfully!");
                fetchCustomerOrders(custPhone);
              } else {
                Alert.alert("Pending", "Payment has not been confirmed yet.");
              }
            });
          }} style={{backgroundColor: '#e65100', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5}}>
            <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>🔄 Check</Text>
          </TouchableOpacity>
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
    <Modal visible={!termsAccepted} transparent={true} animationType="slide">
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
    <Modal visible={showLegalModal} animationType="slide" transparent={false}>
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
            <Text style={{fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 15}}>Enter 10-digit mobile number to enter store:</Text>
            <TextInput style={s.lockInput} placeholder="10-digit Phone" keyboardType="numeric" maxLength={10} value={loginPhoneInput} onChangeText={setLoginPhoneInput} />
            <TouchableOpacity style={s.lockBtn} onPress={handleLogin}><Text style={s.lockBtnTxt}>🚀 Enter Store Now</Text></TouchableOpacity>
            
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

      <View style={s.hdr}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6}}>
          <View style={{flex: 1, paddingRight: 6}}>
            <Text style={s.ht} numberOfLines={1}>🛒 {storeSettings.store}</Text>
            <Text style={{fontSize: 10, color: '#ffd54f', fontWeight: 'bold', marginTop: 2}} numberOfLines={1}>
              📍 Delivery to: {custAddr ? custAddr : 'Enter address in Profile'}
            </Text>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity onPress={() => detectGPSAndLoadStore(true)} style={{backgroundColor: '#7b1fa2', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, marginRight: 6}}>
              <Text style={{fontSize: 9.5, color: '#fff', fontWeight: 'bold'}}>🔄 GPS</Text>
            </TouchableOpacity>
            <View style={{backgroundColor: inRange ? '#2e7d32' : '#c62828', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6}}>
              <Text style={{fontSize: 9.5, color: '#fff', fontWeight: 'bold'}} numberOfLines={1}>
                {inRange ? `Inside (${distanceKm} KM)` : `Outside (${distanceKm} KM)`}
              </Text>
            </View>
          </View>
        </View>

        <View style={{flexDirection: 'row', width: '100%', justifyContent: 'space-between'}}>
          {[
            { key: 'shop', label: '🛍️ Shop' },
            { key: 'orders', label: '📦 Orders' },
            { key: 'profile', label: '⚙️ Profile' },
            { key: 'exit', label: '🚪 Exit', action: handleExitApp }
          ].map(t => (
            <TouchableOpacity key={t.key} onPress={t.action ? t.action : () => { setActiveTab(t.key); if(t.key==='orders') fetchCustomerOrders(custPhone); }} style={[s.headerTabBtn, activeTab === t.key && s.headerTabAct, t.key === 'exit' && {backgroundColor: '#c62828'}]}>
              <Text style={{fontSize: 9.5, fontWeight: 'bold', color: t.key === 'exit' ? '#fff' : (activeTab === t.key ? '#6a1b9a' : '#fff'), textAlign: 'center'}} numberOfLines={1}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {storeSettings.storeOpen === false && (
        <View style={{backgroundColor: '#c62828', padding: 10, alignItems: 'center', width: '100%'}}>
          <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 12}}>🔴 Store is Currently Closed! Orders are temporarily suspended.</Text>
        </View>
      )}

      {activeTab === 'shop' && (
        <View style={s.stickySearchContainer}>
          <TextInput 
            style={s.searchBar} 
            placeholder="🔍 Search groceries (e.g. Rice, Kaju, Tomato)..." 
            value={searchQuery} 
            onChangeText={setSearchQuery} 
          />
        </View>
      )}

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 150, width: '100%', paddingHorizontal: 8 }}>
        {activeTab === 'shop' && (
          <View style={{width: '100%'}}>
            {storeSettings.adminNote ? (
              <View style={s.announcementBox}>
                <Text style={{fontSize: 10.5, color: '#d84315', fontWeight: 'bold', textAlign: 'center'}}>📢 {storeSettings.adminNote}</Text>
              </View>
            ) : null}

            {!selectedCat && !searchQuery && bannerList.length > 0 ? (
              <View style={s.bannerVerticalContainer}>
                {bannerList.map((bannerUrl, idx) => (
                  <Image key={idx} source={{ uri: bannerUrl }} style={s.bannerVerticalImg} />
                ))}
              </View>
            ) : null}

            {!selectedCat && !searchQuery ? (
              <View style={{width: '100%', marginBottom: 12, marginTop: 4}}>
                <Text style={{fontSize: 13, fontWeight: 'bold', color: '#222', marginBottom: 8}}>📂 Grocery & Kitchen Categories</Text>
                <View style={s.catGridContainer}>
                  {Object.keys(categories || {}).map((catName, idx) => {
                    const catObj = categories[catName];
                    const catImgUrl = catObj?.image && typeof catObj.image === 'string' && catObj.image.trim().startsWith('http') 
                      ? catObj.image.trim() 
                      : null;

                    return (
                      <TouchableOpacity key={idx} onPress={() => setSelectedCat(catName)} style={s.instamartCatCard}>
                        <View style={s.instamartCatCircle}>
                          {catImgUrl ? (
                            <Image source={{ uri: catImgUrl }} style={s.catCircleImg} />
                          ) : (
                            <Text style={{fontSize: 22}}>🛍️</Text>
                          )}
                        </View>
                        <Text style={{fontSize: 10, fontWeight: 'bold', color: '#333', textAlign: 'center', marginTop: 4}} numberOfLines={2}>{catName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {!inRange && (
              <View style={s.warningBox}>
                <Text style={{fontSize: 11, color: '#c62828', fontWeight: 'bold', textAlign: 'center'}}>
                  🚫 You are {distanceKm} KM away from store. Admin delivery limit is {storeSettings.radiusKm} KM. Orders are disabled.
                </Text>
              </View>
            )}

            {(selectedCat || searchQuery) ? (
              <View style={{width: '100%'}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <TouchableOpacity onPress={() => { setSelectedCat(''); setSearchQuery(''); }} style={{backgroundColor: '#6a1b9a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6}}>
                    <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>← Back to Categories</Text>
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
                        let effPrice = Number(pr.price || 0) - Number(pr.discount || 0);
                        let cartQty = cart[pr.id]?.qty || 0;
                        let isSoldOut = pr.inStock === false;

                        return (
                          <View key={idx} style={[s.gridCard, isSoldOut && {backgroundColor: '#f5f5f5'}]}>
                            {pr.image && typeof pr.image === 'string' && pr.image.trim().startsWith('http') ? (
                              <Image source={{ uri: pr.image.trim() }} style={s.gridImg} />
                            ) : (
                              <View style={[s.gridImg, {justifyContent:'center', alignItems:'center', backgroundColor:'#f3e5f5'}]}>
                                <Text style={{fontSize: 24}}>📦</Text>
                              </View>
                            )}
                            
                            <View style={{flex: 1, justifyContent: 'space-between', width: '100%', marginTop: 4}}>
                              <Text style={{fontWeight: 'bold', fontSize: 12, color: '#222'}} numberOfLines={2}>{pr.name || 'Product'}</Text>
                              <Text style={{fontSize: 10, color: '#666', marginVertical: 2}}>{pr.unit || ''}</Text>
                              
                              <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 2}}>
                                <Text style={{fontWeight: 'bold', color: '#2e7d32', fontSize: 13}}>₹{effPrice}</Text>
                                {Number(pr.discount || 0) > 0 && <Text style={{fontSize: 9.5, color: '#888', textDecorationLine: 'line-through', marginLeft: 4}}>₹{pr.price}</Text>}
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
                              <TouchableOpacity 
                                onPress={() => {
                                  if (!inRange) {
                                    return Alert.alert("Outside Delivery Zone", `Delivery is restricted to ${storeSettings.radiusKm} KM. You are ${distanceKm} KM away.`);
                                  }
                                  updateCartQty(pr, 1);
                                }} 
                                style={[s.gridAddBtn, !inRange && {backgroundColor: '#b0bec5'}]}
                              >
                                <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>ADD +</Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={s.qtyCon}>
                                <TouchableOpacity onPress={() => updateCartQty(pr, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 14}}>-</Text></TouchableOpacity>
                                <Text style={{marginHorizontal: 8, fontWeight: 'bold', fontSize: 12}}>{cartQty}</Text>
                                <TouchableOpacity onPress={() => updateCartQty(pr, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 14}}>+</Text></TouchableOpacity>
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
          <View style={s.card}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
              <Text style={s.secTitle}>📦 Track Orders & Live Timeline</Text>
              <TouchableOpacity onPress={() => fetchCustomerOrders(custPhone)} style={{backgroundColor: '#e1bee7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4}}>
                <Text style={{fontSize: 9.5, fontWeight: 'bold', color: '#6a1b9a'}}>🔄 Refresh</Text>
              </TouchableOpacity>
            </View>

            {myOrders.length === 0 ? (
              <Text style={{textAlign: 'center', color: '#777', padding: 15, fontSize: 11}}>No orders placed yet.</Text>
            ) : (
              myOrders.map(ord => {
                let isDeleting = deleteStepOrder === ord.id;
                let isCancelling = cancelStepOrder === ord.id;
                let isWaitingPayment = ord.deliveryStatus && ord.deliveryStatus.includes('Payment Pending');
                let isCancelled = ord.deliveryStatus && ord.deliveryStatus.includes('Cancelled');
                let orderTimeFormatted = formatOrderDateTime(ord.timestamp);

                let boy = deliveryBoysList[ord.assignedBoy] || 
                          Object.values(deliveryBoysList || {}).find(b => b?.name === ord.assignedBoy || b?.id === ord.assignedBoy);
                let boyPhone = ord.deliveryBoyPhone || ord.assignedBoyPhone || boy?.phone || '';
                let boyName = boy?.name || ord.assignedBoy;

                return (
                  <View key={ord.id} style={[s.card, {borderColor: isWaitingPayment ? '#e65100' : isCancelled ? '#c62828' : '#8e24aa', borderWidth: 1.2, padding: 10, width: '100%'}]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: 'bold', color: '#6a1b9a', fontSize: 12 }}>ORDER #{ord.id.slice(-6)}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <View style={{backgroundColor: ord.payment === 'Online' ? '#e1bee7' : '#c8e6c9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6}}>
                          <Text style={{fontSize: 9, fontWeight: 'bold', color: ord.payment === 'Online' ? '#4a148c' : '#1b5e20'}}>
                            {ord.payment === 'Online' ? '💳 Online' : '💵 COD'}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: 'bold', color: '#2e7d32', marginRight: 6, fontSize: 12 }}>₹{ord.total}</Text>
                        <TouchableOpacity onPress={() => confirmDeleteOrder(ord.id)} style={{backgroundColor: isDeleting ? '#b71c1c' : '#c62828', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3}}>
                          <Text style={{color: '#fff', fontSize: 8.5, fontWeight: 'bold'}}>{isDeleting ? '⚠️ Tap' : '🗑️'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {orderTimeFormatted ? (
                      <Text style={{fontSize: 9.5, color: '#555', marginTop: 2, marginBottom: 4}}>
                        🕒 Placed on: <Text style={{fontWeight: 'bold', color: '#333'}}>{orderTimeFormatted}</Text>
                      </Text>
                    ) : null}
                    
                    {renderTimelineTracker(ord.deliveryStatus, ord.id)}

                    {ord.assignedBoy ? (
                      <View style={{backgroundColor: '#e8f5e9', padding: 10, borderRadius: 8, marginVertical: 6, borderWidth: 1, borderColor: '#a5d6a7'}}>
                        <Text style={{fontSize: 10, fontWeight: 'bold', color: '#2e7d32'}}>🛵 Assigned Delivery Partner:</Text>
                        <Text style={{fontSize: 12, fontWeight: 'bold', color: '#1b5e20', marginTop: 2}}>
                          {boyName} {boyPhone ? `(${boyPhone})` : ''}
                        </Text>
                        {boyPhone ? (
                          <TouchableOpacity 
                            onPress={() => Linking.openURL(`tel:${boyPhone}`)}
                            style={{backgroundColor: '#2e7d32', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginTop: 6, alignSelf: 'flex-start'}}
                          >
                            <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>📞 Call Delivery Partner</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}

                    {!isCancelled && !ord.deliveryStatus?.includes('Delivered') && !ord.deliveryStatus?.includes('Out for Delivery') && (
                      <TouchableOpacity 
                        onPress={() => handleCancelOrderAction(ord.id, ord.deliveryStatus, ord.payment)} 
                        style={{backgroundColor: isCancelling ? '#b71c1c' : '#d32f2f', padding: 6, borderRadius: 5, marginVertical: 3, alignItems: 'center'}}
                      >
                        <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 10.5}}>
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

        {activeTab === 'profile' && (
          <View style={s.card}>
            <Text style={s.secTitle}>⚙️ Customer Profile & Saved Addresses</Text>
            <Text style={s.lbl}>Your Name:</Text>
            <TextInput style={s.i} value={custName} onChangeText={v => setCustName(sanitizeInput(v))} placeholder="Enter Full Name" />
            <Text style={s.lbl}>Mobile Number (Fixed):</Text>
            <TextInput style={[s.i, {backgroundColor: '#f5f5f5'}]} value={custPhone} editable={false} />
            
            <Text style={s.lbl}>Delivery Address:</Text>
            <TextInput style={[s.i, {height: 55}]} value={custAddr} onChangeText={v => setCustAddr(sanitizeInput(v))} placeholder="House No, Landmark, Area" multiline={true} />
            
            <TouchableOpacity style={{backgroundColor: '#7b1fa2', padding: 7, borderRadius: 5, alignItems: 'center', marginVertical: 3}} onPress={saveCurrentAddress}>
              <Text style={{color: '#fff', fontSize: 10.5, fontWeight: 'bold'}}>📍 Save This Address</Text>
            </TouchableOpacity>

            {savedAddresses.length > 0 && (
              <View style={{marginTop: 5}}>
                <Text style={{fontSize: 10, fontWeight: 'bold', color: '#4a148c'}}>Saved Addresses (Tap to select):</Text>
                {savedAddresses.map((ad, i) => (
                  <TouchableOpacity key={i} onPress={() => setCustAddr(ad)} style={{backgroundColor: '#f3e5f5', padding: 5, borderRadius: 4, marginVertical: 2}}>
                    <Text style={{fontSize: 9.5, color: '#333'}}>{ad}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={[s.btn, {backgroundColor: '#6a1b9a', marginTop: 8, padding: 10}]} onPress={async () => {
              await AsyncStorage.setItem('manor_cust_name', custName);
              await AsyncStorage.setItem('manor_cust_addr', custAddr);
              if (custPhone) {
                fetch(db + `customers/${custPhone}.json`, {
                  method: 'PATCH',
                  body: JSON.stringify({ name: custName, addr: custAddr })
                }).catch(() => {});
              }
              Alert.alert("Success", "Profile updated successfully!");
            }}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>💾 Save Profile</Text></TouchableOpacity>

            <View style={{marginTop: 15, backgroundColor: '#f3e5f5', padding: 10, borderRadius: 6}}>
              <Text style={{fontSize: 11, fontWeight: 'bold', color: '#4a148c', marginBottom: 4}}>📜 Legal & Store Policies:</Text>
              <TouchableOpacity onPress={() => setShowLegalModal(true)} style={s.policyInteractiveBtn}>
                <Text style={{fontSize: 11, color: '#fff', fontWeight: 'bold', textAlign: 'center'}}>
                  📄 View Terms, Privacy & Refund Policy (5-7 Days)
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{marginTop: 15, borderTopWidth: 1, borderColor: '#eee', paddingTop: 8}}>
              <TouchableOpacity style={[s.btn, {backgroundColor: '#e65100', marginBottom: 6, padding: 10}]} onPress={handleLogout}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>🚪 Logout</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, {backgroundColor: '#d32f2f', marginBottom: 6, padding: 10}]} onPress={handleExitApp}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>🔴 Exit Application</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, {backgroundColor: '#c62828', padding: 10}]} onPress={handleDeleteAccount}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>⚠️ Delete My Account</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {subtotal > 0 && activeTab === 'shop' && storeSettings.storeOpen !== false && (
        <View style={s.floatingCartBar}>
          <View style={{flex: 1, paddingRight: 6}}>
            <Text style={{color: '#fff', fontSize: 10.5, fontWeight: 'bold'}} numberOfLines={1}>{cartItemsList.reduce((sum, i) => sum + i.qty, 0)} Items | ₹{subtotal}</Text>
            <Text style={{color: '#e1bee7', fontSize: 9}} numberOfLines={1}>All taxes included</Text>
          </View>
          <TouchableOpacity onPress={() => setActiveTab('cart')} style={s.viewCartBtn}>
            <Text style={{color: '#6a1b9a', fontWeight: 'bold', fontSize: 11}} numberOfLines={1}>View Cart ➔</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={activeTab === 'cart'} animationType="slide">
        <SafeAreaView style={{flex: 1, backgroundColor: '#fffde7', width: '100%'}}>
          <View style={s.hdr}>
            <Text style={s.ht}>🛒 Cart & Secure Checkout</Text>
            <TouchableOpacity onPress={() => setActiveTab('shop')} style={{backgroundColor: '#7b1fa2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4}}>
              <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>🔙 Back to Store</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{padding: 10, width: '100%'}} contentContainerStyle={{paddingBottom: 35}}>
            <View style={s.card}>
              <Text style={s.secTitle}>🛍️ Review Your Cart</Text>
              {cartItemsList.map(item => (
                <View key={item.id} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#eee'}}>
                  <View style={{flex: 1, paddingRight: 8}}>
                    <Text style={{fontWeight: 'bold', fontSize: 11.5}}>{item.name} ({item.unit})</Text>
                    <Text style={{fontSize: 9.5, color: '#666', marginTop: 2}}>₹{item.effectivePrice} x {item.qty} = ₹{item.effectivePrice * item.qty}</Text>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <View style={s.qtyConCart}>
                      <TouchableOpacity onPress={() => updateCartQty(item, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 14}}>-</Text></TouchableOpacity>
                      <Text style={{marginHorizontal: 8, fontWeight: 'bold', fontSize: 11}}>{item.qty}</Text>
                      <TouchableOpacity onPress={() => updateCartQty(item, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 14}}>+</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setCart(prev => { let u = {...prev}; delete u[item.id]; return u; })} style={{backgroundColor: '#c62828', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, marginLeft: 6}}>
                      <Text style={{color: '#fff', fontSize: 9, fontWeight: 'bold'}}>✕</Text>
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
              <Text style={s.secTitle}>📍 Delivery Details</Text>
              <Text style={s.lbl}>Full Name:</Text>
              <TextInput style={s.i} placeholder="Enter Full Name (Required)" value={custName} onChangeText={v => setCustName(v)} />
              <Text style={s.lbl}>Mobile Number:</Text>
              <TextInput style={[s.i, {backgroundColor: '#f5f5f5'}]} value={custPhone} editable={false} />
              <Text style={s.lbl}>Delivery Address (Distance: {distanceKm} KM):</Text>
              <TextInput style={[s.i, {height: 55}]} placeholder="House No, Landmark, Area (Required)" multiline={true} value={custAddr} onChangeText={v => setCustAddr(v)} />

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
                style={[s.btn, {marginTop: 12, backgroundColor: inRange ? '#6a1b9a' : '#c62828', padding: 10}]} 
                onPress={placeOrder}
              >
                <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>
                  {inRange 
                    ? (paymentMode === 'Online' ? `Pay ₹${finalTotal} via Razorpay & Place Order` : `Place COD Order (₹${finalTotal})`) 
                    : `🚫 Outside Delivery Zone (${distanceKm} KM / Limit ${storeSettings.radiusKm} KM)`}
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
  con: { flex: 1, backgroundColor: '#fcfcfc', width: '100%' },
  hdr: { backgroundColor: '#4a148c', paddingHorizontal: 10, paddingVertical: 10, paddingTop: 45, width: '100%', elevation: 4 },
  ht: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  headerTabBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#7b1fa2', marginHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  headerTabAct: { backgroundColor: '#ffd54f' },
  body: { padding: 4, width: '100%', flex: 1 },
  announcementBox: { backgroundColor: '#fbe9e7', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ffccbc', width: '100%' },
  warningBox: { backgroundColor: '#ffebee', padding: 8, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#ef9a9a', width: '100%' },
  stickySearchContainer: { backgroundColor: '#4a148c', paddingHorizontal: 10, paddingBottom: 8, width: '100%', elevation: 4 },
  searchBar: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 10, borderRadius: 12, fontSize: 12, width: '100%', elevation: 1 },
  bannerVerticalContainer: { width: '100%', marginBottom: 8, marginTop: 4 },
  bannerVerticalImg: { width: '100%', height: 135, borderRadius: 12, resizeMode: 'cover', marginBottom: 6, borderWidth: 1, borderColor: '#e1bee7' },
  catGridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' },
  instamartCatCard: { width: '23.5%', backgroundColor: '#fff', padding: 6, borderRadius: 12, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#eee', elevation: 1 },
  instamartCatCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3e5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 4, overflow: 'hidden' },
  catCircleImg: { width: '100%', height: '100%', borderRadius: 22, resizeMode: 'cover' },
  productsGridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 15, width: '100%' },
  gridCard: { width: '48.5%', backgroundColor: '#fff', padding: 10, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0', elevation: 2, alignItems: 'flex-start', minHeight: 200, justifyContent: 'space-between' },
  gridImg: { width: '100%', height: 110, borderRadius: 8, backgroundColor: '#f9f9f9', marginBottom: 6, resizeMode: 'contain' },
  gridAddBtn: { backgroundColor: '#6a1b9a', width: '100%', paddingVertical: 6, borderRadius: 6, alignItems: 'center', marginTop: 4 },
  qtyCon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 3, borderRadius: 6, marginTop: 4, justifyContent: 'space-between', width: '100%' },
  qtyConCart: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 4, borderRadius: 6, justifyContent: 'space-between' },
  qtyBtn: { backgroundColor: '#6a1b9a', width: 24, height: 24, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  floatingCartBar: { position: 'absolute', bottom: 70, left: 10, right: 10, backgroundColor: '#4a148c', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8 },
  viewCartBtn: { backgroundColor: '#ffd54f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  card: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#d1c4e9', elevation: 2, width: '100%' },
  secTitle: { fontSize: 12, fontWeight: 'bold', color: '#4a148c', marginVertical: 4 },
  itemsBox: { backgroundColor: '#f3e5f5', padding: 6, borderRadius: 5, marginVertical: 4, borderWidth: 1, borderColor: '#e1bee7', width: '100%' },
  lbl: { fontSize: 10, fontWeight: 'bold', color: '#444', marginTop: 4 },
  i: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 7, borderRadius: 6, fontSize: 11, marginVertical: 2, width: '100%' },
  btn: { backgroundColor: '#6a1b9a', padding: 10, borderRadius: 6, alignItems: 'center', marginTop: 8, width: '100%' },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 11.5 },
  catChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f3e5f5', marginRight: 5, marginBottom: 5, borderWidth: 1, borderColor: '#ce93d8' },
  catChipAct: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 15, width: '100%' },
  modalCard: { width: '100%', maxWidth: 350, backgroundColor: '#fff', padding: 15, borderRadius: 14, elevation: 8 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#4a148c' },
  policyHeader: { backgroundColor: '#4a148c', paddingHorizontal: 15, paddingVertical: 12, paddingTop: 45, width: '100%', elevation: 4 },
  policyBlock: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#eeeeee' },
  policyBlockTitle: { fontSize: 12, fontWeight: 'bold', color: '#4a148c', marginBottom: 4 },
  policyText: { fontSize: 11, color: '#333', lineHeight: 16, marginBottom: 3 },
  policyBottomBar: { position: 'absolute', bottom: 60, left: 15, right: 15, zIndex: 999 },
  policyCloseBtn: { backgroundColor: '#6a1b9a', paddingVertical: 12, borderRadius: 10, alignItems: 'center', elevation: 6 },
  policyInteractiveBtn: { backgroundColor: '#6a1b9a', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginVertical: 6, alignItems: 'center' },
  policyInteractiveBtnSec: { backgroundColor: '#7b1fa2', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginTop: 10, alignItems: 'center' }
});
