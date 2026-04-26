import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, query, where, limit, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref as dbRef, set as rtdbSet, onValue, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCO5ngYh7JYlMJ-PnWqXq142Kj-Umylods",
    authDomain: "motocheck-15c61.firebaseapp.com",
    databaseURL: "https://motocheck-15c61-default-rtdb.firebaseio.com",
    projectId: "motocheck-15c61",
    storageBucket: "motocheck-15c61.firebasestorage.app",
    messagingSenderId: "444725574222",
    appId: "1:444725574222:web:db1055eef17e1a5ddee11f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const storage = getStorage(app);

// Variables globales
window.userIntent = 'inicio';
let tempSOSGps = { lat: null, lng: null };
window.pendingItemToBuy = null;
let globalSettings = {
    schedule: { 0: { o: 8, c: 20 }, 1: { o: 8, c: 20 }, 2: { o: 8, c: 20 }, 3: { o: 8, c: 20 }, 4: { o: 8, c: 20 }, 5: { o: 8, c: 20 }, 6: { o: 8, c: 20 } },
    centerLat: 27.446859188217104, centerLng: -109.94386134566669, radiusKm: 15,
    priceMode: 'km', rescueBase: 100, rescueKmExtra: 10, membershipPrice: 100,
    rescueKmRanges: [{ km: 1, price: 20 }, { km: 1.5, price: 25 }, { km: 2, price: 30 }],
    themeMode: 'dark',
    videoSchedule: {}
};
window.currentStatus = 'idle';
let sosMapInstance = null, mechMapInst = null, mechMarkerInst = null;
let adminGeoMap = null, adminGeoCircle = null;
let adminSOSGlobalMapInst = null, adminSOSMarkers = {};
let sosDetailMapInst = null;
let shopServices = [], adminInventoryList = [];
window.posTicket = []; window.posTotal = 0; window.posTotalCost = 0;
window.cart = []; window.reminders = [];
window.cajaAbierta = false; window.fondoInicial = 0; window.retiros = [];
let activeChatUid = null, chatUnsubscribe = null;
window.currentRating = 0;
let currentDetalleServicioId = null;
let currentSOSFilter = 'pending';
let statsChartInstance = null;

// Funciones de ayuda
window.showToast = (msg, isError = false) => {
    const t = document.getElementById('status-toast');
    document.getElementById('status-msg').innerText = msg;
    const icon = document.getElementById('toast-icon');
    if (isError) {
        t.firstElementChild.className = 'bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 font-bold text-sm';
        icon.className = 'fas fa-exclamation-triangle text-lg';
    } else {
        t.firstElementChild.className = 'bg-naranja text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 font-bold text-sm';
        icon.className = 'fas fa-check-circle text-lg';
    }
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 4000);
};
window.toggleModal = (id, show) => document.getElementById(id).classList.toggle('hidden', !show);

const uploadFile = (file, path) => {
    return new Promise((resolve, reject) => {
        const storageRef = sRef(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on('state_changed', null,
            (error) => reject(error),
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
        );
    });
};

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyTheme() {
    const mode = globalSettings.themeMode || 'dark';
    if (mode === 'auto') {
        document.body.classList.toggle('light-mode', new Date().getHours() >= 7 && new Date().getHours() < 19);
    } else {
        document.body.classList.toggle('light-mode', mode === 'light');
    }
}

async function loadGlobalSettings() {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) Object.assign(globalSettings, snap.data());
    applyTheme();
    updateLandingStatus();
    loadPublicStore();
    loadServicesCatalog();
}

function updateLandingStatus() {
    const now = new Date();
    const day = now.getDay();
    const sched = globalSettings.schedule[day] || { o: 8, c: 20 };
    const isOpen = now.getHours() >= sched.o && now.getHours() < sched.c;
    document.getElementById('landing-open').style.display = isOpen ? 'flex' : 'none';
    document.getElementById('landing-closed').style.display = isOpen ? 'none' : 'flex';
    const badge = document.getElementById('landing-status-badge');
    if (badge) {
        badge.innerText = isOpen ? 'Plataforma Activa' : 'Taller Fuera de Horario';
        badge.className = isOpen
            ? 'text-naranja font-black tracking-widest text-[10px] mb-8 uppercase border border-naranja/30 px-6 py-2 rounded-full bg-naranja/10'
            : 'text-red-500 font-black tracking-widest text-[10px] mb-8 uppercase border border-red-500/30 px-6 py-2 rounded-full bg-red-500/10';
    }
}

async function loadPublicStore() {
    const snap = await getDocs(collection(db, "inventario"));
    const grid = document.getElementById('public-store-grid');
    const cGrid = document.getElementById('client-store-grid');
    let html = '';
    const isMem = auth.currentUser && window.currentUserDoc?.role === 'membresia';
    snap.forEach(doc => {
        const p = doc.data();
        const price = isMem ? (p.priceMember || p.pricePublic) : p.pricePublic;
        html += `
        <div class="glass p-4 rounded-3xl flex flex-col">
            <div class="w-full aspect-square bg-white/5 rounded-2xl mb-3 flex items-center justify-center overflow-hidden">
                ${p.imgUrl ? `<img src="${p.imgUrl}" class="w-full h-full object-cover">` : '<i class="fas fa-box text-4xl text-gray-600"></i>'}
            </div>
            <p class="text-xs font-black uppercase">${p.name}</p>
            <p class="text-naranja font-black text-lg mb-3">$${price}</p>
            <button onclick="addToCart('${p.name}', ${price})" class="bg-naranja text-white p-2 rounded-xl text-xs font-black uppercase">Añadir</button>
        </div>`;
    });
    if (!html) html = `<div class="col-span-full text-center p-10"><img src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500&q=60" class="w-48 mx-auto mb-6 opacity-30 rounded-full"><h3 class="text-2xl font-black text-naranja">Próximamente</h3><p class="text-gray-400 text-sm">¡Contáctanos para más información!</p></div>`;
    if (grid) grid.innerHTML = html;
    if (cGrid) cGrid.innerHTML = html;
}

async function loadServicesCatalog() {
    try {
        shopServices = [];
        const snap = await getDocs(collection(db, "servicios"));
        const select = document.getElementById('sos-service-select');
        let html = '<option value="0">SIN FALLO ESPECÍFICO</option>';
        snap.forEach(doc => {
            const d = doc.data(); d.id = doc.id;
            shopServices.push(d);
            html += `<option value="${d.id}">${d.name} - $${d.price}</option>`;
        });
        if (select) select.innerHTML = html;
    } catch (e) {}
}

// POS
window.openCaja = () => toggleModal('modal-caja', true);
window.confirmOpenCaja = () => {
    const fondo = parseFloat(document.getElementById('caja-fondo-input').value) || 0;
    window.cajaAbierta = true;
    window.fondoInicial = fondo;
    window.retiros = [];
    document.getElementById('btn-open-caja').classList.add('hidden');
    document.getElementById('btn-close-caja').classList.remove('hidden');
    document.getElementById('btn-retiro').classList.remove('hidden');
    document.getElementById('caja-status-bar').classList.remove('hidden');
    document.getElementById('fondo-inicial-display').innerText = fondo.toFixed(2);
    toggleModal('modal-caja', false);
    showToast(`Caja abierta con $${fondo.toFixed(2)}`);
};
window.closeCaja = () => {
    window.cajaAbierta = false;
    document.getElementById('btn-open-caja').classList.remove('hidden');
    document.getElementById('btn-close-caja').classList.add('hidden');
    document.getElementById('btn-retiro').classList.add('hidden');
    document.getElementById('caja-status-bar').classList.add('hidden');
    showAdminCorte();
};
window.addRetiro = () => toggleModal('modal-retiro', true);
window.confirmRetiro = () => {
    const monto = parseFloat(document.getElementById('retiro-monto').value);
    const concepto = document.getElementById('retiro-concepto').value.trim();
    if (!monto || !concepto) return showToast("Completa los datos", true);
    window.retiros.push({ monto, concepto, timestamp: Date.now() });
    toggleModal('modal-retiro', false);
    showToast(`Retiro: $${monto.toFixed(2)}`);
};

