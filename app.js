import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, query, where, limit, updateDoc, deleteDoc, orderBy, arrayUnion, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref as dbRef, set as rtdbSet, onValue, push, remove, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

// === VARIABLES GLOBALES ===
window.userIntent = 'inicio';
let tempSOSGps = { lat: null, lng: null };
window.pendingItemToBuy = null;
const TALLER_LAT = 27.44678301871637;
const TALLER_LNG = -109.94388280415251;

let globalSettings = {
    schedule: { 0: { o: "08:00", c: "20:00" }, 1: { o: "08:00", c: "20:00" }, 2: { o: "08:00", c: "20:00" }, 3: { o: "08:00", c: "20:00" }, 4: { o: "08:00", c: "20:00" }, 5: { o: "08:00", c: "20:00" }, 6: { o: "08:00", c: "20:00" } },
    centerLat: TALLER_LAT, centerLng: TALLER_LNG, radiusKm: 15,
    priceMode: 'km', rescueBase: 100, rescueKmExtra: 10, membershipPrice: 100,
    rescueKmRanges: [{ km: 1, price: 20 }, { km: 1.5, price: 25 }, { km: 2, price: 30 }],
    themeMode: 'auto', videoSchedule: {}
};
let sosMapInstance = null, mechMapInst = null, mechMarkerInst = null;
let adminGeoMap = null, adminGeoCircle = null;
let adminSOSGlobalMapInst = null, adminSOSMarkers = {};
let sosDetailMapInst = null, sosDetailMarker = null, mechSOSMarker = null;
let shopServices = [], adminInventoryList = [];
window.posTicket = []; window.posTotal = 0; window.posTotalCost = 0; window.posDescuento = 0;
window.sosTicket = []; window.sosTotal = 0; window.currentSOSCost = 0; window.currentSOSId = null; window.currentSOSData = null;
window.cart = []; window.cartDescuento = 0; window.retiros = []; window.cajaAbierta = false; window.fondoInicial = 0;
let activeChatUid = null, chatUnsubscribe = null;
window.currentRating = 0; let currentDetalleServicioId = null;
window.currentSOSFilter = 'pending';
let statsChartInstance = null, statsPieInstance = null;
let adminSalesCache = {}; let lastNotifiedSOS = null; let mechWatchId = null;
window.activePosFilter = 'todos';
window.garantiasActivas = []; // Para gestión de garantías

const generateShortId = () => 'OBR-' + Math.floor(10000 + Math.random() * 90000);

// === UTILIDADES ===
window.showToast = (msg, isError = false) => {
    const t = document.getElementById('status-toast'); if(!t) return;
    document.getElementById('status-msg').innerText = msg;
    const icon = document.getElementById('toast-icon');
    t.firstElementChild.className = isError 
        ? 'bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 font-bold text-sm'
        : 'bg-naranja text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 font-bold text-sm';
    icon.className = isError ? 'fas fa-exclamation-triangle text-lg' : 'fas fa-check-circle text-lg';
    t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 4000);
};

window.toggleModal = (id, show) => { 
    const m = document.getElementById(id);
    if(m) {
        m.classList.toggle('hidden', !show);
        if(show && id === 'modal-video-schedule') window.renderVideoScheduleDays?.();
        if(show && id === 'modal-ventas-realizadas') window.loadVentasRealizadas?.();
        if(show && id === 'modal-garantias') window.loadGarantias?.();
    }
};

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        openModals.forEach(m => window.toggleModal?.(m.id, false));
        if(chatUnsubscribe) window.closeChat?.();
    }
});

window.compressImage = async (file) => {
    if (!file) return null;
    if (!file.type.match(/image.*/)) return file;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height; const MAX_DIM = 800;
                if (width > height && width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
                else if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })), 'image/jpeg', 0.6);
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
};

const uploadFile = (file, path, onProgressCallback = null) => {
    return new Promise((resolve, reject) => {
        if(!file) return resolve(null);
        const storageRef = sRef(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on('state_changed', 
            (snapshot) => {
                if (onProgressCallback) {
                    const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    onProgressCallback(p);
                }
            }, 
            error => reject(error), 
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
        );
    });
};

async function uploadWithTimeout(file, path) {
    if (!file) return null;
    const compressed = await window.compressImage(file);
    const uploadPromise = uploadFile(compressed, path);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    try {
        return await Promise.race([uploadPromise, timeoutPromise]);
    } catch (e) {
        console.warn('Subida lenta, usando base64');
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(compressed);
        });
    }
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function playSound(type) {
    try { const s = document.getElementById(type === 'alert' ? 'alert-sound' : 'notif-sound'); if(s) { s.currentTime = 0; s.play().catch(()=>{}); } } catch(e){}
}

function speakTTS(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'es-MX'; utterance.rate = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => v.lang.includes('es') && (v.name.toLowerCase().includes('mujer') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('paulina')));
        if(femaleVoice) utterance.voice = femaleVoice;
        window.speechSynthesis.speak(utterance);
    }
}
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// === TEMA ===
window.changeThemeMode = async (mode) => {
    globalSettings.themeMode = mode; applyTheme();
    if(auth.currentUser && window.currentUserDoc?.role === 'admin') await setDoc(doc(db, "settings", "general"), { themeMode: mode }, { merge: true });
};
function applyTheme() {
    let mode = globalSettings.themeMode || 'auto';
    if (mode === 'auto') { const h = new Date().getHours(); mode = (h >= 7 && h < 19) ? 'light' : 'dark'; }
    document.body.classList.toggle('light-mode', mode === 'light');
    const sel = document.getElementById('theme-selector'); if(sel) sel.value = globalSettings.themeMode || 'auto';
}

// === RASTREO MECÁNICO ===
function startMechanicTracking() {
    if(['admin', 'mecanico', 'taller'].includes(window.currentUserDoc?.role)) {
        if(navigator.geolocation) {
            mechWatchId = navigator.geolocation.watchPosition(pos => {
                update(dbRef(rtdb, 'mecanicos_activos/' + auth.currentUser.uid), { lat: pos.coords.latitude, lng: pos.coords.longitude, name: window.currentUserDoc.name, ts: Date.now() });
            }, e=>console.error(e), {enableHighAccuracy: true, maximumAge: 10000});
        }
    }
}

// === INICIO Y CONFIGURACIÓN GLOBAL ===
async function loadGlobalSettings() {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) Object.assign(globalSettings, snap.data());
    globalSettings.centerLat = TALLER_LAT; globalSettings.centerLng = TALLER_LNG;
    applyTheme(); updateLandingStatus(); loadPublicStore(); loadServicesCatalog();
}

function updateLandingStatus() {
    const now = new Date(); const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1; 
    const sched = globalSettings.schedule[dayIndex] || { o: "08:00", c: "20:00" };
    const [hOpen, mOpen] = sched.o.split(':').map(Number); const [hClose, mClose] = sched.c.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes(); const openMins = hOpen * 60 + mOpen; const closeMins = hClose * 60 + mClose;
    const isOpen = nowMins >= openMins && nowMins < closeMins;
    
    const lo = document.getElementById('landing-open'); const lc = document.getElementById('landing-closed');
    if(lo) lo.style.display = isOpen ? 'flex' : 'none'; if(lc) lc.style.display = isOpen ? 'none' : 'flex';
    const badge = document.getElementById('landing-status-badge');
    if (badge) {
        badge.innerText = isOpen ? 'Plataforma Activa' : 'Taller Fuera de Horario';
        badge.className = isOpen ? 'text-naranja font-black tracking-widest text-[10px] lg:text-xs mb-8 lg:mb-12 uppercase border border-naranja/30 px-6 py-2 rounded-full bg-naranja/10' : 'text-red-500 font-black tracking-widest text-[10px] lg:text-xs mb-8 lg:mb-12 uppercase border border-red-500/30 px-6 py-2 rounded-full bg-red-500/10';
    }
    const closedText = document.getElementById('closed-hours-text');
    if (closedText && !isOpen) {
        const nextOpen = findNextOpenDay();
        if (nextOpen) closedText.innerText = `Abrimos el ${nextOpen.day} a las ${nextOpen.time}`;
        else closedText.innerText = `Abrimos a las ${sched.o}`;
    }
    const globalLoginBtn = document.getElementById('global-login-btn');
    if (globalLoginBtn) {
        globalLoginBtn.style.display = auth.currentUser ? 'none' : 'flex';
    }
    window.updateEmergencyButtonState(isOpen, sched);
}

window.updateEmergencyButtonState = (isOpen, sched) => {
    const emBtn = document.getElementById('emergency-client-btn');
    const emText = document.getElementById('emergency-closed-text');
    if (!emBtn) return;
    
    if (isOpen) {
        emBtn.classList.remove('opacity-50', 'pointer-events-none', 'bg-gray-600');
        emBtn.classList.add('bg-gradient-to-r', 'from-red-600', 'to-naranja');
        emBtn.querySelector('.emergency-label')?.classList.remove('hidden');
        if (emText) emText.classList.add('hidden');
        emBtn.onclick = () => startFlow('sos');
    } else {
        emBtn.classList.add('opacity-50', 'pointer-events-none', 'bg-gray-600');
        emBtn.classList.remove('bg-gradient-to-r', 'from-red-600', 'to-naranja');
        const label = emBtn.querySelector('.emergency-label');
        if (label) label.classList.add('hidden');
        if (emText) {
            emText.classList.remove('hidden');
            const nextOpen = findNextOpenDay();
            if (nextOpen) {
                emText.innerText = `Abrimos el ${nextOpen.day} a las ${nextOpen.time}`;
            } else {
                emText.innerText = `Abrimos a las ${sched?.o || '08:00'}`;
            }
        }
        emBtn.onclick = () => showToast("Taller cerrado. Vuelve en horario laboral.", true);
    }
};

function findNextOpenDay() {
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const check = new Date(now);
        check.setDate(now.getDate() + i);
        const dayIdx = check.getDay() === 0 ? 6 : check.getDay() - 1;
        const s = globalSettings.schedule[dayIdx] || { o: "08:00", c: "20:00" };
        const [h, m] = s.o.split(':').map(Number);
        const openMins = h * 60 + m;
        const currentMins = (i === 0) ? now.getHours() * 60 + now.getMinutes() : 0;
        if (openMins > currentMins) {
            return { day: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][check.getDay()], time: s.o };
        }
    }
    return null;
}

async function loadPublicStore() {
    try {
        const snap = await getDocs(collection(db, "inventario"));
        const grid = document.getElementById('public-store-grid'); const cGrid = document.getElementById('client-store-grid');
        let html = ''; const isMem = auth.currentUser && window.currentUserDoc?.role === 'membresia';
        snap.forEach(doc => {
            const p = doc.data();
            if(p.stock > 0) {
                const price = isMem ? (p.priceMember || p.pricePublic) : p.pricePublic;
                html += `<div class="glass p-4 rounded-3xl flex flex-col hover:shadow-[0_0_15px_rgba(255,107,0,0.3)] transition-all" onclick="window.openProductDetail?.('${doc.id}')"><div class="w-full aspect-square bg-white/5 rounded-2xl mb-3 flex items-center justify-center overflow-hidden">${p.imgUrl ? `<img src="${p.imgUrl}" class="w-full h-full object-contain">` : '<i class="fas fa-box text-4xl text-gray-600"></i>'}</div><p class="text-xs font-black uppercase flex-grow">${p.name}</p><p class="text-naranja font-black text-lg mb-3">$${price}</p><button onclick="event.stopPropagation(); addToCart('${p.name}', ${price})" class="w-full bg-naranja hover:bg-orange-600 transition-colors text-white p-2 rounded-xl text-xs font-black uppercase">Añadir</button></div>`;
            }
        });
        if (!html) html = `<div class="col-span-full text-center p-10 flex flex-col items-center"><i class="fas fa-box-open text-6xl text-gray-600 mb-6 opacity-30"></i><h3 class="text-2xl font-black text-naranja uppercase italic mb-2">Próximamente</h3><p class="text-gray-400 text-sm mb-6">Estamos abasteciendo nuestro almacén.</p><button onclick="toggleModal('modal-contact', true)" class="bg-blue-600 text-white px-6 py-3 rounded-full font-black uppercase text-xs"><i class="fas fa-headset mr-2"></i>Contactar al Taller</button></div>`;
        if (grid) grid.innerHTML = html; if (cGrid) cGrid.innerHTML = html;
    } catch(e){}
}

async function loadServicesCatalog() {
    try {
        shopServices = []; const snap = await getDocs(collection(db, "servicios"));
        const select = document.getElementById('sos-service-select');
        if (!select) return;
        let html = '<option value="0">SIN FALLO ESPECÍFICO (Se cotiza en lugar)</option>';
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; shopServices.push(d); html += `<option value="${d.id}">${d.name} - $${d.price}</option>`; });
        select.innerHTML = html;
    } catch (e) {}
}
// === FLUJO DE VISTAS Y AUTENTICACIÓN ===
onAuthStateChanged(auth, async user => {
    document.getElementById('loading-screen').classList.add('hidden');
    const globalLoginBtn = document.getElementById('global-login-btn');
    
    if (!user) {
        if(mechWatchId) navigator.geolocation.clearWatch(mechWatchId);
        if(globalLoginBtn) globalLoginBtn.style.display = 'flex';
        loadGlobalSettings(); document.getElementById('view-landing').classList.remove('hidden'); document.getElementById('view-landing').classList.add('flex'); return;
    }
    
    if(globalLoginBtn) globalLoginBtn.style.display = 'none';
    
    document.getElementById('view-landing').classList.add('hidden');
    
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists()) { window.currentUserDoc = userSnap.data(); window.currentUserDoc.id = user.uid; } 
    else { window.currentUserDoc = { phone: '', role: 'cliente', name: '' }; }
    
    if (window.currentUserDoc.firstLogin) {
        showView('view-force-setup');
        return;
    }

    applyTheme(); startMechanicTracking();
    
    if (['admin', 'mecanico', 'taller', 'socio'].includes(window.currentUserDoc.role)) {
        showView('app-admin'); document.getElementById('admin-phone-display').innerText = window.currentUserDoc.name || 'Admin';
        window.adminRefreshConfigUI(); window.adminLoadInventory(); window.adminLoadSales(); window.filterSOS('pending'); window.adminListenServices(); window.adminLoadCitas(); window.loadChatList();
        if (window.currentUserDoc.role === 'mecanico') window.loadMechPendingCharges();
    } else {
        showView('app-client'); document.getElementById('client-name-display').innerText = window.currentUserDoc.name || 'Cliente OBR';
        const crown = document.getElementById('client-crown-icon');
        if (window.currentUserDoc.role === 'membresia') {
            crown.classList.remove('hidden'); const exp = window.currentUserDoc.membresiaExp;
            if (exp) {
                const daysLeft = (exp - Date.now()) / (1000 * 60 * 60 * 24);
                if (daysLeft <= 3 && daysLeft > 0) showToast(`Tu membresía vence en ${Math.ceil(daysLeft)} días`);
                if (daysLeft <= 0) { await updateDoc(doc(db, 'users', user.uid), { role: 'cliente', membresiaExp: null }); window.currentUserDoc.role = 'cliente'; crown.classList.add('hidden'); }
            }
        } else crown.classList.add('hidden');
        window.loadClientHistory(); listenToMySOS(); window.loadClientCitas(); loadPublicStore();
        window.loadMyOrders();
        updateLandingStatus();
    }
});

function showView(targetId) {
    const views = ['view-landing', 'view-public-store', 'view-public-tracking', 'view-login', 'view-sos-form', 'view-force-setup', 'app-client', 'app-admin'];
    views.forEach(id => { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); el.style.display = 'none'; } });
    const target = document.getElementById(targetId);
    if(target) { target.classList.remove('hidden'); target.classList.add('flex'); target.style.display = 'flex'; }
    window.fixMaps?.();
}
window.showView = showView;

window.fixMaps = () => {
    setTimeout(() => {
        if(adminGeoMap) adminGeoMap.invalidateSize(); if(adminSOSGlobalMapInst) adminSOSGlobalMapInst.invalidateSize();
        if(sosMapInstance) sosMapInstance.invalidateSize(); if(mechMapInst) mechMapInst.invalidateSize(); if(sosDetailMapInst) sosDetailMapInst.invalidateSize();
    }, 400);
};

