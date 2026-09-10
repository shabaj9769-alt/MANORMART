// --- MANOR MART ULTIMATE CUSTOMER APP (NEXT-GEN COMMERCE FEATURES - MOBILE & WEB FIXED) ---
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, SafeAreaView, Modal, Image, Linking, ImageBackground, Animated, Platform } from 'react-native';
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
    radiusKm: '10',
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
  const [activeTab, setActiveTab] = useState('shop'); // 'shop', 'orders', 'profile', 'cart'

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
    loadStoreConfigAndCatalog();
    detectCustomerGPS();
    checkSavedCustomerSession();
    checkURLPaymentReturn();

    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 1, duration: 600, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const checkURLPaymentReturn = async () => {
    try {
      if (Platform.OS === 'web') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment') === 'success') {
          let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await fetch(db + `orders/${pendingOrderId}/deliveryStatus.json`, {
              method: 'PUT',
              body: JSON.stringify('Order Successful')
            });
            await AsyncStorage.removeItem('manor_pending_ord');
            Alert.alert("🎉 Payment Successful", "Online payment verified and order confirmed!");
          }
        }
      }
    } catch(e) {}
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

  const loadStoreConfigAndCatalog = () => {
    fetch(db + ".json").then(r => r.json()).then(data => {
      if (!data) return;
      if (data.settings) {
        setStoreSettings(prev => ({ ...prev, ...data.settings }));
        if (custLat && custLng) {
          calcGeoFence(custLat, custLng, data.settings.hubLat, data.settings.hubLng, data.settings.radiusKm);
        }
      }
      if (data.categories) setCategories(data.categories);
      if (data.deliveryBoys) setDeliveryBoysList(data.deliveryBoys);
    });
  };

  const detectCustomerGPS = () => {
    if (Platform.OS === 'web' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          let lat = pos.coords.latitude;
          let lng = pos.coords.longitude;
          setCustLat(lat); setCustLng(lng);
          calcGeoFence(lat, lng, storeSettings.hubLat, storeSettings.hubLng, storeSettings.radiusKm);
        },
        () => calcGeoFence(19.7280, 72.9150, storeSettings.hubLat, storeSettings.hubLng, storeSettings.radiusKm),
        { enableHighAccuracy: true }
      );
    } else {
      calcGeoFence(19.7280, 72.9150, storeSettings.hubLat, storeSettings.hubLng, storeSettings.radiusKm);
    }
  };

  const calcGeoFence = (lat, lng, hLat, hLng, rad) => {
    let hubLat = Number(hLat || storeSettings.hubLat || 19.7280);
    let hubLng = Number(hLng || storeSettings.hubLng || 72.9150);
    let allowedRadius = Number(rad || storeSettings.radiusKm || 10);

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
    });
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('manor_cust_phone');
    await AsyncStorage.removeItem('manor_cust_name');
    await AsyncStorage.removeItem('manor_cust_addr');
    await AsyncStorage.removeItem('manor_cust_addrs_list');
    setIsLoggedIn(false); setCart({}); setActiveTab('shop');
    Alert.alert("Logged Out", "Session cleared.");
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
      return Alert.alert("Outside Delivery Zone", `Sorry! Store delivers only within ${storeSettings.radiusKm} KM.`);
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
        let targetUrl = storeSettings.upi ? storeSettings.upi.trim() : 'https://rzp.io/rzp/KshDefR';
        Linking.openURL(targetUrl).catch(() => {
          if (Platform.OS === 'web') window.location.href = targetUrl;
        });
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

    if (currentStepIdx === -1) return <Text style={{fontSize: 11, color: '#e65100', fontWeight: 'bold'}}>⏳ Awaiting Payment Completion</Text>;

    return (
      <View style={{marginVertical: 8, backgroundColor: '#f3e5f5', padding: 8, borderRadius: 6}}>
        <Text style={{fontSize: 10.5, fontWeight: 'bold', color: '#4a148c', marginBottom: 4}}>🚀 Live Order Progress:</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          {steps.map((st, idx) => {
            let isDone = idx <= currentStepIdx;
            return (
              <View key={st} style={{alignItems: 'center', flex: 1}}>
                <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: isDone ? '#6a1b9a' : '#ccc', justifyContent: 'center', alignItems: 'center'}}>
                  <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>{isDone ? '✓' : idx + 1}</Text>
                </View>
                <Text style={{fontSize: 8.5, color: isDone ? '#6a1b9a' : '#777', textAlign: 'center', marginTop: 2}}>{st}</Text>
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
          <View style={{flex: 1, backgroundColor: 'rgba(255,255,255,0.9)'}}>{children}</View>
        </ImageBackground>
      );
    }
    return <View style={{flex: 1, backgroundColor: '#fff8e1'}}>{children}</View>;
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={s.loginCon}>
        {renderAppContainer(
          <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25}}>
            <View style={s.loginCard}>
              <Text style={{fontSize: 48, marginBottom: 10, textAlign: 'center'}}>🛒✨</Text>
              <Text style={s.lockTitle}>{storeSettings.store}</Text>
              <Text style={{fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 20}}>Enter 10-digit mobile number to enter store:</Text>
              <TextInput style={s.lockInput} placeholder="10-digit Phone" keyboardType="numeric" maxLength={10} value={loginPhoneInput} onChangeText={setLoginPhoneInput} />
              <TouchableOpacity style={s.lockBtn} onPress={handleLogin}><Text style={s.lockBtnTxt}>🚀 Enter Store Now</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Helper to get items list for product grid display
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
                <Text style={{fontSize: 32, marginBottom: 4, textAlign: 'center'}}>📜✨</Text>
                <Text style={[s.modalTitle, {textAlign: 'center'}]}>Welcome to {storeSettings.store}</Text>
                <Text style={{fontSize: 12, color: '#444', textAlign: 'center', marginVertical: 10}}>Please review store terms & conditions before entering the vibrant mart.</Text>
                <TouchableOpacity onPress={() => Linking.openURL(termsDocLink)} style={{marginBottom: 15, alignSelf: 'center'}}>
                  <Text style={{fontSize: 12.5, color: '#d81b60', fontWeight: 'bold', textDecorationLine: 'underline'}}>📄 Read Official Terms & Conditions</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTermsAccepted(true)} style={s.btn}><Text style={s.btnTxt}>✨ I Agree & Start Shopping</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={s.hdr}>
            <View>
              <Text style={s.ht}>🛒 {storeSettings.store}</Text>
              <Text style={{fontSize: 10.5, color: inRange ? '#e8f5e9' : '#ffcdd2', fontWeight: 'bold'}}>
                {inRange ? `📍 Inside Delivery Zone (${distanceKm} KM)` : `⚠️ Outside Zone (${distanceKm} KM)`}
              </Text>
            </View>
            <View style={{flexDirection: 'row'}}>
              {['shop', 'orders', 'profile'].map(t => (
                <TouchableOpacity key={t} onPress={() => { setActiveTab(t); if(t==='orders') fetchCustomerOrders(custPhone); }} style={[s.headerTabBtn, activeTab === t && s.headerTabAct]}>
                  <Text style={{fontSize: 10, fontWeight: 'bold', color: activeTab === t ? '#6a1b9a' : '#fff'}}>
                    {t === 'shop' ? '🛍️ Shop' : t === 'orders' ? '📦 Orders' : '⚙️ Profile'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 110 }}>
            {activeTab === 'shop' && (
              <View>
                {storeSettings.adminNote ? (
                  <View style={s.announcementBox}>
                    <Text style={{fontSize: 11.5, color: '#d84315', fontWeight: 'bold', textAlign: 'center'}}>📢 {storeSettings.adminNote}</Text>
                  </View>
                ) : null}

                <View style={{marginVertical: 8}}>
                  <TextInput style={s.searchBar} placeholder="🔍 Search groceries (e.g. Rice, Kaju, Tomato)..." value={searchQuery} onChangeText={setSearchQuery} />
                </View>

                {!inRange && (
                  <View style={s.warningBox}>
                    <Text style={{fontSize: 11.5, color: '#c62828', fontWeight: 'bold', textAlign: 'center'}}>⚠️ Outside delivery zone ({distanceKm} KM). Orders disabled.</Text>
                  </View>
                )}

                <View style={{flexDirection: 'row'}}>
                  <View style={s.sidebar}>
                    {Object.keys(categories).map(catName => (
                      <TouchableOpacity key={catName} onPress={() => { setSelectedCat(selectedCat === catName ? '' : catName); setSearchQuery(''); }} style={[s.sidebarItem, selectedCat === catName && s.sidebarItemAct]}>
                        <Text style={[s.sidebarTxt, selectedCat === catName && s.sidebarTxtAct]}>{catName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={s.productGrid}>
                    {!selectedCat && !searchQuery ? (
                      <View style={s.cartoonBanner}>
                        <Animated.Text style={{fontSize: 55, transform: [{ scale: bounceAnim }], marginBottom: 12}}>🛒✨🛍️</Animated.Text>
                        <Text style={{fontSize: 18, fontWeight: 'bold', color: '#6a1b9a', textAlign: 'center'}}>Fresh & Fast Grocery Express!</Text>
                        <Text style={{fontSize: 12, color: '#555', textAlign: 'center', marginTop: 6, paddingHorizontal: 15, lineHeight: 18}}>
                          Select any category on the left sidebar or search above to discover fresh veggies, dry fruits & daily essentials instantly!
                        </Text>
                      </View>
                    ) : (
                      <View>
                        <Text style={{fontWeight: 'bold', fontSize: 13.5, color: '#6a1b9a', marginBottom: 8}}>
                          {searchQuery ? `🔍 Search Results for "${searchQuery}"` : `📁 ${selectedCat}`}
                        </Text>
                        
                        {itemsToDisplay.length === 0 ? (
                          <Text style={{textAlign: 'center', color: '#888', marginTop: 30, width: '100%'}}>No products found.</Text>
                        ) : (
                          <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 20}}>
                            {itemsToDisplay.map((pr, idx) => {
                              let effPrice = Number(pr.price) - Number(pr.discount || 0);
                              let cartQty = cart[pr.id]?.qty || 0;
                              let isOutOfStock = pr.inStock === false;

                              return (
                                <View key={idx} style={[s.gridCard, isOutOfStock && {backgroundColor: '#f5f5f5'}]}>
                                  {pr.image ? <Image source={{ uri: pr.image }} style={s.gridImg} /> : <View style={[s.gridImg, {justifyContent:'center', alignItems:'center', backgroundColor:'#f3e5f5'} ]}><Text style={{fontSize: 28}}>📦</Text></View>}
                                  <Text style={{fontWeight: 'bold', fontSize: 12, marginTop: 4}} numberOfLines={1}>{pr.name}</Text>
                                  <Text style={{fontSize: 10, color: '#666'}}>{pr.unit}</Text>
                                  
                                  <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 4}}>
                                    <Text style={{fontWeight: 'bold', color: '#2e7d32', fontSize: 12.5}}>₹{effPrice}</Text>
                                    {Number(pr.discount || 0) > 0 && <Text style={{fontSize: 9.5, color: '#888', textDecorationLine: 'line-through', marginLeft: 4}}>₹{pr.price}</Text>}
                                  </View>

                                  {isOutOfStock ? (
                                    <View style={{backgroundColor: '#e53935', width: '100%', paddingVertical: 6, borderRadius: 4, alignItems: 'center', marginTop: 4}}>
                                      <Text style={{color: '#fff', fontSize: 10.5, fontWeight: 'bold'}}>OUT OF STOCK</Text>
                                    </View>
                                  ) : cartQty === 0 ? (
                                    <TouchableOpacity onPress={() => inRange && updateCartQty(pr, 1)} style={[s.gridAddBtn, !inRange && {backgroundColor: '#b0bec5'}]}><Text style={{color: '#fff', fontSize: 11.5, fontWeight: 'bold'}}>ADD +</Text></TouchableOpacity>
                                  ) : (
                                    <View style={s.qtyCon}>
                                      <TouchableOpacity onPress={() => updateCartQty(pr, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold'}}>-</Text></TouchableOpacity>
                                      <Text style={{marginHorizontal: 8, fontWeight: 'bold', fontSize: 12}}>{cartQty}</Text>
                                      <TouchableOpacity onPress={() => updateCartQty(pr, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold'}}>+</Text></TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {activeTab === 'orders' && (
              <View style={s.card}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <Text style={s.secTitle}>📦 Track Orders & Live Timeline</Text>
                  <TouchableOpacity onPress={() => fetchCustomerOrders(custPhone)} style={{backgroundColor: '#e1bee7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4}}>
                    <Text style={{fontSize: 10.5, fontWeight: 'bold', color: '#6a1b9a'}}>🔄 Refresh</Text>
                  </TouchableOpacity>
                </View>

                {myOrders.length === 0 ? (
                  <Text style={{textAlign: 'center', color: '#777', padding: 20}}>No orders placed yet.</Text>
                ) : (
                  myOrders.map(ord => {
                    let boyPhone = getDeliveryBoyPhone(ord.assignedBoy);
                    let isDeleting = deleteStepOrder === ord.id;
                    let isWaitingPayment = ord.deliveryStatus && ord.deliveryStatus.includes('Payment Pending');

                    return (
                      <View key={ord.id} style={[s.card, {borderColor: isWaitingPayment ? '#e65100' : '#8e24aa', borderWidth: 1.5}]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontWeight: 'bold', color: '#6a1b9a' }}>ORDER #{ord.id.slice(-6)}</Text>
                          <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <Text style={{ fontWeight: 'bold', color: '#2e7d32', marginRight: 8 }}>₹{ord.total}</Text>
                            <TouchableOpacity onPress={() => confirmDeleteOrder(ord.id)} style={{backgroundColor: isDeleting ? '#b71c1c' : '#c62828', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4}}>
                              <Text style={{color: '#fff', fontSize: 9.5, fontWeight: 'bold'}}>{isDeleting ? '⚠️ Tap Again' : '🗑️ Delete'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        
                        {renderTimelineTracker(ord.deliveryStatus)}

                        {isWaitingPayment && (
                          <TouchableOpacity onPress={async () => {
                            let targetUrl = storeSettings.upi ? storeSettings.upi.trim() : 'https://rzp.io/rzp/KshDefR';
                            await AsyncStorage.setItem('manor_pending_ord', ord.id);
                            Linking.openURL(targetUrl).catch(() => {
                              if (Platform.OS === 'web') window.location.href = targetUrl;
                            });
                          }} style={{backgroundColor: '#ffb300', padding: 8, borderRadius: 6, marginVertical: 6, alignItems: 'center'}}>
                            <Text style={{color: '#000', fontWeight: 'bold', fontSize: 11}}>💳 Complete Razorpay Payment</Text>
                          </TouchableOpacity>
                        )}
                        
                        {ord.assignedBoy ? (
                          <View style={{backgroundColor: '#f3e5f5', padding: 8, borderRadius: 6, marginVertical: 6}}>
                            <Text style={{fontSize: 11, fontWeight: 'bold', color: '#6a1b9a'}}>🚴 Delivery Partner: {ord.assignedBoy}</Text>
                            {boyPhone ? (
                              <TouchableOpacity onPress={() => Linking.openURL(`tel:${boyPhone}`)} style={{marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#6a1b9a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4}}>
                                <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>📞 Call Delivery Boy</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : !isWaitingPayment ? (
                          <Text style={{fontSize: 10.5, color: '#888', fontStyle: 'italic', marginVertical: 4}}>Waiting for delivery partner assignment...</Text>
                        ) : null}

                        <View style={s.itemsBox}>
                          <Text style={{fontSize: 10.5, fontWeight: 'bold', color: '#6a1b9a', marginBottom: 2}}>🛒 Purchased Items:</Text>
                          {Object.values(ord.items || {}).map((it, idx) => (
                            <Text key={idx} style={{ fontSize: 11, color: '#333' }}>• {it.name} ({it.unit}) x {it.qty} = ₹{it.effectivePrice * it.qty}</Text>
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
                <TextInput style={[s.i, {height: 60}]} value={custAddr} onChangeText={v => setCustAddr(sanitizeInput(v))} placeholder="House No, Street, Area" multiline={true} />
                
                <TouchableOpacity style={{backgroundColor: '#7b1fa2', padding: 8, borderRadius: 6, alignItems: 'center', marginVertical: 4}} onPress={saveCurrentAddress}>
                  <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>📍 Save This Address</Text>
                </TouchableOpacity>

                {savedAddresses.length > 0 && (
                  <View style={{marginTop: 6}}>
                    <Text style={{fontSize: 10.5, fontWeight: 'bold', color: '#4a148c'}}>Saved Addresses (Tap to use):</Text>
                    {savedAddresses.map((ad, i) => (
                      <TouchableOpacity key={i} onPress={() => setCustAddr(ad)} style={{backgroundColor: '#f3e5f5', padding: 6, borderRadius: 4, marginVertical: 2}}>
                        <Text style={{fontSize: 10, color: '#333'}}>{ad}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={[s.btn, {backgroundColor: '#6a1b9a', marginTop: 10}]} onPress={async () => {
                  await AsyncStorage.setItem('manor_cust_name', custName);
                  await AsyncStorage.setItem('manor_cust_addr', custAddr);
                  Alert.alert("Success", "Profile updated!");
                }}><Text style={s.btnTxt}>💾 Save Changes</Text></TouchableOpacity>

                <View style={{marginTop: 20, borderTopWidth: 1, borderColor: '#eee', paddingTop: 10}}>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#e65100', marginBottom: 8}]} onPress={handleLogout}><Text style={s.btnTxt}>🚪 Logout / Exit App</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#c62828'}]} onPress={handleDeleteAccount}><Text style={s.btnTxt}>⚠️ Delete My Account</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {subtotal > 0 && activeTab === 'shop' && inRange && (
            <View style={s.floatingCartBar}>
              <View>
                <Text style={{color: '#fff', fontSize: 11.5, fontWeight: 'bold'}}>{cartItemsList.reduce((sum, i) => sum + i.qty, 0)} Items | ₹{subtotal}</Text>
                <Text style={{color: '#e1bee7', fontSize: 10}}>Taxes & delivery calculated</Text>
              </View>
              <TouchableOpacity onPress={() => setActiveTab('cart')} style={s.viewCartBtn}>
                <Text style={{color: '#6a1b9a', fontWeight: 'bold', fontSize: 12.5}}>View Cart & Checkout ➔</Text>
              </TouchableOpacity>
            </View>
          )}

          <Modal visible={activeTab === 'cart'} animationType="slide">
            <SafeAreaView style={{flex: 1, backgroundColor: '#fffde7'}}>
              <View style={s.hdr}>
                <Text style={s.ht}>🛒 Cart & Secure Checkout</Text>
                <TouchableOpacity onPress={() => setActiveTab('shop')} style={{backgroundColor: '#7b1fa2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4}}>
                  <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>🔙 Return to Menu</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{padding: 12}} contentContainerStyle={{paddingBottom: 40}}>
                <View style={s.card}>
                  <Text style={s.secTitle}>🛍️ Review Your Cart</Text>
                  {cartItemsList.map(item => (
                    <View key={item.id} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#eee'}}>
                      <View style={{flex: 1}}>
                        <Text style={{fontWeight: 'bold', fontSize: 12}}>{item.name} ({item.unit})</Text>
                        <Text style={{fontSize: 10, color: '#666'}}>₹{item.effectivePrice} x {item.qty} = ₹{item.effectivePrice * item.qty}</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <View style={s.qtyCon}>
                          <TouchableOpacity onPress={() => updateCartQty(item, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold'}}>-</Text></TouchableOpacity>
                          <Text style={{marginHorizontal: 6, fontWeight: 'bold'}}>{item.qty}</Text>
                          <TouchableOpacity onPress={() => updateCartQty(item, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold'}}>+</Text></TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => setCart(prev => { let u = {...prev}; delete u[item.id]; return u; })} style={{backgroundColor: '#c62828', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, marginLeft: 6}}>
                          <Text style={{color: '#fff', fontSize: 9.5, fontWeight: 'bold'}}>✕ Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <View style={{marginTop: 10, borderTopWidth: 1, borderColor: '#ddd', paddingTop: 8}}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{fontSize: 11}}>Subtotal:</Text><Text style={{fontSize: 11, fontWeight: 'bold'}}>₹{subtotal}</Text></View>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{fontSize: 11}}>Delivery Fee ({deliveryType}):</Text><Text style={{fontSize: 11, fontWeight: 'bold'}}>₹{deliveryFee}</Text></View>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 4}}><Text style={{fontSize: 13, fontWeight: 'bold', color: '#6a1b9a'}}>Grand Total:</Text><Text style={{fontSize: 13, fontWeight: 'bold', color: '#6a1b9a'}}>₹{finalTotal}</Text></View>
                  </View>
                </View>

                <View style={s.card}>
                  <Text style={s.secTitle}>📍 Delivery Details</Text>
                  <Text style={s.lbl}>Full Name:</Text>
                  <TextInput style={s.i} placeholder="Enter Full Name (Required)" value={custName} onChangeText={v => setCustName(v)} />
                  <Text style={s.lbl}>Mobile Number:</Text>
                  <TextInput style={[s.i, {backgroundColor: '#f5f5f5'}]} value={custPhone} editable={false} />
                  <Text style={s.lbl}>Delivery Address:</Text>
                  <TextInput style={[s.i, {height: 60}]} placeholder="House No, Landmark, Area (Required)" multiline={true} value={custAddr} onChangeText={v => setCustAddr(v)} />

                  {savedAddresses.length > 0 && (
                    <View style={{marginVertical: 4}}>
                      <Text style={{fontSize: 10, fontWeight: 'bold', color: '#6a1b9a'}}>Quick Select Saved Address:</Text>
                      <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={{marginTop: 2}}>
                        {savedAddresses.map((ad, i) => (
                          <TouchableOpacity key={i} onPress={() => setCustAddr(ad)} style={{backgroundColor: '#f3e5f5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 4}}>
                            <Text style={{fontSize: 9.5, color: '#4a148c'}}>{ad}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <Text style={s.lbl}>Select Delivery Speed:</Text>
                  <View style={{flexDirection: 'row', marginVertical: 4}}>
                    {['Normal', 'Express'].map(spd => (
                      <TouchableOpacity key={spd} onPress={() => setDeliveryType(spd)} style={[s.catChip, deliveryType === spd && s.catChipAct]}>
                        <Text style={{fontSize: 11, fontWeight: 'bold', color: deliveryType === spd ? '#fff' : '#6a1b9a'}}>{spd === 'Express' ? `⚡ Express (${storeSettings.expDeliveryTime})` : '📦 Normal Delivery'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.lbl}>Select Delivery Shift:</Text>
                  <View style={{flexDirection: 'row', marginVertical: 4}}>
                    {['Morning (8 AM - 11 AM)', 'Evening (4 PM - 8 PM)'].map(sh => (
                      <TouchableOpacity key={sh} onPress={() => setDeliveryShift(sh)} style={[s.catChip, deliveryShift === sh && s.catChipAct]}>
                        <Text style={{fontSize: 10, fontWeight: 'bold', color: deliveryShift === sh ? '#fff' : '#6a1b9a'}}>{sh}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.lbl}>Payment Mode:</Text>
                  <View style={{flexDirection: 'row', marginVertical: 4}}>
                    <TouchableOpacity onPress={() => setPaymentMode('COD')} style={[s.catChip, paymentMode === 'COD' && s.catChipAct]}>
                      <Text style={{fontSize: 11, fontWeight: 'bold', color: paymentMode === 'COD' ? '#fff' : '#6a1b9a'}}>💵 Cash on Delivery</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setPaymentMode('Online')} style={[s.catChip, paymentMode === 'Online' && s.catChipAct]}>
                      <Text style={{fontSize: 11, fontWeight: 'bold', color: paymentMode === 'Online' ? '#fff' : '#6a1b9a'}}>💳 Pay Online (Razorpay / UPI)</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={[s.btn, {marginTop: 16, backgroundColor: inRange ? '#6a1b9a' : '#c62828'}]} onPress={placeOrder}>
                    <Text style={s.btnTxt}>{inRange ? (paymentMode === 'Online' ? `Pay ₹${finalTotal} via Razorpay & Place Order` : `Place COD Order (₹${finalTotal})`) : '⚠️ Outside Delivery Zone'}</Text>
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
  loginCon: { flex: 1, backgroundColor: '#4a148c', justifyContent: 'center', alignItems: 'center', padding: 25 },
  loginCard: { width: '100%', maxWidth: 400, backgroundColor: '#ffffff', padding: 24, borderRadius: 16, elevation: 6 },
  lockTitle: { fontSize: 24, fontWeight: 'bold', color: '#4a148c', marginBottom: 6, textAlign: 'center' },
  lockSubtitle: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 20 },
  lockInput: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#f3e5f5', padding: 12, borderRadius: 10, fontSize: 16, textAlign: 'center', letterSpacing: 2, marginBottom: 15 },
  lockBtn: { backgroundColor: '#6a1b9a', padding: 14, borderRadius: 10, alignItems: 'center' },
  lockBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  con: { flex: 1, backgroundColor: '#fffde7' },
  hdr: { backgroundColor: '#4a148c', padding: 12, paddingTop: 35, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  ht: { color: '#fff', fontSize: 14.5, fontWeight: 'bold' },
  headerTabBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#7b1fa2', marginLeft: 4 },
  headerTabAct: { backgroundColor: '#ffd54f' },
  body: { padding: 8 },
  announcementBox: { backgroundColor: '#fbe9e7', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ffccbc' },
  warningBox: { backgroundColor: '#ffebee', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ef9a9a' },
  searchBar: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 11, borderRadius: 10, fontSize: 12.5, marginBottom: 4 },
  cartoonBanner: { backgroundColor: '#f3e5f5', padding: 35, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ab47bc', marginTop: 10, elevation: 2 },
  sidebar: { width: 90, backgroundColor: '#f3e5f5', borderRightWidth: 1, borderColor: '#ce93d8', paddingVertical: 4, borderRadius: 8 },
  sidebarItem: { padding: 11, alignItems: 'center', borderBottomWidth: 0.5, borderColor: '#e1bee7' },
  sidebarItemAct: { backgroundColor: '#6a1b9a' },
  sidebarTxt: { fontSize: 10.5, fontWeight: 'bold', color: '#4a148c', textAlign: 'center' },
  sidebarTxtAct: { color: '#fff' },
  productGrid: { flex: 1, paddingLeft: 8 },
  gridCard: { width: '48%', backgroundColor: '#fff', padding: 9, borderRadius: 10, marginBottom: 9, borderWidth: 1, borderColor: '#e1bee7', elevation: 2, alignItems: 'center' },
  gridImg: { width: 75, height: 75, borderRadius: 8, backgroundColor: '#fafafa', marginBottom: 4 },
  gridAddBtn: { backgroundColor: '#6a1b9a', width: '100%', paddingVertical: 6.5, borderRadius: 6, alignItems: 'center', marginTop: 4 },
  qtyCon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 4, borderRadius: 6, marginTop: 4 },
  qtyBtn: { backgroundColor: '#6a1b9a', width: 22, height: 22, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  floatingCartBar: { position: 'absolute', bottom: 15, left: 12, right: 12, backgroundColor: '#4a148c', padding: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8 },
  viewCartBtn: { backgroundColor: '#ffd54f', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#d1c4e9', elevation: 2 },
  secTitle: { fontSize: 13.5, fontWeight: 'bold', color: '#4a148c', marginVertical: 6 },
  itemsBox: { backgroundColor: '#f3e5f5', padding: 8, borderRadius: 6, marginVertical: 6, borderWidth: 1, borderColor: '#e1bee7' },
  lbl: { fontSize: 11, fontWeight: 'bold', color: '#444', marginTop: 6 },
  i: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 9, borderRadius: 8, fontSize: 12, marginVertical: 3 },
  btn: { backgroundColor: '#6a1b9a', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 12.5 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3e5f5', marginRight: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ce93d8' },
  catChipAct: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', padding: 20, borderRadius: 16, elevation: 8 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#4a148c', marginBottom: 6 }
});