// Chat
window.openChat = (uid, isClient = false) => {
    activeChatUid = uid;
    toggleModal('modal-chat', true);
    document.getElementById('chat-title').innerText = isClient ? "Contactar al Taller" : "Contactar al Mecánico";
    const box = document.getElementById('chat-messages');
    box.innerHTML = '';
    chatUnsubscribe = onValue(dbRef(rtdb, `sos_chats/${uid}`), snap => {
        box.innerHTML = '';
        if (snap.exists()) {
            Object.values(snap.val()).sort((a, b) => a.ts - b.ts).forEach(m => {
                const align = (isClient && m.sender === 'client') || (!isClient && m.sender === 'admin') ? 'self-end bg-blue-600' : 'self-start bg-white/10';
                box.innerHTML += `<div class="max-w-[80%] rounded-2xl p-3 ${align}"><p class="text-sm">${m.text}</p></div>`;
            });
        }
        box.scrollTop = box.scrollHeight;
    });
};
window.sendMessage = () => {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    const sender = window.currentUserDoc?.role === 'cliente' ? 'client' : 'admin';
    push(dbRef(rtdb, `sos_chats/${activeChatUid}`), { sender, text, ts: Date.now() });
    input.value = '';
};
window.closeChat = () => { toggleModal('modal-chat', false); if (chatUnsubscribe) chatUnsubscribe(); };

// Autenticación y flujo
onAuthStateChanged(auth, async user => {
    document.getElementById('loading-screen').classList.add('hidden');
    if (!user) return loadGlobalSettings(), showView('view-landing');
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists()) {
        window.currentUserDoc = userSnap.data();
        window.currentUserDoc.id = user.uid;
    } else {
        window.currentUserDoc = { phone: '', role: 'cliente', name: '' };
    }
    applyTheme();
    if (['admin', 'mecanico', 'taller', 'socio'].includes(window.currentUserDoc.role)) {
        showView('app-admin');
        document.getElementById('admin-phone-display').innerText = window.currentUserDoc.name || 'Admin';
        adminRefreshConfigUI();
        adminLoadSales();
        adminLoadInventory();
        adminListenSOS();
        adminListenServices();
        adminLoadCitas();
        loadChatList();
    } else {
        showView('app-client');
        document.getElementById('client-name-display').innerText = window.currentUserDoc.name;
        const crown = document.getElementById('client-crown-icon');
        if (window.currentUserDoc.role === 'membresia') {
            crown.classList.remove('hidden');
            const exp = window.currentUserDoc.membresiaExp;
            if (exp) {
                const daysLeft = (exp - Date.now()) / (1000 * 60 * 60 * 24);
                if (daysLeft <= 3 && daysLeft > 0) showToast(`Tu membresía vence en ${Math.ceil(daysLeft)} días`);
                if (daysLeft <= 0) {
                    await updateDoc(doc(db, 'users', user.uid), { role: 'cliente', membresiaExp: null });
                    window.currentUserDoc.role = 'cliente';
                    crown.classList.add('hidden');
                }
            }
        } else crown.classList.add('hidden');
        loadClientHistory();
        listenToMySOS();
        loadClientCitas();
        loadPublicStore();
    }
});

function showView(targetId) {
    const views = ['view-landing', 'view-public-store', 'view-public-tracking', 'view-login', 'view-sos-form', 'view-force-setup', 'app-client', 'app-admin'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); el.style.display = 'none'; }
    });
    const target = document.getElementById(targetId);
    if(target) { target.classList.remove('hidden'); target.classList.add('flex'); target.style.display = 'flex'; }
    window.fixMaps?.();
}

window.fixMaps = () => {
    setTimeout(() => {
        if(adminGeoMap) adminGeoMap.invalidateSize();
        if(adminSOSGlobalMapInst) adminSOSGlobalMapInst.invalidateSize();
        if(sosMapInstance) sosMapInstance.invalidateSize();
        if(mechMapInst) mechMapInst.invalidateSize();
    }, 300);
};

window.startFlow = (intent) => {
    window.userIntent = intent;
    if (intent === 'tienda_publica') showView('view-public-store');
    else if (intent === 'rastreo_publico') showView('view-public-tracking');
    else if (intent === 'inicio') { showView('view-landing'); window.pendingItemToBuy = null; }
    else {
        if(auth.currentUser) {
            if(intent === 'sos' && ['admin','socio','taller','mecanico'].includes(window.currentUserDoc?.role)) {
                showView('app-admin'); return;
            }
            if(intent === 'sos') { launchSOSForm(window.currentUserDoc.name); return; }
        }
        showView('view-login');
    }
};

window.cancelFlow = () => {
    showView('view-landing');
    window.pendingItemToBuy = null;
    ['auth-step-1','auth-step-login','auth-step-register','auth-step-recovery'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('auth-step-1')?.classList.remove('hidden');
    document.getElementById('phone-input').value = '';
};

window.switchClientView = (id) => {
    document.querySelectorAll('.c-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.c-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.c-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active');
    window.fixMaps?.();
};

window.switchAdminView = (id) => {
    document.querySelectorAll('.a-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.a-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.a-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active');
    if(id === 'a-view-config') { adminRefreshConfigUI(); renderAdminMap(); }
    if(id === 'a-view-usuarios') adminLoadUsers();
    if(id === 'a-view-promos') adminLoadLoyalty();
    if(id === 'a-view-stats') loadStats();
    if(id === 'a-view-citas') adminLoadCitas();
    if(id === 'a-view-alertas') renderSOSGlobalMap();
    window.fixMaps?.();
};

// ===================== AUTENTICACIÓN =====================
window.checkUserExists = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim();
    if (rawPhone.length !== 10) return showToast("Celular de 10 dígitos", true);
    const btn = document.querySelector('#auth-step-1 button');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';
    try {
        const q = query(collection(db, "users"), where("phone", "==", "+52"+rawPhone), limit(1));
        const snap = await getDocs(q);
        document.getElementById('auth-step-1').classList.add('hidden');
        if (!snap.empty) {
            window.currentUserDoc = snap.docs[0].data();
            document.getElementById('login-name-display').innerText = window.currentUserDoc.name || 'Cliente';
            document.getElementById('auth-step-login').classList.remove('hidden');
        } else { document.getElementById('auth-step-register').classList.remove('hidden'); }
    } catch(e) { showToast("Error de conexión", true); } 
    finally { btn.disabled = false; btn.innerHTML = 'Siguiente'; }
};

window.processLogin = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if(!password) return showToast("Ingresa contraseña", true);
    const btn = document.querySelector('#auth-step-login button');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Entrando...';
    try { await signInWithEmailAndPassword(auth, `${rawPhone}@motorescateobr.com`, password); } 
    catch(e) { showToast("Contraseña incorrecta", true); } 
    finally { btn.disabled = false; btn.innerHTML = 'Entrar'; }
};

window.processRegister = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const question = document.getElementById('reg-question').value;
    const answer = document.getElementById('reg-answer').value.trim();
    if (!name || password.length < 6 || !question || !answer) return showToast("Completa datos (Pass min 6)", true);
    const fakeEmail = `${rawPhone}@motorescateobr.com`;
    const btn = document.querySelector('#auth-step-register button');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Registrando...';
    try {
        const userCred = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        await setDoc(doc(db, "users", userCred.user.uid), { phone: "+52" + rawPhone, name, role: 'cliente', secQuestion: question, secAnswer: answer.toLowerCase(), pwd: password, created: new Date().toISOString() });
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
            try { await signInWithEmailAndPassword(auth, fakeEmail, password); } catch(loginErr) {}
        } else showToast("Error en registro", true);
    }
    finally { btn.disabled = false; btn.innerHTML = 'Registrarme y Entrar'; }
};

window.forceSetupSubmit = async () => {
    const pwd = document.getElementById('force-password').value.trim();
    const q = document.getElementById('force-question').value;
    const ans = document.getElementById('force-answer').value.trim();
    const name = document.getElementById('force-name').value.trim();
    if(pwd.length < 6 || !q || !ans || !name) return showToast("Llena todos los campos", true);
    const btn = document.querySelector('#view-force-setup button.bg-blue-600');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
    try {
        await setDoc(doc(db, "users", auth.currentUser.uid), { name, secQuestion: q, secAnswer: ans.toLowerCase(), pwd }, {merge: true});
        showToast("Seguridad actualizada");
        window.location.reload();
    } catch(e) { showToast("Error", true); btn.disabled = false; btn.innerHTML = 'Guardar y Entrar'; }
};