window.startFlow = (intent) => {
    window.userIntent = intent;
    if (intent === 'tienda_publica') showView('view-public-store');
    else if (intent === 'rastreo_publico') showView('view-public-tracking');
    else if (intent === 'inicio') { showView('view-landing'); window.pendingItemToBuy = null; }
    else {
        if(auth.currentUser) {
            if(intent === 'sos' && ['admin','socio','taller','mecanico'].includes(window.currentUserDoc?.role)) { showView('app-admin'); window.switchAdminView('a-view-alertas'); return; }
            if(intent === 'sos') { window.launchSOSForm(); return; }
        }
        showView('view-login');
    }
};
window.cancelFlow = () => {
    showView('view-landing'); window.pendingItemToBuy = null;
    ['auth-step-1','auth-step-login','auth-step-register','auth-step-recovery'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('auth-step-1')?.classList.remove('hidden'); document.getElementById('phone-input').value = '';
};

window.resetAndGoHome = () => {
    document.getElementById('search-tracker-input').value = '';
    document.getElementById('search-tracker-pwd').value = '';
    document.getElementById('tracker-password-container').classList.add('hidden');
    document.getElementById('tracking-result-container').classList.add('hidden');
    document.getElementById('tracking-result-container').innerHTML = '';
    document.getElementById('tracking-not-found').classList.add('hidden');
    showView('view-landing');
};

window.switchClientView = (id) => {
    document.querySelectorAll('.c-view').forEach(v => v.classList.add('hidden')); document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.c-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.c-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active'); window.fixMaps?.();
};

window.switchAdminView = (id) => {
    document.querySelectorAll('.a-view').forEach(v => v.classList.add('hidden')); document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.a-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.a-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active');
    
    const chatBtn = document.getElementById('admin-chat-float-btn');
    if(chatBtn) chatBtn.classList.toggle('hidden', !['a-view-pos', 'a-view-alertas'].includes(id));

    if(id === 'a-view-config') { window.adminRefreshConfigUI(); window.renderAdminMap(); }
    if(id === 'a-view-usuarios') window.adminLoadUsers();
    if(id === 'a-view-promos') { window.adminLoadLoyalty(); populatePromoProductSelect(); }
    if(id === 'a-view-stats') window.loadStats();
    if(id === 'a-view-citas') window.adminLoadCitas();
    if(id === 'a-view-alertas') window.renderSOSGlobalMap();
    if(id === 'a-view-pos') { window.posFilterProducts(); window.renderPendingMechanicPayments(); window.loadVentasRealizadas(); }
    if(id === 'a-view-inventario') { 
        window.adminLoadInventory();
        if (!document.getElementById('float-inventory-btn')) {
            const btn = document.createElement('button');
            btn.id = 'float-inventory-btn';
            btn.className = 'fixed bottom-24 right-28 w-14 h-14 bg-green-600 rounded-full flex items-center justify-center text-white shadow-2xl z-40';
            btn.onclick = () => window.openInventoryCount();
            btn.innerHTML = '<i class="fas fa-clipboard-list text-2xl"></i>';
            document.body.appendChild(btn);
        }
    } else {
        const btn = document.getElementById('float-inventory-btn');
        if (btn) btn.remove();
    }
    window.fixMaps?.();
};

// === LOGIN LOGIC ===
window.checkUserExists = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim();
    if (rawPhone.length !== 10) return showToast("Celular de 10 dígitos", true);
    const btn = document.querySelector('#auth-step-1 button'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';
    try {
        const q = query(collection(db, "users"), where("phone", "==", "+52"+rawPhone), limit(1)); const snap = await getDocs(q);
        document.getElementById('auth-step-1').classList.add('hidden');
        if (!snap.empty) {
            window.currentUserDoc = snap.docs[0].data(); document.getElementById('login-name-display').innerText = window.currentUserDoc.name || 'Cliente';
            document.getElementById('auth-step-login').classList.remove('hidden');
        } else { document.getElementById('auth-step-register').classList.remove('hidden'); }
    } catch(e) { showToast("Error de conexión", true); } finally { btn.disabled = false; btn.innerHTML = 'Siguiente'; }
};

window.processLogin = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim(); const password = document.getElementById('login-password').value.trim();
    if(!password) return showToast("Ingresa contraseña", true);
    try { await signInWithEmailAndPassword(auth, `${rawPhone}@motorescateobr.com`, password); } catch(e) { showToast("Contraseña incorrecta", true); }
};

window.processRegister = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim(); const name = document.getElementById('reg-name').value.trim();
    const password = document.getElementById('reg-password').value.trim(); const question = document.getElementById('reg-question').value;
    const answer = document.getElementById('reg-answer').value.trim();
    if (!name || password.length < 6 || !question || !answer) return showToast("Completa datos (Pass min 6)", true);
    const fakeEmail = `${rawPhone}@motorescateobr.com`;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        await setDoc(doc(db, "users", userCredential.user.uid), { phone: "+52" + rawPhone, name, role: 'cliente', secQuestion: question, secAnswer: answer.toLowerCase(), pwd: password, created: new Date().toISOString() });
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') { try { await signInWithEmailAndPassword(auth, fakeEmail, password); } catch(loginErr) { showToast("Ya existe. Inicia sesión.", true); } } 
        else showToast("Error en registro", true);
    }
};

window.forceSetupSubmit = async () => {
    const pwd = document.getElementById('force-password').value.trim(); const q = document.getElementById('force-question').value;
    const ans = document.getElementById('force-answer').value.trim(); const name = document.getElementById('force-name').value.trim();
    if(pwd.length < 6 || !q || !ans || !name) return showToast("Llena todos los campos", true);
    await setDoc(doc(db, "users", auth.currentUser.uid), { name, secQuestion: q, secAnswer: ans.toLowerCase(), pwd, firstLogin: false }, {merge: true});
    showToast("Seguridad actualizada"); setTimeout(() => window.location.reload(), 1000);
};

window.showRecoveryFlow = () => { document.getElementById('auth-step-login').classList.add('hidden'); document.getElementById('auth-step-recovery').classList.remove('hidden'); document.getElementById('recovery-question-display').innerText = window.currentUserDoc?.secQuestion || "¿No hay pregunta?"; };
window.backToLoginStep = () => { document.getElementById('auth-step-recovery').classList.add('hidden'); document.getElementById('auth-step-login').classList.remove('hidden'); };

window.processRecovery = () => {
    const answer = document.getElementById('recovery-answer-input').value.trim().toLowerCase(); const realAnswer = window.currentUserDoc?.secAnswer?.toLowerCase();
    if(!realAnswer) return showToast("Sin pregunta configurada", true);
    if(answer === realAnswer) document.getElementById('recovery-form-area').innerHTML = `<div class="animate-fade-in mb-6 bg-black/50 border border-green-500 p-6 rounded-2xl text-center"><p class="text-[10px] font-black text-green-400 mb-2">Contraseña Recuperada</p><p class="font-black text-3xl text-white tracking-widest bg-white/5 py-3 rounded-xl border border-white/10">${window.currentUserDoc.pwd}</p></div>`;
    else showToast("Respuesta incorrecta", true);
};

window.logout = () => signOut(auth).then(() => window.location.href = window.location.pathname);

// === SOS CLIENTE (con envío forzado por timeout) ===
window.launchSOSForm = () => {
    showView('view-sos-form'); document.getElementById('manual-address-container').classList.add('hidden'); document.getElementById('llanta-type-container').classList.add('hidden');
    document.getElementById('sos-map-preview').classList.remove('hidden'); document.getElementById('sos-estimate-display').innerText = "Calculando..."; document.getElementById('gps-status-text').innerText = "Buscando...";
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            tempSOSGps.lat = pos.coords.latitude; tempSOSGps.lng = pos.coords.longitude;
            const dist = getDistanceKm(tempSOSGps.lat, tempSOSGps.lng, globalSettings.centerLat, globalSettings.centerLng);
            if(dist > globalSettings.radiusKm) { document.getElementById('out-of-zone-modal').classList.remove('hidden'); document.getElementById('out-of-zone-modal').classList.add('flex'); showView('view-landing'); return; }
            document.getElementById('gps-status-text').innerText = "GPS Establecido"; document.getElementById('gps-status-text').className = "text-[9px] font-bold text-green-400";
            if(!sosMapInstance) {
                sosMapInstance = L.map('sos-map-preview', { dragging: false, zoomControl: false, scrollWheelZoom: false }).setView([tempSOSGps.lat, tempSOSGps.lng], 16);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(sosMapInstance);
                L.marker([tempSOSGps.lat, tempSOSGps.lng], { icon: L.divIcon({ className: 'gps-pulse-marker', html:'<div class="pulse-inner"><i class="fas fa-street-view text-white text-xs"></i></div>', iconSize: [28, 28], iconAnchor: [14, 28] }) }).addTo(sosMapInstance);
            } else { sosMapInstance.setView([tempSOSGps.lat, tempSOSGps.lng], 16); sosMapInstance.invalidateSize(); }
            window.updateSOSEstimate(dist);
        }, () => {
            document.getElementById('gps-status-text').innerText = "Sin GPS: Escribe dirección"; document.getElementById('gps-status-text').className = "text-[9px] font-bold text-red-500";
            document.getElementById('manual-address-container').classList.remove('hidden'); document.getElementById('sos-map-preview').classList.add('hidden');
            window.updateSOSEstimate(0);
        }, { enableHighAccuracy: true, timeout: 10000 });
    } else {
        document.getElementById('manual-address-container').classList.remove('hidden'); document.getElementById('sos-map-preview').classList.add('hidden'); window.updateSOSEstimate(0);
    }
};

window.updateSOSEstimate = function(dist = null) {
    const selectEl = document.getElementById('sos-service-select'); const dispEl = document.getElementById('sos-estimate-display');
    let rescueCost = 0;
    if (globalSettings.priceMode === 'km') {
        let d = dist !== null ? dist : getDistanceKm(tempSOSGps.lat||0, tempSOSGps.lng||0, globalSettings.centerLat, globalSettings.centerLng);
        let ranges = globalSettings.rescueKmRanges || []; ranges.sort((a,b) => a.km - b.km); let matched = false;
        for(let r of ranges) { if(d <= r.km) { rescueCost = r.price; matched = true; break; } }
        if(!matched && ranges.length > 0) rescueCost = ranges[ranges.length-1].price + Math.max(0, (d - ranges[ranges.length-1].km)) * (globalSettings.rescueKmExtra||0);
    } else rescueCost = globalSettings.rescueBase || 100;
    
    if(auth.currentUser && window.currentUserDoc?.role === 'membresia') rescueCost = 0; window.currentSOSCost = rescueCost;
    if(selectEl.value === "0") dispEl.innerHTML = `<span class="text-naranja">Rescate: $${rescueCost.toFixed(2)}</span>`;
    else { const s = shopServices.find(x => x.id === selectEl.value); if(s) dispEl.innerHTML = `$${(rescueCost + parseFloat(s.price)).toFixed(2)}`; }
};

window.checkSOSKeywords = () => {
    const txt = document.getElementById('sos-falla').value.toLowerCase(); const llantaBox = document.getElementById('llanta-type-container');
    if(txt.includes('poncha') || txt.includes('llanta') || txt.includes('aire') || txt.includes('camara')) llantaBox.classList.remove('hidden'); else llantaBox.classList.add('hidden');
};

window.submitFinalSOS = async () => {
    const servSelect = document.getElementById('sos-service-select'); const falla = document.getElementById('sos-falla').value.trim();
    const manualAddress = document.getElementById('sos-manual-address').value.trim(); const fileInput = document.getElementById('sos-media');
    const btn = document.getElementById('btn-submit-sos');
    if (!falla && servSelect.value === "0") return showToast("Describe la falla", true);
    if (!tempSOSGps.lat && !manualAddress) return showToast("Falta ubicación", true);
    
    speakTTS('Estamos notificando al taller para su solicitud. Espere un momento.');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
    let mediaUrl = ""; const truePhone = window.currentUserDoc?.phone || ("+52" + (auth.currentUser.email?.replace('@motorescateobr.com','') || ''));
    
    let srvName = servSelect.value === "0" ? "Auxilio" : servSelect.options[servSelect.selectedIndex].text;
    let descFinal = `[${srvName}] ${falla}`;
    const srvDoc = shopServices.find(x => x.id === servSelect.value);
    if(srvDoc && srvDoc.desc) descFinal += ` \n*${srvDoc.desc}*`;

    const llantaOpt = document.querySelector('input[name="llanta"]:checked'); if(llantaOpt) descFinal += ` (Llanta: ${llantaOpt.value})`;
    
    const obrId = generateShortId();
    
    // Forzar timeout de 5 segundos para todo el proceso
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    
    try {
        const uploadPromise = (async () => {
            if (fileInput && fileInput.files.length > 0) {
                const url = await uploadWithTimeout(fileInput.files[0], `rescates/${auth.currentUser.uid}/${Date.now()}_${fileInput.files[0].name}`);
                return url || "";
            }
            return "";
        })();
        
        mediaUrl = await Promise.race([uploadPromise, timeoutPromise.catch(() => "")]);
        
        const rData = { uid: auth.currentUser.uid, shortId: obrId, clientName: window.currentUserDoc?.name || '', phone: truePhone, extraPhone: document.getElementById('sos-extra-phone').value.trim(), marca: document.getElementById('sos-marca').value.trim(), modelo: document.getElementById('sos-modelo').value.trim(), cc: document.getElementById('sos-cc').value.trim(), falla: descFinal, mediaUrl, lat: tempSOSGps.lat, lng: tempSOSGps.lng, manualAddress, costoRescateEstimado: window.currentSOSCost, status: 'pending', tallerStatus: 'recibida', timestamp: Date.now() };
        
        const addPromise = addDoc(collection(db, "rescates"), rData);
        const rtdbPromise = rtdbSet(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), rData);
        
        await Promise.race([
            Promise.all([addPromise, rtdbPromise]),
            timeoutPromise
        ]);
        
        document.getElementById('sos-falla').value = ''; document.getElementById('sos-media').value = ''; document.getElementById('llanta-type-container').classList.add('hidden');
        showToast("¡Unidad notificada!"); showView('app-client'); window.switchClientView('c-view-moto'); listenToMySOS();
    } catch (e) {
        console.warn('SOS enviado con posibles demoras:', e);
        showToast("Solicitud enviada. Te notificaremos cuando el taller confirme.");
        document.getElementById('sos-falla').value = ''; document.getElementById('sos-media').value = ''; document.getElementById('llanta-type-container').classList.add('hidden');
        showView('app-client'); window.switchClientView('c-view-moto'); listenToMySOS();
    } finally { 
        btn.disabled = false; btn.innerHTML = '<span>SOLICITAR AUXILIO</span> <i class="fas fa-ambulance text-2xl"></i>'; 
    }
};

let mySOSListener = null;
function listenToMySOS() {
    if(!auth.currentUser) return;
    if(mySOSListener) mySOSListener();
    mySOSListener = onValue(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), (snap) => {
        if(!snap.exists()) { document.getElementById('active-sos-card')?.classList.add('hidden'); document.getElementById('no-active-services-msg')?.classList.remove('hidden'); return; }
        const data = snap.val();
        document.getElementById('active-sos-card')?.classList.remove('hidden'); document.getElementById('no-active-services-msg')?.classList.add('hidden');
        
        if(data.status === 'accepted' && window.lastClientSOSStatus !== 'accepted') { speakTTS('TU SOLICITUD HA SIDO ACEPTADA. ESPERA MIENTRAS LLEGA EL MECÁNICO.'); playSound('notif'); }
        else if (data.status === 'completed' && window.lastClientSOSStatus !== 'completed') {
            speakTTS('AUXILIO FINALIZADO. GRACIAS POR CONFIAR EN OBR.'); playSound('notif');
            document.getElementById('active-sos-card')?.classList.add('hidden'); document.getElementById('satisfaction-survey').classList.remove('hidden'); remove(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid));
        }
        window.lastClientSOSStatus = data.status;
        document.getElementById('sos-status-desc-client').innerText = data.status === 'accepted' ? "Mecánico en camino" : "Esperando confirmación";
        
        if(data.status === 'accepted' && data.mech_lat) {
            document.getElementById('mechanic-live-map').classList.remove('hidden');
            if(!mechMapInst) {
                mechMapInst = L.map('mechanic-live-map', { dragging: false, zoomControl: false }).setView([data.mech_lat, data.mech_lng], 14);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(mechMapInst);
                mechMarkerInst = L.marker([data.mech_lat, data.mech_lng], { icon: L.divIcon({ className: 'mech-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-motorcycle text-white"></i></div>', iconSize: [32,32], iconAnchor: [16,32] }) }).addTo(mechMapInst);
            } else { mechMarkerInst.setLatLng([data.mech_lat, data.mech_lng]); mechMapInst.invalidateSize(); }
        }
    });
}
window.openSOSDetailClient = function() {};

window.setRating = r => {
    window.currentRating = r; const stars = document.getElementById('star-rating').children;
    for(let i=0; i<5; i++) stars[i].classList.toggle('text-naranja', i < r);
    document.getElementById('survey-comments').classList.toggle('hidden', r >= 3);
};

window.submitSurvey = async () => {
    if(!window.currentRating) return showToast("Selecciona una calificación", true);
    const comments = document.getElementById('survey-comments').value.trim();
    if(window.currentRating < 3 && !comments) return showToast("¿Qué mejorarías?", true);
    await addDoc(collection(db, "satisfaction"), { uid: auth.currentUser.uid, rating: window.currentRating, comments, timestamp: Date.now(), mechName: window.currentUserDoc.name || 'Mecánico' });
    document.getElementById('satisfaction-survey').classList.add('hidden'); document.getElementById('no-active-services-msg')?.classList.remove('hidden'); showToast("¡Gracias!");
};
// === ADMIN TALLER Y CITAS (con colores por estatus) ===
window.adminListenServices = async () => {
    const snap = await getDocs(query(collection(db, "rescates"), limit(50)));
    const list = document.getElementById('admin-services-list'); if(!list) return; list.innerHTML = '';
    let listaMotos = [];
    snap.forEach(d => {
        const v = d.data(); if(v.status !== 'completed' || v.tallerStatus === 'entregada' || v.tallerStatus === 'pagado') return;
        listaMotos.push({ id: d.id, ...v });
    });
    // Ordenar: primero las que no están "lista", luego "lista" al final
    listaMotos.sort((a,b) => (a.tallerStatus === 'lista' ? 1 : 0) - (b.tallerStatus === 'lista' ? 1 : 0));
    listaMotos.forEach(v => {
        const colorClass = v.tallerStatus === 'mecanica' ? 'bg-yellow-600/30 text-yellow-400' :
                           v.tallerStatus === 'pruebas' ? 'bg-blue-600/30 text-blue-400' :
                           v.tallerStatus === 'lista' ? 'bg-green-600/30 text-green-400' :
                           'bg-gray-600/30 text-gray-400';
        list.innerHTML += `<div class="bg-white/5 border border-white/10 p-4 rounded-2xl cursor-pointer hover:bg-white/10 transition shadow-lg" onclick="openDetalleServicio('${v.id}')"><div class="flex justify-between"><span class="font-black text-white text-sm">${v.phone}</span><span class="text-[10px] font-black uppercase px-2 py-1 rounded ${colorClass}">${v.tallerStatus}</span></div><p class="text-[10px] text-gray-400 mt-2 line-clamp-2">${v.falla}</p></div>`;
    });
    if(list.innerHTML === '') list.innerHTML = '<p class="text-gray-600 text-xs text-center col-span-full">Sin motos activas en taller</p>';
    // Botón flotante para ver solo las "lista"
    const btnCheck = document.getElementById('btn-lista-check');
    if (btnCheck) {
        btnCheck.style.display = 'flex';
        btnCheck.onclick = () => {
            list.innerHTML = '';
            listaMotos.filter(v => v.tallerStatus === 'lista').forEach(v => {
                list.innerHTML += `<div class="bg-green-600/20 border border-green-500/30 p-4 rounded-2xl cursor-pointer hover:bg-green-600/30 transition shadow-lg" onclick="openDetalleServicio('${v.id}')"><div class="flex justify-between"><span class="font-black text-white text-sm">${v.phone}</span><span class="text-[10px] font-black uppercase text-green-400 px-2 py-1 rounded">Lista</span></div><p class="text-[10px] text-gray-400 mt-2 line-clamp-2">${v.falla}</p></div>`;
            });
        };
    }
};

