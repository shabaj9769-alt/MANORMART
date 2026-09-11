
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, SafeAreaView, Modal, Image, Linking, ImageBackground, Animated, Platform, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    hubLat: '19.7280',
    hubLng: '72.9150',
    radiusKm: '5',
    adminNote: '',
    bgImage: '',
    codEnabled: true,
    onlineEnabled: true,
    b1: '',
    b2: '',
    b3: ''
  });

  const [categories, setCategories] = useState({});
  const [selectedCat, setSelectedCat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState({});
  const [activeTab, setActiveTab] = useState('shop');

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isProductModalVisible, setIsProductModalVisible] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const termsDocLink = "https://docs.google.com/document/d/1Ifz2UIjAx1mfaaRiV0xisLihPXhCeiQkmebOfnBSUDA/edit?usp=drivesdk";

  const [custLat, setCustLat] = useState(19.7280);
  const [custLng, setCustLng] = useState(72.9150);
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

  const bounceAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    detectCustomerGPSAndLoadStore();
    checkSavedCustomerSession();
    checkURLPaymentReturn();

    const autoRefreshInterval = setInterval(() => {
      loadStoreConfigAndCatalog(false);
      if (custPhone) {
        fetchCustomerOrders(custPhone);
      }
    }, 5000);

    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 1, duration: 600, useNativeDriver: true })
      ])
    ).start();

    return () => clearInterval(autoRefreshInterval);
  }, [custPhone]);

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

  const detectCustomerGPSAndLoadStore = () => {
    if (Platform.OS === 'web' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          let lat = pos.coords.latitude;
          let lng = pos.coords.longitude;
          setCustLat(lat);
          setCustLng(lng);
          loadStoreConfigAndCatalog(true, lat, lng);
        },
        () => loadStoreConfigAndCatalog(true, 19.7280, 72.9150),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
      );
    } else {
      loadStoreConfigAndCatalog(true, 19.7280, 72.9150);
    }
  };

  const loadStoreConfigAndCatalog = (isInitial = false, lat = custLat, lng = custLng) => {
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
    let hubLat = Number(hLat || storeSettings.hubLat || 19.7280);
    let hubLng = Number(hLng || storeSettings.hubLng || 72.9150);
    let allowedRadius = Number(rad || storeSettings.radiusKm || 5);

    let R = 6371;
    let dLat = (lat - hubLat) * (Math.PI / 180);
    let dLon = (lng - hubLng) * (Math.PI / 180);
    let a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(hubLat*(Math.PI/180))*Math.cos(lat*(Math.PI/180))*Math.sin(dLon/2)*Math.sin(dLon/2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    let d = R * c;

    let distRounded = Number(d.toFixed(2));
    setDistanceKm(distRounded);
    setInRange(distRounded <= allowedRadius);
  };

  const sanitizeInput = (str) => (str || '').replace(/[^a-zA-Z0-9\s,.-]/g, '');

  const updateCartQty = (prod, delta) => {
    if (prod.inStock === false) {
      return Alert.alert("Out of Stock", "Sorry! This item is currently sold out.");
    }
    let pKey = prod.id;
    let curr = cart[pKey]?.qty || 0;
    let next = curr + delta;
    setCart(prev => {
      let up = { ...prev };
      if (next <= 0) delete up[pKey];
      else {
        let eff = Number(prod.price) - Number(prod.discount || 0);
        up[pKey] = { ...prod, effectivePrice: eff, qty: next };
      }
      return up;
    });
  };

  let cartItemsList = Object.values(cart);
  let subtotal = cartItemsList.reduce((sum, i) => sum + (i.effectivePrice * i.qty), 0);

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

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account and clear data?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", onPress: handleLogout, style: "destructive" }
      ]
    );
  };

  const cancelOrder = (orderId, currentStatus) => {
    if (currentStatus === 'Delivered' || currentStatus === 'Out for Delivery') {
      return Alert.alert("Cannot Cancel", "Order is already out for delivery or delivered.");
    }
    
    const executeCancel = () => {
      fetch(db + `orders/${orderId}.json`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryStatus: '❌ Order Cancelled' })
      }).then(() => {
        fetchCustomerOrders(custPhone);
        Alert.alert("Cancelled", "Your order has been cancelled successfully.");
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
      return Alert.alert("Outside Delivery Zone", `Sorry! Store delivers only within ${storeSettings.radiusKm} KM. (You are ${distanceKm} KM away)`);
    }

    let minOrd = Number(storeSettings.minOrd || 0);
    if (minOrd > 0 && subtotal < minOrd) {
      return Alert.alert("⚠️ Minimum Order Notice", `Store minimum order is ₹${minOrd}. Your subtotal is ₹${subtotal}.`);
    }

    let orderId = 'ord_' + Date.now();
    let initialStatus = paymentMode === 'Online' ? '⏳ Payment Pending' : 'Order Successful';

    let orderObj = {
      id: orderId, name: cleanName, phone: custPhone, addr: cleanAddr,
      lat: custLat, lng: custLng, distance: distanceKm, items: cart,
      subtotal, deliveryFee, total: finalTotal, deliveryType, deliveryShift,
      payment: paymentMode, deliveryStatus: initialStatus, assignedBoy: '', timestamp: Date.now()
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
        let baseUrl = storeSettings.upi ? storeSettings.upi.trim() : 'https://rzp.io/rzp/KshDefR';
        let targetUrl = baseUrl.includes('?') ? `${baseUrl}&amount=${finalTotal}` : `${baseUrl}?amount=${finalTotal}`;
        
        try {
          let supported = await Linking.canOpenURL(targetUrl);
          if (supported) {
            await Linking.openURL(targetUrl);
          } else {
            if (Platform.OS === 'web') window.location.href = targetUrl;
            else Alert.alert("Error", "Cannot open payment link.");
          }
        } catch (e) {
          if (Platform.OS === 'web') window.location.href = targetUrl;
        }
      } else {
        Alert.alert("🎉 Success", `Order #${orderId.slice(-6)} placed successfully!`);
      }
    }).catch(err => {
      Alert.alert("Error", "Failed to place order. Please try again.");
    });
  };

  const renderTimelineTracker = (status) => {
    let steps = ['Order Successful', 'Assigned', 'Out for Delivery', 'Delivered'];
    let currentStepIdx = 0;
    if (status === 'Assigned') currentStepIdx = 1;
    else if (status === 'Out for Delivery') currentStepIdx = 2;
    else if (status === 'Delivered') currentStepIdx = 3;
    else if (status && status.includes('Payment Pending')) currentStepIdx = -1;
    else if (status && status.includes('Cancelled')) return <Text style={{fontSize: 10, color: '#c62828', fontWeight: 'bold'}}>❌ Order Cancelled</Text>;

    if (currentStepIdx === -1) return <Text style={{fontSize: 10, color: '#e65100', fontWeight: 'bold'}}>⏳ Awaiting Payment Completion</Text>;

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

  const renderAppContainer = (children) => {
    if (storeSettings.bgImage && storeSettings.bgImage.trim().startsWith('http')) {
      return (
        <ImageBackground source={{ uri: storeSettings.bgImage.trim() }} style={{flex: 1, width: '100%', height: '100%'}} resizeMode="cover">
          <View style={{flex: 1, backgroundColor: 'rgba(255,255,255,0.9)', width: '100%'}}>{children}</View>
        </ImageBackground>
      );
    }
    return <View style={{flex: 1, backgroundColor: '#fff8e1', width: '100%'}}>{children}</View>;
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={s.loginCon}>
        {renderAppContainer(
          <>
            <Modal visible={!termsAccepted} transparent={true} animationType="slide">
              <View style={s.modalOverlay}>
                <View style={s.modalCard}>
                  <Text style={{fontSize: 28, marginBottom: 4, textAlign: 'center'}}>📜✨</Text>
                  <Text style={[s.modalTitle, {textAlign: 'center'}]}>Welcome to {storeSettings.store}</Text>
                  <Text style={{fontSize: 11, color: '#444', textAlign: 'center', marginVertical: 8}}>Please review store terms & conditions before entering the vibrant mart.</Text>
                  <TouchableOpacity onPress={() => Linking.openURL(termsDocLink)} style={{marginBottom: 12, alignSelf: 'center'}}>
                    <Text style={{fontSize: 11.5, color: '#d81b60', fontWeight: 'bold', textDecorationLine: 'underline'}}>📄 Read Official Terms & Conditions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setTermsAccepted(true)} style={s.btn}><Text style={s.btnTxt}>✨ I Agree & Start Shopping</Text></TouchableOpacity>
                </View>
              </View>
            </Modal>

            <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, width: '100%'}}>
              <View style={s.loginCard}>
                <Text style={{fontSize: 40, marginBottom: 8, textAlign: 'center'}}>🛒✨</Text>
                <Text style={s.lockTitle}>{storeSettings.store}</Text>
                <Text style={{fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 15}}>Enter 10-digit mobile number to enter store:</Text>
                <TextInput style={s.lockInput} placeholder="10-digit Phone" keyboardType="numeric" maxLength={10} value={loginPhoneInput} onChangeText={setLoginPhoneInput} />
                <TouchableOpacity style={s.lockBtn} onPress={handleLogin}><Text style={s.lockBtnTxt}>🚀 Enter Store Now</Text></TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </SafeAreaView>
    );
  }

  let itemsToDisplay = [];
  if (searchQuery) {
    Object.keys(categories).forEach(cat => {
      Object.keys(categories[cat] || {}).forEach(pKey => {
        if (pKey !== 'status') {
          let pr = categories[cat][pKey];
          if (pr?.name && pr.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            itemsToDisplay.push({ ...pr, catName: cat });
          }
        }
      });
    });
  } else if (selectedCat && categories[selectedCat]) {
    Object.keys(categories[selectedCat]).forEach(pKey => {
      if (pKey !== 'status') {
        let pr = categories[selectedCat][pKey];
        if (pr?.name) itemsToDisplay.push({ ...pr, catName: selectedCat });
      }
    });
  }

  return (
    <SafeAreaView style={s.con}>
      {renderAppContainer(
        <>
          <Modal visible={!termsAccepted} transparent={true} animationType="slide">
            <View style={s.modalOverlay}>
              <View style={s.modalCard}>
                <Text style={{fontSize: 28, marginBottom: 4, textAlign: 'center'}}>📜✨</Text>
                <Text style={[s.modalTitle, {textAlign: 'center'}]}>Welcome to {storeSettings.store}</Text>
                <Text style={{fontSize: 11, color: '#444', textAlign: 'center', marginVertical: 8}}>Please review store terms & conditions before entering the vibrant mart.</Text>
                <TouchableOpacity onPress={() => Linking.openURL(termsDocLink)} style={{marginBottom: 12, alignSelf: 'center'}}>
                  <Text style={{fontSize: 11.5, color: '#d81b60', fontWeight: 'bold', textDecorationLine: 'underline'}}>📄 Read Official Terms & Conditions</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTermsAccepted(true)} style={s.btn}><Text style={s.btnTxt}>✨ I Agree & Start Shopping</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* HEADER WITH SHOP, ORDERS, PROFILE, AND EXIT BUTTONS */}
          <View style={s.hdr}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6}}>
              <Text style={s.ht} numberOfLines={1}>🛒 {storeSettings.store}</Text>
              <Text style={{fontSize: 10, color: inRange ? '#e8f5e9' : '#ffcdd2', fontWeight: 'bold'}} numberOfLines={1}>
                {inRange ? `📍 Inside Zone (${distanceKm} KM)` : `⚠️ Outside Zone (${distanceKm} KM / Limit: ${storeSettings.radiusKm} KM)`}
              </Text>
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

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 130, width: '100%', paddingHorizontal: 4 }}>
            {activeTab === 'shop' && (
              <View style={{width: '100%'}}>
                {storeSettings.adminNote ? (
                  <View style={s.announcementBox}>
                    <Text style={{fontSize: 10.5, color: '#d84315', fontWeight: 'bold', textAlign: 'center'}}>📢 {storeSettings.adminNote}</Text>
                  </View>
                ) : null}

                <View style={{marginVertical: 8, width: '100%'}}>
                  <TextInput style={s.searchBar} placeholder="🔍 Search groceries (e.g. Rice, Kaju, Tomato)..." value={searchQuery} onChangeText={setSearchQuery} />
                </View>

                {/* HOMEPAGE CATEGORY GRID - 4 COLUMNS */}
                {!selectedCat && !searchQuery ? (
                  <View style={{width: '100%', marginBottom: 12}}>
                    <Text style={{fontSize: 13, fontWeight: 'bold', color: '#4a148c', marginBottom: 8}}>📂 Grocery & Kitchen Categories</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%'}}>
                      {Object.keys(categories).map((catName, idx) => (
                        <TouchableOpacity key={idx} onPress={() => setSelectedCat(catName)} style={s.instamartCatCard}>
                          <View style={s.instamartCatCircle}>
                            <Text style={{fontSize: 20}}>🧺</Text>
                          </View>
                          <Text style={{fontSize: 9, fontWeight: 'bold', color: '#333', textAlign: 'center', marginTop: 4}} numberOfLines={2}>{catName}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {!inRange && (
                  <View style={s.warningBox}>
                    <Text style={{fontSize: 10.5, color: '#c62828', fontWeight: 'bold', textAlign: 'center'}}>⚠️ Outside delivery zone ({distanceKm} KM). Admin limit is {storeSettings.radiusKm} KM. Orders disabled.</Text>
                  </View>
                )}

                {/* SELECTED CATEGORY FULL VIEW - 4 COLUMNS */}
                {(selectedCat || searchQuery) ? (
                  <View style={{width: '100%'}}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                      <TouchableOpacity onPress={() => { setSelectedCat(''); setSearchQuery(''); }} style={{backgroundColor: '#6a1b9a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, flexDirection: 'row', alignItems: 'center'}}>
                        <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>← Back to Home Categories</Text>
                      </TouchableOpacity>
                      <Text style={{fontWeight: 'bold', fontSize: 12, color: '#4a148c'}} numberOfLines={1}>
                        {searchQuery ? `Search: "${searchQuery}"` : `📁 ${selectedCat}`}
                      </Text>
                    </View>

                    <View style={{width: '100%'}}>
                      {itemsToDisplay.length === 0 ? (
                        <Text style={{textAlign: 'center', color: '#888', marginTop: 25, width: '100%', fontSize: 11}}>No products found in this category.</Text>
                      ) : (
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 15, width: '100%'}}>
                          {itemsToDisplay.map((pr, idx) => {
                            let effPrice = Number(pr.price) - Number(pr.discount || 0);
                            let cartQty = cart[pr.id]?.qty || 0;
                            let isOutOfStock = pr.inStock === false;

                            return (
                              <TouchableOpacity key={idx} activeOpacity={0.8} onPress={() => { setSelectedProduct(pr); setIsProductModalVisible(true); }} style={[s.gridCard, isOutOfStock && {backgroundColor: '#f5f5f5'}]}>
                                {pr.image ? <Image source={{ uri: pr.image }} style={s.gridImg} /> : <View style={[s.gridImg, {justifyContent:'center', alignItems:'center', backgroundColor:'#f3e5f5'} ]}><Text style={{fontSize: 14}}>📦</Text></View>}
                                <Text style={{fontWeight: 'bold', fontSize: 9.5, marginTop: 1}} numberOfLines={1}>{pr.name}</Text>
                                <Text style={{fontSize: 7.5, color: '#666'}}>{pr.unit}</Text>
                                
                                <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 1}}>
                                  <Text style={{fontWeight: 'bold', color: '#2e7d32', fontSize: 10}}>₹{effPrice}</Text>
                                  {Number(pr.discount || 0) > 0 && <Text style={{fontSize: 7, color: '#888', textDecorationLine: 'line-through', marginLeft: 2}}>₹{pr.price}</Text>}
                                </View>

                                {isOutOfStock ? (
                                  <View style={{backgroundColor: '#e53935', width: '100%', paddingVertical: 2.5, borderRadius: 4, alignItems: 'center', marginTop: 2}}>
                                    <Text style={{color: '#fff', fontSize: 7.5, fontWeight: 'bold'}}>OUT OF STOCK</Text>
                                  </View>
                                ) : cartQty === 0 ? (
                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); inRange && updateCartQty(pr, 1); }} style={[s.gridAddBtn, !inRange && {backgroundColor: '#b0bec5'}]}><Text style={{color: '#fff', fontSize: 9, fontWeight: 'bold'}}>ADD +</Text></TouchableOpacity>
                                ) : (
                                  <View style={s.qtyCon} onStartShouldSetResponder={() => true}>
                                    <TouchableOpacity onPress={() => updateCartQty(pr, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 11}}>-</Text></TouchableOpacity>
                                    <Text style={{marginHorizontal: 3, fontWeight: 'bold', fontSize: 9.5}}>{cartQty}</Text>
                                    <TouchableOpacity onPress={() => updateCartQty(pr, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 11}}>+</Text></TouchableOpacity>
                                  </View>
                                )}
                              </TouchableOpacity>
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
                            <Text style={{ fontWeight: 'bold', color: '#2e7d32', marginRight: 6, fontSize: 11.5 }}>₹{ord.total}</Text>
                            <TouchableOpacity onPress={() => confirmDeleteOrder(ord.id)} style={{backgroundColor: isDeleting ? '#b71c1c' : '#c62828', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3}}>
                              <Text style={{color: '#fff', fontSize: 8.5, fontWeight: 'bold'}}>{isDeleting ? '⚠️ Tap' : '🗑️'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        
                        {renderTimelineTracker(ord.deliveryStatus)}

                        {!isCancelled && !ord.deliveryStatus?.includes('Delivered') && !ord.deliveryStatus?.includes('Out for Delivery') && (
                          <TouchableOpacity onPress={() => cancelOrder(ord.id, ord.deliveryStatus)} style={{backgroundColor: '#d32f2f', padding: 5, borderRadius: 5, marginVertical: 3, alignItems: 'center'}}>
                            <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 10}}>❌ Cancel This Order</Text>
                          </TouchableOpacity>
                        )}

                        {isWaitingPayment && (
                          <View style={{marginVertical: 4}}>
                            <TouchableOpacity onPress={async () => {
                              let targetUrl = storeSettings.upi ? storeSettings.upi.trim() : 'https://rzp.io/rzp/KshDefR';
                              let finalPayUrl = targetUrl.includes('?') ? `${targetUrl}&amount=${ord.total}` : `${targetUrl}?amount=${ord.total}`;
                              await AsyncStorage.setItem('manor_pending_ord', ord.id);
                              Linking.openURL(finalPayUrl).catch(() => {
                                if (Platform.OS === 'web') window.location.href = finalPayUrl;
                              });
                            }} style={{backgroundColor: '#ffb300', padding: 6, borderRadius: 5, alignItems: 'center', marginBottom: 4}}>
                              <Text style={{color: '#000', fontWeight: 'bold', fontSize: 10.5}}>💳 Complete Razorpay Payment (₹{ord.total})</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => verifyAndConfirmOrder(ord.id)} style={{backgroundColor: '#2e7d32', padding: 6, borderRadius: 5, alignItems: 'center'}}>
                              <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 10.5}}>🔄 Verify Payment Done (Mark Successful)</Text>
                            </TouchableOpacity>
                          </View>
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
                        ) : !isWaitingPayment && !isCancelled ? (
                          <Text style={{fontSize: 9.5, color: '#888', fontStyle: 'italic', marginVertical: 3}}>Waiting for delivery partner assignment...</Text>
                        ) : null}

                        <View style={s.itemsBox}>
                          <Text style={{fontSize: 9.5, fontWeight: 'bold', color: '#6a1b9a', marginBottom: 2}}>🛒 Purchased Items:</Text>
                          {Object.values(ord.items || {}).map((it, idx) => (
                            <Text key={idx} style={{ fontSize: 10, color: '#333' }}>• {it.name} ({it.unit}) x {it.qty} = ₹{it.effectivePrice * it.qty}</Text>
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

                <View style={{marginTop: 15, borderTopWidth: 1, borderColor: '#eee', paddingTop: 8}}>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#e65100', marginBottom: 6, padding: 10}]} onPress={handleLogout}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>🚪 Logout</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#d32f2f', marginBottom: 6, padding: 10}]} onPress={handleExitApp}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>🔴 Exit Application</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#c62828', padding: 10}]} onPress={handleDeleteAccount}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>⚠️ Delete My Account</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {/* SWIGGY STYLE PRODUCT DETAIL BOTTOM SHEET MODAL WITH TOTAL WEIGHT & PRICE */}
          <Modal visible={isProductModalVisible} transparent={true} animationType="slide">
            <View style={s.modalBottomSheetOverlay}>
              <View style={s.modalBottomSheetCard}>
                <TouchableOpacity onPress={() => setIsProductModalVisible(false)} style={s.modalCloseCircle}>
                  <Text style={{fontSize: 14, fontWeight: 'bold', color: '#333'}}>✕</Text>
                </TouchableOpacity>

                {selectedProduct && (() => {
                  let effPrice = Number(selectedProduct.price) - Number(selectedProduct.discount || 0);
                  let cartQty = cart[selectedProduct.id]?.qty || 0;
                  let itemTotal = effPrice * (cartQty > 0 ? cartQty : 1);

                  return (
                    <View style={{width: '100%', alignItems: 'center'}}>
                      {selectedProduct.image ? (
                        <Image source={{ uri: selectedProduct.image }} style={{width: 100, height: 100, borderRadius: 10, resizeMode: 'contain', marginBottom: 8}} />
                      ) : (
                        <View style={{width: 100, height: 100, borderRadius: 10, backgroundColor: '#f3e5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 8}}>
                          <Text style={{fontSize: 32}}>📦</Text>
                        </View>
                      )}

                      <Text style={{fontSize: 15, fontWeight: 'bold', color: '#222', textAlign: 'center', marginBottom: 2}}>{selectedProduct.name}</Text>
                      <Text style={{fontSize: 11.5, color: '#666', fontWeight: '600', marginBottom: 8}}>⚖️ {selectedProduct.unit}</Text>

                      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}>
                        <Text style={{fontSize: 16, fontWeight: 'bold', color: '#2e7d32'}}>₹{effPrice}</Text>
                        {Number(selectedProduct.discount || 0) > 0 && (
                          <Text style={{fontSize: 11, color: '#888', textDecorationLine: 'line-through', marginLeft: 6}}>₹{selectedProduct.price}</Text>
                        )}
                      </View>

                      <View style={{width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eee', marginBottom: 12}}>
                        <Text style={{fontSize: 12, fontWeight: 'bold', color: '#444'}}>Quantity ({selectedProduct.unit})</Text>
                        {cartQty === 0 ? (
                          <TouchableOpacity onPress={() => { inRange && updateCartQty(selectedProduct, 1); }} style={{backgroundColor: '#6a1b9a', paddingHorizontal: 20, paddingVertical: 6, borderRadius: 6}}>
                            <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 12}}>ADD +</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 4, borderRadius: 6}}>
                            <TouchableOpacity onPress={() => updateCartQty(selectedProduct, -1)} style={{backgroundColor: '#6a1b9a', width: 28, height: 28, borderRadius: 4, justifyContent: 'center', alignItems: 'center'}}>
                              <Text style={{color:'#fff', fontWeight:'bold', fontSize: 16}}>-</Text>
                            </TouchableOpacity>
                            <Text style={{marginHorizontal: 12, fontWeight: 'bold', fontSize: 13}}>{cartQty}</Text>
                            <TouchableOpacity onPress={() => updateCartQty(selectedProduct, 1)} style={{backgroundColor: '#6a1b9a', width: 28, height: 28, borderRadius: 4, justifyContent: 'center', alignItems: 'center'}}>
                              <Text style={{color:'#fff', fontWeight:'bold', fontSize: 16}}>+</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      {/* TOTAL WEIGHT & PRICE DISPLAY */}
                      <View style={{width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingHorizontal: 4}}>
                        <Text style={{fontSize: 11.5, color: '#555', fontWeight: 'bold'}}>Total: {cartQty > 0 ? cartQty : 1} x {selectedProduct.unit}</Text>
                        <Text style={{fontSize: 13.5, fontWeight: 'bold', color: '#2e7d32'}}>Item Total: ₹{itemTotal}</Text>
                      </View>

                      <TouchableOpacity onPress={() => setIsProductModalVisible(false)} style={{backgroundColor: '#6a1b9a', width: '100%', padding: 11, borderRadius: 8, alignItems: 'center'}}>
                        <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 13}}>Done / View Cart</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
            </View>
          </Modal>

          {subtotal > 0 && activeTab === 'shop' && inRange && (
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
                  <Text style={s.lbl}>Delivery Address:</Text>
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
                    <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>{inRange ? (paymentMode === 'Online' ? `Pay ₹{finalTotal} via Razorpay & Place Order` : `Place COD Order (₹{finalTotal})`) : '⚠️ Outside Delivery Zone'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </SafeAreaView>
          </Modal>
        </>
      )}
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
  con: { flex: 1, backgroundColor: '#fffde7', width: '100%' },
  hdr: { backgroundColor: '#4a148c', paddingHorizontal: 8, paddingVertical: 10, paddingTop: 48, width: '100%', elevation: 4 },
  ht: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  headerTabBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#7b1fa2', marginHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  headerTabAct: { backgroundColor: '#ffd54f' },
  body: { padding: 4, width: '100%', flex: 1 },
  announcementBox: { backgroundColor: '#fbe9e7', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ffccbc', width: '100%' },
  warningBox: { backgroundColor: '#ffebee', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ef9a9a', width: '100%' },
  searchBar: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 11, borderRadius: 10, fontSize: 12, marginBottom: 6, width: '100%' },
  instamartCatCard: { width: '23.5%', backgroundColor: '#fff', padding: 6, borderRadius: 10, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#e1bee7', elevation: 2 },
  instamartCatCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3e5f5', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  gridCard: { width: '23.5%', backgroundColor: '#fff', padding: 4, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e1bee7', elevation: 2, alignItems: 'center', minHeight: 105 },
  gridImg: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#fafafa', marginBottom: 2 },
  gridAddBtn: { backgroundColor: '#6a1b9a', width: '100%', paddingVertical: 2.5, borderRadius: 4, alignItems: 'center', marginTop: 2 },
  qtyCon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 2, borderRadius: 4, marginTop: 2, justifyContent: 'space-between', width: '100%' },
  qtyConCart: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 4, borderRadius: 6, justifyContent: 'space-between' },
  qtyBtn: { backgroundColor: '#6a1b9a', width: 20, height: 20, borderRadius: 3, justifyContent: 'center', alignItems: 'center' },
  floatingCartBar: { position: 'absolute', bottom: 30, left: 10, right: 10, backgroundColor: '#4a148c', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8 },
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
  modalTitle: { fontSize: 15, fontWeight: 'bold', color: '#4a1b9a', marginBottom: 4 },
  modalBottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  modalBottomSheetCard: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, alignItems: 'center', elevation: 15 },
  modalCloseCircle: { position: 'absolute', top: 10, right: 15, width: 28, height: 28, borderRadius: 14, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }
});