window.showRecoveryFlow = () => {
    document.getElementById('auth-step-login').classList.add('hidden');
    document.getElementById('auth-step-recovery').classList.remove('hidden');
    document.getElementById('recovery-question-display').innerText = window.currentUserDoc?.secQuestion || "¿No hay pregunta?";
};
window.backToLoginStep = () => {
    document.getElementById('auth-step-recovery').classList.add('hidden');
    document.getElementById('auth-step-login').classList.remove('hidden');
};
window.processRecovery = () => {
    const answer = document.getElementById('recovery-answer-input').value.trim().toLowerCase();
    const realAnswer = window.currentUserDoc?.secAnswer?.toLowerCase();
    if(!realAnswer) return showToast("Sin pregunta configurada", true);
    if(answer === realAnswer) {
        const pwd = window.currentUserDoc.pwd;
        document.getElementById('recovery-form-area').innerHTML = `<div class="animate-fade-in mb-6 bg-black/50 border border-green-500 p-6 rounded-2xl text-center">
            <p class="text-[10px] font-black text-green-400 mb-2">Contraseña Recuperada</p>
            <p class="font-black text-3xl text-white tracking-widest bg-white/5 py-3 rounded-xl border border-white/10">${pwd}</p>
        </div>`;
    } else showToast("Respuesta incorrecta", true);
};

window.logout = () => signOut(auth).then(() => window.location.href = window.location.pathname);

// ===================== SOS =====================
function launchSOSForm(userName) {
    showView('view-sos-form');
    document.getElementById('manual-address-container').classList.add('hidden');
    document.getElementById('llanta-type-container').classList.add('hidden');
    document.getElementById('sos-map-preview').classList.remove('hidden');
    document.getElementById('sos-estimate-display').innerText = "Calculando...";
    document.getElementById('gps-status-text').innerText = "Buscando...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            tempSOSGps.lat = pos.coords.latitude;
            tempSOSGps.lng = pos.coords.longitude;
            const dist = getDistanceKm(tempSOSGps.lat, tempSOSGps.lng, globalSettings.centerLat, globalSettings.centerLng);
            if(dist > globalSettings.radiusKm) {
                document.getElementById('out-of-zone-modal').classList.remove('hidden');
                document.getElementById('out-of-zone-modal').classList.add('flex');
                showView('view-landing');
                return;
            }
            document.getElementById('gps-status-text').innerText = "GPS Establecido";
            document.getElementById('gps-status-text').className = "text-[9px] font-bold text-green-400";
            if(!sosMapInstance) {
                sosMapInstance = L.map('sos-map-preview', { dragging: false, zoomControl: false, scrollWheelZoom: false }).setView([tempSOSGps.lat, tempSOSGps.lng], 16);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: 'OBR' }).addTo(sosMapInstance);
                L.marker([tempSOSGps.lat, tempSOSGps.lng], { icon: L.divIcon({ className: 'gps-pulse-marker', iconSize: [20, 20] }) }).addTo(sosMapInstance);
            } else {
                sosMapInstance.setView([tempSOSGps.lat, tempSOSGps.lng], 16);
                sosMapInstance.invalidateSize();
            }
            updateSOSEstimate(dist);
        }, (err) => {
            document.getElementById('gps-status-text').innerText = "Sin GPS: Escribe dirección";
            document.getElementById('gps-status-text').className = "text-[9px] font-bold text-red-500";
            document.getElementById('manual-address-container').classList.remove('hidden');
            document.getElementById('sos-map-preview').classList.add('hidden');
            updateSOSEstimate(0);
        }, { enableHighAccuracy: true, timeout: 10000 });
    } else {
        document.getElementById('manual-address-container').classList.remove('hidden');
        document.getElementById('sos-map-preview').classList.add('hidden');
        updateSOSEstimate(0);
    }
}

window.updateSOSEstimate = function(dist = null) {
    const selectEl = document.getElementById('sos-service-select');
    const dispEl = document.getElementById('sos-estimate-display');
    let rescueCost = 0;
    if (globalSettings.priceMode === 'km') {
        let d = dist !== null ? dist : getDistanceKm(tempSOSGps.lat||0, tempSOSGps.lng||0, globalSettings.centerLat, globalSettings.centerLng);
        let ranges = globalSettings.rescueKmRanges || [];
        ranges.sort((a,b) => a.km - b.km);
        let matched = false;
        for(let r of ranges) { if(d <= r.km) { rescueCost = r.price; matched = true; break; } }
        if(!matched && ranges.length > 0) rescueCost = ranges[ranges.length-1].price + Math.max(0, (d - ranges[ranges.length-1].km)) * (globalSettings.rescueKmExtra||0);
    } else rescueCost = globalSettings.rescueBase || 100;
    const isMem = auth.currentUser && window.currentUserDoc?.role === 'membresia';
    if(isMem) rescueCost = 0;
    if(selectEl.value === "0") dispEl.innerHTML = `<span class="text-naranja">Rescate: $${rescueCost.toFixed(2)}</span>`;
    else {
        const s = shopServices.find(x => x.id === selectEl.value);
        if(s) dispEl.innerHTML = `$${(rescueCost + parseFloat(s.price)).toFixed(2)}`;
    }
};

window.submitFinalSOS = async () => {
    const servSelect = document.getElementById('sos-service-select');
    const falla = document.getElementById('sos-falla').value.trim();
    const manualAddress = document.getElementById('sos-manual-address').value.trim();
    const fileInput = document.getElementById('sos-media');
    const btn = document.getElementById('btn-submit-sos');
    if (!falla && servSelect.value === "0") return showToast("Describe la falla", true);
    if (!tempSOSGps.lat && !manualAddress) return showToast("Falta ubicación", true);
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
    let mediaUrl = "";
    const truePhone = window.currentUserDoc?.phone || ("+52" + (auth.currentUser.email?.replace('@motorescateobr.com','') || ''));
    try {
        if (fileInput.files.length > 0) mediaUrl = await uploadFile(fileInput.files[0], `rescates/${auth.currentUser.uid}/${Date.now()}_${fileInput.files[0].name}`);
        const rData = {
            uid: auth.currentUser.uid, clientName: window.currentUserDoc?.name || '',
            phone: truePhone, extraPhone: document.getElementById('sos-extra-phone').value.trim(),
            falla: `[${servSelect.options[servSelect.selectedIndex].text}] ${falla}`,
            mediaUrl, lat: tempSOSGps.lat, lng: tempSOSGps.lng, manualAddress,
            status: 'pending', tallerStatus: 'recibida', timestamp: Date.now()
        };
        await addDoc(collection(db, "rescates"), rData);
        await rtdbSet(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), rData);
        showToast("¡Unidad notificada!");
        showView('app-client');
        switchClientView('c-view-moto');
        listenToMySOS();
    } catch (e) { showToast("Error de conexión", true); }
    finally { btn.disabled = false; btn.innerHTML = '<span>SOLICITAR AUXILIO</span> <i class="fas fa-ambulance text-2xl"></i>'; }
};

function listenToMySOS() {
    if(!auth.currentUser) return;
    onValue(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        const sosCard = document.getElementById('active-sos-card');
        if(sosCard) sosCard.classList.remove('hidden');
        document.getElementById('no-active-services-msg')?.classList.add('hidden');
        document.getElementById('sos-status-desc-client').innerText = data.status === 'accepted' ? "Mecánico en camino" : "Esperando confirmación";
        const btn = document.getElementById('btn-contacto-taller');
        if(btn) btn.innerText = data.status === 'accepted' ? "Contactar al Mecánico" : "Contactar al Taller";
        if(data.status === 'accepted' && data.mech_lat) {
            document.getElementById('mechanic-live-map').classList.remove('hidden');
            if(!mechMapInst) {
                mechMapInst = L.map('mechanic-live-map', { dragging: false, zoomControl: false }).setView([data.mech_lat, data.mech_lng], 14);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(mechMapInst);
                mechMarkerInst = L.marker([data.mech_lat, data.mech_lng], { icon: L.divIcon({ className: 'mech-pulse-marker', html: '<i class="fas fa-wrench"></i>', iconSize: [24,24] }) }).addTo(mechMapInst);
            } else { mechMarkerInst.setLatLng([data.mech_lat, data.mech_lng]); mechMapInst.invalidateSize(); }
        }
    });
}

window.openSOSDetailClient = function() {
    toggleModal('modal-sos-detail', true);
    // Cargar datos del SOS propio
    if(auth.currentUser) {
        onValue(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), (snap) => {
            if(snap.exists()) {
                const data = snap.val();
                document.getElementById('sos-detail-title').innerText = data.clientName || 'Cliente';
                document.getElementById('sos-detail-falla').innerText = data.falla;
            }
        });
    }
};