window.adminIngresarServicioManual = async () => {
    const phone = document.getElementById('manual-srv-phone').value.trim();
    const moto = document.getElementById('manual-srv-moto').value.trim();
    const falla = document.getElementById('manual-srv-falla').value.trim();
    const fileInput = document.getElementById('manual-srv-media');
    if(!phone || !moto || !falla) return showToast("Completar datos", true);

    const btn = document.querySelector('#modal-nuevo-servicio button.bg-green-500');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';
    try {
        let mediaUrls = [];
        if (fileInput && fileInput.files.length > 0) {
            const files = Array.from(fileInput.files).slice(0, 3);
            for (const file of files) {
                const url = await uploadWithTimeout(file, `rescates/manual/${Date.now()}_${file.name}`);
                if (url) mediaUrls.push(url);
            }
        }
        await addDoc(collection(db, "rescates"), {
            shortId: generateShortId(),
            phone: "+52" + phone,
            marca: moto.split(' ')[0] || moto,
            modelo: moto.replace(moto.split(' ')[0], '').trim(),
            falla,
            mediaUrl: mediaUrls.length === 1 ? mediaUrls[0] : (mediaUrls.length > 1 ? mediaUrls : ''),
            status: 'completed',
            tallerStatus: 'recibida',
            timestamp: Date.now()
        });
        showToast("Moto ingresada al Taller");
        toggleModal('modal-nuevo-servicio', false);
        window.adminListenServices();
    } catch (e) {
        showToast("Error", true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>INGRESAR';
    }
};

window.openDetalleServicio = async (id) => {
    const docSnap = await getDoc(doc(db, "rescates", id)); if(!docSnap.exists()) return;
    const data = docSnap.data(); currentDetalleServicioId = id;
    document.getElementById('servicio-detalle-phone').innerText = `${data.shortId || ''} - ${data.phone}`; 
    document.getElementById('servicio-detalle-info').innerHTML = `<p class="text-xs text-white">Moto: ${data.marca||''} ${data.modelo||''} ${data.cc||''}<br><br>${data.falla}</p>`;
    
    const mediaContainer = document.getElementById('servicio-fotos-container');
    let existingUrls = [];
    if (data.mediaUrl) {
        existingUrls = Array.isArray(data.mediaUrl) ? data.mediaUrl : [data.mediaUrl];
    }
    mediaContainer.innerHTML = existingUrls.map(url => `<img src="${url}" class="h-20 w-20 object-contain rounded-xl border border-white/10 cursor-pointer" onclick="window.open(this.src)">`).join('');
    if (existingUrls.length === 0) mediaContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic">Sin fotos</p>';
    
    const addPhotoBtn = document.getElementById('servicio-add-photo-btn');
    if (addPhotoBtn) {
        addPhotoBtn.classList.remove('hidden');
        addPhotoBtn.onclick = () => window.addExtraPhotos(id);
    }
    const changeCitaBtn = document.querySelector('#modal-detalle-servicio .bg-yellow-600\\/20');
    if (changeCitaBtn) changeCitaBtn.style.display = 'none';
    
    window.loadServicioBitacora(id);
    
    const actions = document.getElementById('servicio-actions-container');
    if(data.tallerStatus === 'lista' || data.tallerStatus === 'pagado') actions.classList.add('hidden');
    else actions.classList.remove('hidden');
    
    toggleModal('modal-detalle-servicio', true);
};

window.loadServicioBitacora = async (id) => {
    const bSnap = await getDocs(collection(db, "rescates", id, "bitacora"));
    const bList = document.getElementById('servicio-bitacora-list'); bList.innerHTML = '';
    let arr = []; bSnap.forEach(d => arr.push(d.data()));
    arr.sort((a,b)=>a.ts - b.ts).forEach(m => {
        bList.innerHTML += `<div class="bg-black/40 p-2 rounded-xl mb-1 border border-white/5"><p class="text-[9px] text-blue-400 font-black">${m.mechName} <span class="text-gray-500 font-normal float-right">${new Date(m.ts).toLocaleTimeString()}</span></p><p class="text-xs text-white mt-1">${m.text}</p></div>`;
    });
};
window.addServicioComentario = async () => {
    if(!currentDetalleServicioId) return;
    const txt = document.getElementById('servicio-comentario').value.trim(); if(!txt) return;
    await addDoc(collection(db, "rescates", currentDetalleServicioId, "bitacora"), { text: txt, mechName: window.currentUserDoc.name, ts: Date.now() });
    document.getElementById('servicio-comentario').value = ''; window.loadServicioBitacora(currentDetalleServicioId);
};

window.cambiarEstadoServicio = async (nuevoEstado) => {
    if(!currentDetalleServicioId) return;
    const docRef = doc(db, "rescates", currentDetalleServicioId); const docSnap = await getDoc(docRef); if(!docSnap.exists()) return;
    const actual = docSnap.data().tallerStatus; if(actual === 'lista' || actual === 'pagado') return showToast("No se puede cambiar, ya finalizó", true);
    
    await updateDoc(docRef, { tallerStatus: nuevoEstado });
    
    if(docSnap.data().uid) push(dbRef(rtdb, 'sos_alerts/' + docSnap.data().uid + '/notifs'), { msg: nuevoEstado === 'pruebas' ? 'CONTINUAMOS TRABAJANDO EN TU MOTO' : (nuevoEstado === 'lista' ? 'TU MOTO YA CASI ESTA LISTA, ESPERA AL MECÁNICO' : 'MOTO EN MECÁNICA') });

    playSound('notif'); showToast(`Estado cambiado a ${nuevoEstado}`); toggleModal('modal-detalle-servicio', false); window.adminListenServices();
};

// === HISTORIAL DEL CLIENTE (con detalle, descarga PDF y comentarios) ===
window.loadClientHistory = async () => {
    if(!auth.currentUser || !window.currentUserDoc) return;
    const snap = await getDocs(query(collection(db, "rescates"), where("phone", "==", window.currentUserDoc.phone)));
    const list = document.getElementById('client-history-list'); let html = '';
    snap.forEach(d => {
        const v = d.data();
        html += `<div class="bg-white/5 p-3 rounded-xl border border-white/10 flex justify-between items-center mb-2 cursor-pointer" onclick="window.openClientServiceDetail('${d.id}')">
            <span class="text-xs text-white truncate w-2/3">${v.shortId || 'Sin ID'} - ${v.falla}</span>
            <span class="text-[9px] bg-blue-600/30 text-blue-400 px-2 py-1 rounded font-bold uppercase">${v.status || 'pendiente'}</span>
        </div>`;
    });
    if(html) list.innerHTML = html;
    else list.innerHTML = '<p class="text-xs text-center text-gray-600 italic">No tienes servicios registrados.</p>';
};

window.openClientServiceDetail = async (id) => {
    const docSnap = await getDoc(doc(db, "rescates", id));
    if(!docSnap.exists()) return showToast("Servicio no encontrado", true);
    const data = docSnap.data();
    if(data.uid !== auth.currentUser.uid && data.phone !== window.currentUserDoc.phone) {
        return showToast("No tienes permiso para ver este servicio", true);
    }
    
    const detailHTML = `
        <div class="text-white space-y-2">
            <h3 class="font-black text-lg">Servicio: ${data.shortId || 'Sin ID'}</h3>
            <p class="text-xs text-gray-400">Moto: ${data.marca || ''} ${data.modelo || ''} (${data.cc || ''})</p>
            <p class="text-sm">${data.falla}</p>
            <p class="text-xs">Estado: <span class="font-bold text-naranja">${data.status}</span></p>
            ${data.tallerStatus ? `<p class="text-xs">Taller: ${data.tallerStatus}</p>` : ''}
            <p class="text-xs text-gray-500">${new Date(data.timestamp).toLocaleString()}</p>
            ${data.status === 'completed' ? `<button onclick="window.downloadClientTicket('${id}')" class="mt-2 bg-blue-600 text-white text-xs px-3 py-2 rounded-xl font-black uppercase">Descargar Ticket PDF</button>` : ''}
        </div>
    `;
    
    const modalId = 'modal-client-service-detail';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-blue-500/30 shadow-2xl" id="${modalId}-content"><button onclick="toggleModal('${modalId}', false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = `<button onclick="toggleModal('${modalId}', false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>${detailHTML}`;
    toggleModal(modalId, true);
};

window.downloadClientTicket = async (serviceId) => {
    const docSnap = await getDoc(doc(db, "rescates", serviceId));
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Comprobante de Servicio OBR", 14, 20);
    doc.setFontSize(10);
    doc.text(`Servicio: ${data.shortId || 'Sin ID'}`, 14, 30);
    doc.text(`Cliente: ${window.currentUserDoc?.name || ''}`, 14, 36);
    doc.text(`Moto: ${data.marca || ''} ${data.modelo || ''}`, 14, 42);
    doc.text(`Fecha: ${new Date(data.timestamp).toLocaleString()}`, 14, 48);
    doc.text(`Descripción: ${data.falla}`, 14, 54);
    doc.text(`Estado: ${data.status}`, 14, 60);
    if (data.costoRescateEstimado) doc.text(`Costo: $${data.costoRescateEstimado}`, 14, 66);
    doc.save(`Servicio_${data.shortId || serviceId}.pdf`);
};

// === CITAS DEL CLIENTE (modificar con aviso al taller) ===
window.loadClientCitas = async () => {
    if(!window.currentUserDoc) return;
    const snap = await getDocs(query(collection(db, "citas"), where("phone", "==", window.currentUserDoc.phone)));
    const list = document.getElementById('client-appointments-list'); if(!list) return; list.innerHTML = '';
    snap.forEach(d => { 
        const c = d.data(); 
        list.innerHTML += `<div class="bg-white/5 p-3 rounded-xl text-xs text-white border border-white/10 mb-2 flex justify-between items-center">
            <div>
                <span class="text-green-400 font-bold mr-2">${c.fecha} ${c.hora}</span>
                <span>${c.trabajo}</span>
                <p class="text-[10px] text-gray-400">${c.moto}</p>
            </div>
            <button onclick="window.clientEditCita('${d.id}')" class="bg-yellow-600/20 text-yellow-400 border border-yellow-500/50 px-2 py-1 rounded text-[9px] font-black uppercase"><i class="fas fa-edit"></i></button>
        </div>`; 
    });
    if(list.innerHTML === '') list.innerHTML = '<p class="text-gray-500 text-xs italic">Sin citas.</p>';
};

window.clientEditCita = (citaId) => {
    getDoc(doc(db, "citas", citaId)).then(snap => {
        if (!snap.exists()) return;
        const c = snap.data();
        const modalHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-yellow-500/30">
                <button onclick="toggleModal('modal-client-edit-cita', false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                <h2 class="text-xl font-black mb-4 text-white">Modificar Cita</h2>
                <p class="text-xs text-gray-400 mb-4">Los cambios se enviarán al taller para confirmación.</p>
                <input type="date" id="client-edit-cita-fecha" value="${c.fecha}" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl mb-3 text-white color-scheme-dark">
                <input type="time" id="client-edit-cita-hora" value="${c.hora}" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl mb-3 text-white color-scheme-dark">
                <textarea id="client-edit-cita-trabajo" rows="2" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl mb-3 text-white">${c.trabajo}</textarea>
                <button onclick="window.clientSubmitCitaChange('${citaId}')" class="w-full bg-yellow-600 hover:bg-yellow-500 text-white p-3 rounded-xl font-black uppercase">Enviar Solicitud de Cambio</button>
            </div>
        `;
        const modalId = 'modal-client-edit-cita';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            document.body.appendChild(modalEl);
        }
        modalEl.innerHTML = modalHTML;
        toggleModal(modalId, true);
    });
};

window.clientSubmitCitaChange = async (citaId) => {
    const fecha = document.getElementById('client-edit-cita-fecha').value;
    const hora = document.getElementById('client-edit-cita-hora').value;
    const trabajo = document.getElementById('client-edit-cita-trabajo').value.trim();
    if (!fecha || !hora || !trabajo) return showToast("Completa todos los campos", true);
    
    await addDoc(collection(db, "citas", citaId, "cambios_solicitados"), {
        fecha, hora, trabajo,
        solicitadoPor: auth.currentUser.uid,
        nombre: window.currentUserDoc.name,
        timestamp: Date.now(),
        estado: 'pendiente'
    });
    
    showToast("Solicitud enviada al taller. Te contactaremos para confirmar.");
    toggleModal('modal-client-edit-cita', false);
};

// === TIENDA Y CARRITO (vista cliente con opciones de entrega) ===
window.addToCart = (name, price) => { window.cart.push({name, price: parseFloat(price)}); window.updateCartUI(); showToast("Agregado"); };

window.updateCartUI = () => {
    const cartCount = document.getElementById('cart-count');
    if(cartCount) cartCount.innerText = window.cart.length;
    const mobileCount = document.getElementById('cart-count-mobile');
    if(mobileCount) mobileCount.innerText = window.cart.length;
    const cartItems = document.getElementById('cart-items');
    if(cartItems) cartItems.innerHTML = window.cart.map((item,i) => `<div class="flex justify-between items-center bg-white/5 p-2 rounded-lg text-white mb-1"><span class="text-xs">${item.name}</span><span class="text-naranja font-black">$${item.price.toFixed(2)} <button onclick="removeFromCart(${i})" class="text-red-500 ml-2"><i class="fas fa-times"></i></button></span></div>`).join('');
    
    let sub = window.cart.reduce((s,i)=>s+i.price,0);
    let total = sub - window.cartDescuento; if(total < 0) total = 0;
    
    const discountRow = document.getElementById('cart-discount-row');
    if(discountRow) {
        if(window.cartDescuento > 0) {
            discountRow.classList.remove('hidden');
            const discAmt = document.getElementById('cart-discount-amount');
            if(discAmt) discAmt.innerText = `-$${window.cartDescuento.toFixed(2)}`;
        } else { discountRow.classList.add('hidden'); }
    }
    const cartTotal = document.getElementById('cart-total');
    if(cartTotal) cartTotal.innerText = total.toFixed(2);
};
window.removeFromCart = i => { window.cart.splice(i,1); window.updateCartUI(); };

window.applyCartPromo = async () => {
    const code = document.getElementById('cart-promo-code')?.value.trim().toUpperCase();
    if(!code) return;
    const snap = await getDocs(query(collection(db, "promociones"), where("codigo", "==", code), where("active", "==", true), limit(1)));
    if(!snap.empty) {
        const promo = snap.docs[0].data();
        let sub = window.cart.reduce((s,i)=>s+i.price,0);
        if(promo.tipoRecompensa === 'desc_fijo') window.cartDescuento = parseFloat(promo.valorRecompensa);
        else if(promo.tipoRecompensa === 'desc_porc') window.cartDescuento = sub * (parseFloat(promo.valorRecompensa)/100);
        window.updateCartUI(); showToast("Cupón aplicado");
    } else { showToast("Cupón inválido", true); window.cartDescuento = 0; window.updateCartUI(); }
};

window.createOrder = async () => {
    if (!window.cart.length) return showToast("Carrito vacío", true);
    if (!auth.currentUser) { showToast("Inicia sesión para continuar", true); window.showView('view-login'); return; }
    
    const modalId = 'modal-order-options';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-md rounded-[2rem] p-6 relative border border-naranja/30 shadow-2xl" id="${modalId}-content"></div>`;
        document.body.appendChild(modalEl);
    }
    
    const total = parseFloat(document.getElementById('cart-total')?.innerText || '0');
    document.getElementById(`${modalId}-content`).innerHTML = `
        <button onclick="toggleModal('${modalId}', false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
        <h2 class="text-xl font-black mb-4 text-white">Opciones de entrega</h2>
        <div class="space-y-4">
            <div>
                <label class="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-1">Tipo de entrega</label>
                <select id="order-delivery-type" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white mb-3" onchange="window.toggleDeliveryAddress(this.value)">
                    <option value="recoger">Recoger en taller</option>
                    <option value="domicilio">Envío a domicilio</option>
                </select>
            </div>
            <div id="delivery-address-container" class="hidden space-y-3">
                <input id="order-address" type="text" placeholder="Dirección (calle y número)" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm">
                <input id="order-between-streets" type="text" placeholder="Entre calles" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm">
                <input id="order-alt-phone" type="tel" placeholder="Teléfono alterno" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm">
            </div>
            <div>
                <label class="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-1">Método de pago</label>
                <select id="order-payment-method" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white mb-3">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia (el taller te contactará)</option>
                    <option value="tarjeta">Tarjeta (al recibir)</option>
                </select>
            </div>
            <p class="text-xs text-gray-400">Total a pagar: <span class="text-naranja font-black">$${total.toFixed(2)}</span></p>
            <button onclick="window.finalizeOrder()" class="w-full bg-naranja hover:bg-orange-600 text-white p-4 rounded-xl font-black uppercase">Confirmar Pedido</button>
        </div>
    `;
    toggleModal(modalId, true);
};

window.toggleDeliveryAddress = (value) => {
    const container = document.getElementById('delivery-address-container');
    if (container) container.classList.toggle('hidden', value !== 'domicilio');
};

window.finalizeOrder = async () => {
    const deliveryType = document.getElementById('order-delivery-type').value;
    const paymentMethod = document.getElementById('order-payment-method').value;
    const total = parseFloat(document.getElementById('cart-total')?.innerText || '0');
    
    let address = '', betweenStreets = '', altPhone = '';
    if (deliveryType === 'domicilio') {
        address = document.getElementById('order-address')?.value.trim();
        betweenStreets = document.getElementById('order-between-streets')?.value.trim();
        altPhone = document.getElementById('order-alt-phone')?.value.trim();
        if (!address) return showToast("Ingresa la dirección de entrega", true);
    }
    
    const order = {
        uid: auth.currentUser.uid,
        items: window.cart,
        total,
        status: 'solicitado',
        timestamp: Date.now(),
        shortId: generateShortId(),
        deliveryType,
        paymentMethod,
        address,
        betweenStreets,
        altPhone,
        clientName: window.currentUserDoc.name || '',
        clientPhone: window.currentUserDoc.phone || ''
    };
    
    try {
        const docRef = await addDoc(collection(db, "pedidos"), order);
        window.cart = []; window.cartDescuento = 0; window.updateCartUI();
        toggleModal('modal-cart', false);
        toggleModal('modal-order-options', false);
        showToast("Pedido realizado. Te mantendremos informado.");
        window.loadMyOrders();
    } catch(e) {
        showToast("Error al crear pedido", true);
        console.error(e);
    }
};

window.loadMyOrders = async () => {
    if (!auth.currentUser) return;
    const snap = await getDocs(query(collection(db, "pedidos"), where("uid", "==", auth.currentUser.uid), orderBy("timestamp", "desc"), limit(10)));
    const container = document.getElementById('pedidos-list');
    if (!container) return;
    container.innerHTML = '';
    snap.forEach(doc => {
        const o = doc.data();
        container.innerHTML += `<div class="bg-white/5 p-3 rounded-xl border border-white/10">
            <div class="flex justify-between"><span class="font-bold text-sm">${o.shortId}</span><span class="text-xs capitalize">${o.status}</span></div>
            <p class="text-xs text-gray-400">${o.items.map(i=>i.name).join(', ')}</p>
            <p class="text-naranja font-black">$${o.total.toFixed(2)}</p>
            <p class="text-[10px] text-gray-400">${o.deliveryType === 'domicilio' ? 'Envío a domicilio' : 'Recoger en taller'}</p>
            ${o.status === 'pagado' ? `<button onclick="window.downloadReceipt('${doc.id}')" class="mt-1 bg-blue-600 text-white text-[10px] px-2 py-1 rounded font-bold uppercase">Descargar ticket</button>` : ''}
        </div>`;
    });
};

window.downloadReceipt = async (pedidoId) => {
    const snap = await getDoc(doc(db, "pedidos", pedidoId));
    if (!snap.exists()) return;
    const data = snap.data();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Comprobante de Pago OBR", 14, 20);
    doc.setFontSize(10);
    doc.text(`Pedido: ${data.shortId}`, 14, 30);
    doc.text(`Cliente: ${window.currentUserDoc?.name || ''}`, 14, 36);
    doc.text(`Fecha: ${new Date(data.timestamp).toLocaleString()}`, 14, 42);
    doc.text(`Tipo de entrega: ${data.deliveryType === 'domicilio' ? 'Envío a domicilio' : 'Recoger en taller'}`, 14, 48);
    if (data.address) doc.text(`Dirección: ${data.address}`, 14, 54);
    doc.text("Productos:", 14, 60);
    let y = 66;
    data.items.forEach(item => {
        doc.text(`- ${item.name}: $${item.price}`, 14, y);
        y += 6;
    });
    doc.text(`Total: $${data.total}`, 14, y+4);
    doc.save(`Ticket_${data.shortId}.pdf`);
};
// === CIERRE DE TIENDA Y CARRITO (CONTINUACIÓN) ===
window.sendContactFromModal = () => {
    const name = document.getElementById('modal-contact-name')?.value.trim();
    const phone = document.getElementById('modal-contact-phone')?.value.trim();
    const msg = document.getElementById('modal-contact-msg')?.value.trim();
    if(!name || !msg) return showToast("Nombre y mensaje requeridos", true);
    window.open(`https://wa.me/526311551533?text=${encodeURIComponent(`Hola, soy ${name}${phone ? ' ('+phone+')' : ''}. ${msg}`)}`, '_blank');
};

// ============================================================
// === CAJA / POS COMPLETO (con garantías y ventas realizadas) ===
// ============================================================
window.openCaja = () => toggleModal('modal-caja', true);
window.confirmOpenCaja = () => {
    const fondo = parseFloat(document.getElementById('caja-fondo-input')?.value) || 0;
    window.cajaAbierta = true; window.fondoInicial = fondo; window.retiros = [];
    document.getElementById('btn-open-caja')?.classList.add('hidden');
    document.getElementById('btn-close-caja')?.classList.remove('hidden');
    document.getElementById('btn-retiro')?.classList.remove('hidden');
    document.getElementById('caja-status-bar')?.classList.remove('hidden');
    const display = document.getElementById('fondo-inicial-display');
    if(display) display.innerText = fondo.toFixed(2);
    toggleModal('modal-caja', false); showToast(`Caja abierta con $${fondo.toFixed(2)}`);
};
window.closeCaja = () => { window.showAdminCorte(); };
window.addRetiro = () => toggleModal('modal-retiro', true);
window.confirmRetiro = () => {
    const monto = parseFloat(document.getElementById('retiro-monto')?.value);
    const concepto = document.getElementById('retiro-concepto')?.value.trim();
    if (!monto || !concepto) return showToast("Completa los datos", true);
    window.retiros.push({ monto, concepto, timestamp: Date.now() });
    toggleModal('modal-retiro', false); showToast(`Retiro: $${monto.toFixed(2)}`);
};

// Filtros de productos por categoría
window.posFilterProducts = () => {
    const term = document.getElementById('pos-search-input')?.value.toLowerCase() || '';
    const grid = document.getElementById('pos-product-grid');
    if(!grid) return;
    grid.innerHTML = '';
    let filtered = adminInventoryList.filter(p => {
        if (window.activePosFilter && window.activePosFilter !== 'todos') {
            if ((p.category || '') !== window.activePosFilter) return false;
        }
        return p.name.toLowerCase().includes(term) || (p.id && p.id.toLowerCase().includes(term));
    });
    filtered.forEach(p => {
        grid.innerHTML += `<div class="bg-black/30 p-3 rounded-2xl border border-white/5 flex flex-col justify-between cursor-pointer hover:border-naranja transition-all shadow-md" onclick="addAlmacenToTicket('${p.id}')">
            <div class="w-full aspect-square bg-white/5 rounded-xl mb-2 flex items-center justify-center overflow-hidden">${p.imgUrl ? `<img src="${p.imgUrl}" class="w-full h-full object-contain">` : '<i class="fas fa-box text-2xl text-gray-600"></i>'}</div>
            <p class="text-[10px] font-black text-white leading-tight mb-1 h-6 overflow-hidden">${p.name}</p>
            <div class="flex justify-between items-center"><span class="text-naranja font-black text-sm">$${p.priceTaller}</span><span class="${p.stock>0?'bg-green-600':'bg-red-600'} text-white text-[8px] px-2 py-0.5 rounded-full font-bold">${p.stock}</span></div>
        </div>`;
    });
};

window.applyPosPromoCode = async () => {
    const code = document.getElementById('pos-promo-code')?.value.trim().toUpperCase();
    if(!code) return;
    const snap = await getDocs(query(collection(db, "promociones"), where("codigo", "==", code), where("active", "==", true), limit(1)));
    if(!snap.empty) {
        const promoDoc = snap.docs[0];
        const promo = promoDoc.data();
        const maxUsos = promo.maxUsos || 0;
        const usosActuales = promo.usos || 0;
        if (maxUsos > 0 && usosActuales >= maxUsos) {
            await updateDoc(doc(db, "promociones", promoDoc.id), { active: false });
            showToast("Código agotado", true); window.posDescuento = 0; window.renderTicket(); return;
        }
        let sub = window.posTicket.reduce((s,i)=>s+i.price,0);
        if(promo.tipoRecompensa === 'desc_fijo') window.posDescuento = parseFloat(promo.valorRecompensa);
        else if(promo.tipoRecompensa === 'desc_porc') window.posDescuento = sub * (parseFloat(promo.valorRecompensa)/100);
        const nuevosUsos = usosActuales + 1;
        await updateDoc(doc(db, "promociones", promoDoc.id), { usos: nuevosUsos });
        if (maxUsos > 0 && nuevosUsos >= maxUsos) {
            await updateDoc(doc(db, "promociones", promoDoc.id), { active: false });
        }
        window.renderTicket(); showToast("Código aplicado");
    } else { showToast("Código inválido", true); window.posDescuento = 0; window.renderTicket(); }
};

window.calcPosChange = () => {
    const receivedEl = document.getElementById('pos-amount-received');
    const totalEl = document.getElementById('pos-ticket-total');
    if (!receivedEl || !totalEl) return;
    const received = parseFloat(receivedEl.value) || 0;
    const total = parseFloat(totalEl.innerText.replace('$',''));
    let change = received - total; if(change < 0) change = 0;
    const changeEl = document.getElementById('pos-change');
    if (changeEl) changeEl.innerText = `$${change.toFixed(2)}`;
};

window.togglePosReceivedInput = () => {
    const method = document.getElementById('pos-payment-method')?.value;
    const receivedContainer = document.getElementById('pos-received-container');
    if (receivedContainer) receivedContainer.style.display = method === 'Efectivo' ? 'flex' : 'none';
    if(method !== 'Efectivo') {
        const changeEl = document.getElementById('pos-change');
        if (changeEl) changeEl.innerText = "$0.00";
        // Ahora el folio de tarjeta es opcional, no forzamos modal
    }
};

window.renderTicket = () => {
    const list = document.getElementById('pos-ticket-list');
    if (!list) return;
    window.posTotal = 0; window.posTotalCost = 0; let html = '';
    window.posTicket.forEach((item, i) => {
        window.posTotal += item.price; window.posTotalCost += item.cost || 0;
        html += `<div class="flex justify-between items-center text-black border-b border-dashed border-gray-200 pb-2 mb-2">
            <div class="flex flex-col w-2/3"><span class="text-[10px] font-bold truncate">${item.name}</span><span class="text-[8px] text-gray-500 uppercase">${item.type==='almacen'?'Almacén':'Servicio'}</span></div>
            <div class="flex items-center space-x-2"><span class="font-black text-xs">$${item.price.toFixed(2)}</span><button onclick="removeTicketItem(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-times-circle"></i></button></div></div>`;
    });
    if(!window.posTicket.length) html = '<p class="text-gray-400 text-xs italic text-center mt-10">Agrega productos al ticket</p>';
    list.innerHTML = html; 
    
    let realTotal = window.posTotal - (window.posDescuento || 0); if(realTotal < 0) realTotal = 0;
    const sub = realTotal / 1.16; const iva = realTotal - sub;

    const discountRow = document.getElementById('pos-discount-row');
    if(discountRow) {
        if(window.posDescuento > 0) {
            discountRow.classList.remove('hidden');
            const discountAmount = document.getElementById('pos-discount-amount');
            if(discountAmount) discountAmount.innerText = `-$${window.posDescuento.toFixed(2)}`;
        } else { discountRow.classList.add('hidden'); }
    }

    const subEl = document.getElementById('pos-subtotal');
    const ivaEl = document.getElementById('pos-iva');
    const totalEl = document.getElementById('pos-ticket-total');
    const btnTotalEl = document.getElementById('pos-btn-total');
    if(subEl) subEl.innerText = `$${sub.toFixed(2)}`;
    if(ivaEl) ivaEl.innerText = `$${iva.toFixed(2)}`;
    if(totalEl) totalEl.innerText = `$${realTotal.toFixed(2)}`;
    if(btnTotalEl) btnTotalEl.innerText = `$${realTotal.toFixed(2)}`;
    window.calcPosChange();
};

window.removeTicketItem = i => { window.posTicket.splice(i,1); window.renderTicket(); };
window.addAlmacenToTicket = (id) => {
    const p = adminInventoryList.find(x => x.id === id);
    if(p && p.stock > 0) {
        // Preguntar garantía si es producto de almacén
        const garantia = prompt("Garantía para este producto:\n(Dejar vacío = Sin garantía, o escribe: 15 días, 1 mes, 2 meses, 3 meses, No aplica)", "");
        window.posTicket.push({ type: 'almacen', id: p.id, name: p.name, price: p.priceTaller, cost: p.cost, garantia: garantia || 'Sin garantía' });
        window.renderTicket(); showToast("Agregado");
    }
    else if(p) showToast("Sin stock", true);
};

window.processManualCharge = () => {
    const descEl = document.getElementById('manual-charge-desc');
    const priceEl = document.getElementById('manual-charge-price');
    const desc = descEl?.value.trim();
    const price = parseFloat(priceEl?.value);
    if(!desc || isNaN(price)) return showToast("Falta concepto o precio", true);
    window.posTicket.push({ type: 'manual', name: desc, price, cost: 0 });
    if(descEl) descEl.value = '';
    if(priceEl) priceEl.value = '';
    toggleModal('modal-manual-charge', false); window.renderTicket();
};

window.processScannerInput = async () => {
    const idEl = document.getElementById('scanner-id-input');
    const id = idEl?.value.trim().toUpperCase();
    if(!id) return showToast("Escribe un ID", true);
    const btn = document.querySelector('#modal-scanner-input button');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...'; }
    try {
        const snap = await getDocs(query(collection(db, "rescates"), where("shortId", "==", id), limit(1)));
        if(!snap.empty) {
            const data = snap.docs[0].data();
            window.posTicket.push({ type: 'rescate', id: snap.docs[0].id, name: `Servicio OBR ${data.shortId}`, price: data.costoRescateEstimado || 0, cost: 0 });
            window.renderTicket(); showToast("Servicio cargado a caja");
            toggleModal('modal-scanner-input', false);
            if(idEl) idEl.value = '';
        } else showToast("Servicio no encontrado", true);
    } catch(e) { showToast("Error de red", true); }
    finally { if(btn) { btn.disabled = false; btn.innerHTML = 'Buscar / Cobrar'; } }
};

// ===== FINALIZAR CHECKOUT (con impresión automática y garantías) =====
window.checkoutTicket = async (isCard = false) => {
    if(!window.posTicket.length) return showToast("El ticket está vacío", true);
    if(!window.cajaAbierta) return showToast("Abrir caja primero", true);
    const totalToPay = parseFloat(document.getElementById('pos-ticket-total')?.innerText?.replace('$','')) || 0;
    const paymentMethod = document.getElementById('pos-payment-method')?.value || 'Efectivo';
    if (paymentMethod === 'Efectivo') {
        const received = parseFloat(document.getElementById('pos-amount-received')?.value) || 0;
        if (received < totalToPay) return showToast("Monto recibido insuficiente", true);
    }
    const phone = document.getElementById('pos-customer-phone')?.value.trim() || '';
    if (phone) {
        const userSnap = await getDocs(query(collection(db, "users"), where("phone", "==", "+52"+phone), limit(1)));
        if (!userSnap.empty) {
            const name = userSnap.docs[0].data().name;
            const waNameEl = document.getElementById('wa-client-name');
            if(waNameEl) waNameEl.innerText = name;
            window._pendingCheckout = { isCard, totalToPay, paymentMethod, phone };
            toggleModal('modal-whatsapp-confirm', true);
            return;
        }
    }
    await finalizeCheckout(isCard, totalToPay, paymentMethod, phone);
};

window.confirmWhatsAppSend = async (confirmed) => {
    toggleModal('modal-whatsapp-confirm', false);
    if (confirmed && window._pendingCheckout) {
        const { isCard, totalToPay, paymentMethod, phone } = window._pendingCheckout;
        await finalizeCheckout(isCard, totalToPay, paymentMethod, phone);
    }
};

async function finalizeCheckout(isCard, totalToPay, paymentMethod, phone) {
    const btn = document.getElementById('btn-checkout-pos');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';
    }
    
    try {
        const sId = generateShortId();
        // Recoger garantías de los productos de almacén
        const garantias = window.posTicket
            .filter(item => item.type === 'almacen' && item.garantia && item.garantia !== 'Sin garantía' && item.garantia !== 'No aplica')
            .map(item => ({
                productoId: item.id,
                producto: item.name,
                tipoGarantia: item.garantia,
                fechaInicio: new Date().toISOString(),
                fechaFin: window.calcularFechaFinGarantia(item.garantia),
                estado: 'activa'
            }));

        const saleData = {
            shortId: sId,
            desc: window.posTicket.map(i => i.name).join(", "),
            total: totalToPay,
            costo: window.posTotalCost,
            metodoPago: paymentMethod,
            clienteCel: phone ? "+52"+phone : null,
            ticket: window.posTicket,
            garantias: garantias.length ? garantias : null,
            fecha: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, "ventas"), saleData);

        // Guardar garantías en colección aparte si existen
        for (let g of garantias) {
            await addDoc(collection(db, "garantias"), {
                ...g,
                ventaId: docRef.id,
                clienteCel: phone ? "+52"+phone : null,
                fechaVenta: new Date().toISOString()
            });
        }

        // Descontar stock
        for(let item of window.posTicket) {
            try {
                if(item.type === 'almacen') {
                    const pData = adminInventoryList.find(x => x.id === item.id);
                    if(pData && pData.stock > 0) {
                        await updateDoc(doc(db, "inventario", item.id), { stock: pData.stock - 1 });
                    }
                }
                if(item.type === 'rescate') {
                    await updateDoc(doc(db, "rescates", item.id), { tallerStatus: 'pagado', status: 'completed' });
                }
            } catch (innerError) {
                console.warn('Error al actualizar inventario/rescate:', innerError);
            }
        }

        // Vincular pedido del cliente si existe
        if (phone) {
            try {
                const userSnap = await getDocs(query(collection(db, "users"), where("phone", "==", "+52"+phone), limit(1)));
                if (!userSnap.empty) {
                    const uid = userSnap.docs[0].id;
                    const pedidosSnap = await getDocs(query(collection(db, "pedidos"), where("uid", "==", uid), where("status", "==", "solicitado"), orderBy("timestamp", "desc"), limit(1)));
                    if (!pedidosSnap.empty) {
                        await updateDoc(doc(db, "pedidos", pedidosSnap.docs[0].id), { status: 'pagado' });
                    }
                }
            } catch (e) {
                console.warn('Error al vincular pedido:', e);
            }
        }

        showToast("Venta Registrada y Pagada", false);

        // Imprimir ticket automáticamente (PDF)
        window.imprimirTicketVenta(docRef.id, saleData);

        // Respaldo del ticket para WhatsApp
        const ticketRespaldo = [...window.posTicket];
        
        // LIMPIAR TODO para nueva venta
        window.posTicket = [];
        window.posDescuento = 0;
        const phoneInput = document.getElementById('pos-customer-phone');
        const promoInput = document.getElementById('pos-promo-code');
        const amountInput = document.getElementById('pos-amount-received');
        if (phoneInput) phoneInput.value = '';
        if (promoInput) promoInput.value = '';
        if (amountInput) amountInput.value = '';

        window.renderTicket();
        window.adminLoadInventory();
        if (typeof window.adminLoadSales === 'function') window.adminLoadSales();
        window.adminListenServices();
        if (typeof window.openSaleDetails === 'function') window.openSaleDetails(docRef.id, saleData);
        if (phone) {
            try {
                window.sendTicketWhatsAppAfterCheckout(phone, totalToPay, ticketRespaldo);
            } catch (e) {
                console.warn('Error al enviar WhatsApp:', e);
            }
        }
        // Actualizar ventas realizadas
        window.loadVentasRealizadas();

    } catch (e) {
        console.error('Error en finalizeCheckout:', e);
        showToast("Error al procesar: " + (e.message || 'Error desconocido'), true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>Cobrar</span> <span id="pos-btn-total">$0.00</span>`;
        }
    }
}

// Función auxiliar para calcular fecha de fin de garantía
window.calcularFechaFinGarantia = (tipo) => {
    if (!tipo || tipo === 'Sin garantía' || tipo === 'No aplica') return null;
    const ahora = new Date();
    const match = tipo.match(/(\d+)\s*(días|dias|mes|meses)/i);
    if (match) {
        const cantidad = parseInt(match[1]);
        if (match[2].toLowerCase().includes('día') || match[2].toLowerCase().includes('dia')) {
            ahora.setDate(ahora.getDate() + cantidad);
        } else if (match[2].toLowerCase().includes('mes')) {
            ahora.setMonth(ahora.getMonth() + cantidad);
        }
        return ahora.toISOString();
    }
    return null;
};

// Imprimir ticket de venta en PDF automáticamente
window.imprimirTicketVenta = (ventaId, saleData) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("COMPROBANTE DE VENTA OBR", 14, 20);
    doc.setFontSize(8);
    doc.text(`Ticket: ${saleData.shortId}`, 14, 28);
    doc.text(`Fecha: ${new Date(saleData.fecha).toLocaleString()}`, 14, 33);
    doc.text(`Método de pago: ${saleData.metodoPago}`, 14, 38);
    if (saleData.clienteCel) doc.text(`Cliente: ${saleData.clienteCel}`, 14, 43);
    doc.setFontSize(10);
    doc.text("Productos:", 14, 50);
    let y = 57;
    saleData.ticket.forEach(item => {
        doc.text(`- ${item.name}: $${item.price.toFixed(2)} ${item.garantia ? '(Garantía: '+item.garantia+')' : ''}`, 14, y);
        y += 7;
    });
    doc.text(`Total: $${saleData.total.toFixed(2)}`, 14, y+5);
    doc.setFontSize(7);
    doc.text("Gracias por su compra. Conserve este ticket para garantías.", 14, y+12);
    // Guardar automáticamente sin pedir confirmación (el navegador puede bloquear popups múltiples)
    try {
        doc.save(`Venta_${saleData.shortId}.pdf`);
    } catch(e) { console.warn('Auto-impresión bloqueada por el navegador'); }
};

window.sendTicketWhatsAppAfterCheckout = (phone, total, ticketItems) => {
    if (!ticketItems || !ticketItems.length) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const items = ticketItems.map(i => `- ${i.name}: $${i.price}`).join('\n');
    const msg = `🧾 *Ticket OBR*\n${items}\n\n*Total: $${total}*`;
    const url = `https://api.whatsapp.com/send?phone=+52${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

// Listener del input para mostrar/ocultar botón WhatsApp
const phoneInputListener = document.getElementById('pos-customer-phone');
if (phoneInputListener) {
    phoneInputListener.addEventListener('input', function() {
        const waBtn = document.getElementById('wa-ticket-btn');
        if (waBtn) waBtn.style.display = this.value.trim() ? 'block' : 'none';
    });
}

// ==================================
// === VENTAS REALIZADAS (reimprimir) ===
// ==================================
window.loadVentasRealizadas = async () => {
    const container = document.getElementById('ventas-realizadas-list');
    if (!container) return;
    const snap = await getDocs(query(collection(db, "ventas"), orderBy("fecha", "desc"), limit(30)));
    container.innerHTML = '';
    snap.forEach(docSnap => {
        const v = docSnap.data();
        container.innerHTML += `<div class="bg-white/5 border border-white/10 p-3 rounded-xl text-xs text-white flex justify-between items-center mb-2">
            <div>
                <span class="font-bold">${v.shortId}</span> - ${new Date(v.fecha).toLocaleDateString()}
                <p class="text-gray-400">${v.desc?.substring(0,40)}</p>
                <p class="text-naranja font-black">$${v.total?.toFixed(2)}</p>
            </div>
            <div>
                <button onclick="window.reimprimirVenta('${docSnap.id}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase">Reimprimir</button>
                ${v.garantias ? `<button onclick="window.verGarantiasVenta('${docSnap.id}')" class="bg-green-600 text-white px-2 py-1 rounded text-[9px] font-bold uppercase mt-1">Garantías</button>` : ''}
            </div>
        </div>`;
    });
};

window.reimprimirVenta = async (ventaId) => {
    const snap = await getDoc(doc(db, "ventas", ventaId));
    if (!snap.exists()) return showToast("Venta no encontrada", true);
    window.imprimirTicketVenta(ventaId, snap.data());
};

window.verGarantiasVenta = async (ventaId) => {
    const snap = await getDocs(query(collection(db, "garantias"), where("ventaId", "==", ventaId)));
    if (snap.empty) return showToast("Sin garantías registradas", true);
    let html = '';
    snap.forEach(d => {
        const g = d.data();
        const estadoColor = g.estado === 'activa' ? 'text-green-400' : (g.estado === 'vencida' ? 'text-red-400' : 'text-gray-400');
        html += `<div class="bg-white/5 p-2 rounded text-xs text-white mb-1">
            <p><span class="font-bold">${g.producto}</span> - ${g.tipoGarantia}</p>
            <p class="${estadoColor}">Estado: ${g.estado}</p>
            <p class="text-gray-400">Vence: ${g.fechaFin ? new Date(g.fechaFin).toLocaleDateString() : 'N/A'}</p>
        </div>`;
    });
    const modalId = 'modal-garantias-venta';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-green-500/30" id="${modalId}-content"></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = `<button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button><h3 class="text-lg font-black text-white mb-3">Garantías de la Venta</h3>${html}`;
    toggleModal(modalId, true);
};

// ======================
// === GESTIÓN DE GARANTÍAS ===
// ======================
window.loadGarantias = async () => {
    const container = document.getElementById('garantias-list');
    if (!container) return;
    const ahora = new Date();
    const snap = await getDocs(collection(db, "garantias"));
    // Actualizar estados vencidos
    const batch = [];
    snap.forEach(d => {
        const g = d.data();
        if (g.estado === 'activa' && g.fechaFin && new Date(g.fechaFin) < ahora) {
            batch.push(updateDoc(doc(db, "garantias", d.id), { estado: 'vencida' }));
        }
    });
    if (batch.length) await Promise.all(batch);
    
    // Recargar
    const snapActualizado = await getDocs(collection(db, "garantias"));
    container.innerHTML = '';
    snapActualizado.forEach(d => {
        const g = d.data();
        const estadoColor = g.estado === 'activa' ? 'text-green-400' : (g.estado === 'vencida' ? 'text-red-400' : 'text-gray-400');
        container.innerHTML += `<div class="bg-white/5 border border-white/10 p-3 rounded-xl text-xs text-white">
            <div class="flex justify-between">
                <span class="font-bold">${g.producto}</span>
                <span class="${estadoColor} font-black uppercase">${g.estado}</span>
            </div>
            <p class="text-gray-400">Garantía: ${g.tipoGarantia} | Vence: ${g.fechaFin ? new Date(g.fechaFin).toLocaleDateString() : 'N/A'}</p>
            ${g.ventaId ? `<p class="text-gray-500">Venta: ${g.ventaId}</p>` : ''}
        </div>`;
    });
};

// ==================================
// === GESTIÓN DE COBROS PENDIENTES DE MECÁNICOS ===
// ==================================
window.loadMechPendingCharges = async () => {
    if (!auth.currentUser || window.currentUserDoc?.role !== 'mecanico') return;
    const snap = await getDocs(query(collection(db, "cobros_pendientes"), 
        where("mech_uid", "==", auth.currentUser.uid),
        where("estado", "==", "pendiente")
    ));
    const container = document.getElementById('mech-pending-charges');
    if (!container) return;
    container.innerHTML = '';
    let totalPendiente = 0;
    snap.forEach(d => {
        const c = d.data();
        totalPendiente += c.monto || 0;
        container.innerHTML += `<div class="bg-yellow-600/20 border border-yellow-500/30 p-3 rounded-xl text-xs text-white flex justify-between items-center">
            <div>
                <p class="font-bold">${c.concepto || 'Refacción vendida'}</p>
                <p class="text-[10px] text-gray-400">Cliente: ${c.clienteCel || 'N/A'}</p>
            </div>
            <div class="text-right">
                <p class="text-yellow-400 font-black">$${c.monto.toFixed(2)}</p>
                <button onclick="window.markMechChargeAsPaid('${d.id}')" class="text-[8px] bg-green-600 text-white px-2 py-0.5 rounded font-bold uppercase mt-1">Pagado al taller</button>
            </div>
        </div>`;
    });
    const totalEl = document.getElementById('mech-total-pending');
    if (totalEl) totalEl.innerText = `$${totalPendiente.toFixed(2)}`;
};

window.markMechChargeAsPaid = async (cobroId) => {
    await updateDoc(doc(db, "cobros_pendientes", cobroId), { estado: 'pagado', fechaPago: new Date().toISOString() });
    showToast("Marcado como pagado al taller");
    window.loadMechPendingCharges();
};

window.renderPendingMechanicPayments = async () => {
    const container = document.getElementById('admin-pending-mech-payments');
    if (!container) return;
    const snap = await getDocs(query(collection(db, "cobros_pendientes"), where("estado", "==", "pendiente")));
    container.innerHTML = '<h4 class="text-yellow-400 font-black text-xs uppercase tracking-widest mb-2"><i class="fas fa-hand-holding-usd mr-1"></i> Cobros pendientes de mecánicos</h4>';
    snap.forEach(d => {
        const c = d.data();
        container.innerHTML += `<div class="bg-yellow-600/20 border border-yellow-500/30 p-2 rounded-xl text-xs text-white flex justify-between items-center mb-1">
            <div>
                <p class="font-bold">${c.mech_name || 'Mecánico'}</p>
                <p class="text-[10px] text-gray-400">${c.concepto}</p>
            </div>
            <p class="text-yellow-400 font-black">$${c.monto.toFixed(2)}</p>
        </div>`;
    });
};

// === INVENTARIO Y PRODUCTOS ===
window.adminLoadInventory = async () => {
    try {
        const snap = await getDocs(collection(db, "inventario"));
        adminInventoryList = [];
        let listHtml = '';
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            adminInventoryList.push(d);
            // Construir el texto de precio con tachado si hay descuento activo (menor que pricePublic original)
            let precioHtml = `$${d.pricePublic?.toFixed(2)}`;
            if (d.originalPrice && d.originalPrice > d.pricePublic) {
                precioHtml = `<span class="line-through text-gray-500 text-xs mr-1">$${d.originalPrice.toFixed(2)}</span><span class="text-naranja font-black text-lg">$${d.pricePublic.toFixed(2)}</span>`;
            } else {
                precioHtml = `<span class="text-naranja font-black text-lg">$${d.pricePublic?.toFixed(2)}</span>`;
            }
            listHtml += `<div class="bg-white/5 p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between" onclick="window.openProductDetail?.('${doc.id}')">
                <div>
                    <p class="text-white font-bold text-sm mb-1">${d.name}</p>
                    <p class="text-naranja font-black text-lg">${precioHtml}</p>
                </div>
                <div class="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                    <span class="text-xs text-gray-400">Stock: <b class="${d.stock>0?'text-green-400':'text-red-500'}">${d.stock}</b></span>
                    ${d.category ? `<span class="text-[10px] text-gray-500 uppercase bg-white/5 px-2 py-0.5 rounded">${d.category}</span>` : ''}
                </div>
            </div>`;
        });
        const listEl = document.getElementById('admin-inventory-list');
        if (listEl) listEl.innerHTML = listHtml || '<p class="text-gray-500 text-xs col-span-full">Sin productos</p>';
        window.posFilterProducts();
    } catch(e) {}
};

window.adminAddProduct = async () => {
    const name = document.getElementById('inv-name')?.value.trim();
    if(!name) return showToast("Falta el Nombre Comercial", true);
    const taller = document.getElementById('inv-price-taller')?.value;
    const member = document.getElementById('inv-price-member')?.value;
    const publicPrice = document.getElementById('inv-price-public')?.value;
    if (!taller || !member || !publicPrice) return showToast("Completa los tres precios de venta", true);
    const btn = document.querySelector('#a-view-inventario button.bg-green-600');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...'; }
    let mediaUrl = "";
    const category = document.getElementById('inv-category')?.value || '';
    try {
        const fileInput = document.getElementById('inv-image');
        if (fileInput && fileInput.files.length > 0) { 
            const file = fileInput.files[0];
            mediaUrl = await uploadWithTimeout(file, `inventario/${Date.now()}_${file.name}`);
        }
        // Guardar también el precio original para descuentos futuros
        const originalPrice = parseFloat(publicPrice);
        await addDoc(collection(db, "inventario"), { 
            name, 
            desc: document.getElementById('inv-desc')?.value.trim() || '', 
            stock: parseInt(document.getElementById('inv-stock')?.value) || 0, 
            cost: parseFloat(document.getElementById('inv-cost')?.value) || 0, 
            priceTaller: parseFloat(taller), 
            priceMember: parseFloat(member), 
            pricePublic: originalPrice, 
            originalPrice: originalPrice, // para restauraciones
            category,
            imgUrl: mediaUrl, 
            timestamp: Date.now() 
        });
        showToast("Producto agregado"); 
        ['inv-name','inv-desc','inv-stock','inv-cost','inv-price-taller','inv-price-member','inv-price-public'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        }); 
        if(fileInput) fileInput.value = ''; 
        const catEl = document.getElementById('inv-category');
        if(catEl) catEl.value = '';
        window.adminLoadInventory(); loadPublicStore();
    } catch(e) { showToast("Error al agregar", true); } finally { 
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save mr-2"></i>Guardar en Almacén'; }
    }
};

window.openProductDetail = (id) => {
    const p = adminInventoryList.find(x => x.id === id);
    if(p) {
        let precioHtml = `$${p.pricePublic?.toFixed(2)}`;
        if (p.originalPrice && p.originalPrice > p.pricePublic) {
            precioHtml = `<span class="line-through text-gray-400">$${p.originalPrice.toFixed(2)}</span> <span class="text-naranja font-black text-xl">$${p.pricePublic.toFixed(2)}</span>`;
        }
        document.getElementById('product-detail-content').innerHTML = `<img src="${p.imgUrl}" class="w-full h-48 object-contain rounded-xl mb-3"><h3 class="text-lg font-black">${p.name}</h3><p class="text-xs text-gray-400">${p.desc || ''}</p><p class="text-naranja font-black text-xl mt-2">${precioHtml}</p><p class="text-xs">Stock: ${p.stock}</p>`;
        toggleModal('modal-product-detail', true);
    }
};

// === PROMOCIONES Y DESCUENTOS (con lista de productos con descuento) ===
window.populatePromoProductSelect = () => {
    const select = document.getElementById('promo-product-select');
    if (!select) return;
    select.innerHTML = '<option value="">Selecciona del almacén...</option>';
    const productsWithStock = adminInventoryList.filter(p => p.stock > 0);
    productsWithStock.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.name} ($${p.pricePublic})</option>`;
    });
};

window.adminApplyPromo = async () => {
    const productId = document.getElementById('promo-product-select')?.value;
    if (!productId) return showToast("Selecciona un producto", true);
    const type = document.getElementById('promo-type')?.value;
    const discount = parseFloat(document.getElementById('promo-discount')?.value);
    if (isNaN(discount)) return showToast("Ingresa un valor válido", true);
    const productRef = doc(db, "inventario", productId);
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) return showToast("Producto no encontrado", true);
    const product = productSnap.data();
    const originalPrice = product.originalPrice || product.pricePublic;
    let newPrice;
    if (type === 'percent') {
        newPrice = originalPrice * (1 - discount / 100);
    } else {
        newPrice = discount; // precio fijo
    }
    await updateDoc(productRef, { pricePublic: newPrice, originalPrice: originalPrice });
    showToast(`Descuento aplicado: ahora $${newPrice.toFixed(2)}`);
    window.adminLoadInventory();
    loadPublicStore();
    // Refrescar lista de productos con descuento en panel lateral
    window.renderDiscountedProductsList();
};

// Lista lateral de productos con descuento
window.renderDiscountedProductsList = () => {
    const container = document.getElementById('discounted-products-list');
    if (!container) return;
    const discounted = adminInventoryList.filter(p => p.originalPrice && p.originalPrice > p.pricePublic);
    container.innerHTML = '';
    if (discounted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Ningún producto con descuento</p>';
        return;
    }
    discounted.forEach(p => {
        container.innerHTML += `<div class="bg-purple-600/10 border border-purple-500/20 p-2 rounded-xl text-xs text-white flex justify-between items-center mb-1">
            <div>
                <span class="font-bold">${p.name}</span>
                <p><span class="line-through text-gray-400">$${p.originalPrice.toFixed(2)}</span> → <span class="text-green-400 font-black">$${p.pricePublic.toFixed(2)}</span></p>
            </div>
            <button onclick="window.removeProductDiscount('${p.id}')" class="text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
        </div>`;
    });
};

window.removeProductDiscount = async (productId) => {
    const p = adminInventoryList.find(x => x.id === productId);
    if (!p) return;
    await updateDoc(doc(db, "inventario", productId), { pricePublic: p.originalPrice, originalPrice: null });
    showToast("Descuento eliminado. Precio restaurado.");
    window.adminLoadInventory();
    loadPublicStore();
    window.renderDiscountedProductsList();
};

// === ADMIN LEALTAD Y CÓDIGOS ===
window.adminSaveLoyalty = async () => {
    const code = document.getElementById('loyalty-code')?.value.trim().toUpperCase();
    if (!code) return showToast("Ingresa un código", true);
    const condition = document.getElementById('loyalty-condition')?.value;
    const rewardType = document.getElementById('loyalty-reward-type')?.value;
    const rewardVal = document.getElementById('loyalty-reward-val')?.value.trim();
    const audience = document.getElementById('loyalty-audience')?.value;
    const maxUsos = parseInt(document.getElementById('loyalty-max-usos')?.value) || 0;
    if (!rewardVal) return showToast("Valor de recompensa requerido", true);
    await addDoc(collection(db, "promociones"), {
        codigo: code,
        tipoRecompensa: rewardType,
        valorRecompensa: rewardVal,
        active: true,
        maxUsos: maxUsos,
        usos: 0,
        condition,
        audience,
        timestamp: Date.now()
    });
    showToast("Promoción activada");
    window.adminLoadLoyalty();
};

window.adminLoadLoyalty = async () => {
    const snap = await getDocs(collection(db, "promociones"));
    const list = document.getElementById('admin-loyalty-list');
    if (!list) return;
    list.innerHTML = '';
    snap.forEach(docSnap => {
        const promo = docSnap.data();
        const maxUsos = promo.maxUsos || 0;
        const usos = promo.usos || 0;
        const limiteTexto = maxUsos > 0 ? `${usos}/${maxUsos}` : `${usos}/∞`;
        list.innerHTML += `<div class="flex justify-between items-center bg-white/5 p-2 rounded-xl text-white text-xs">
            <div class="flex-1">
                <span class="font-bold">${promo.codigo}</span>
                <span class="text-gray-400 ml-2">${promo.tipoRecompensa}: ${promo.valorRecompensa}</span>
            </div>
            <span class="text-[10px]">${limiteTexto}</span>
            <div class="flex space-x-1 ml-2">
                <button onclick="window.togglePromoActive('${docSnap.id}', ${!promo.active})" class="text-xs px-2 py-0.5 rounded ${promo.active ? 'bg-yellow-600' : 'bg-green-600'} text-white">${promo.active ? 'Pausar' : 'Activar'}</button>
                <button onclick="window.deletePromo('${docSnap.id}')" class="text-xs px-2 py-0.5 rounded bg-red-600 text-white">Eliminar</button>
            </div>
        </div>`;
    });
};

window.togglePromoActive = async (promoId, active) => {
    await updateDoc(doc(db, "promociones", promoId), { active });
    window.adminLoadLoyalty();
};

window.deletePromo = async (promoId) => {
    await deleteDoc(doc(db, "promociones", promoId));
    showToast("Promoción eliminada");
    window.adminLoadLoyalty();
};

// === VIDEO BANNER ===
window.renderVideoScheduleDays = () => {
    const container = document.getElementById('video-schedule-days');
    if (!container) return;
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let html = '';
    dias.forEach((dia, index) => {
        const current = globalSettings.videoSchedule && globalSettings.videoSchedule[index] ? globalSettings.videoSchedule[index] : '';
        html += `<div class="video-day-row">
            <p class="font-bold text-xs text-white mb-1">${dia}</p>
            <input type="file" accept="video/*" class="w-full text-xs text-gray-400 file:bg-naranja file:text-white file:border-0 file:rounded-md file:px-2 file:py-1" onchange="window.handleVideoFile(this, ${index})" />
            <p class="text-[9px] text-gray-500 mt-1 truncate">${current ? current : 'Sin video asignado'}</p>
        </div>`;
    });
    container.innerHTML = html;
};

window.handleVideoFile = (input, dayIndex) => {
    if (input.files && input.files[0]) {
        if (!globalSettings.videoSchedule) globalSettings.videoSchedule = {};
        globalSettings.videoSchedule[dayIndex] = input.files[0].name;
    }
};

window.saveVideoSchedule = async () => {
    await setDoc(doc(db, "settings", "general"), { videoSchedule: globalSettings.videoSchedule }, { merge: true });
    showToast("Programación de videos guardada");
    toggleModal('modal-video-schedule', false);
};

// === AJUSTES GENERALES (GUARDAR) ===
window.adminSaveConfig = async () => {
    const mode = document.getElementById('config-price-mode')?.value;
    const basePrice = parseFloat(document.getElementById('config-base-price')?.value) || 0;
    const kmExtra = parseFloat(document.getElementById('config-km-extra')?.value) || 0;
    const radius = parseFloat(document.getElementById('config-radius')?.value) || 15;
    const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const schedule = {};
    days.forEach((day, i) => {
        const openEl = document.getElementById(`sch-${i}-o`);
        const closeEl = document.getElementById(`sch-${i}-c`);
        schedule[i] = {
            o: openEl ? openEl.value : "08:00",
            c: closeEl ? closeEl.value : "20:00"
        };
    });
    globalSettings.priceMode = mode;
    globalSettings.rescueBase = basePrice;
    globalSettings.rescueKmExtra = kmExtra;
    globalSettings.radiusKm = radius;
    globalSettings.schedule = schedule;
    await setDoc(doc(db, "settings", "general"), globalSettings, { merge: true });
    showToast("Ajustes guardados");
    if (adminGeoMap) {
        adminGeoMap.setView([TALLER_LAT, TALLER_LNG], 13);
        if (adminGeoCircle) {
            adminGeoCircle.setRadius(radius * 1000);
            const circleBounds = adminGeoCircle.getBounds();
            if (circleBounds.isValid()) adminGeoMap.fitBounds(circleBounds, { padding: [30,30] });
        }
    }
    updateLandingStatus();
};

window.set24HSchedule = async () => {
    const days = ['L','M','X','J','V','S','D'];
    const newSchedule = {};
    days.forEach((_, i) => {
        newSchedule[i] = { o: "00:00", c: "23:59" };
        const openEl = document.getElementById(`sch-${i}-o`);
        const closeEl = document.getElementById(`sch-${i}-c`);
        if(openEl) openEl.value = "00:00";
        if(closeEl) closeEl.value = "23:59";
    });
    globalSettings.schedule = newSchedule;
    await setDoc(doc(db, "settings", "general"), { schedule: newSchedule }, { merge: true });
    showToast("Horario 24 horas activado");
    updateLandingStatus();
};

// === CATÁLOGO DE SERVICIOS (con descripción IA) ===
window.adminAddService = async () => {
    const name = document.getElementById('new-service-name')?.value.trim();
    const price = parseFloat(document.getElementById('new-service-price')?.value);
    const desc = document.getElementById('new-service-desc')?.value.trim();
    if (!name || isNaN(price)) return showToast("Nombre y precio requeridos", true);
    await addDoc(collection(db, "servicios"), { name, price, desc });
    showToast("Servicio agregado");
    document.getElementById('new-service-name').value = '';
    document.getElementById('new-service-price').value = '';
    document.getElementById('new-service-desc').value = '';
    loadServicesCatalog();
    const catalogList = document.getElementById('admin-service-catalog');
    if (catalogList) {
        const snap = await getDocs(collection(db, "servicios"));
        catalogList.innerHTML = '';
        snap.forEach(d => {
            const s = d.data();
            catalogList.innerHTML += `<div class="flex justify-between bg-white/5 p-2 rounded text-xs"><span>${s.name}</span><span>$${s.price}</span></div>`;
        });
    }
};

// === ADMIN USUARIOS Y DETALLE DE CLIENTES / STAFF ===
window.adminAddUser = async () => {
    const phone = document.getElementById('add-user-phone')?.value.trim();
    const name = document.getElementById('add-user-name')?.value.trim();
    const role = document.getElementById('add-user-role')?.value;
    if (!phone || !name) return showToast("Completa celular y nombre", true);
    const fakeEmail = `${phone}@motorescateobr.com`;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, '123456');
        await setDoc(doc(db, "users", userCredential.user.uid), { phone: "+52"+phone, name, role, pwd: '123456', firstLogin: true });
        showToast('Usuario creado. Deberá cambiar contraseña en su primer inicio.');
        window.adminLoadUsers();
        await signOut(auth);
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') showToast("Ese celular ya existe", true);
        else showToast("Error al crear", true);
    }
};

window.adminLoadUsers = async () => {
    const snap = await getDocs(collection(db, "users"));
    const normalList = document.getElementById('admin-users-normal-list');
    const vipList = document.getElementById('admin-users-vip-list');
    const staffList = document.getElementById('admin-users-staff-list');
    if (normalList) normalList.innerHTML = '';
    if (vipList) vipList.innerHTML = '';
    if (staffList) staffList.innerHTML = '';
    snap.forEach(d => {
        const u = d.data();
        const card = `<div class="bg-white/5 p-2 rounded-xl text-white text-xs flex justify-between items-center cursor-pointer" onclick="window.openUserDetail('${d.id}')">
            <span>${u.name || u.phone}</span><span class="text-naranja">${u.role}</span>
        </div>`;
        if (u.role === 'cliente' && normalList) normalList.innerHTML += card;
        else if (u.role === 'membresia' && vipList) vipList.innerHTML += card;
        else if (['admin','mecanico','taller','socio'].includes(u.role) && staffList) staffList.innerHTML += `<div class="bg-white/5 p-2 rounded-xl text-white text-xs flex justify-between items-center cursor-pointer" onclick="window.openStaffDetail('${d.id}')">
            <span>${u.name || u.phone}</span><span class="text-naranja">${u.role}</span>
        </div>`;
    });
};

window.openUserDetail = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return showToast("Usuario no encontrado", true);
    const user = userDoc.data();
    document.getElementById('ud-name').innerText = user.name || 'Sin nombre';
    document.getElementById('ud-phone').innerText = user.phone;

    // Historial de servicios
    const rescatesSnap = await getDocs(query(collection(db, "rescates"), where("phone", "==", user.phone), orderBy("timestamp", "desc")));
    const historyDiv = document.getElementById('ud-history');
    historyDiv.innerHTML = '';
    rescatesSnap.forEach(r => {
        const rData = r.data();
        historyDiv.innerHTML += `<div class="bg-white/5 p-2 rounded text-xs text-white"><span class="font-bold">${rData.shortId || ''}</span> - ${rData.falla}</div>`;
    });

    // Citas
    const citasSnap = await getDocs(query(collection(db, "citas"), where("phone", "==", user.phone)));
    const citasDiv = document.getElementById('ud-citas');
    citasDiv.innerHTML = '';
    citasSnap.forEach(c => {
        const cData = c.data();
        citasDiv.innerHTML += `<div class="bg-white/5 p-2 rounded text-xs cursor-pointer" onclick="window.openCitaDetail('${c.id}')">${cData.fecha} ${cData.hora} - ${cData.trabajo}</div>`;
    });

    // Historial de membresías (si existe)
    const membContainer = document.getElementById('ud-membership-history');
    if (membContainer) {
        if (user.membresiaExp) {
            const expDate = new Date(user.membresiaExp);
            membContainer.innerHTML = `<p class="text-xs text-yellow-400 font-bold">Membresía VIP vigente hasta ${expDate.toLocaleDateString()}</p>`;
        } else {
            membContainer.innerHTML = '<p class="text-xs text-gray-500">Sin membresía activa</p>';
        }
    }

    // Botón VIP
    const vipBtn = document.getElementById('promote-vip-btn');
    if (vipBtn) {
        if (user.role === 'membresia') {
            vipBtn.classList.add('hidden');
        } else {
            vipBtn.classList.remove('hidden');
            vipBtn.onclick = () => window.promoteToVIP(uid);
        }
    }
    toggleModal('modal-user-detail', true);
};

window.promoteToVIP = async (uid) => {
    const now = Date.now();
    const exp = new Date(now);
    exp.setMonth(exp.getMonth() + 1);
    await updateDoc(doc(db, "users", uid), { role: 'membresia', membresiaExp: exp.getTime() });
    showToast("Usuario promovido a VIP");
    toggleModal('modal-user-detail', false);
    window.adminLoadUsers();
};

window.adminEditUser = async (uid) => {
    const newName = prompt("Nuevo nombre:", window.currentUserDoc?.name || '');
    if (newName) {
        await updateDoc(doc(db, "users", uid), { name: newName });
        showToast("Nombre actualizado");
        window.adminLoadUsers();
        if (!document.getElementById('modal-user-detail').classList.contains('hidden')) {
            window.openUserDetail(uid);
        }
    }
};

window.adminDeleteUser = async (uid) => {
    if (confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.")) {
        await deleteDoc(doc(db, "users", uid));
        showToast("Usuario eliminado");
        toggleModal('modal-user-detail', false);
        window.adminLoadUsers();
    }
};

// === DETALLE DE MECÁNICO (STAFF) mejorado ===
window.openStaffDetail = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return;
    const user = userDoc.data();

    // Servicios realizados
    const rescatesSnap = await getDocs(query(collection(db, "rescates"), where("mech_uid", "==", uid), orderBy("timestamp", "desc")));
    let servicios = 0;
    let ingresos = 0;
    let listaServicios = '';
    rescatesSnap.forEach(r => {
        const rData = r.data();
        if (rData.status === 'completed' || rData.status === 'repairing') {
            servicios++;
            if (rData.costoRescateEstimado) ingresos += rData.costoRescateEstimado;
            listaServicios += `<div class="text-[10px] text-gray-400">${rData.shortId} - ${rData.falla?.substring(0,30)}</div>`;
        }
    });

    // Calificaciones
    const satisfactionSnap = await getDocs(query(collection(db, "satisfaction"), where("uid", "==", uid)));
    let calificaciones = [];
    let comentarios = '';
    satisfactionSnap.forEach(s => {
        const sData = s.data();
        calificaciones.push(sData.rating);
        if (sData.comments) comentarios += `<div class="text-[10px] text-gray-500">"${sData.comments}" (${sData.rating}★)</div>`;
    });
    const promedio = calificaciones.length ? (calificaciones.reduce((a,b)=>a+b,0)/calificaciones.length).toFixed(1) : 'N/A';

    const html = `<div class="text-white space-y-2 text-xs">
        <h3 class="font-black text-lg">${user.name}</h3>
        <p>Servicios realizados: ${servicios}</p>
        <p>Ingresos generados: <span class="text-naranja font-bold">$${ingresos.toFixed(2)}</span></p>
        <p>Calificación promedio: <span class="text-yellow-400 font-black">${promedio} ⭐</span></p>
        <div class="max-h-32 overflow-y-auto hide-scroll bg-black/30 p-2 rounded mt-2">${listaServicios || 'Sin servicios'}</div>
        <div class="max-h-32 overflow-y-auto hide-scroll bg-black/30 p-2 rounded mt-2">${comentarios || 'Sin comentarios'}</div>
    </div>`;
    const modalId = 'modal-staff-detail';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-blue-500/30" id="${modalId}-content"></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = `<button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>${html}`;
    toggleModal(modalId, true);
};
// === SOS MEJORADO (filtro corregido, mapa externo, adminSOSGlobalMapInst asegurado) ===
window.filterSOS = (status) => {
    window.currentSOSFilter = status || 'pending';
    renderSOSGlobalMap();
};

window.renderSOSGlobalMap = async () => {
    const mapEl = document.getElementById('admin-sos-global-map');
    if (!mapEl) return;

    // Asegurar que adminSOSGlobalMapInst exista siempre
    if (!adminSOSGlobalMapInst) {
        adminSOSGlobalMapInst = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView([TALLER_LAT, TALLER_LNG], 11);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(adminSOSGlobalMapInst);
        L.marker([TALLER_LAT, TALLER_LNG], {
            icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36, 36], iconAnchor: [18, 36] }),
            interactive: false
        }).addTo(adminSOSGlobalMapInst);
    }

    // Limpiar solo marcadores, no el mapa
    Object.values(adminSOSMarkers).forEach(m => {
        if (adminSOSGlobalMapInst) adminSOSGlobalMapInst.removeLayer(m);
    });
    adminSOSMarkers = {};

    const allSnap = await getDocs(collection(db, "rescates"));
    const listEl = document.getElementById('admin-sos-list');
    listEl.innerHTML = '';
    let markersGroup = [];

    allSnap.forEach(docSnap => {
        const d = docSnap.data();
        const lat = d.lat || TALLER_LAT;
        const lng = d.lng || TALLER_LNG;

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'gps-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-ambulance text-white"></i></div>', iconSize: [28, 28], iconAnchor: [14, 28] })
        }).addTo(adminSOSGlobalMapInst);

        marker.bindPopup(`<b>${d.phone || ''}</b><br>${d.falla}<br>Estado: ${d.status}`);
        adminSOSMarkers[docSnap.id] = marker;
        markersGroup.push(marker);

        // *** FILTRO CORREGIDO: solo mostrar en lista si coincide con currentSOSFilter ***
        const filterStatus = window.currentSOSFilter || 'pending';
        if (d.status !== filterStatus) return; // no agregar a la lista HTML

        // Botón NAVEGAR 🏍️ con enlace a Google Maps externo
        const navBtn = `<button onclick="event.stopPropagation(); window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}', '_blank')" class="bg-gray-700 hover:bg-gray-600 text-white px-1.5 py-0.5 rounded text-[0.6rem] font-bold uppercase">NAVEGAR 🏍️</button>`;

        let actions = navBtn;

        if (d.status === 'pending') {
            actions += `<button onclick="event.stopPropagation(); window.acceptSOS('${docSnap.id}')" class="bg-green-500 hover:bg-green-400 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase animate-pulse">Aceptar</button>
                       <button onclick="event.stopPropagation(); window.cancelSOS('${docSnap.id}')" class="bg-red-500 hover:bg-red-400 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase">Cancelar</button>`;
        } else if (d.status === 'accepted' && d.mech_uid === auth.currentUser.uid) {
            actions += `<button onclick="event.stopPropagation(); window.changeSOSStatus('${docSnap.id}','repairing')" class="bg-yellow-500 text-white px-2 py-0.5 rounded text-[0.6rem]">Reparando</button>
                       <button onclick="event.stopPropagation(); window.changeSOSStatus('${docSnap.id}','to_shop')" class="bg-blue-500 text-white px-2 py-0.5 rounded text-[0.6rem]">A taller</button>
                       <button onclick="event.stopPropagation(); window.changeSOSStatus('${docSnap.id}','ready')" class="bg-purple-500 text-white px-2 py-0.5 rounded text-[0.6rem]">Lista</button>
                       <button onclick="event.stopPropagation(); window.openMechanicPOS('${docSnap.id}')" class="bg-indigo-500 text-white px-2 py-0.5 rounded text-[0.6rem]">Cobrar</button>`;
        } else if (d.status === 'repairing' && d.mech_uid === auth.currentUser.uid) {
            actions += `<button onclick="event.stopPropagation(); window.changeSOSStatus('${docSnap.id}','to_shop')" class="bg-blue-500 text-white px-2 py-0.5 rounded text-[0.6rem]">A taller</button>
                       <button onclick="event.stopPropagation(); window.changeSOSStatus('${docSnap.id}','ready')" class="bg-purple-500 text-white px-2 py-0.5 rounded text-[0.6rem]">Lista</button>`;
        }

        listEl.innerHTML += `
        <div class="sos-card-compact" onclick="openDetalleServicio('${docSnap.id}')">
            <div class="flex justify-between items-center">
                <span class="text-[0.8rem] font-bold">${d.phone || ''}</span>
                <span class="text-[0.6rem] capitalize bg-${filterStatus==='pending'?'yellow':filterStatus==='accepted'?'blue':'green'}-600/20 text-${filterStatus==='pending'?'yellow':filterStatus==='accepted'?'blue':'green'}-400 px-1.5 py-0.5 rounded font-bold uppercase">${d.status}</span>
            </div>
            <p class="text-[0.7rem] text-gray-400 truncate">${d.falla || ''}</p>
            <div class="flex gap-1 mt-1 flex-wrap">${actions}</div>
        </div>`;
    });

    // Ajustar zoom para ver todos los marcadores
    if (markersGroup.length > 0) {
        const group = new L.featureGroup(markersGroup);
        adminSOSGlobalMapInst.fitBounds(group.getBounds().pad(0.1));
    } else {
        // Si no hay marcadores, vista centrada en el taller
        adminSOSGlobalMapInst.setView([TALLER_LAT, TALLER_LNG], 13);
    }
    window.fixMaps?.();
};

window.acceptSOS = (id) => {
    window.currentSOSId = id;
    loadMecanicosActivosParaAsignar(id);
    toggleModal('modal-asignar-mecanico', true);
};

window.cancelSOS = async (id) => {
    const docRef = doc(db, "rescates", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.uid) {
        push(dbRef(rtdb, 'sos_alerts/' + data.uid + '/notifs'), {
            msg: 'El taller no puede atender tu solicitud en este momento, contacta por llamada.'
        });
        speakTTS("El taller no puede atender tu solicitud en este momento, contacta por llamada.");
    }
    await updateDoc(docRef, { status: 'cancelled' });
    renderSOSGlobalMap();
};

window.changeSOSStatus = async (id, newStatus) => {
    const docRef = doc(db, "rescates", id);
    const now = Date.now();
    const updates = {};
    let notifMsg = '';
    switch(newStatus) {
        case 'repairing': updates.status = 'repairing'; updates.repairedAt = now; notifMsg = 'El mecánico está reparando tu moto.'; break;
        case 'to_shop': updates.status = 'to_shop'; updates.shopAt = now; notifMsg = 'Tu moto será llevada al taller.'; break;
        case 'ready': updates.status = 'completed'; updates.tallerStatus = 'lista'; notifMsg = 'Tu moto está lista para entregar.'; break;
    }
    await updateDoc(docRef, updates);
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().uid) {
        rtdbSet(dbRef(rtdb, 'sos_alerts/' + snap.data().uid), { ...snap.data(), ...updates });
        if (notifMsg) push(dbRef(rtdb, 'sos_alerts/' + snap.data().uid + '/notifs'), { msg: notifMsg });
    }
    showToast('Estado actualizado');
    renderSOSGlobalMap();
};

window.openMechanicPOS = (sosId) => {
    window.currentSOSId = sosId;
    toggleModal('modal-mechanic-pos', true);
    const posGrid = document.getElementById('mechanic-pos-grid');
    if (posGrid) {
        posGrid.innerHTML = '';
        adminInventoryList.filter(p => p.stock > 0).forEach(p => {
            posGrid.innerHTML += `
            <div onclick="window.addMechanicPOSItem('${p.id}')" class="bg-black/30 p-2 rounded-2xl cursor-pointer hover:bg-white/10">
                <p class="text-xs font-black text-white truncate">${p.name}</p>
                <p class="text-naranja text-sm font-bold">$${p.priceTaller}</p>
                <p class="text-[0.6rem] text-green-400">Stock: ${p.stock}</p>
            </div>`;
        });
    }
};

window.addMechanicPOSItem = (id) => {
    const p = adminInventoryList.find(x => x.id === id);
    if (p) {
        window.posTicket.push({ type: 'almacen', id: p.id, name: p.name, price: p.priceTaller, cost: p.cost });
        window.renderTicket();
        const total = window.posTicket.reduce((s,i)=>s+i.price,0);
        const totalEl = document.getElementById('mechanic-total');
        if (totalEl) totalEl.innerText = total.toFixed(2);
        showToast("Agregado");
    }
};

window.finalizeMechanicCharge = async () => {
    if (!window.posTicket.length) return showToast("Agrega productos", true);
    const total = window.posTicket.reduce((s,i)=>s+i.price,0);
    const sosDocRef = doc(db, "rescates", window.currentSOSId);
    try {
        const saleData = {
            shortId: generateShortId(),
            desc: window.posTicket.map(i => i.name).join(", "),
            total,
            costo: window.posTicket.reduce((s,i)=>s+(i.cost||0),0),
            metodoPago: 'Efectivo',
            ticket: window.posTicket,
            fecha: new Date().toISOString(),
            sosId: window.currentSOSId
        };
        await addDoc(collection(db, "ventas"), saleData);
        for(let item of window.posTicket) {
            if(item.type === 'almacen') {
                const pData = adminInventoryList.find(x => x.id === item.id);
                if(pData && pData.stock > 0) await updateDoc(doc(db, "inventario", item.id), { stock: pData.stock - 1 });
            }
        }
        await updateDoc(sosDocRef, { tallerStatus: 'pagado', status: 'completed' });
        window.posTicket = [];
        window.renderTicket();
        const totalEl = document.getElementById('mechanic-total');
        if (totalEl) totalEl.innerText = '0.00';
        toggleModal('modal-mechanic-pos', false);
        showToast("Cobro exitoso");
        renderSOSGlobalMap();
        window.adminLoadInventory();
    } catch(e) { showToast("Error al cobrar", true); }
};

async function loadMecanicosActivosParaAsignar(sosId) {
    const lista = document.getElementById('lista-mecanicos-asignar');
    if (!lista) return;
    lista.innerHTML = '<div class="text-center text-gray-400 text-xs"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    const mechSnap = await getDocs(query(collection(db, "users"), where("role", "==", "mecanico")));
    let html = '';
    mechSnap.forEach(docSnap => {
        const user = docSnap.data();
        html += `<button onclick="window.asignarMecanicoASOS('${docSnap.id}', '${sosId}')" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white font-bold text-sm hover:bg-white/10 transition-colors flex items-center space-x-3">
            <i class="fas fa-motorcycle text-blue-400"></i><span>${user.name || 'Mecánico'}</span>
        </button>`;
    });
    lista.innerHTML = html || '<p class="text-gray-500 text-xs">No hay mecánicos registrados.</p>';
}

window.asignarMecanicoASOS = async (mechUid, sosId) => {
    const mechSnap = await getDoc(doc(db, "users", mechUid));
    if (!mechSnap.exists()) return showToast("Mecánico no encontrado", true);
    const mech = mechSnap.data();
    await updateDoc(doc(db, "rescates", sosId), { status: 'accepted', mech_uid: mechUid, mech_name: mech.name });
    const sosSnap = await getDoc(doc(db, "rescates", sosId));
    if (sosSnap.exists() && sosSnap.data().uid) {
        rtdbSet(dbRef(rtdb, 'sos_alerts/' + sosSnap.data().uid), { ...sosSnap.data(), status: 'accepted' });
        push(dbRef(rtdb, 'sos_alerts/' + sosSnap.data().uid + '/notifs'), { msg: 'Mecánico asignado, en camino.' });
        speakTTS("Mecánico asignado, en camino.");
    }
    showToast(`Asignado a ${mech.name}`);
    toggleModal('modal-asignar-mecanico', false);
    renderSOSGlobalMap();
};

window.tomarCasoDirecto = async () => {
    if (!auth.currentUser || !window.currentSOSId) return;
    const mech = window.currentUserDoc;
    if (!mech || mech.role !== 'mecanico') return showToast("Solo mecánicos", true);
    await updateDoc(doc(db, "rescates", window.currentSOSId), { status: 'accepted', mech_uid: auth.currentUser.uid, mech_name: mech.name });
    const sosSnap = await getDoc(doc(db, "rescates", window.currentSOSId));
    if (sosSnap.exists() && sosSnap.data().uid) {
        rtdbSet(dbRef(rtdb, 'sos_alerts/' + sosSnap.data().uid), { ...sosSnap.data(), status: 'accepted' });
        push(dbRef(rtdb, 'sos_alerts/' + sosSnap.data().uid + '/notifs'), { msg: 'Mecánico asignado, en camino.' });
        speakTTS("Mecánico asignado, en camino.");
    }
    showToast("Caso tomado por ti");
    toggleModal('modal-asignar-mecanico', false);
    renderSOSGlobalMap();
};

// === FOTOS EXTRA ===
window.addExtraPhotos = async (sosId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
        const files = Array.from(input.files).slice(0, 3);
        const docRef = doc(db, "rescates", sosId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;
        const currentData = snap.data();
        let existingUrls = Array.isArray(currentData.mediaUrl) ? currentData.mediaUrl : (currentData.mediaUrl ? [currentData.mediaUrl] : []);
        for (const file of files) {
            const url = await uploadWithTimeout(file, `rescates/extra/${Date.now()}_${file.name}`);
            if (url) existingUrls.push(url);
        }
        if (existingUrls.length > 6) existingUrls = existingUrls.slice(-6);
        await updateDoc(docRef, { mediaUrl: existingUrls });
        showToast('Fotos agregadas');
        if (currentDetalleServicioId === sosId) {
            const fotosContainer = document.getElementById('servicio-fotos-container');
            if (fotosContainer) fotosContainer.innerHTML = existingUrls.map(url => `<img src="${url}" class="h-20 w-20 object-contain rounded-xl border border-white/10 cursor-pointer" onclick="window.open(this.src)">`).join('');
        }
    };
    input.click();
};
// === ESTADÍSTICAS ===
window.loadStats = async () => {
    const fromDate = document.getElementById('stats-from')?.value;
    const toDate = document.getElementById('stats-to')?.value;
    let q = collection(db, "ventas");
    const salesSnap = await getDocs(q);
    let salesData = [];
    salesSnap.forEach(d => salesData.push(d.data()));
    if (fromDate) salesData = salesData.filter(v => v.fecha >= fromDate);
    if (toDate) salesData = salesData.filter(v => v.fecha <= toDate + 'T23:59:59');
    const byDay = {};
    salesData.forEach(v => {
        const day = new Date(v.fecha).toLocaleDateString();
        byDay[day] = (byDay[day] || 0) + (v.total || 0);
    });
    const labels = Object.keys(byDay).sort();
    const values = labels.map(d => byDay[d]);
    if (statsChartInstance) statsChartInstance.destroy();
    const ctx = document.getElementById('stats-chart')?.getContext('2d');
    if (ctx) {
        statsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Ingresos ($)', data: values, backgroundColor: '#FF6B00' }] }
        });
    }
    const totalVentas = salesData.reduce((s,v) => s + (v.total || 0), 0);
    const totalCosto = salesData.reduce((s,v) => s + (v.costo || 0), 0);
    const summaryGrid = document.getElementById('stats-summary-grid');
    if (summaryGrid) {
        summaryGrid.innerHTML = `
            <div class="bg-white/5 p-3 rounded-xl"><p class="text-xs text-gray-400">Ventas Totales</p><p class="text-xl font-black">$${totalVentas.toFixed(2)}</p></div>
            <div class="bg-white/5 p-3 rounded-xl"><p class="text-xs text-gray-400">Ganancia</p><p class="text-xl font-black">$${(totalVentas - totalCosto).toFixed(2)}</p></div>
        `;
    }
    const productCount = {};
    salesData.forEach(v => {
        if (v.ticket) {
            v.ticket.forEach(item => {
                if (item.type === 'almacen') {
                    productCount[item.name] = (productCount[item.name] || 0) + 1;
                }
            });
        }
    });
    const pieLabels = Object.keys(productCount).slice(0, 5);
    const pieValues = pieLabels.map(k => productCount[k]);
    if (statsPieInstance) statsPieInstance.destroy();
    const pieCtx = document.getElementById('stats-pie-chart')?.getContext('2d');
    if (pieCtx) {
        statsPieInstance = new Chart(pieCtx, {
            type: 'pie',
            data: { labels: pieLabels, datasets: [{ data: pieValues, backgroundColor: ['#FF6B00','#2563eb','#16a34a','#eab308','#8b5cf6'] }] }
        });
    }
};

window.exportStatsPDF = async () => {
    const snap = await getDocs(collection(db, "ventas"));
    let totalV = 0, totalC = 0; const bodyData = [];
    snap.forEach(d => { const v = d.data(); totalV += v.total; totalC += (v.costo || 0); bodyData.push([new Date(v.fecha).toLocaleDateString(), v.desc.substring(0,30), `$${v.total.toFixed(2)}`]); });
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    const logoImg = new Image(); logoImg.crossOrigin = 'Anonymous'; logoImg.src = 'logo.png';
    await new Promise((res) => { logoImg.onload = res; logoImg.onerror = res; });
    if(logoImg.complete && logoImg.naturalWidth > 0) doc.addImage(logoImg, 'PNG', 14, 10, 30, 30);
    const chartCanvas = document.getElementById('stats-chart');
    if (chartCanvas) {
        const chartImg = chartCanvas.toDataURL('image/png');
        doc.addImage(chartImg, 'PNG', 14, 50, 180, 80);
    }
    doc.setFillColor(255, 107, 0); doc.rect(0, 0, 210, 30, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text("REPORTE ESTADÍSTICO OBR", 14, 20);
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 140);
    doc.text(`Ingresos Totales: $${totalV.toFixed(2)} | Ganancia Estimada: $${(totalV - totalC).toFixed(2)}`, 14, 148);
    doc.autoTable({ startY: 160, head: [['Fecha', 'Descripción', 'Total']], body: bodyData, theme: 'grid', headStyles: { fillColor: [26, 26, 26] } });
    doc.setFontSize(12); doc.setFont("helvetica", "italic"); doc.setTextColor(100, 100, 100);
    doc.text("Recomendaciones OBR: Mantenimiento preventivo, revisión periódica de frenos y aceite.", 14, doc.lastAutoTable.finalY + 15);
    doc.save(`Estadisticas_OBR_${new Date().toISOString().slice(0,10)}.pdf`);
};

// === ADMIN REFRESH CONFIG UI ===
window.adminRefreshConfigUI = () => {
    const modeEl = document.getElementById('config-price-mode');
    if (modeEl) modeEl.value = globalSettings.priceMode;
    const basePriceEl = document.getElementById('config-base-price');
    if (basePriceEl) basePriceEl.value = globalSettings.rescueBase;
    const kmExtraEl = document.getElementById('config-km-extra');
    if (kmExtraEl) kmExtraEl.value = globalSettings.rescueKmExtra;
    const radiusEl = document.getElementById('config-radius');
    if (radiusEl) radiusEl.value = globalSettings.radiusKm;
    const days = ['L','M','X','J','V','S','D'];
    const tbody = document.getElementById('schedule-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        Object.keys(globalSettings.schedule).forEach((i) => {
            const s = globalSettings.schedule[i];
            tbody.innerHTML += `<tr>
                <td class="pb-2">${days[i]}</td>
                <td class="text-center"><input id="sch-${i}-o" type="time" value="${s.o}" class="bg-black/30 border border-white/10 p-1 rounded text-white text-xs w-20"></td>
                <td class="text-center"><input id="sch-${i}-c" type="time" value="${s.c}" class="bg-black/30 border border-white/10 p-1 rounded text-white text-xs w-20"></td>
            </tr>`;
        });
    }
    const kmRangesList = document.getElementById('km-ranges-list');
    if (kmRangesList) {
        kmRangesList.innerHTML = '';
        globalSettings.rescueKmRanges.forEach((r, i) => {
            kmRangesList.innerHTML += `<div class="flex justify-between items-center bg-black/20 p-1 rounded">
                <span class="text-xs">Hasta ${r.km} km: $${r.price}</span>
                <button onclick="window.removeKmRange(${i})" class="text-red-400"><i class="fas fa-times"></i></button>
            </div>`;
        });
    }
    if (adminGeoMap) {
        adminGeoMap.setView([TALLER_LAT, TALLER_LNG], 13);
        if (adminGeoCircle) {
            adminGeoCircle.setRadius(globalSettings.radiusKm * 1000);
        }
    }
    window.togglePriceMode();
};

window.adminAddKmRange = () => {
    const kmLimit = parseFloat(document.getElementById('new-km-limit')?.value);
    const price = parseFloat(document.getElementById('new-km-price')?.value);
    if (isNaN(kmLimit) || isNaN(price)) return showToast("Ingresa valores numéricos", true);
    globalSettings.rescueKmRanges.push({ km: kmLimit, price });
    globalSettings.rescueKmRanges.sort((a,b) => a.km - b.km);
    window.adminRefreshConfigUI();
    const kmInput = document.getElementById('new-km-limit');
    const priceInput = document.getElementById('new-km-price');
    if (kmInput) kmInput.value = '';
    if (priceInput) priceInput.value = '';
};

window.removeKmRange = (index) => {
    globalSettings.rescueKmRanges.splice(index, 1);
    window.adminRefreshConfigUI();
};

// Inicializar mapa de geofence
window.renderAdminMap = () => {
    const mapEl = document.getElementById('admin-geofence-map');
    if (!mapEl || adminGeoMap) return;
    adminGeoMap = L.map(mapEl).setView([TALLER_LAT, TALLER_LNG], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(adminGeoMap);
    L.marker([TALLER_LAT, TALLER_LNG], { icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] }) }).addTo(adminGeoMap);
    adminGeoCircle = L.circle([TALLER_LAT, TALLER_LNG], { radius: globalSettings.radiusKm * 1000, color: '#FF6B00', fillOpacity: 0.1 }).addTo(adminGeoMap);
};

// === INVENTARIO FLOTANTE (CONTEO RÁPIDO) ===
window.openInventoryCount = () => {
    const now = Date.now();
    if (window.inventoryCountSession && (now - window.inventoryCountSession.start) > 6 * 60 * 60 * 1000) {
        window.inventoryCountSession = null;
    }
    if (!window.inventoryCountSession) {
        window.inventoryCountSession = { start: now, items: [], index: 0, completed: false };
    }
    if (!document.getElementById('modal-inventory-count')) {
        const modal = document.createElement('div');
        modal.id = 'modal-inventory-count';
        modal.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-asfalto w-full max-w-lg rounded-[2rem] p-6 relative border border-green-500/30 shadow-2xl flex flex-col max-h-[80vh]">
                <button onclick="toggleModal('modal-inventory-count',false); window.inventoryCountSession = null;" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                <h2 class="text-xl font-black mb-4 text-white">Conteo Rápido</h2>
                <div id="inventory-count-current" class="flex-grow overflow-y-auto hide-scroll mb-4 space-y-4"></div>
                <div id="inventory-count-progress" class="text-xs text-gray-400 text-center border-t border-white/10 pt-3"></div>
                <button onclick="window.finalizeInventoryCount()" class="w-full bg-blue-600 text-white p-3 rounded-xl font-black uppercase text-xs mt-3 hidden" id="inventory-finish-btn">Finalizar y generar reporte</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    renderInventoryCountItem();
    toggleModal('modal-inventory-count', true);
};

function renderInventoryCountItem() {
    if (!window.inventoryCountSession) return;
    const session = window.inventoryCountSession;
    const products = adminInventoryList;
    if (session.index >= products.length) {
        const currentEl = document.getElementById('inventory-count-current');
        if (currentEl) currentEl.innerHTML = '<p class="text-green-400 text-center font-bold text-lg">¡Conteo completado!</p>';
        const finishBtn = document.getElementById('inventory-finish-btn');
        if (finishBtn) finishBtn.classList.remove('hidden');
        const progressEl = document.getElementById('inventory-count-progress');
        if (progressEl) progressEl.innerText = `Productos revisados: ${products.length}/${products.length}`;
        return;
    }
    const product = products[session.index];
    const currentItem = session.items.find(i => i.id === product.id);
    const counted = currentItem ? currentItem.qty : null;
    const currentEl = document.getElementById('inventory-count-current');
    if (currentEl) {
        currentEl.innerHTML = `
        <div class="bg-white/5 p-4 rounded-2xl">
            <p class="text-xs text-gray-400">Producto ${session.index+1}/${products.length}</p>
            <h3 class="text-xl font-black text-white">${product.name}</h3>
            <p class="text-sm text-gray-400">Stock registrado: <span class="text-green-400 font-bold">${product.stock}</span></p>
            <input type="number" id="count-actual-qty" placeholder="Cantidad real contada" value="${counted || ''}" class="w-full bg-asfalto border border-naranja/50 p-3 rounded-xl mt-2 text-white font-bold">
            <p id="count-discrepancy" class="text-xs mt-1 hidden"></p>
            <div class="flex space-x-2 mt-4">
                <button onclick="window.saveCountAndNext()" class="flex-1 bg-green-500 text-white py-3 rounded-xl font-black uppercase text-xs">Guardar y siguiente</button>
                <button onclick="window.skipCount()" class="bg-gray-600 text-white py-3 px-4 rounded-xl font-black uppercase text-xs">Omitir</button>
            </div>
        </div>`;
    }
    const finishBtn = document.getElementById('inventory-finish-btn');
    if (finishBtn) finishBtn.classList.add('hidden');
    const progressEl = document.getElementById('inventory-count-progress');
    if (progressEl) progressEl.innerText = `Progreso: ${session.index}/${products.length}`;
}

window.saveCountAndNext = () => {
    const qtyInput = document.getElementById('count-actual-qty');
    if (!qtyInput) return;
    const qty = parseInt(qtyInput.value) || 0;
    const session = window.inventoryCountSession;
    const products = adminInventoryList;
    const product = products[session.index];
    const existingIndex = session.items.findIndex(i => i.id === product.id);
    if (existingIndex > -1) session.items[existingIndex].qty = qty;
    else session.items.push({ id: product.id, name: product.name, expected: product.stock, actual: qty });
    session.index++;
    renderInventoryCountItem();
};

window.skipCount = () => {
    window.inventoryCountSession.index++;
    renderInventoryCountItem();
};

window.finalizeInventoryCount = () => {
    const session = window.inventoryCountSession;
    if (!session) return;
    const products = adminInventoryList;
    let missingItems = session.items.filter(item => item.actual < item.expected);
    let totalLost = 0;
    missingItems.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) totalLost += (item.expected - item.actual) * product.cost;
    });
    window.inventoryCountSession = null;
    toggleModal('modal-inventory-count', false);
    const reportHTML = `
        <div class="text-white space-y-2 text-xs">
            <h3 class="text-lg font-black mb-2">Reporte de Conteo</h3>
            <p>Productos contados: ${session.items.length}</p>
            <p>Faltantes detectados: ${missingItems.length}</p>
            ${missingItems.length > 0 ? `
            <div class="max-h-40 overflow-y-auto hide-scroll">
                <table class="w-full text-left">
                    <thead><tr class="text-gray-400"><th>Producto</th><th>Esperado</th><th>Real</th><th>Faltante</th></tr></thead>
                    <tbody>
                        ${missingItems.map(i => `<tr><td>${i.name}</td><td>${i.expected}</td><td>${i.actual}</td><td>${i.expected - i.actual}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <p class="text-red-400 font-bold">Pérdida total estimada: $${totalLost.toFixed(2)}</p>
            ` : '<p class="text-green-400">No se detectaron faltantes.</p>'}
        </div>
    `;
    const modalId = 'modal-inventory-report';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-md rounded-[2rem] p-6 relative border border-green-500/30 shadow-2xl" id="${modalId}-content"></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = reportHTML + `<button onclick="toggleModal('${modalId}',false)" class="mt-4 w-full bg-gray-600 text-white p-3 rounded-xl font-black uppercase text-xs">Cerrar</button>`;
    toggleModal(modalId, true);
};

// === CORTE DE CAJA ===
window.showAdminCorte = () => {
    if (!window.cajaAbierta) return;
    const ventasHoy = (adminSalesCache?.ventas || []).filter(
        v => new Date(v.fecha).toDateString() === new Date().toDateString()
    );
    const totalVentas = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);
    const totalRetiros = (window.retiros || []).reduce((sum, r) => sum + (r.monto || 0), 0);
    const efectivoDisponible = window.fondoInicial + totalVentas - totalRetiros;
    const corteHTML = `
        <div class="text-white space-y-3 text-sm">
            <div class="flex justify-between"><span>Fondo inicial:</span><span>$${window.fondoInicial.toFixed(2)}</span></div>
            <div class="flex justify-between"><span>Ventas del día:</span><span>$${totalVentas.toFixed(2)}</span></div>
            <div class="flex justify-between"><span>Retiros:</span><span>$${totalRetiros.toFixed(2)}</span></div>
            <hr class="border-white/10"/>
            <div class="flex justify-between font-black text-green-400"><span>Efectivo en caja:</span><span>$${efectivoDisponible.toFixed(2)}</span></div>
        </div>
        <div class="mt-4 flex space-x-2">
            <button onclick="window.exportCortePDF()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl font-black uppercase text-xs">Exportar PDF</button>
            <button onclick="toggleModal('modal-corte', false)" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-xl font-black uppercase text-xs">Cerrar</button>
        </div>
    `;
    const modalId = 'modal-corte';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-green-500/30 shadow-2xl" id="${modalId}-content"></div>
        `;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = `<h2 class="text-xl font-black mb-4 text-white">Corte del día</h2>${corteHTML}`;
    toggleModal(modalId, true);
    window.cajaAbierta = false;
    window.fondoInicial = 0;
    window.retiros = [];
    document.getElementById('btn-open-caja')?.classList.remove('hidden');
    document.getElementById('btn-close-caja')?.classList.add('hidden');
    document.getElementById('btn-retiro')?.classList.add('hidden');
    document.getElementById('caja-status-bar')?.classList.add('hidden');
    const display = document.getElementById('fondo-inicial-display');
    if(display) display.innerText = '0.00';
};

window.exportCortePDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Corte de Caja OBR", 14, 20);
    doc.setFontSize(10);
    const ventasHoy = (adminSalesCache?.ventas || []).filter(v => new Date(v.fecha).toDateString() === new Date().toDateString());
    const totalVentas = ventasHoy.reduce((s,v)=>s+(v.total||0),0);
    const totalRetiros = (window.retiros||[]).reduce((s,r)=>s+(r.monto||0),0);
    doc.text(`Fondo Inicial: $${window.fondoInicial.toFixed(2)}`, 14, 30);
    doc.text(`Ventas del día: $${totalVentas.toFixed(2)}`, 14, 38);
    doc.text(`Retiros: $${totalRetiros.toFixed(2)}`, 14, 46);
    doc.text(`Efectivo en caja: $${(window.fondoInicial+totalVentas-totalRetiros).toFixed(2)}`, 14, 54);
    doc.autoTable({
        startY: 65,
        head: [['Concepto', 'Monto']],
        body: [
            ['Fondo Inicial', `$${window.fondoInicial.toFixed(2)}`],
            ['Ventas', `$${totalVentas.toFixed(2)}`],
            ['Retiros', `$${totalRetiros.toFixed(2)}`]
        ]
    });
    doc.save(`Corte_Caja_${new Date().toISOString().slice(0,10)}.pdf`);
};
// === BÚSQUEDA DE ESTADO DE SERVICIO (PÚBLICO) ===
window.searchServiceStatus = async () => {
    const input = document.getElementById('search-tracker-input')?.value.trim();
    const password = document.getElementById('search-tracker-pwd')?.value.trim();
    if (!input) return showToast("Ingresa número celular (10 dígitos) o ID OBR", true);

    let rescatesQuery;
    if (input.startsWith('OBR-')) {
        rescatesQuery = query(collection(db, "rescates"), where("shortId", "==", input), limit(1));
    } else {
        rescatesQuery = query(collection(db, "rescates"), where("phone", "==", "+52"+input), orderBy("timestamp", "desc"), limit(1));
    }
    const snap = await getDocs(rescatesQuery);
    if (snap.empty) {
        const resultContainer = document.getElementById('tracking-result-container');
        if (resultContainer) resultContainer.classList.add('hidden');
        const notFound = document.getElementById('tracking-not-found');
        if (notFound) notFound.classList.remove('hidden');
        return;
    }
    const rescueDoc = snap.docs[0];
    const rescue = rescueDoc.data();

    const passwordContainer = document.getElementById('tracker-password-container');
    if (!input.startsWith('OBR-') && !password) {
        if (passwordContainer) passwordContainer.classList.remove('hidden');
        const notFound = document.getElementById('tracking-not-found');
        if (notFound) notFound.classList.add('hidden');
        return;
    }

    if (!input.startsWith('OBR-')) {
        const userSnap = await getDocs(query(collection(db, "users"), where("phone", "==", "+52"+input), limit(1)));
        if (userSnap.empty) {
            const notFound = document.getElementById('tracking-not-found');
            if (notFound) notFound.classList.remove('hidden');
            return;
        }
        const user = userSnap.docs[0].data();
        if (user.pwd !== password) {
            showToast("Contraseña incorrecta", true);
            return;
        }
    }

    const notFound = document.getElementById('tracking-not-found');
    if (notFound) notFound.classList.add('hidden');
    const container = document.getElementById('tracking-result-container');
    if (container) {
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="glass p-6 rounded-3xl text-white">
                <h3 class="font-black text-lg">Servicio: ${rescue.shortId}</h3>
                <p class="text-xs text-gray-400">Moto: ${rescue.marca || ''} ${rescue.modelo || ''}</p>
                <p class="text-sm mt-2">${rescue.falla}</p>
                <p class="text-xs mt-2">Estado: <span class="font-bold text-naranja">${rescue.status}</span></p>
                ${rescue.tallerStatus ? `<p class="text-xs">Taller: ${rescue.tallerStatus}</p>` : ''}
                <p class="text-xs mt-4 text-gray-500">Última actualización: ${new Date(rescue.timestamp).toLocaleString()}</p>
            </div>
        `;
    }
};

