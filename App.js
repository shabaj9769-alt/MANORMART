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
        if (urlParams.get('payment') === 'success' || urlParams.get('status') === 'success') {
          let pendingOrderId = await AsyncStorage.getItem('manor_pending_ord');
          if (pendingOrderId) {
            await fetch(db + `orders/${pendingOrderId}/deliveryStatus.json`, {
              method: 'PUT',
              body: JSON.stringify('Order Successful')
            });
            await AsyncStorage.removeItem('manor_pending_ord');
            Alert.alert("🎉 Payment Successful", "Online payment verified and order confirmed!");
            setActiveTab('orders');
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
        let baseUrl = storeSettings.upi ? storeSettings.upi.trim() : 'https://rzp.io/rzp/KshDefR';
        let targetUrl = baseUrl.includes('?') ? `${baseUrl}&amount=${finalTotal}` : `${baseUrl}?amount=${finalTotal}`;
        
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
              <Text style={{fontSize: 40, marginBottom: 8, textAlign: 'center'}}>🛒✨</Text>
              <Text style={s.lockTitle}>{storeSettings.store}</Text>
              <Text style={{fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 15}}>Enter 10-digit mobile number to enter store:</Text>
              <TextInput style={s.lockInput} placeholder="10-digit Phone" keyboardType="numeric" maxLength={10} value={loginPhoneInput} onChangeText={setLoginPhoneInput} />
              <TouchableOpacity style={s.lockBtn} onPress={handleLogin}><Text style={s.lockBtnTxt}>🚀 Enter Store Now</Text></TouchableOpacity>
            </View>
          </View>
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

          <View style={s.hdr}>
            <View style={{flex: 1, paddingRight: 4}}>
              <Text style={s.ht} numberOfLines={1}>🛒 {storeSettings.store}</Text>
              <Text style={{fontSize: 9, color: inRange ? '#e8f5e9' : '#ffcdd2', fontWeight: 'bold'}} numberOfLines={1}>
                {inRange ? `📍 Inside Zone (${distanceKm} KM)` : `⚠️ Outside Zone (${distanceKm} KM)`}
              </Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              {[
                { key: 'shop', label: '🛍️ Shop' },
                { key: 'orders', label: '📦 Orders' },
                { key: 'profile', label: '⚙️ Profile' }
              ].map(t => (
                <TouchableOpacity key={t.key} onPress={() => { setActiveTab(t.key); if(t.key==='orders') fetchCustomerOrders(custPhone); }} style={[s.headerTabBtn, activeTab === t.key && s.headerTabAct]}>
                  <Text style={{fontSize: 9, fontWeight: 'bold', color: activeTab === t.key ? '#6a1b9a' : '#fff'}} numberOfLines={1}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 130 }}>
            {activeTab === 'shop' && (
              <View>
                {storeSettings.adminNote ? (
                  <View style={s.announcementBox}>
                    <Text style={{fontSize: 10.5, color: '#d84315', fontWeight: 'bold', textAlign: 'center'}}>📢 {storeSettings.adminNote}</Text>
                  </View>
                ) : null}

                <View style={{marginVertical: 6}}>
                  <TextInput style={s.searchBar} placeholder="🔍 Search groceries (e.g. Rice, Kaju, Tomato)..." value={searchQuery} onChangeText={setSearchQuery} />
                </View>

                {!inRange && (
                  <View style={s.warningBox}>
                    <Text style={{fontSize: 10.5, color: '#c62828', fontWeight: 'bold', textAlign: 'center'}}>⚠️ Outside delivery zone ({distanceKm} KM). Orders disabled.</Text>
                  </View>
                )}

                <View style={{flexDirection: 'row'}}>
                  <View style={s.sidebar}>
                    {Object.keys(categories).map(catName => (
                      <TouchableOpacity key={catName} onPress={() => { setSelectedCat(selectedCat === catName ? '' : catName); setSearchQuery(''); }} style={[s.sidebarItem, selectedCat === catName && s.sidebarItemAct]}>
                        <Text style={[s.sidebarTxt, selectedCat === catName && s.sidebarTxtAct]} numberOfLines={2}>{catName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={s.productGrid}>
                    {!selectedCat && !searchQuery ? (
                      <View style={s.cartoonBanner}>
                        <Animated.Text style={{fontSize: 45, transform: [{ scale: bounceAnim }], marginBottom: 8}}>🛒✨🛍️</Animated.Text>
                        <Text style={{fontSize: 15, fontWeight: 'bold', color: '#6a1b9a', textAlign: 'center'}}>Fresh & Fast Grocery Express!</Text>
                        <Text style={{fontSize: 11, color: '#555', textAlign: 'center', marginTop: 4, paddingHorizontal: 10, lineHeight: 16}}>
                          Select any category on the left sidebar or search above to discover fresh veggies, dry fruits & daily essentials instantly!
                        </Text>
                      </View>
                    ) : (
                      <View>
                        <Text style={{fontWeight: 'bold', fontSize: 12.5, color: '#6a1b9a', marginBottom: 6}}>
                          {searchQuery ? `🔍 Search Results for "${searchQuery}"` : `📁 ${selectedCat}`}
                        </Text>
                        
                        {itemsToDisplay.length === 0 ? (
                          <Text style={{textAlign: 'center', color: '#888', marginTop: 25, width: '100%', fontSize: 11}}>No products found.</Text>
                        ) : (
                          <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 15}}>
                            {itemsToDisplay.map((pr, idx) => {
                              let effPrice = Number(pr.price) - Number(pr.discount || 0);
                              let cartQty = cart[pr.id]?.qty || 0;
                              let isOutOfStock = pr.inStock === false;

                              return (
                                <View key={idx} style={[s.gridCard, isOutOfStock && {backgroundColor: '#f5f5f5'}]}>
                                  {pr.image ? <Image source={{ uri: pr.image }} style={s.gridImg} /> : <View style={[s.gridImg, {justifyContent:'center', alignItems:'center', backgroundColor:'#f3e5f5'} ]}><Text style={{fontSize: 16}}>📦</Text></View>}
                                  <Text style={{fontWeight: 'bold', fontSize: 10, marginTop: 1}} numberOfLines={1}>{pr.name}</Text>
                                  <Text style={{fontSize: 8, color: '#666'}}>{pr.unit}</Text>
                                  
                                  <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 1}}>
                                    <Text style={{fontWeight: 'bold', color: '#2e7d32', fontSize: 10.5}}>₹{effPrice}</Text>
                                    {Number(pr.discount || 0) > 0 && <Text style={{fontSize: 7.5, color: '#888', textDecorationLine: 'line-through', marginLeft: 2}}>₹{pr.price}</Text>}
                                  </View>

                                  {isOutOfStock ? (
                                    <View style={{backgroundColor: '#e53935', width: '100%', paddingVertical: 2.5, borderRadius: 3, alignItems: 'center', marginTop: 2}}>
                                      <Text style={{color: '#fff', fontSize: 8, fontWeight: 'bold'}}>OUT OF STOCK</Text>
                                    </View>
                                  ) : cartQty === 0 ? (
                                    <TouchableOpacity onPress={() => inRange && updateCartQty(pr, 1)} style={[s.gridAddBtn, !inRange && {backgroundColor: '#b0bec5'}]}><Text style={{color: '#fff', fontSize: 9, fontWeight: 'bold'}}>ADD +</Text></TouchableOpacity>
                                  ) : (
                                    <View style={s.qtyCon}>
                                      <TouchableOpacity onPress={() => updateCartQty(pr, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 10}}>-</Text></TouchableOpacity>
                                      <Text style={{marginHorizontal: 3, fontWeight: 'bold', fontSize: 9.5}}>{cartQty}</Text>
                                      <TouchableOpacity onPress={() => updateCartQty(pr, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 10}}>+</Text></TouchableOpacity>
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
                      <View key={ord.id} style={[s.card, {borderColor: isWaitingPayment ? '#e65100' : isCancelled ? '#c62828' : '#8e24aa', borderWidth: 1.2, padding: 10}]}>
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
                          <TouchableOpacity onPress={async () => {
                            let targetUrl = storeSettings.upi ? storeSettings.upi.trim() : 'https://rzp.io/rzp/KshDefR';
                            let finalPayUrl = targetUrl.includes('?') ? `${targetUrl}&amount=${ord.total}` : `${targetUrl}?amount=${ord.total}`;
                            await AsyncStorage.setItem('manor_pending_ord', ord.id);
                            Linking.openURL(finalPayUrl).catch(() => {
                              if (Platform.OS === 'web') window.location.href = finalPayUrl;
                            });
                          }} style={{backgroundColor: '#ffb300', padding: 6, borderRadius: 5, marginVertical: 4, alignItems: 'center'}}>
                            <Text style={{color: '#000', fontWeight: 'bold', fontSize: 10.5}}>💳 Complete Razorpay Payment (₹{ord.total})</Text>
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
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#e65100', marginBottom: 6, padding: 10}]} onPress={handleLogout}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>🚪 Logout / Exit App</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btn, {backgroundColor: '#c62828', padding: 10}]} onPress={handleDeleteAccount}><Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>⚠️ Delete My Account</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

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
            <SafeAreaView style={{flex: 1, backgroundColor: '#fffde7'}}>
              <View style={s.hdr}>
                <Text style={s.ht}>🛒 Cart & Secure Checkout</Text>
                <TouchableOpacity onPress={() => setActiveTab('shop')} style={{backgroundColor: '#7b1fa2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4}}>
                  <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>🔙 Return to Menu</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{padding: 10}} contentContainerStyle={{paddingBottom: 35}}>
                <View style={s.card}>
                  <Text style={s.secTitle}>🛍️ Review Your Cart</Text>
                  {cartItemsList.map(item => (
                    <View key={item.id} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eee'}}>
                      <View style={{flex: 1}}>
                        <Text style={{fontWeight: 'bold', fontSize: 11.5}}>{item.name} ({item.unit})</Text>
                        <Text style={{fontSize: 9.5, color: '#666'}}>₹{item.effectivePrice} x {item.qty} = ₹{item.effectivePrice * item.qty}</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <View style={s.qtyCon}>
                          <TouchableOpacity onPress={() => updateCartQty(item, -1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 10}}>-</Text></TouchableOpacity>
                          <Text style={{marginHorizontal: 5, fontWeight: 'bold', fontSize: 10.5}}>{item.qty}</Text>
                          <TouchableOpacity onPress={() => updateCartQty(item, 1)} style={s.qtyBtn}><Text style={{color:'#fff', fontWeight:'bold', fontSize: 10}}>+</Text></TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => setCart(prev => { let u = {...prev}; delete u[item.id]; return u; })} style={{backgroundColor: '#c62828', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 3, marginLeft: 5}}>
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
                    <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 11.5}}>{inRange ? (paymentMode === 'Online' ? `Pay ₹${finalTotal} via Razorpay & Place Order` : `Place COD Order (₹${finalTotal})`) : '⚠️ Outside Delivery Zone'}</Text>
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
  loginCon: { flex: 1, backgroundColor: '#4a148c', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginCard: { width: '100%', maxWidth: 380, backgroundColor: '#ffffff', padding: 20, borderRadius: 14, elevation: 6 },
  lockTitle: { fontSize: 21, fontWeight: 'bold', color: '#4a148c', marginBottom: 4, textAlign: 'center' },
  lockInput: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#f3e5f5', padding: 10, borderRadius: 8, fontSize: 14, textAlign: 'center', letterSpacing: 2, marginBottom: 12 },
  lockBtn: { backgroundColor: '#6a1b9a', padding: 12, borderRadius: 8, alignItems: 'center' },
  lockBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 12.5 },
  con: { flex: 1, backgroundColor: '#fffde7' },
  hdr: { backgroundColor: '#4a148c', paddingHorizontal: 8, paddingVertical: 8, paddingTop: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  ht: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  headerTabBtn: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: '#7b1fa2', marginLeft: 3 },
  headerTabAct: { backgroundColor: '#ffd54f' },
  body: { padding: 6 },
  announcementBox: { backgroundColor: '#fbe9e7', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ffccbc' },
  warningBox: { backgroundColor: '#ffebee', padding: 8, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#ef9a9a' },
  searchBar: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 9, borderRadius: 8, fontSize: 11.5, marginBottom: 3 },
  cartoonBanner: { backgroundColor: '#f3e5f5', padding: 25, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ab47bc', marginTop: 8, elevation: 2 },
  sidebar: { width: 85, backgroundColor: '#f3e5f5', borderRightWidth: 1, borderColor: '#ce93d8', paddingVertical: 4, paddingHorizontal: 2, borderRadius: 8, flexShrink: 0 },
  sidebarItem: { paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0.5, borderColor: '#e1bee7', minHeight: 40 },
  sidebarItemAct: { backgroundColor: '#6a1b9a' },
  sidebarTxt: { fontSize: 9.5, fontWeight: 'bold', color: '#4a148c', textAlign: 'center' },
  sidebarTxtAct: { color: '#fff' },
  productGrid: { flex: 1, paddingLeft: 6, paddingRight: 2, overflow: 'hidden' },
  gridCard: { width: '48%', backgroundColor: '#fff', padding: 4, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#e1bee7', elevation: 2, alignItems: 'center' },
  gridImg: { width: 38, height: 38, borderRadius: 6, backgroundColor: '#fafafa', marginBottom: 2 },
  gridAddBtn: { backgroundColor: '#6a1b9a', width: '100%', paddingVertical: 3, borderRadius: 4, alignItems: 'center', marginTop: 2 },
  qtyCon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 2, borderRadius: 4, marginTop: 2 },
  qtyBtn: { backgroundColor: '#6a1b9a', width: 16, height: 16, borderRadius: 3, justifyContent: 'center', alignItems: 'center' },
  floatingCartBar: { position: 'absolute', bottom: 30, left: 10, right: 10, backgroundColor: '#4a148c', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 8 },
  viewCartBtn: { backgroundColor: '#ffd54f', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5 },
  card: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#d1c4e9', elevation: 2 },
  secTitle: { fontSize: 12, fontWeight: 'bold', color: '#4a148c', marginVertical: 4 },
  itemsBox: { backgroundColor: '#f3e5f5', padding: 6, borderRadius: 5, marginVertical: 4, borderWidth: 1, borderColor: '#e1bee7' },
  lbl: { fontSize: 10, fontWeight: 'bold', color: '#444', marginTop: 4 },
  i: { borderWidth: 1, borderColor: '#ce93d8', backgroundColor: '#fff', padding: 7, borderRadius: 6, fontSize: 11, marginVertical: 2 },
  btn: { backgroundColor: '#6a1b9a', padding: 10, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 11.5 },
  catChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f3e5f5', marginRight: 5, marginBottom: 5, borderWidth: 1, borderColor: '#ce93d8' },
  catChipAct: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 15 },
  modalCard: { width: '100%', maxWidth: 350, backgroundColor: '#fff', padding: 15, borderRadius: 14, elevation: 8 },
  modalTitle: { fontSize: 15, fontWeight: 'bold', color: '#4a148c', marginBottom: 4 }
});