window.setRating = r => {
    window.currentRating = r;
    const stars = document.getElementById('star-rating').children;
    for(let i=0; i<5; i++) stars[i].classList.toggle('text-naranja', i < r);
    document.getElementById('survey-comments').classList.toggle('hidden', r >= 3);
};
window.submitSurvey = async () => {
    if(!window.currentRating) return showToast("Selecciona una calificación", true);
    const comments = document.getElementById('survey-comments').value.trim();
    if(window.currentRating < 3 && !comments) return showToast("¿Qué mejorarías?", true);
    await addDoc(collection(db, "satisfaction"), { uid: auth.currentUser.uid, rating: window.currentRating, comments, timestamp: Date.now() });
    document.getElementById('satisfaction-survey').classList.add('hidden');
    showToast("¡Gracias!");
};

// ===================== TALLER =====================
async function adminListenServices() {
    const snap = await getDocs(query(collection(db, "rescates"), limit(50)));
    const list = document.getElementById('admin-services-list');
    if(!list) return;
    list.innerHTML = '';
    snap.forEach(d => {
        const v = d.data();
        if(!v.tallerStatus || v.tallerStatus === 'entregada' || v.status !== 'completed') return;
        list.innerHTML += `<div class="bg-white/5 border border-white/10 p-4 rounded-2xl cursor-pointer hover:bg-white/10 transition" onclick="openDetalleServicio('${d.id}')">
            <div class="flex justify-between"><span class="font-black text-white">${v.phone}</span><span class="text-[10px] font-black uppercase text-blue-400">${v.tallerStatus}</span></div>
            <p class="text-[10px] text-gray-400 mt-1 truncate">${v.falla}</p></div>`;
    });
    if(list.innerHTML === '') list.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin motos en taller</p>';
}

window.openDetalleServicio = async (id) => {
    const docSnap = await getDoc(doc(db, "rescates", id));
    if(!docSnap.exists()) return;
    const data = docSnap.data();
    currentDetalleServicioId = id;
    document.getElementById('servicio-detalle-phone').innerText = data.phone + ' - ' + (data.falla || '');
    document.getElementById('servicio-detalle-info').innerHTML = `<p class="text-xs text-white">Moto: ${data.falla}</p>`;
    toggleModal('modal-detalle-servicio', true);
};

window.cambiarEstadoServicio = async (nuevoEstado) => {
    if(!currentDetalleServicioId) return;
    const docRef = doc(db, "rescates", currentDetalleServicioId);
    const docSnap = await getDoc(docRef);
    if(!docSnap.exists()) return;
    const actual = docSnap.data().tallerStatus;
    if(actual === 'lista') return showToast("No se puede cambiar una vez entregada", true);
    if(nuevoEstado === 'mecanica' && actual === 'mecanica') return;
    if(nuevoEstado === 'pruebas' && actual === 'pruebas') return;
    if(nuevoEstado === 'lista') await updateDoc(docRef, { tallerStatus: nuevoEstado, status: 'completed' });
    else await updateDoc(docRef, { tallerStatus: nuevoEstado });
    showToast(`Estado cambiado a ${nuevoEstado}`);
    toggleModal('modal-detalle-servicio', false);
    adminListenServices();
};

// ===================== CITAS =====================
window.adminCrearCita = async () => {
    const phone = document.getElementById('cita-phone').value.trim();
    const moto = document.getElementById('cita-moto').value.trim();
    const trabajo = document.getElementById('cita-trabajo').value.trim();
    const fecha = document.getElementById('cita-fecha').value;
    const hora = document.getElementById('cita-hora').value;
    if(!phone || !moto || !fecha || !hora) return showToast("Completa todos los campos", true);
    await addDoc(collection(db, "citas"), { phone: "+52"+phone, moto, trabajo, fecha, hora, timestamp: Date.now() });
    showToast("Cita agendada");
    toggleModal('modal-nueva-cita', false);
    adminLoadCitas();
};

async function adminLoadCitas() {
    const snap = await getDocs(collection(db, "citas"));
    const list = document.getElementById('admin-citas-list');
    if(!list) return;
    list.innerHTML = '';
    snap.forEach(d => {
        const c = d.data();
        list.innerHTML += `<div class="bg-white/5 p-3 rounded-xl text-xs text-white cursor-pointer" onclick="openCitaDetail('${d.id}')">
            <p><b>${c.fecha} ${c.hora}</b> - ${c.moto}</p><p>${c.trabajo}</p></div>`;
    });
}

window.openCitaDetail = async (id) => {
    const snap = await getDoc(doc(db, "citas", id));
    if(!snap.exists()) return;
    const c = snap.data();
    showToast(`Cita: ${c.fecha} ${c.hora} - ${c.trabajo}`);
};

async function loadClientCitas() {
    const snap = await getDocs(query(collection(db, "citas"), where("phone", "==", window.currentUserDoc?.phone)));
    const list = document.getElementById('client-appointments-list');
    if(!list) return;
    list.innerHTML = '';
    snap.forEach(d => {
        const c = d.data();
        list.innerHTML += `<div class="bg-white/5 p-2 rounded text-xs text-white">${c.fecha} ${c.hora} - ${c.trabajo}</div>`;
    });
}

// ===================== TIENDA =====================
window.addToCart = (name, price) => {
    window.cart.push({name, price: parseFloat(price)});
    updateCartUI();
    showToast("Agregado al carrito");
};
window.updateCartUI = () => {
    document.getElementById('cart-count').innerText = window.cart.length;
    document.getElementById('cart-items').innerHTML = window.cart.map((item,i) => `
        <div class="flex justify-between text-white"><span>${item.name}</span><span>$${item.price.toFixed(2)} <button onclick="removeFromCart(${i})" class="text-red-500"><i class="fas fa-times"></i></button></span></div>
    `).join('');
    document.getElementById('cart-total').innerText = window.cart.reduce((s,i)=>s+i.price,0).toFixed(2);
};
window.removeFromCart = i => { window.cart.splice(i,1); updateCartUI(); };
window.checkoutCart = () => {
    if(!window.cart.length) return showToast("Carrito vacío", true);
    let msg = "Hola, quiero pedir:\n";
    window.cart.forEach(item => msg += `- ${item.name}: $${item.price}\n`);
    msg += `Total: $${window.cart.reduce((s,i)=>s+i.price,0)}`;
    window.open(`https://wa.me/526311551533?text=${encodeURIComponent(msg)}`, '_blank');
    window.cart = []; updateCartUI(); toggleModal('modal-cart', false);
};

// ===================== CONTACTO =====================
window.sendContactFromModal = () => {
    const name = document.getElementById('modal-contact-name').value.trim();
    const phone = document.getElementById('modal-contact-phone').value.trim();
    const msg = document.getElementById('modal-contact-msg').value.trim();
    if(!name || !msg) return showToast("Nombre y mensaje requeridos", true);
    window.open(`https://wa.me/526311551533?text=${encodeURIComponent(`Hola, soy ${name}${phone ? ' ('+phone+')' : ''}. ${msg}`)}`, '_blank');
};