// === INICIALIZAR ===
window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
});

// Stubs para funciones pendientes (chat, etc.)
window.openChat = window.openChat || function(){};
window.closeChat = window.closeChat || function(){};
window.loadChatList = window.loadChatList || async function(){};
window.sendMessage = window.sendMessage || async function(){};
window.enviarSolicitudCambioCita = window.enviarSolicitudCambioCita || async function(){};
window.adminLoadSales = window.adminLoadSales || async function(){};
window.openSaleDetails = window.openSaleDetails || function(id, data){ showToast(`Venta ${data.shortId} registrada`); };
window.filterStore = window.filterStore || function(){};
window.printTicket = window.printTicket || function(){};
window.adminSaveMemPrice = window.adminSaveMemPrice || async function(){};
window.exportCSV = window.exportCSV || function(){};
window.clearSignature = window.clearSignature || function(){};
window.saveSignature = window.saveSignature || function(){};
window.exportUserHistoryPDF = window.exportUserHistoryPDF || function(){};

// tailwind config
tailwind.config = { theme: { extend: { colors: { asfalto: '#1A1A1A', naranja: '#FF6B00' } } } };
const manifest = {
    name: "Moto Rescate OBR",
    short_name: "OBR",
    start_url: ".",
    display: "standalone",
    background_color: "#1A1A1A",
    theme_color: "#FF6B00",
    icons: [
        { src: "logo.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
};
const mBlob = new Blob([JSON.stringify(manifest)], {type: 'application/manifest+json'});
(function() { const l = document.createElement('link'); l.rel = 'manifest'; l.href = URL.createObjectURL(mBlob); document.head.appendChild(l); })();
