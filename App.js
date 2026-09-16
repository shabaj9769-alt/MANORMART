// --- MANOR MART ADVANCED INSTAMART-STYLE CUSTOMER APP ---
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, SafeAreaView, Modal, Image, Platform, BackHandler, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ExpoLinking from 'expo-linking';

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
    hubLat: '19.6967',
    hubLng: '72.7699',
    radiusKm: '10',
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

  const [custLat, setCustLat] = useState(19.6967);
  const [custLng, setCustLng] = useState(72.7699);
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

  useEffect(() => {
    checkInitialTermsAgreement();
    detectCustomerGPSAndLoadStore();
    checkSavedCustomerSession();
    checkURLPaymentReturn();

    const handleDeepLink = async (event) => {
      try {
        let data = ExpoLinking.parse(event.url);
        if (data.queryParams?.razorpay_payment_id || data.queryParams?.status === 'success' || (event.url && event.url.includes('success'))) {
          let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await verifyAndConfirmOrder(pendingOrderId);
          }
        }
      } catch (e) {}
    };

    const sub = ExpoLinking.addEventListener('url', handleDeepLink);

    ExpoLinking.getInitialURL().then(async (url) => {
      try {
        if (url && (url.includes('success') || url.includes('razorpay_payment_id'))) {
          let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await verifyAndConfirmOrder(pendingOrderId);
          }
        }
      } catch (e) {}
    });

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
      }).catch(e => {});

      if (custPhone) {
        fetchCustomerOrders(custPhone);
      }
    }, 5000);

    return () => {
      clearInterval(autoRefreshInterval);
      sub.remove();
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
      if (Platform.OS === 'web') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment') === 'success' || urlParams.get('status') === 'success' || urlParams.get('razorpay_payment_id')) {
          let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
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
      Alert.alert("🎉 Payment Successful", "Online payment verified automatically and order confirmed!");
      if (custPhone) fetchCustomerOrders(custPhone);
      setActiveTab('orders');
    } catch(e) {
      Alert.alert("Error", "Failed to verify payment status.");
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

  const detectCustomerGPSAndLoadStore = async () => {
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              let lat = pos.coords.latitude;
              let lng = pos.coords.longitude;
              setCustLat(lat);
              setCustLng(lng);
              loadStoreConfigAndLoadCatalog(lat, lng);
            },
            () => loadStoreConfigAndLoadCatalog(19.6967, 72.7699),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
          );
        } else {
          loadStoreConfigAndLoadCatalog(19.6967, 72.7699);
        }
      } else {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          loadStoreConfigAndLoadCatalog(19.6967, 72.7699);
          return;
        }

        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let lat = loc.coords.latitude;
        let lng = loc.coords.longitude;
        setCustLat(lat);
        setCustLng(lng);
        loadStoreConfigAndLoadCatalog(lat, lng);
      }
    } catch (error) {
      loadStoreConfigAndLoadCatalog(19.6967, 72.7699);
    }
  };

  const loadStoreConfigAndLoadCatalog = (lat, lng) => {
    fetch(db + ".json").then(r => r.json()).then(data => {
      if (!data) return;
      let currentSettings = storeSettings;
      if (data.settings) {
        currentSettings = { ...storeSettings, ...data.settings };
        setStoreSettings(currentSettings);
      }
      if (data.categories) {
        setCategories(data.categories);
      }
      if (data.deliveryBoys) setDeliveryBoysList(data.deliveryBoys);

      calcGeoFence(lat, lng, currentSettings.hubLat, currentSettings.hubLng, currentSettings.radiusKm);
    }).catch(e => {});
  };

  const calcGeoFence = (lat, lng, hLat, hLng, rad) => {
    let customerLat = Number(lat);
    let customerLng = Number(lng);
    let hubLat = Number(hLat);
    let hubLng = Number(hLng);
    let allowedRadius = Number(rad);

    if (isNaN(customerLat) || isNaN(customerLng)) {
      customerLat = 19.6967;
      customerLng = 72.7699;
    }
    if (isNaN(hubLat) || isNaN(hubLng) || hubLat === 0 || hubLng === 0) {
      hubLat = 19.6967;
      hubLng = 72.7699;
    }
    if (isNaN(allowedRadius) || allowedRadius <= 0) {
      allowedRadius = 10;
    }

    let R = 6371;
    let dLat = (customerLat - hubLat) * (Math.PI / 180);
    let dLon = (customerLng - hubLng) * (Math.PI / 180);
    let a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
      Math.cos(hubLat * (Math.PI / 180)) * Math.cos(customerLat * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c;

    if (isNaN(d)) {
      setDistanceKm(0);
      setInRange(true);
      return;
    }

    let distRounded = Number(d.toFixed(2));
    setDistanceKm(distRounded);
    setInRange(distRounded <= allowedRadius);
  };

  const sanitizeInput = (str) => (str || '').replace(/[.#$[\]/]/g, '').trim();

  // Safe Cart Quantity Updater to prevent crashes
  const updateCartQty = (prod, delta) => {
    if (!prod || !prod.id) return;
    if (prod.inStock === false) {
      return Alert.alert("Out of Stock", "Sorry! This item is currently sold out.");
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
    if (cleanPh.length !== 10) return Alert.alert("Error", "Enter valid 10-digit phone number!");
    setCustPhone(cleanPh);
    setIsLoggedIn(true);
    await AsyncStorage.setItem('manor_cust_phone', cleanPh);
    fetchCustomerOrders(cleanPh);
    Alert.alert("Success", "Logged in successfully!");
  };

  const fetchCustomerOrders = (phone) => {
    fetch(db + "orders.json").then(r => r.json()).then(data => {
      if (!data) return setMyOrders([]);
      let list = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      let mine = list.filter(o => o.phone === phone);
      setMyOrders(mine.reverse());
    }).catch(e => {});
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('manor_cust_phone');
    await AsyncStorage.removeItem('manor_cust_name');
    await AsyncStorage.removeItem('manor_cust_addr');
    await AsyncStorage.removeItem('manor_cust_addrs_list');
    setIsLoggedIn(false); setCart({}); setActiveTab('shop');
    Alert.alert("Logged Out", "Session cleared.");
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
            } else {
              window.close();
            }
          }, style: "destructive" }
      ]
    );
  };

  const cancelOrder = (orderId, currentStatus, paymentModeVal) => {
    if (currentStatus === 'Delivered' || currentStatus === 'Out for Delivery') {
      return Alert.alert("Cannot Cancel", "Order is already out for delivery or delivered.");
    }
    
    const executeCancel = () => {
      let newCancelStatus = '❌ Order Cancelled';
      let needsRefund = false;

      if (paymentModeVal === 'Online') {
        if (currentStatus && currentStatus.includes('Payment Pending')) {
          newCancelStatus = '❌ Cancelled (Unpaid)';
          needsRefund = false;
        } else {
          newCancelStatus = '❌ Cancelled (Paid - Refundable)';
          needsRefund = true;
        }
      } else {
        newCancelStatus = '❌ Order Cancelled (COD)';
        needsRefund = false;
      }

      fetch(db + `orders/${orderId}.json`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryStatus: newCancelStatus })
      }).then(() => {
        fetchCustomerOrders(custPhone);
        if (needsRefund) {
          Alert.alert("Cancelled", "Your order has been cancelled. Online payment will be refunded within 5 to 7 business days per store policy.");
        } else {
          Alert.alert("Cancelled", "Your order has been cancelled successfully. No payment was charged.");
        }
      }).catch(() => {
        Alert.alert("Error", "Failed to cancel order. Try again.");
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Are you sure you want to cancel this order?")) {
        executeCancel();
      }
    } else {
      Alert.alert(
        "Cancel Order",
        "Are you sure you want to cancel this order?",
        [
          { text: "No", style: "cancel" },
          { text: "Yes, Cancel", onPress: executeCancel, style: "destructive" }
        ]
      );
    }
  };

  const confirmDeleteOrder = (orderId) => {
    if (deleteStepOrder === orderId) {
      fetch(db + `orders/${orderId}.json`, { method: 'DELETE' }).then(() => {
        setDeleteStepOrder(null);
        fetchCustomerOrders(custPhone);
        Alert.alert("Deleted", "Order removed successfully.");
      });
    } else {
      setDeleteStepOrder(orderId);
      setTimeout(() => setDeleteStepOrder(null), 4000);
    }
  };

  const getDeliveryBoyPhone = (boyName) => {
    for (let k in deliveryBoysList) {
      if (deliveryBoysList[k].name === boyName) return deliveryBoysList[k].phone;
    }
    return '';
  };

  const saveCurrentAddress = async () => {
    let cleanAddr = sanitizeInput(custAddr);
    if (!cleanAddr) return Alert.alert("Error", "Enter address to save!");
    let updatedAddrs = [...savedAddresses];
    if (!updatedAddrs.includes(cleanAddr)) {
      updatedAddrs.push(cleanAddr);
      setSavedAddresses(updatedAddrs);
      await AsyncStorage.setItem('manor_cust_addrs_list', JSON.stringify(updatedAddrs));
      Alert.alert("Saved", "Address added to saved addresses list!");
    }
  };

  const placeOrder = async () => {
    if (storeSettings.storeOpen === false) {
      return Alert.alert("Store Closed", "Sorry! The store is currently closed. You cannot place orders right now.");
    }

    let cleanName = sanitizeInput(custName);
    let cleanAddr = sanitizeInput(custAddr);

    if (!cleanName || cleanName.trim() === '') {
      return Alert.alert("⚠️ Name Required", "Please enter your Full Name in delivery details!");
    }
    if (!cleanAddr || cleanAddr.trim() === '') {
      return Alert.alert("⚠️ Address Required", "Please enter your Delivery Address!");
    }
    if (!custPhone || custPhone.length !== 10) {
      return Alert.alert("⚠️ Phone Error", "Valid 10-digit mobile number required.");
    }

    if (!inRange) {
      return Alert.alert(
        "🚫 Outside Delivery Zone", 
        `Sorry! Store delivers only within ${storeSettings.radiusKm} KM. Your location is ${distanceKm} KM away, which is out of our delivery zone.`
      );
    }

    let minOrd = Number(storeSettings.minOrd || 0);
    if (minOrd > 0 && subtotal < minOrd) {
      return Alert.alert("⚠️ Minimum Order Notice", `Store minimum order is ₹${minOrd}. Your subtotal is ₹${subtotal}.`);
    }

    let orderId = 'ord_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    let initialStatus = paymentMode === 'Online' ? '⏳ Payment Pending' : 'Order Successful';

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
      timestamp: Date.now()
    };

    fetch(db + `orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify(orderObj)
    }).then(async () => {
      setCart({});
      setActiveTab('orders');
      fetchCustomerOrders(custPhone);

      if (paymentMode === 'Online') {
        await AsyncStorage.setItem('manor_pending_ord', orderId);
        let customBaseUrl = storeSettings.upi && storeSettings.upi.trim().startsWith('http') 
          ? storeSettings.upi.trim() 
          : 'https://shabaj9769-alt.github.io/manormart-pay/';
        let targetUrl = `${customBaseUrl}?amount=${finalTotal}&order_id=${orderId}`;
        
        if (Platform.OS === 'web') {
          window.location.href = targetUrl;
        } else {
          Linking.openURL(targetUrl).catch(() => {
            Alert.alert("Browser Error", "Payment link open nahi ho paya. Kripya phone ka browser check karein.");
          });
        }
      } else {
        Alert.alert("🎉 Success", `Order #${orderId.slice(-6)} placed successfully!`);
      }
    }).catch(err => {
      Alert.alert("Error", "Failed to place order: " + (err.message || "Check network"));
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
            <Text style={{fontSize: 9.5, color: '#666', marginTop: 2}}>Agar payment ho gaya hai, toh check karein:</Text>
          </View>
          <TouchableOpacity onPress={() => {
            fetch(db + `orders/${orderId}.json`).then(r => r.json()).then(ord => {
              if (ord && ord.deliveryStatus === 'Order Successful') {
                Alert.alert("Verified!", "Payment verified and order confirmed!");
                fetchCustomerOrders(custPhone);
              } else {
                Alert.alert("Pending", "Payment abhi confirm nahi hui hai ya app band ho gayi thi. Dobara try karein.");
              }
            });
          }} style={{backgroundColor: '#e65100', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5}}>
            <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>🔄 Check Status</Text>
          </TouchableOpacity>
        </View>
      );
    } else if (status && status.includes('Cancelled')) {
      return <Text style={{fontSize: 10, color: status.includes('Unpaid') ? '#757575' : '#c62828', fontWeight: 'bold'}}>{status}</Text>;
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
          
          <TouchableOpacity onPress={() => setShowLegalModal(true)} style={{marginBottom: 12, alignSelf: 'center'}}>
            <Text style={{fontSize: 11.5, color: '#6a1b9a', fontWeight: 'bold', textDecorationLine: 'underline'}}>
              📄 Read Complete Terms & Refund Policies
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleAcceptTerms} style={s.btn}>
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
            <Text style={s.policyBlockTitle}>2. Account & Eligibility</Text>
            <Text style={s.policyText}>• Customers must provide an active, valid 10-digit Indian mobile number to log in and use our service.</Text>
            <Text style={s.policyText}>• Customers are responsible for providing complete and accurate recipient details and delivery addresses.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>3. Pricing & Orders</Text>
            <Text style={s.policyText}>• All prices listed on the application are in Indian Rupees (INR) and include applicable taxes.</Text>
            <Text style={s.policyText}>• Delivery fees (Normal or Express) and free-delivery eligibility are calculated transparently at checkout.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>4. Cancellation & Refund Policy (5 to 7 Days)</Text>
            <Text style={s.policyText}>• Customers can cancel orders directly through the app before dispatch ("Out for Delivery").</Text>
            <Text style={s.policyText}>• In case of cancellation before dispatch or spoiled/damaged items, refunds for prepaid online payments (Razorpay, UPI, Cards) are credited back to the original source payment account within 5 to 7 business days.</Text>
            <Text style={s.policyText}>• For Cash on Delivery (COD) orders, billing invoices are adjusted immediately on the spot.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>5. Privacy & User Data Protection</Text>
            <Text style={s.policyText}>• We collect phone number, name, delivery address, and GPS coordinates solely for delivery routing and geofencing verification.</Text>
            <Text style={s.policyText}>• We never sell, rent, or trade your personal information to third parties.</Text>
            <Text style={s.policyText}>• Users can clear their profile details or delete their account directly within the Profile section.</Text>
          </View>

          <View style={s.policyBlock}>
            <Text style={s.policyBlockTitle}>6. Grievance & Official Support</Text>
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
            
            <TouchableOpacity onPress={() => setShowLegalModal(true)} style={{marginTop: 12, alignSelf: 'center'}}>
              <Text style={{fontSize: 10, color: '#6a1b9a', textDecorationLine: 'underline'}}>Terms, Privacy & Refund Policy</Text>
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
            <TouchableOpacity onPress={detectCustomerGPSAndLoadStore} style={{backgroundColor: '#7b1fa2', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, marginRight: 6}}>
              <Text style={{fontSize: 9.5, color: '#fff', fontWeight: 'bold'}}>🔄 Refresh GPS</Text>
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
          <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 12}}>🔴 Store is Currently Closed! You cannot place orders right now.</Text>
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

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 130, width: '100%', paddingHorizontal: 8 }}>
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
                <Text style={{fontSize: 10.5, color: '#c62828', fontWeight: 'bold', textAlign: 'center'}}>⚠️ You are {distanceKm} KM away from store. Admin limit is {storeSettings.radiusKm} KM. Orders disabled.</Text>
              </View>
            )}

            {(selectedCat || searchQuery) ? (
              <View style={{width: '100%'}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <TouchableOpacity onPress={() => { setSelectedCat(''); setSearchQuery(''); }} style={{backgroundColor: '#6a1b9a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6}}>
                    <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>← Back to Home</Text>
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
                          <View 
                            key={idx} 
                            style={[s.gridCard, isSoldOut && {backgroundColor: '#f5f5f5'}]}
                          >
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
                              <TouchableOpacity onPress={() => { inRange && updateCartQty(pr, 1); }} style={[s.gridAddBtn, !inRange && {backgroundColor: '#b0bec5'}]}><Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>ADD +</Text></TouchableOpacity>
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
                let boyPhone = getDeliveryBoyPhone(ord.assignedBoy);
                let isDeleting = deleteStepOrder === ord.id;
                let isWaitingPayment = ord.deliveryStatus && ord.deliveryStatus.includes('Payment Pending');
                let isCancelled = ord.deliveryStatus && ord.deliveryStatus.includes('Cancelled');

                return (
                  <View key={ord.id} style={[s.card, {borderColor: isWaitingPayment ? '#e65100' : isCancelled ? '#c62828' : '#8e24aa', borderWidth: 1.2, padding: 10, width: '100%'}]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: 'bold', color: '#6a1b9a', fontSize: 11.5 }}>ORDER #{ord.id.slice(-6)}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <View style={{backgroundColor: ord.payment === 'Online' ? '#e1bee7' : '#c8e6c9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6}}>
                          <Text style={{fontSize: 9, fontWeight: 'bold', color: ord.payment === 'Online' ? '#4a148c' : '#1b5e20'}}>
                            {ord.payment === 'Online' ? '💳 Online' : '💵 COD'}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: 'bold', color: '#2e7d32', marginRight: 6, fontSize: 11.5 }}>₹{ord.total}</Text>
                        <TouchableOpacity onPress={() => confirmDeleteOrder(ord.id)} style={{backgroundColor: isDeleting ? '#b71c1c' : '#c62828', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3}}>
                          <Text style={{color: '#fff', fontSize: 8.5, fontWeight: 'bold'}}>{isDeleting ? '⚠️ Tap' : '🗑️'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    {renderTimelineTracker(ord.deliveryStatus, ord.id)}

                    {!isCancelled && !ord.deliveryStatus?.includes('Delivered') && !ord.deliveryStatus?.includes('Out for Delivery') && (
                      <TouchableOpacity onPress={() => cancelOrder(ord.id, ord.deliveryStatus, ord.payment)} style={{backgroundColor: '#d32f2f', padding: 5, borderRadius: 5, marginVertical: 3, alignItems: 'center'}}>
                        <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 10}}>❌ Cancel This Order</Text>
                      </TouchableOpacity>
                    )}
                    
                    {ord.assignedBoy ? (
                      <View style={{backgroundColor: '#f3e5f5', padding: 6, borderRadius: 5, marginVertical: 4}}>
                        <Text style={{fontSize: 10, fontWeight: 'bold', color: '#6a1b9a'}}>🚴 Delivery Partner: {ord.assignedBoy}</Text>
                        {boyPhone ? (
                          <TouchableOpacity onPress={() => Linking.openURL(`tel:${boyPhone}`)} style={{marginTop: 3, alignSelf: 'flex-start', backgroundColor: '#6a1b9a', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3}}>
                            <Text style={{color: '#fff', fontSize: 9, fontWeight: 'bold'}}>📞 Call Delivery Boy</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}

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
            <TextInput style={s.i} value={custName} onChangeText={v => setCustName(sanitizeInput(v))} placeholder="Update Name" />
            <Text style={s.lbl}>Mobile Number (Fixed):</Text>
            <TextInput style={[s.i, {backgroundColor: '#f5f5f5'}]} value={custPhone} editable={false} />
            
            <Text style={s.lbl}>Delivery Address:</Text>
            <TextInput style={[s.i, {height: 55}]} value={custAddr} onChangeText={v => setCustAddr(sanitizeInput(v))} placeholder="House No, Street, Area" multiline={true} />
            
            <TouchableOpacity style={{backgroundColor: '#7b1fa2', padding: 7, borderRadius: 5, alignItems: 'center', marginVertical: 3}} onPress={saveCurrentAddress}>
              <Text style={{color: '#fff', fontSize: 10.5, fontWeight: 'bold'}}>📍 Save This Address</Text>
            </TouchableOpacity>

            {savedAddresses.length > 0 && (
              <View style={{marginTop: 5}}>
                <Text style={{fontSize: 10, fontWeight: 'bold', color: '#4a148c'}}>Saved Addresses (Tap to use):</Text>
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
              Alert.alert("Success", "Profile updated!");
            }}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>💾 Save Changes</Text></TouchableOpacity>

            <View style={{marginTop: 15, backgroundColor: '#f3e5f5', padding: 10, borderRadius: 6}}>
              <Text style={{fontSize: 11, fontWeight: 'bold', color: '#4a148c', marginBottom: 4}}>📜 Legal & Store Policies:</Text>
              <TouchableOpacity onPress={() => setShowLegalModal(true)} style={{paddingVertical: 4}}>
                <Text style={{fontSize: 10.5, color: '#6a1b9a', textDecorationLine: 'underline', fontWeight: 'bold'}}>
                  • View Terms, Privacy & Refund Policy (5-7 Days)
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

      {subtotal > 0 && activeTab === 'shop' && inRange && storeSettings.storeOpen !== false && (
        <View style={s.floatingCartBar}>
          <View style={{flex: 1, paddingRight: 6}}>
            <Text style={{color: '#fff', fontSize: 10.5, fontWeight: 'bold'}} numberOfLines={1}>{cartItemsList.reduce((sum, i) => sum + i.qty, 0)} Items | ₹{subtotal}</Text>
            <Text style={{color: '#e1bee7', fontSize: 9}} numberOfLines={1}>Taxes included</Text>
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
              <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>🔙 Return to Menu</Text>
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
              <Text style={s.lbl}>Delivery Address (Distance from store: {distanceKm} KM):</Text>
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

              <TouchableOpacity style={[s.btn, {marginTop: 12, backgroundColor: inRange ? '#6a1b9a' : '#c62828', padding: 10}]} onPress={placeOrder}>
                <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>
                  {inRange ? (paymentMode === 'Online' ? `Pay ₹${finalTotal} via Razorpay & Place Order` : `Place COD Order (₹${finalTotal})`) : '🚫 Outside Delivery Zone - Cannot Order'}
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
  
  stickySearchContainer: { backgroundColor: '#4a148c', paddingHorizontal: 10, paddingBottom: 8, width: '100%', elevation: 4 },
  searchBar: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 10, borderRadius: 12, fontSize: 12, width: '100%', elevation: 1 },

  bannerVerticalContainer: { width: '100%', marginBottom: 8, marginTop: 4 },
  bannerVerticalImg: { width: '100%', height: 135, borderRadius: 12, resizeMode: 'cover', marginBottom: 6, borderWidth: 1, borderColor: '#e1bee7' },

  warningBox: { backgroundColor: '#ffebee', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ef9a9a', width: '100%' },
  
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
  
  floatingCartBar: { position: 'absolute', bottom: 80, left: 10, right: 10, backgroundColor: '#4a148c', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8 },
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
  policyCloseBtn: { backgroundColor: '#6a1b9a', paddingVertical: 12, borderRadius: 10, alignItems: 'center', elevation: 6 }
});