// ===================== POS TICKET Y VENTAS =====================
window.renderTicket = () => {
    const list = document.getElementById('pos-ticket-list');
    const totalEl = document.getElementById('pos-ticket-total');
    window.posTotal = 0; window.posTotalCost = 0;
    let html = '';
    window.posTicket.forEach((item, i) => {
        window.posTotal += item.price;
        window.posTotalCost += item.cost || 0;
        html += `<div class="flex justify-between items-center text-white bg-black/40 p-3 rounded-lg border border-white/5 mb-2">
            <div class="flex flex-col"><span class="text-xs font-bold">${item.name}</span><span class="text-[8px] text-gray-500 uppercase">${item.type==='almacen'?'Almacén':'Mano de Obra'}</span></div>
            <div class="flex items-center space-x-3"><span class="text-naranja font-black">$${item.price.toFixed(2)}</span><button onclick="removeTicketItem(${i})" class="text-red-500 hover:text-white"><i class="fas fa-trash"></i></button></div></div>`;
    });
    if(!window.posTicket.length) html = '<p class="text-gray-600 text-xs italic text-center mt-10">El ticket está vacío</p>';
    list.innerHTML = html;
    totalEl.innerText = `$${window.posTotal.toFixed(2)}`;
};
window.removeTicketItem = i => { window.posTicket.splice(i,1); renderTicket(); };
window.addAlmacenToTicket = () => {
    const id = document.getElementById('pos-product-select').value;
    if(!id) return;
    const p = adminInventoryList.find(x => x.id === id);
    if(p) { window.posTicket.push({ type: 'almacen', id: p.id, name: p.name, price: p.priceTaller, cost: p.cost }); renderTicket(); }
};
window.addManualToTicket = () => {
    const desc = document.getElementById('pos-manual-desc').value.trim();
    const price = parseFloat(document.getElementById('pos-manual-price').value);
    if(!desc || isNaN(price)) return showToast("Falta concepto o precio", true);
    window.posTicket.push({ type: 'manual', name: desc, price, cost: 0 });
    document.getElementById('pos-manual-desc').value = '';
    document.getElementById('pos-manual-price').value = '';
    renderTicket();
};
window.checkoutTicket = async () => {
    if(!window.posTicket.length) return showToast("El ticket está vacío", true);
    if(!window.cajaAbierta) return showToast("Abrir caja primero", true);
    const btn = document.querySelector('#a-view-pos button.bg-naranja');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';
    const pMethod = document.getElementById('pos-payment-method').value;
    const customerPhone = document.getElementById('pos-customer-phone').value.trim();
    try {
        const saleData = {
            desc: window.posTicket.map(i => i.name).join(", "),
            total: window.posTotal,
            costo: window.posTotalCost,
            metodoPago: pMethod,
            clienteCel: customerPhone ? "+52"+customerPhone : null,
            ticket: window.posTicket,
            fecha: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "ventas"), saleData);
        for(let item of window.posTicket) {
            if(item.type === 'almacen') {
                const pRef = doc(db, "inventario", item.id);
                const pData = adminInventoryList.find(x => x.id === item.id);
                if(pData && pData.stock > 0) await updateDoc(pRef, { stock: pData.stock - 1 });
            }
        }
        showToast("Venta Registrada");
        window.posTicket = [];
        document.getElementById('pos-customer-phone').value = '';
        renderTicket();
        adminLoadInventory();
        adminLoadSales();
        openSaleDetails(docRef.id, saleData);
    } catch(e) { showToast("Error al procesar", true); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Cobrar Ticket'; }
};

let adminSalesCache = {};
async function adminLoadSales() {
    const container = document.getElementById('admin-pos-history');
    if(!container) return;
    container.innerHTML = "<p class='text-[10px] text-gray-500 italic'>Cargando...</p>";
    try {
        const snap = await getDocs(collection(db, "ventas"));
        container.innerHTML = "";
        snap.forEach(doc => {
            const v = doc.data();
            adminSalesCache[doc.id] = v;
            container.innerHTML += `<div onclick="openSaleDetails('${doc.id}', adminSalesCache['${doc.id}'])" class="bg-white/5 p-4 rounded-2xl flex justify-between items-center mb-2 cursor-pointer hover:bg-white/10">
                <div><p class="text-xs font-black uppercase text-gray-300 truncate w-32 md:w-48">${v.desc}</p><p class="text-[8px] text-gray-500">${new Date(v.fecha).toLocaleDateString()} - ${v.metodoPago||'Efectivo'}</p></div>
                <b class="text-naranja">$${v.total.toFixed(2)}</b></div>`;
        });
    } catch(e) {}
}
window.openSaleDetails = (id, data) => {
    if(!data) return;
    document.getElementById('sale-detail-date').innerText = new Date(data.fecha).toLocaleString();
    document.getElementById('sale-detail-content').innerHTML = (data.ticket||[]).map(i => `<div class="flex justify-between py-1"><span>${i.name}</span><span>$${i.price.toFixed(2)}</span></div>`).join('');
    document.getElementById('sale-detail-total').innerText = `$${data.total.toFixed(2)}`;
    const btnWa = document.getElementById('btn-wa-ticket');
    if(btnWa) btnWa.classList.toggle('hidden', !data.clienteCel);
    toggleModal('modal-sale-details', true);
};
window.printTicket = () => {
    const printContent = document.getElementById('print-ticket-area').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Ticket OBR</title><style>body{font-family:sans-serif;background:#fff;color:#000;padding:20px;max-width:300px;margin:0 auto;}</style></head><body>${printContent}<script>setTimeout(()=>window.print(),500);<\/script></body></html>`);
};
window.showAdminCorte = async () => {
    let totalVentas = 0, totalCostos = 0, totalRetiros = window.retiros.reduce((s,r)=>s+r.monto,0);
    try { const snap = await getDocs(collection(db, "ventas")); snap.forEach(d => { totalVentas += d.data().total; totalCostos += d.data().costo||0; }); } catch(e){}
    const efectivoReal = window.fondoInicial + totalVentas - totalRetiros;
    const ganancia = totalVentas - totalCostos - totalRetiros;
    document.getElementById('admin-corte-results').innerHTML = `
        <div class="flex justify-between py-2"><span>Fondo Inicial:</span><b>$${window.fondoInicial.toFixed(2)}</b></div>
        <div class="flex justify-between py-2"><span>Ventas Totales:</span><b>$${totalVentas.toFixed(2)}</b></div>
        <div class="flex justify-between py-2 text-red-400"><span>Costo Refacciones:</span><b>-$${totalCostos.toFixed(2)}</b></div>
        <div class="flex justify-between py-2 text-red-400"><span>Retiros/Gastos:</span><b>-$${totalRetiros.toFixed(2)}</b></div>
        <div class="flex justify-between py-2 text-green-400 font-black text-lg"><span>Efectivo en Caja:</span><b>$${efectivoReal.toFixed(2)}</b></div>
        <div class="flex justify-between py-2 text-naranja font-black text-lg"><span>Ganancia Neta:</span><b>$${ganancia.toFixed(2)}</b></div>`;
    toggleModal('modal-corte-admin', true);
};
window.generarCortePDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("MOTO RESCATE OBR - Corte de Caja", 14, 22);
    doc.setFontSize(12); doc.text(`Fecha: ${new Date().toLocaleString()}`, 14, 32);
    doc.text(`Fondo Inicial: $${window.fondoInicial.toFixed(2)}`, 14, 42);
    let totalVentas = 0, totalCostos = 0, totalRetiros = window.retiros.reduce((s,r)=>s+r.monto,0);
    let y = 55;
    doc.text("Detalle de movimientos:", 14, y);
    y += 8;
    doc.text(`Ventas totales: $${totalVentas.toFixed(2)}  -  Costos: $${totalCostos.toFixed(2)}`, 14, y);
    y += 8;
    window.retiros.forEach(r => {
        doc.text(`Retiro: ${r.concepto} - $${r.monto.toFixed(2)}`, 14, y);
        y += 6;
    });
    doc.save(`corte_caja_${new Date().toISOString().slice(0,10)}.pdf`);
};

// ===================== INVENTARIO =====================
async function adminLoadInventory() {
    try {
        const snap = await getDocs(collection(db, "inventario"));
        adminInventoryList = [];
        let selectHtml = '<option value="">Selecciona refacción...</option>';
        let listHtml = '';
        snap.forEach(doc => {
            const d = doc.data(); d.id = doc.id;
            adminInventoryList.push(d);
            selectHtml += `<option value="${d.id}">${d.name} (Stock: ${d.stock}) - $${d.priceTaller}</option>`;
            listHtml += `<div class="bg-white/5 p-4 rounded-xl flex justify-between"><span class="text-white font-bold">${d.name}</span><span class="text-naranja font-black">$${d.pricePublic}</span><span class="text-xs text-gray-400">Stock: ${d.stock}</span></div>`;
        });
        document.getElementById('pos-product-select').innerHTML = selectHtml;
        document.getElementById('admin-inventory-list').innerHTML = listHtml || '<p class="text-gray-500 text-xs">Sin productos</p>';
    } catch(e) {}
}
window.adminAddProduct = async () => {
    const name = document.getElementById('inv-name').value.trim();
    const desc = document.getElementById('inv-desc').value.trim();
    const stock = parseInt(document.getElementById('inv-stock').value) || 0;
    const cost = parseFloat(document.getElementById('inv-cost').value) || 0;
    const priceTaller = parseFloat(document.getElementById('inv-price-taller').value) || cost;
    const priceMember = parseFloat(document.getElementById('inv-price-member').value) || cost;
    const pricePublic = parseFloat(document.getElementById('inv-price-public').value) || cost;
    const fileInput = document.getElementById('inv-image');
    if(!name) return showToast("Falta el Nombre Comercial", true);
    const btn = document.querySelector('#a-view-inventario button.bg-green-600');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
    let mediaUrl = "";
    try {
        if (fileInput.files.length > 0) mediaUrl = await uploadFile(fileInput.files[0], `inventario/${Date.now()}_${fileInput.files[0].name}`);
        await addDoc(collection(db, "inventario"), { name, desc, stock, cost, priceTaller, priceMember, pricePublic, imgUrl: mediaUrl, timestamp: Date.now() });
        showToast("Producto agregado");
        ['inv-name','inv-desc','inv-stock','inv-cost','inv-price-taller','inv-price-member','inv-price-public'].forEach(id => document.getElementById(id).value = '');
        if(fileInput) fileInput.value = '';
        adminLoadInventory();
        loadPublicStore();
    } catch(e) { showToast("Error al agregar producto", true); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-2"></i>Guardar en Almacén'; }
};
window.generateAIDescription = async () => {
    const name = document.getElementById('inv-name').value.trim();
    if(!name) return showToast("Ingresa el nombre del producto", true);
    const descEl = document.getElementById('inv-desc');
    descEl.value = "Generando descripción...";
    setTimeout(() => {
        const phrases = [`¡Rinde al máximo con nuestro ${name}!`, `${name} de calidad insuperable.`, `Potencia y durabilidad con ${name}.`];
        descEl.value = phrases[Math.floor(Math.random() * phrases.length)];
        showToast("Descripción generada");
    }, 600);
};

// ===================== PROMOS =====================
window.adminApplyPromo = async () => {
    const id = document.getElementById('promo-product-select').value;
    const type = document.getElementById('promo-type').value;
    const discount = parseFloat(document.getElementById('promo-discount').value);
    const audience = document.getElementById('promo-audience').value;
    if(!id || isNaN(discount)) return showToast("Selecciona producto y valor", true);
    const updateData = type === 'percent' ? { discountPercent: discount, discountFixed: null } : { discountFixed: discount, discountPercent: null };
    updateData.promoAudience = audience;
    await updateDoc(doc(db, "inventario", id), updateData);
    showToast("Descuento aplicado");
    loadPublicStore();
};
window.adminSaveLoyalty = async () => {
    const code = document.getElementById('loyalty-code').value.trim();
    const cond = document.getElementById('loyalty-condition').value;
    const rewType = document.getElementById('loyalty-reward-type').value;
    const rewVal = document.getElementById('loyalty-reward-val').value.trim();
    const audience = document.getElementById('loyalty-audience').value;
    const maxUsos = parseInt(document.getElementById('loyalty-max-usos').value) || 0;
    if(!code || !rewVal) return showToast("Falta código o recompensa", true);
    await addDoc(collection(db, "promociones"), {
        codigo: code, condicion: cond, tipoRecompensa: rewType, valorRecompensa: rewVal,
        audience, active: true, maxUsos, usos: 0, created: Date.now()
    });
    showToast("Promoción activada");
    document.getElementById('loyalty-code').value = '';
    document.getElementById('loyalty-reward-val').value = '';
    adminLoadLoyalty();
};
window.adminLoadLoyalty = async () => {
    const snap = await getDocs(collection(db, "promociones"));
    const list = document.getElementById('admin-loyalty-list');
    if(!list) return;
    list.innerHTML = '';
    snap.forEach(d => {
        const data = d.data();
        list.innerHTML += `<div class="flex justify-between items-center bg-black/40 p-3 rounded-xl mb-2">
            <div><p class="text-xs font-black text-white">${data.codigo} ${data.active ? '<span class="text-green-400">Activo</span>' : '<span class="text-red-400">Pausado</span>'}</p>
            <p class="text-[9px] text-gray-400">Para: ${data.audience === 'both' ? 'VIP y General' : data.audience === 'vip' ? 'Solo VIP' : 'Solo General'} | Cond: ${data.condicion} | Premio: ${data.tipoRecompensa === 'desc_porc' ? '% Desc.' : data.tipoRecompensa === 'desc_fijo' ? '$ Fijo' : 'Servicio'} ${data.valorRecompensa} | Usos: ${data.usos||0}/${data.maxUsos>0 ? data.maxUsos : '∞'}</p></div>
            <button onclick="adminToggleLoyalty('${d.id}', ${!data.active})" class="text-white"><i class="fas ${data.active ? 'fa-pause' : 'fa-play'}"></i></button>
            <button onclick="adminDelLoyalty('${d.id}')" class="text-red-500"><i class="fas fa-trash"></i></button></div>`;
    });
};
window.adminToggleLoyalty = async (id, st) => { await updateDoc(doc(db, "promociones", id), { active: st }); adminLoadLoyalty(); };
window.adminDelLoyalty = async (id) => { await deleteDoc(doc(db, "promociones", id)); adminLoadLoyalty(); };

// ===================== CONFIGURACIÓN =====================
function adminRefreshConfigUI() {
    const tbody = document.getElementById('schedule-tbody');
    if(tbody) {
        const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        tbody.innerHTML = dias.map((d,i) => {
            const s = globalSettings.schedule[i] || {o:8, c:20};
            return `<tr><td class="py-2 pl-1 font-bold">${d}</td><td><input type="number" id="sched-${i}-o" value="${s.o}" min="0" max="23" class="w-16 bg-asfalto border border-white/10 p-1 rounded text-white text-center text-xs"></td><td><input type="number" id="sched-${i}-c" value="${s.c}" min="0" max="23" class="w-16 bg-asfalto border border-white/10 p-1 rounded text-white text-center text-xs"></td></tr>`;
        }).join('');
    }
    document.getElementById('config-price-mode').value = globalSettings.priceMode || 'km';
    document.getElementById('config-base-price').value = globalSettings.rescueBase || 100;
    document.getElementById('config-km-extra').value = globalSettings.rescueKmExtra || 10;
    document.getElementById('config-mem-price').value = globalSettings.membershipPrice || 100;
    document.getElementById('config-radius').value = globalSettings.radiusKm || 15;
    document.getElementById('radius-display').innerText = globalSettings.radiusKm || 15;
    document.getElementById('config-theme-mode').value = globalSettings.themeMode || 'dark';
    renderKmRanges();
    togglePriceMode();
}
function togglePriceMode() {
    const modo = document.getElementById('config-price-mode').value;
    document.getElementById('config-price-fijo').classList.toggle('hidden', modo !== 'fijo');
    document.getElementById('config-price-km').classList.toggle('hidden', modo !== 'km');
}
window.togglePriceMode = togglePriceMode;
function renderKmRanges() {
    const list = document.getElementById('km-ranges-list');
    if(!list) return;
    list.innerHTML = (globalSettings.rescueKmRanges||[]).map((r,i) => 
        `<div class="flex justify-between text-white text-xs bg-black/40 p-2 rounded"><span>Hasta ${r.km} km = $${r.price}</span><button onclick="removeKmRange(${i})" class="text-red-500"><i class="fas fa-trash"></i></button></div>`
    ).join('');
}
window.adminAddKmRange = () => {
    const km = parseFloat(document.getElementById('new-km-limit').value);
    const price = parseFloat(document.getElementById('new-km-price').value);
    if(isNaN(km) || isNaN(price)) return showToast("Valores inválidos", true);
    if(!globalSettings.rescueKmRanges) globalSettings.rescueKmRanges = [];
    globalSettings.rescueKmRanges.push({km, price});
    globalSettings.rescueKmRanges.sort((a,b)=>a.km - b.km);
    renderKmRanges();
    document.getElementById('new-km-limit').value = '';
    document.getElementById('new-km-price').value = '';
};
window.removeKmRange = i => { globalSettings.rescueKmRanges.splice(i,1); renderKmRanges(); };
window.updateGeofenceRadius = val => {
    document.getElementById('radius-display').innerText = val;
    if(adminGeoCircle) adminGeoCircle.setRadius(val * 1000);
};
function renderAdminMap() {
    setTimeout(() => {
        const mapEl = document.getElementById('admin-geofence-map');
        if(!mapEl || adminGeoMap) return;
        adminGeoMap = L.map(mapEl, { zoomControl: true }).setView([globalSettings.centerLat, globalSettings.centerLng], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: 'OBR' }).addTo(adminGeoMap);
        const pinIcon = L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt"></i></div>', iconSize: [32,32], iconAnchor: [16,32] });
        adminBusinessMarker = L.marker([globalSettings.centerLat, globalSettings.centerLng], { icon: pinIcon, draggable: true }).addTo(adminGeoMap)
            .on('dragend', e => { const pos = e.target.getLatLng(); globalSettings.centerLat = pos.lat; globalSettings.centerLng = pos.lng; if(adminGeoCircle) adminGeoCircle.setLatLng(pos); });
        adminGeoCircle = L.circle([globalSettings.centerLat, globalSettings.centerLng], { color: '#FF6B00', fillColor: '#FF6B00', fillOpacity: 0.1, radius: globalSettings.radiusKm * 1000 }).addTo(adminGeoMap);
    }, 300);
}
window.adminSaveConfig = async () => {
    const schedule = {};
    for(let i=0; i<7; i++) {
        const o = parseInt(document.getElementById(`sched-${i}-o`).value) || 8;
        const c = parseInt(document.getElementById(`sched-${i}-c`).value) || 20;
        schedule[i] = { o, c };
    }
    if(document.getElementById('config-apply-all').checked) {
        const base = schedule[1] || { o:8, c:20 };
        for(let i=0; i<7; i++) { schedule[i] = { ...base }; document.getElementById(`sched-${i}-o`).value = base.o; document.getElementById(`sched-${i}-c`).value = base.c; }
    }
    globalSettings.schedule = schedule;
    globalSettings.priceMode = document.getElementById('config-price-mode').value;
    globalSettings.rescueBase = parseFloat(document.getElementById('config-base-price').value) || 100;
    globalSettings.rescueKmExtra = parseFloat(document.getElementById('config-km-extra').value) || 10;
    globalSettings.membershipPrice = parseFloat(document.getElementById('config-mem-price').value) || 100;
    globalSettings.radiusKm = parseFloat(document.getElementById('config-radius').value) || 15;
    globalSettings.themeMode = document.getElementById('config-theme-mode').value;
    await setDoc(doc(db, "settings", "general"), globalSettings);
    applyTheme();
    updateLandingStatus();
    showToast("Configuración guardada");
};
window.adminSaveMemPrice = async () => {
    const val = parseFloat(document.getElementById('config-mem-price').value);
    if(isNaN(val)) return showToast("Precio inválido", true);
    globalSettings.membershipPrice = val;
    await setDoc(doc(db, "settings", "general"), { membershipPrice: val }, { merge: true });
    showToast("Costo de membresía actualizado");
};

// ===================== USUARIOS =====================
window.adminLoadUsers = async () => {
    const snap = await getDocs(query(collection(db, "users"), limit(100)));
    const normal = document.getElementById('admin-users-normal-list');
    const vip = document.getElementById('admin-users-vip-list');
    const staff = document.getElementById('admin-users-staff-list');
    if(!normal || !vip || !staff) return;
    normal.innerHTML = ''; vip.innerHTML = ''; staff.innerHTML = '';
    snap.forEach(d => {
        const u = d.data();
        if(['admin','mecanico','taller','socio'].includes(u.role)) {
            staff.innerHTML += `<div class="bg-white/5 p-3 rounded-xl flex justify-between items-center mb-2 cursor-pointer" onclick="openUserDetail('${d.id}')">
                <div><p class="font-black text-white text-xs">${u.name}</p><p class="text-[9px] text-blue-400 uppercase">${u.role}</p></div>
                <div class="text-right"><p class="text-yellow-400 text-xs"><i class="fas fa-star"></i> 5.0</p></div></div>`;
        } else if(u.role === 'membresia') {
            vip.innerHTML += `<div class="bg-black/50 border border-yellow-500/30 p-3 rounded-xl flex justify-between mb-2">
                <div onclick="openUserDetail('${d.id}')" class="cursor-pointer"><p class="font-black text-white text-xs">${u.name}</p><p class="text-[9px] text-gray-400">${u.phone}</p></div>
                <button onclick="adminToggleMembership('${d.id}', false)" class="text-[8px] bg-red-600/20 text-red-400 px-3 py-2 rounded-lg">Bajar</button></div>`;
        } else {
            normal.innerHTML += `<div class="bg-black/30 border border-white/5 p-3 rounded-xl flex justify-between mb-2">
                <div onclick="openUserDetail('${d.id}')" class="cursor-pointer"><p class="font-black text-white text-xs">${u.name}</p><p class="text-[9px] text-gray-500">${u.phone}</p></div>
                <button onclick="adminToggleMembership('${d.id}', true)" class="text-[8px] bg-yellow-600/20 text-yellow-400 px-3 py-2 rounded-lg">Hacer VIP</button></div>`;
        }
    });
};
window.adminToggleMembership = async (uid, makeVip) => {
    if(makeVip) await updateDoc(doc(db, "users", uid), { role: 'membresia', membresiaExp: Date.now() + 30*24*60*60*1000 });
    else await updateDoc(doc(db, "users", uid), { role: 'cliente', membresiaExp: null });
    showToast(makeVip ? "Membresía Activada" : "Cancelada");
    adminLoadUsers();
};
window.openUserDetail = async uid => {
    const u = (await getDoc(doc(db, "users", uid))).data();
    document.getElementById('ud-name').innerText = u.name;
    document.getElementById('ud-phone').innerText = u.phone;
    toggleModal('modal-user-detail', true);
};

// ===================== ESTADÍSTICAS =====================
window.loadStats = async () => {
    const snap = await getDocs(collection(db, "ventas"));
    const salesByDay = {};
    snap.forEach(d => {
        const date = new Date(d.data().fecha).toLocaleDateString();
        salesByDay[date] = (salesByDay[date]||0) + d.data().total;
    });
    const labels = Object.keys(salesByDay).slice(-14);
    const data = Object.values(salesByDay).slice(-14);
    const ctx = document.getElementById('stats-chart')?.getContext('2d');
    if(ctx) {
        if(statsChartInstance) statsChartInstance.destroy();
        statsChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Ingresos ($)', data, backgroundColor: '#FF6B00' }] } });
    }
};
window.exportCSV = async type => {
    let csv = '';
    if(type === 'ventas') {
        const snap = await getDocs(collection(db, "ventas"));
        csv = "Fecha,Descripción,Total\n";
        snap.forEach(d => { const v = d.data(); csv += `${new Date(v.fecha).toLocaleDateString()},"${v.desc}",${v.total}\n`; });
    }
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${type}_${Date.now()}.csv`; a.click();
};
window.exportStatsPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("MOTO RESCATE OBR - Reporte Estadístico", 14, 22);
    doc.setFontSize(12); doc.text(`Fecha: ${new Date().toLocaleString()}`, 14, 32);
    doc.save(`reporte_${new Date().toISOString().slice(0,10)}.pdf`);
};

// ===================== VIDEO, CHAT, QR, FIRMA =====================
function renderVideoScheduleDays() {
    const container = document.getElementById('video-schedule-days');
    if (!container) return;
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    container.innerHTML = dias.map((dia, i) => {
        const sched = (globalSettings.videoSchedule && globalSettings.videoSchedule[i]) || {};
        return `<div class="bg-black/30 p-4 rounded-xl border border-white/10 mb-3">
            <p class="text-xs font-black text-white uppercase mb-2">${dia}</p>
            <div class="flex items-center space-x-2 mb-2">
                <input type="file" id="video-file-${i}" accept="video/*" class="flex-1 bg-white/5 border border-white/10 p-2 rounded-lg text-xs text-gray-400 file:bg-purple-600 file:text-white file:border-0 file:rounded-md file:px-2 file:py-1">
                <button onclick="copyVideoToDay(${i})" class="text-[9px] text-blue-400 hover:text-white p-2 rounded-lg bg-blue-500/10"><i class="fas fa-copy mr-1"></i>Repetir día anterior</button>
            </div>
            <div class="flex space-x-2">
                <div class="w-1/2"><label class="text-[9px] text-gray-400">Inicio (hora)</label><input type="number" id="video-start-${i}" min="0" max="23" value="${sched.startH || 8}" class="w-full bg-white/5 border border-white/10 p-2 rounded-lg text-white text-sm"></div>
                <div class="w-1/2"><label class="text-[9px] text-gray-400">Fin (hora)</label><input type="number" id="video-end-${i}" min="0" max="23" value="${sched.endH || 20}" class="w-full bg-white/5 border border-white/10 p-2 rounded-lg text-white text-sm"></div>
            </div>
            ${sched.videoUrl ? `<p class="text-[9px] text-green-400 mt-1">Video cargado</p>` : ''}
        </div>`;
    }).join('');
}
window.copyVideoToDay = function(dayIndex) {
    const prevIndex = (dayIndex === 0) ? 6 : dayIndex - 1;
    const prevFile = document.getElementById(`video-file-${prevIndex}`).files[0];
    if (!prevFile) return showToast("No hay video en el día anterior", true);
    const dt = new DataTransfer();
    dt.items.add(prevFile);
    document.getElementById(`video-file-${dayIndex}`).files = dt.files;
    showToast("Video repetido del día anterior");
};
window.saveVideoSchedule = async function() {
    const schedule = {};
    for (let i = 0; i < 7; i++) {
        const fileInput = document.getElementById(`video-file-${i}`);
        const startH = parseInt(document.getElementById(`video-start-${i}`).value) || 8;
        const endH = parseInt(document.getElementById(`video-end-${i}`).value) || 20;
        let videoUrl = (globalSettings.videoSchedule && globalSettings.videoSchedule[i]) ? globalSettings.videoSchedule[i].videoUrl : null;
        if (fileInput.files.length > 0) videoUrl = await uploadFile(fileInput.files[0], `videos_semana/dia_${i}_${Date.now()}_${fileInput.files[0].name}`);
        schedule[i] = { videoUrl, startH, endH };
    }
    globalSettings.videoSchedule = schedule;
    await setDoc(doc(db, "settings", "general"), { videoSchedule: schedule }, { merge: true });
    showToast("Programación de videos guardada");
    toggleModal('modal-video-schedule', false);
    loadPublicStore();
};

async function loadChatList() {
    const list = document.getElementById('chat-list-items');
    if (!list) return;
    const btn = document.getElementById('admin-chat-float-btn');
    const snap = await getDocs(query(collection(db, "rescates"), where("status", "in", ["pending", "accepted"]), limit(20)));
    let active = false;
    list.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        if (d.uid) {
            active = true;
            list.innerHTML += `<div onclick="openChatFromList('${d.uid}')" class="bg-white/5 p-3 rounded-xl cursor-pointer hover:bg-white/10">
                <p class="text-sm font-bold text-white">${d.clientName || 'Cliente'}</p><p class="text-[10px] text-gray-400 truncate">${d.falla}</p></div>`;
        }
    });
    if (btn) btn.classList.toggle('hidden', !active);
    if (!active) list.innerHTML = '<p class="text-gray-500 text-xs text-center">Sin chats activos</p>';
}
window.openChatFromList = (uid) => { toggleModal('modal-chat-list', false); openChat(uid, false); };

function adminListenSOS() {
    onValue(dbRef(rtdb, 'sos_alerts'), (snap) => {
        const list = document.getElementById('admin-sos-list');
        if (!list) return;
        list.innerHTML = '';
        if (!snap.exists()) return;
        const data = snap.val();
        Object.entries(data).forEach(([uid, val]) => {
            if ((currentSOSFilter === 'pending' && val.status === 'pending') ||
                (currentSOSFilter === 'accepted' && val.status === 'accepted') ||
                (currentSOSFilter === 'completed' && val.status === 'completed') ||
                (currentSOSFilter === 'cancelled' && val.status === 'cancelled')) {
                list.innerHTML += `<div class="bg-red-900/20 border border-red-500/30 p-4 rounded-2xl">
                    <p class="text-xs text-red-400 font-black uppercase">${val.clientName || 'Cliente'}</p>
                    <p class="text-sm text-white mt-1">${val.falla}</p>
                    <div class="flex space-x-2 mt-3">
                        <button onclick="adminMoveToWorkshop('${uid}', '${val.phone}', '${val.falla?.replace(/'/g, "\\'") || ''}')" class="bg-blue-600 text-white text-[10px] px-3 py-1 rounded-lg font-black uppercase">A Taller</button>
                        <button onclick="openChat('${uid}', false)" class="bg-green-600 text-white text-[10px] px-3 py-1 rounded-lg font-black uppercase">Chat</button>
                        <button onclick="openSOSDetail('${uid}')" class="bg-yellow-600 text-white text-[10px] px-3 py-1 rounded-lg font-black uppercase">Ver</button>
                    </div></div>`;
            }
        });
    });
}
window.filterSOS = (filter) => {
    currentSOSFilter = filter;
    adminListenSOS();
};
window.openSOSDetail = async (uid) => {
    const snap = await getDocs(query(collection(db, "rescates"), where("uid", "==", uid), limit(1)));
    if (snap.empty) return;
    const data = snap.docs[0].data();
    document.getElementById('sos-detail-title').innerText = data.clientName || 'Cliente';
    document.getElementById('sos-detail-falla').innerText = data.falla;
    if (data.mediaUrl) { document.getElementById('sos-detail-img').src = data.mediaUrl; document.getElementById('sos-detail-media-container').classList.remove('hidden'); }
    else document.getElementById('sos-detail-media-container').classList.add('hidden');
    if (data.lat && data.lng && !sosDetailMapInst) {
        sosDetailMapInst = L.map('sos-detail-map').setView([data.lat, data.lng], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(sosDetailMapInst);
        L.marker([data.lat, data.lng], { icon: L.divIcon({ className: 'gps-pulse-marker', iconSize: [20, 20] }) }).addTo(sosDetailMapInst);
    }
    toggleModal('modal-sos-detail', true);
};
window.closeSOSDetail = () => { toggleModal('modal-sos-detail', false); if (sosDetailMapInst) { sosDetailMapInst.remove(); sosDetailMapInst = null; } };

function renderSOSGlobalMap() {
    setTimeout(() => {
        const mapEl = document.getElementById('admin-sos-global-map');
        if(!mapEl || adminSOSGlobalMapInst) return;
        adminSOSGlobalMapInst = L.map(mapEl).setView([globalSettings.centerLat, globalSettings.centerLng], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(adminSOSGlobalMapInst);
    }, 300);
}

window.adminPrintQR = (id) => {
    document.getElementById('qr-ticket-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=OBR-${id.slice(0,6)}`;
    document.getElementById('qr-ticket-id').innerText = `OBR-${id.slice(0,6)}`;
    toggleModal('modal-qr-ticket', true);
};
window.printQRTicket = () => {
    const printContent = document.getElementById('print-qr-area').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Folio OBR</title><style>body{font-family:sans-serif;background:#fff;color:#000;padding:20px;max-width:300px;margin:0 auto;text-align:center;}</style></head><body>${printContent}<script>setTimeout(()=>window.print(),500);<\/script></body></html>`);
};

window.filterStore = () => {
    const term = document.getElementById('store-search').value.toLowerCase();
    document.querySelectorAll('#public-store-grid > div').forEach(card => card.style.display = card.innerText.toLowerCase().includes(term) ? '' : 'none');
};
window.sendContact = () => {
    const name = document.getElementById('contact-name')?.value.trim() || '';
    const phone = document.getElementById('contact-phone')?.value.trim() || '';
    const msg = document.getElementById('contact-msg')?.value.trim() || '';
    if (!name || !msg) return showToast("Nombre y mensaje requeridos", true);
    window.open(`https://wa.me/526311551533?text=${encodeURIComponent(`Hola, soy ${name}${phone ? ' ('+phone+')' : ''}. ${msg}`)}`, '_blank');
};
window.searchServiceStatus = async () => {
    const val = document.getElementById('search-tracker-input').value.trim();
    const pwd = document.getElementById('search-tracker-pwd').value.trim();
    if(!val || !pwd) return showToast("Ingresa celular y contraseña", true);
    try {
        await signInWithEmailAndPassword(auth, `${val}@motorescateobr.com`, pwd);
        const q = query(collection(db, "rescates"), where("phone", "==", "+52"+val), limit(10));
        const snap = await getDocs(q);
        const container = document.getElementById('tracking-result-container');
        if(!snap.empty) {
            container.classList.remove('hidden');
            container.innerHTML = snap.docs.map(d => `<div class="bg-white/5 p-3 rounded-xl text-white text-sm mb-2"><p>${d.data().falla}</p><p class="text-[10px] text-gray-400">${new Date(d.data().timestamp).toLocaleDateString()}</p></div>`).join('');
        } else showToast("Sin servicios", true);
    } catch(e) { showToast("Datos incorrectos", true); }
};

// Inicialización
window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});

console.log("🚀 OBR v3.0 cargado correctamente");
