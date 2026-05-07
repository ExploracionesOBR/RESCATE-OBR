import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, query, where, limit, updateDoc, deleteDoc, orderBy, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// === CARGA DIFERIDA DE html2canvas ===
window.loadHtml2Canvas = () => {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) return resolve(window.html2canvas);
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve(window.html2canvas);
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

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
window.globalSettings = globalSettings;
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
let adminSalesCache = {}; let lastNotifiedSOS = null; let mechWatchId = null; window.activeMechanicSOSId = null;
window.activePosFilter = 'todos';
window.garantiasActivas = [];
let mySOSListener = null;
let serviciosListener = null, sosListener = null, pedidosListener = null, citasListener = null;
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

window.confirmModal = (message, onConfirm, onCancel) => {
    const modalId = 'modal-confirm-custom';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-white/10 shadow-2xl text-center">
                <p id="confirm-msg" class="text-white font-bold mb-6"></p>
                <div class="flex space-x-3 justify-center">
                    <button id="confirm-yes" class="bg-green-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">Sí</button>
                    <button id="confirm-no" class="bg-gray-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">No</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
    }
    document.getElementById('confirm-msg').innerText = message;
    document.getElementById('confirm-yes').onclick = () => {
        toggleModal(modalId, false);
        if (onConfirm) onConfirm();
    };
    document.getElementById('confirm-no').onclick = () => {
        toggleModal(modalId, false);
        if (onCancel) onCancel();
    };
    toggleModal(modalId, true);
};

window.promptModal = (message, defaultValue, callback) => {
    const modalId = 'modal-prompt-custom';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <p id="prompt-msg" class="text-white font-bold mb-4"></p>
                <input id="prompt-input" type="text" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white mb-4">
                <div class="flex space-x-3 justify-center">
                    <button id="prompt-ok" class="bg-green-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">Aceptar</button>
                    <button id="prompt-cancel" class="bg-gray-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
    }
    document.getElementById('prompt-msg').innerText = message;
    const input = document.getElementById('prompt-input');
    input.value = defaultValue || '';
    document.getElementById('prompt-ok').onclick = () => {
        toggleModal(modalId, false);
        if (callback) callback(input.value);
    };
    document.getElementById('prompt-cancel').onclick = () => {
        toggleModal(modalId, false);
        if (callback) callback(null);
    };
    toggleModal(modalId, true);
    setTimeout(() => input.focus(), 100);
};

window.toggleModal = (id, show) => {
    const m = document.getElementById(id);
    if(m) {
        m.classList.toggle('hidden', !show);
        if(show && id === 'modal-video-schedule') window.renderVideoScheduleDays?.();
        if(show && id === 'modal-garantias') window.loadGarantias?.();
        if(show && id === 'modal-nueva-cita') {
            const fechaInput = document.getElementById('cita-fecha');
            if(fechaInput) fechaInput.min = new Date().toISOString().split('T')[0];
        }
        if(show && id === 'modal-edit-cita') {
            const fechaInput = document.getElementById('edit-cita-fecha');
            if(fechaInput) fechaInput.min = new Date().toISOString().split('T')[0];
        }
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
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        if (type === 'alert') {
            // Sonido de alerta: tono más grave y largo
            oscillator.frequency.value = 800;
            oscillator.type = 'square';
            gainNode.gain.value = 0.3;
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.2);
        } else {
            // Sonido de notificación: tono agudo y corto
            oscillator.frequency.value = 1200;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.2;
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        }
    } catch(e) {}
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
    switchMapLayer(mode === 'light');
}

function switchMapLayer(isLight) {
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://carto.com/">CARTO</a>';

    const maps = [adminSOSGlobalMapInst, adminGeoMap, mechMapInst, sosMapInstance];
    maps.forEach(map => {
        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) map.removeLayer(layer);
            });
            L.tileLayer(layerUrl, { attribution }).addTo(map);
        }
    });
}

// === RASTREO MECÁNICO ===
function startMechanicTracking() {
    if(['admin', 'mecanico', 'taller'].includes(window.currentUserDoc?.role)) {
        if(navigator.geolocation) {
            navigator.geolocation.watchPosition(pos => {
                const uid = auth.currentUser.uid;
                update(dbRef(rtdb, 'mecanicos_activos/' + uid), { lat: pos.coords.latitude, lng: pos.coords.longitude, name: window.currentUserDoc.name, ts: Date.now() });
                // Si hay un SOS activo, guardar punto de trayectoria
                if (window.activeMechanicSOSId) {
                    push(dbRef(rtdb, `sos_tracking/${window.activeMechanicSOSId}/${uid}/points`), {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        ts: Date.now()
                    });
                }
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
    const loginBtn = document.getElementById('global-login-btn');
    const loginIcon = document.getElementById('global-login-icon');
    if (loginBtn && loginIcon) {
        if (auth.currentUser) {
            loginIcon.className = 'fas fa-sign-out-alt text-xl';
            loginBtn.classList.add('bg-red-600', 'border-red-500/30');
            loginBtn.classList.remove('bg-naranja', 'border-naranja/50');
            loginBtn.onclick = () => window.logout();
        } else {
            loginIcon.className = 'fas fa-sign-in-alt text-xl';
            loginBtn.classList.add('bg-naranja', 'border-naranja/50');
            loginBtn.classList.remove('bg-red-600', 'border-red-500/30');
            loginBtn.onclick = () => window.showView('view-login');
        }
        loginBtn.style.display = 'flex'; // siempre visible
    }
    window.updateEmergencyButtonState(isOpen, sched);

    // Mostrar/ocultar banners VIP en la tienda pública y en la tienda del cliente
    const vipBannerShop = document.getElementById('vip-banner-shop');
    const vipBannerShopClient = document.getElementById('vip-banner-shop-client');
    [vipBannerShop, vipBannerShopClient].forEach(banner => {
        if (banner) {
            if (!auth.currentUser || (window.currentUserDoc && window.currentUserDoc.role !== 'membresia')) {
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        }
    });

    // Cargar video promocional si está programado para hoy
    window.loadPromoVideo();
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

// === CARGA DE TIENDA Y SERVICIOS ===
async function loadPublicStore() {
    try {
        const snap = await getDocs(collection(db, "inventario"));
        const grid = document.getElementById('public-store-grid'); const cGrid = document.getElementById('client-store-grid');
        let html = ''; const isMem = auth.currentUser && window.currentUserDoc?.role === 'membresia';
        snap.forEach(doc => {
            const p = doc.data();
            if(p.stock > 0 && p.visible !== false) {
                const price = isMem ? (p.priceMember || p.pricePublic) : p.pricePublic;
                const promo = (p.originalPrice && p.originalPrice > p.pricePublic);
                html += `<div class="glass p-4 rounded-3xl flex flex-col hover:shadow-[0_0_15px_rgba(255,107,0,0.3)] transition-all relative" onclick="window.openProductDetail?.('${doc.id}')">
                    ${promo ? '<div class="sticker-promo absolute top-2 right-2 bg-red-500 text-white px-2 py-0.5 text-[0.6rem] font-black rounded-full uppercase z-10">PROMO</div>' : ''}
                    <div class="w-full aspect-square bg-white/5 rounded-2xl mb-3 flex items-center justify-center overflow-hidden relative">${p.imgUrl ? `<img src="${p.imgUrl}" class="w-full h-full object-contain">` : '<i class="fas fa-box text-4xl text-gray-600"></i>'}</div>
                    <p class="text-xs font-black uppercase flex-grow">${p.name}</p>
                    <p class="text-naranja font-black text-lg mb-3">${promo ? `<span class="line-through text-gray-500 text-xs mr-1">$${p.originalPrice.toFixed(2)}</span>` : ''}$${price.toFixed(2)}</p>
                    <button onclick="event.stopPropagation(); addToCart('${p.name}', ${price})" class="shop-add-btn w-full bg-naranja hover:bg-orange-600 transition-colors text-white p-2 rounded-xl text-xs font-black uppercase">Añadir</button>
                </div>`;
            }
        });
        if (!html) html = `<div class="col-span-full text-center p-10 flex flex-col items-center"><i class="fas fa-box-open text-6xl text-gray-600 mb-6 opacity-30"></i><h3 class="text-2xl font-black text-naranja uppercase italic mb-2">Próximamente</h3><p class="text-gray-400 text-sm mb-6">Estamos abasteciendo nuestro almacén.</p><button onclick="toggleModal('modal-contact', true)" class="bg-blue-600 text-white px-6 py-3 rounded-full font-black uppercase text-xs"><i class="fas fa-headset mr-2"></i>Contactar al Taller</button></div>`;
        if (grid) grid.innerHTML = html; if (cGrid) cGrid.innerHTML = html;
        window.loadPromoVideo();
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

  if (window.currentUserDoc.firstLogin && !['admin','mecanico','taller','socio'].includes(window.currentUserDoc.role)) {
    showView('view-force-setup');
    return;
}
    window.requestAppPermissions();
    if (window.currentUserDoc.role === 'membresia' && window.currentUserDoc.membresiaExp) {
        if (Date.now() > window.currentUserDoc.membresiaExp) {
            await updateDoc(doc(db, 'users', user.uid), { role: 'cliente', membresiaExp: null });
            window.currentUserDoc.role = 'cliente';
            showToast("Tu membresía VIP ha expirado. Has vuelto a Cliente Estándar.");
        }
    }

    applyTheme(); startMechanicTracking();
        updateLandingStatus(); // Refresca el botón de sesión al cambiar de usuario

    if (['admin', 'mecanico', 'taller', 'socio'].includes(window.currentUserDoc.role)) {
        showView('app-admin'); document.getElementById('admin-phone-display').innerText = window.currentUserDoc.name || 'Admin';
        setTimeout(() => {
    window.adminRefreshConfigUI();
    window.adminLoadInventory();
    window.adminLoadSales();
    window.filterSOS('pending');
    window.adminListenServices();
    window.adminLoadCitas();
    window.loadChatList();
}, 100);
        if (window.currentUserDoc.role === 'mecanico') window.loadMechPendingCharges();

// Listener de notificaciones en tiempo real (para cualquier rol)
onValue(dbRef(rtdb, 'notificaciones/' + user.uid), (snap) => {
    if (snap.exists()) {
        const notif = snap.val();
        showToast(notif.msg);
        playSound('notif');
        speakTTS(notif.msg); // si está disponible
        // Eliminar la notificación después de mostrarla
        remove(dbRef(rtdb, 'notificaciones/' + user.uid));
    }
});
        window.initAdminNotifications();
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

    // Listener genérico de notificaciones RTDB para cualquier rol
    onValue(dbRef(rtdb, 'notificaciones/' + user.uid), (snap) => {
        if (snap.exists()) {
            const notif = snap.val();
            showToast(notif.msg);
            playSound('notif');
            speakTTS(notif.msg);
            remove(dbRef(rtdb, 'notificaciones/' + user.uid));
        }
    });
});

function showView(targetId) {
    const views = ['view-landing', 'view-public-store', 'view-public-tracking', 'view-login', 'view-sos-form', 'view-force-setup', 'app-client', 'app-admin'];
    views.forEach(id => { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); el.style.display = 'none'; } });
    const target = document.getElementById(targetId);
    if(target) { target.classList.remove('hidden'); target.classList.add('flex'); target.style.display = 'flex'; }
    toggleModal('modal-user-detail', false);
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
    toggleModal('modal-user-detail', false);
    document.querySelectorAll('.c-view').forEach(v => v.classList.add('hidden')); document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.c-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.c-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active'); window.fixMaps?.();
};

window.switchAdminView = (id) => {
    toggleModal('modal-user-detail', false);
    document.querySelectorAll('.a-view').forEach(v => v.classList.add('hidden')); document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.a-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.a-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active');

    const chatBtn = document.getElementById('admin-chat-float-btn');
    if(chatBtn) chatBtn.classList.toggle('hidden', !['a-view-pos', 'a-view-alertas'].includes(id));

    if(id === 'a-view-config') { window.adminRefreshConfigUI(); window.renderAdminMap(); }
    if(id === 'a-view-usuarios') window.adminLoadUsers();
    if(id === 'a-view-promos') { window.adminLoadLoyalty(); populatePromoProductSelect(); window.loadPromoPreview?.(); }
    if(id === 'a-view-stats') window.loadStats();
    if(id === 'a-view-citas') window.adminLoadCitas();
    if(id === 'a-view-alertas') window.renderSOSGlobalMap();
    if(id === 'a-view-pos') { 
    window.posFilterProducts(); 
    window.cargarNotificacionesCitas(); 
    window.cargarCobrosMecanicosPanel(); 
    window.loadVentasRealizadas(); 
}
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
        } else {
            document.getElementById('auth-step-register').classList.remove('hidden');
        }
    } catch(e) { showToast("Error de conexión", true); } finally { btn.disabled = false; btn.innerHTML = 'Siguiente'; }
};

window.processLogin = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim(); const password = document.getElementById('login-password').value.trim();
    if(!password) return showToast("Ingresa contraseña", true);
    try {
        await signInWithEmailAndPassword(auth, `${rawPhone}@motorescateobr.com`, password);
    } catch(e) {
        if (e.code === 'auth/user-not-found') showToast("Usuario no registrado", true);
        else if (e.code === 'auth/wrong-password') showToast("Contraseña incorrecta", true);
        else showToast("Error al iniciar sesión", true);
    }
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
        if (e.code === 'auth/email-already-in-use') {
            try {
                await signInWithEmailAndPassword(auth, fakeEmail, password);
            } catch(loginErr) {
                showToast("Ya existe. Inicia sesión con tu contraseña.", true);
                document.getElementById('auth-step-register').classList.add('hidden');
                document.getElementById('auth-step-login').classList.remove('hidden');
            }
        } else showToast("Error en registro", true);
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

// === SOS CLIENTE ===
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
                const isLight = document.body.classList.contains('light-mode');
                const layerUrl = isLight
                    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                L.tileLayer(layerUrl, { attribution: '&copy; <a href="https://carto.com/">CARTO</a>' }).addTo(sosMapInstance);
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
function listenToMySOS() {
    if(!auth.currentUser) return;
    if(mySOSListener) mySOSListener();
    mySOSListener = onValue(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), (snap) => {
        if(!snap.exists()) {
            document.getElementById('active-sos-card')?.classList.add('hidden');
            document.getElementById('no-active-services-msg')?.classList.remove('hidden');
            window.lastClientSOSStatus = null;
            // Limpiar mapa del mecánico si se cancela el SOS
            if (mechMapInst) {
                mechMapInst.remove();
                mechMapInst = null;
                mechMarkerInst = null;
            }
            return;
        }
        const data = snap.val();
        document.getElementById('active-sos-card')?.classList.remove('hidden');
        document.getElementById('no-active-services-msg')?.classList.add('hidden');

        if(data.status === 'accepted' && window.lastClientSOSStatus !== 'accepted') {
            speakTTS('TU SOLICITUD HA SIDO ACEPTADA. ESPERA MIENTRAS LLEGA EL MECÁNICO.');
            playSound('notif');
        } else if (data.status === 'completed' && window.lastClientSOSStatus !== 'completed') {
            speakTTS('AUXILIO FINALIZADO. GRACIAS POR CONFIAR EN OBR.');
            playSound('notif');
            document.getElementById('active-sos-card')?.classList.add('hidden');
            document.getElementById('satisfaction-survey').classList.remove('hidden');
            remove(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid));
            window.loadClientHistory();
            // Limpiar mapa del mecánico al finalizar
            if (mechMapInst) {
                mechMapInst.remove();
                mechMapInst = null;
                mechMarkerInst = null;
            }
        }
        window.lastClientSOSStatus = data.status;
        document.getElementById('sos-status-desc-client').innerText = data.status === 'accepted' ? "Mecánico en camino" : "Esperando confirmación";

        if(data.status === 'accepted' && data.mech_lat) {
            document.getElementById('mechanic-live-map').classList.remove('hidden');
            if(!mechMapInst) {
                mechMapInst = L.map('mechanic-live-map', { dragging: false, zoomControl: false }).setView([data.mech_lat, data.mech_lng], 14);
                const isLight = document.body.classList.contains('light-mode');
                const layerUrl = isLight
                    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                L.tileLayer(layerUrl).addTo(mechMapInst);
                mechMarkerInst = L.marker([data.mech_lat, data.mech_lng], { icon: L.divIcon({ className: 'mech-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-motorcycle text-white"></i></div>', iconSize: [32,32], iconAnchor: [16,32] }) }).addTo(mechMapInst);
            } else {
                mechMarkerInst.setLatLng([data.mech_lat, data.mech_lng]);
                mechMapInst.invalidateSize();
            }
        }

        // Escuchar ubicación del mecánico en tiempo real (DENTRO del callback, data existe)
        if (data.status === 'accepted' && data.mech_uid) {
            onValue(dbRef(rtdb, 'mecanicos_activos/' + data.mech_uid), (mechSnap) => {
                if (mechSnap.exists()) {
                    const pos = mechSnap.val();
                    if (mechMarkerInst && pos.lat) {
                        mechMarkerInst.setLatLng([pos.lat, pos.lng]);
                        mechMapInst.setView([pos.lat, pos.lng], 14);
                    } else if (!mechMapInst && pos.lat) {
                        mechMapInst = L.map('mechanic-live-map', { dragging: false, zoomControl: false }).setView([pos.lat, pos.lng], 14);
                        const isLight = document.body.classList.contains('light-mode');
                        const layerUrl = isLight
                            ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                            : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                        L.tileLayer(layerUrl).addTo(mechMapInst);
                        mechMarkerInst = L.marker([pos.lat, pos.lng], {
                            icon: L.divIcon({ className: 'mech-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-motorcycle text-white"></i></div>', iconSize: [32,32], iconAnchor: [16,32] })
                        }).addTo(mechMapInst);
                    }
                }
            });
        }
        // FIN de la escucha de ubicación del mecánico
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

// === ADMIN TALLER Y CITAS (organizado por bloques, solo "lista" es solo lectura) ===
window.adminListenServices = () => {
    if (serviciosListener) serviciosListener();
    serviciosListener = onSnapshot(query(collection(db, "rescates"), limit(50)), (snap) => {
        const list = document.getElementById('admin-services-list'); if(!list) return;
        let listaMotos = [];
        snap.forEach(d => {
            const v = d.data(); if(v.status !== 'completed' || v.tallerStatus === 'entregada' || v.tallerStatus === 'pagado') return;
            listaMotos.push({ id: d.id, ...v });
        });
        const recibidas = listaMotos.filter(v => v.tallerStatus === 'recibida');
        const mecanica = listaMotos.filter(v => v.tallerStatus === 'mecanica');
        const pruebas = listaMotos.filter(v => v.tallerStatus === 'pruebas');
        const listas = listaMotos.filter(v => v.tallerStatus === 'lista');

        const renderBlock = (title, items, colorClass, borderColor) => {
    let html = `<div class="mb-6"><h4 class="text-sm font-black uppercase text-white mb-2 border-b ${borderColor} pb-1">${title} (${items.length})</h4><div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">`;
    if (items.length === 0) html += '<p class="text-gray-500 text-xs italic">Sin motos</p>';
    items.forEach(v => {
        const statusColor = v.tallerStatus === 'mecanica' ? 'bg-yellow-600/30 text-yellow-400' :
                           v.tallerStatus === 'pruebas' ? 'bg-blue-600/30 text-blue-400' :
                           v.tallerStatus === 'lista' ? 'bg-green-600/30 text-green-400' :
                           'bg-gray-600/30 text-gray-400';
        const pdfBtn = v.tallerStatus === 'lista' ? `<button onclick="event.stopPropagation(); window.downloadCompletedServicePDF('${v.id}')" class="bg-purple-600 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase mt-1">📄 PDF</button>` : '';
        html += `<div class="bg-white/5 border border-white/10 p-6 rounded-2xl cursor-pointer hover:bg-white/10 transition shadow-lg w-full" onclick="openDetalleServicio('${v.id}')">
            <div class="flex justify-between items-start">
                <span class="font-black text-white text-base break-words">${v.clientName || (v.phone ? v.phone.replace('+52', '') : 'Sin nombre')}</span>
                <span class="text-[12px] font-black uppercase px-3 py-1 rounded ${statusColor} shrink-0">${v.tallerStatus}</span>
            </div>
            <p class="text-sm text-gray-400 mt-2">${v.falla}</p>
            ${pdfBtn}
        </div>`;
    });
    html += '</div></div>';
    return html;
};
        list.innerHTML = renderBlock('📥 Recibidas', recibidas, 'text-gray-400', 'border-gray-500/30') +
                         renderBlock('🔧 En Mecánica', mecanica, 'text-yellow-400', 'border-yellow-500/30') +
                         renderBlock('🧪 En Pruebas', pruebas, 'text-blue-400', 'border-blue-500/30') +
                         renderBlock('✅ Listas para Entrega', listas, 'text-green-400', 'border-green-500/30');
    });
};

window.adminIngresarServicioManual = async () => {
    const phone = document.getElementById('manual-srv-phone').value.trim() || null;
    const moto = document.getElementById('manual-srv-moto').value.trim();
    const falla = document.getElementById('manual-srv-falla').value.trim();
    const fileInput = document.getElementById('manual-srv-media');
    if(!moto || !falla) return showToast("Completar marca/modelo y falla", true);

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
            phone: phone ? "+52" + phone : null,
            marca: moto.split(' ')[0] || moto,
            modelo: moto.replace(moto.split(' ')[0], '').trim() || moto,
            falla,
            mediaUrl: mediaUrls.length === 1 ? mediaUrls[0] : (mediaUrls.length > 1 ? mediaUrls : ''),
            status: 'completed',
            tallerStatus: 'recibida',
            timestamp: Date.now()
        });
        showToast("Moto ingresada al Taller");
        toggleModal('modal-nuevo-servicio', false);
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
    const soloLectura = data.tallerStatus === 'lista' || data.tallerStatus === 'pagado';
    document.getElementById('servicio-detalle-phone').innerText = `${data.shortId || ''} - ${data.phone || 'Sin teléfono'}`;
    document.getElementById('servicio-detalle-info').innerHTML = `<p class="text-xs text-white">Moto: ${data.marca||''} ${data.modelo||''} ${data.cc||''}<br><br>${data.falla}</p>`;

    const mediaContainer = document.getElementById('servicio-fotos-container');
    let existingUrls = [];
    if (data.mediaUrl) {
        existingUrls = Array.isArray(data.mediaUrl) ? data.mediaUrl : [data.mediaUrl];
    }
    mediaContainer.innerHTML = existingUrls.map(url => `<img src="${url}" class="h-20 w-20 object-contain rounded-xl border border-white/10 cursor-pointer" onclick="window.openImageLightbox('${url}')">`).join('');
    if (existingUrls.length === 0) mediaContainer.innerHTML = '<p class="text-[10px] text-gray-500 italic">Sin fotos</p>';

    const addPhotoBtn = document.getElementById('servicio-add-photo-btn');
    const actionsContainer = document.getElementById('servicio-actions-container');
    const comentarioInput = document.getElementById('servicio-comentario');
    const comentarioBtn = comentarioInput?.nextElementSibling;

    if (soloLectura) {
        if (addPhotoBtn) addPhotoBtn.classList.add('hidden');
        if (actionsContainer) actionsContainer.classList.add('hidden');
        if (comentarioInput) comentarioInput.disabled = true;
        if (comentarioBtn) comentarioBtn.classList.add('hidden');
    } else {
        if (addPhotoBtn) {
            addPhotoBtn.classList.remove('hidden');
            addPhotoBtn.onclick = () => window.addExtraPhotos(id);
        }
        if (actionsContainer) actionsContainer.classList.remove('hidden');
        if (comentarioInput) comentarioInput.disabled = false;
        if (comentarioBtn) comentarioBtn.classList.remove('hidden');
    }

    window.loadServicioBitacora(id);
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
    document.getElementById('servicio-comentario').value = '';
    window.loadServicioBitacora(currentDetalleServicioId);
};

window.cambiarEstadoServicio = async (nuevoEstado) => {
    if(!currentDetalleServicioId) return;
    const docRef = doc(db, "rescates", currentDetalleServicioId); const docSnap = await getDoc(docRef); if(!docSnap.exists()) return;
    const actual = docSnap.data().tallerStatus;
    if(actual === 'lista' || actual === 'pagado') return showToast("No se puede cambiar, ya finalizó", true);

    await updateDoc(docRef, { tallerStatus: nuevoEstado });

    if(docSnap.data().uid) push(dbRef(rtdb, 'sos_alerts/' + docSnap.data().uid + '/notifs'), { msg: nuevoEstado === 'pruebas' ? 'CONTINUAMOS TRABAJANDO EN TU MOTO' : (nuevoEstado === 'lista' ? 'TU MOTO YA CASI ESTA LISTA, ESPERA AL MECÁNICO' : 'MOTO EN MECÁNICA') });

    playSound('notif'); showToast(`Estado cambiado a ${nuevoEstado}`); toggleModal('modal-detalle-servicio', false);
};

// === HISTORIAL DEL CLIENTE ===
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
    const pdfDoc = new jsPDF();
    const addFooter = window._setupProfessionalPDF(pdfDoc, 'COMPROBANTE DE SERVICIO', null);
    const pageWidth = pdfDoc.internal.pageSize.getWidth();

    let y = 38;
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(30,41,59);

    // Tarjeta de datos del servicio
    pdfDoc.setFillColor(245, 245, 245);
    pdfDoc.roundedRect(12, y, pageWidth - 24, 30, 3, 3, 'FD');
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text(`Servicio: ${data.shortId || 'Sin ID'}`, 16, y + 10);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.text(`Cliente: ${window.currentUserDoc?.name || 'No identificado'}`, 16, y + 18);
    pdfDoc.text(`Moto: ${data.marca || ''} ${data.modelo || ''} (${data.cc || ''})`, 16, y + 26);
    y += 38;

    // Badge de estado
    const estado = data.status || 'pendiente';
    const colorEstado = estado === 'completed' ? [34, 197, 94] : estado === 'cancelled' ? [239, 68, 68] : [251, 191, 36];
    pdfDoc.setFillColor(...colorEstado);
    pdfDoc.roundedRect(pageWidth - 55, y - 4, 42, 12, 3, 3, 'F');
    pdfDoc.setFontSize(7);
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text(estado.toUpperCase(), pageWidth - 53, y + 4);

    pdfDoc.setTextColor(30,41,59);
    pdfDoc.setFontSize(10);
    pdfDoc.setFont("helvetica", "normal");

    // Fecha
    pdfDoc.text(`Fecha: ${new Date(data.timestamp).toLocaleString('es-MX')}`, 16, y + 8);
    y += 18;

    // Descripción
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text("Descripción:", 16, y);
    y += 7;
    pdfDoc.setFont("helvetica", "normal");
    const descLines = pdfDoc.splitTextToSize(data.falla || '', pageWidth - 32);
    pdfDoc.text(descLines, 16, y);
    y += descLines.length * 5 + 10;

    // Detalle de taller (si existe)
    if (data.tallerStatus) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(`Estado en taller: ${data.tallerStatus}`, 16, y);
        y += 10;
    }

    // Costo
    if (data.costoRescateEstimado) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(`Costo: $${data.costoRescateEstimado.toFixed(2)}`, 16, y);
        y += 12;
    }

    addFooter(pdfDoc);
    pdfDoc.save(`Servicio_${data.shortId || serviceId}.pdf`);
};

// === CITAS DEL CLIENTE ===
window.loadClientCitas = () => {
    if(!window.currentUserDoc) return;
    if(citasListener) citasListener();
    citasListener = onSnapshot(query(collection(db, "citas"), where("phone", "==", window.currentUserDoc.phone)), (snap) => {
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
    });
};

window.solicitarNuevaCita = () => {
    toggleModal('modal-nueva-cita', true);
};

// === LIGHTBOX PARA IMÁGENES ===
window.openImageLightbox = (url) => {
    const lightboxId = 'modal-image-lightbox';
    let modalEl = document.getElementById(lightboxId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = lightboxId;
        modalEl.className = 'fixed inset-0 bg-black/90 z-[400] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.onclick = () => toggleModal(lightboxId, false);
        modalEl.innerHTML = `<div class="max-w-[90vw] max-h-[90vh]"><img id="lightbox-img" src="" class="max-w-full max-h-full object-contain rounded-xl"></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById('lightbox-img').src = url;
    toggleModal(lightboxId, true);
};

// === GARANTÍAS ===
window.calcularFechaFinGarantia = (tipo) => {
    if (!tipo || tipo === 'Sin garantía' || tipo === 'No aplica') return null;
    const ahora = new Date();
    const match = tipo.match(/(\d+)\s*(días|dias|día|dia|mes|meses)/i);
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

window.searchGarantiaByCodigo = () => {
    window.promptModal("Ingresa el código de compra (OBR-...):", "", async (codigo) => {
        if (!codigo) return;
        const snap = await getDocs(query(collection(db, "garantias"), where("ventaId", ">=", ""), where("ventaId", "<=", "z")));
        let resultado = '';
        snap.forEach(d => {
            const g = d.data();
            if (g.ventaId && g.ventaId.toLowerCase().includes(codigo.toLowerCase())) {
                resultado += `<div class="bg-white/5 p-2 rounded text-xs text-white mb-1">
                    <p><span class="font-bold">${g.producto}</span> - ${g.tipoGarantia}</p>
                    <p class="text-gray-400">Estado: ${g.estado}</p>
                    <p class="text-gray-400">Vence: ${g.fechaFin ? new Date(g.fechaFin).toLocaleDateString() : 'N/A'}</p>
                </div>`;
            }
        });
        if (!resultado) return showToast("No se encontraron garantías para ese código", true);
        const modalId = 'modal-garantias-result';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-green-500/30" id="${modalId}-content"></div>`;
            document.body.appendChild(modalEl);
        }
        document.getElementById(`${modalId}-content`).innerHTML = `<button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button><h3 class="text-lg font-black text-white mb-3">Garantías encontradas</h3>${resultado}`;
        toggleModal(modalId, true);
    });
};

// === REPORTE PDF DE SERVICIO COMPLETADO (con mapa de ruta del mecánico) ===
window.downloadCompletedServicePDF = async (id) => {
    const docSnap = await getDoc(doc(db, "rescates", id));
    if (!docSnap.exists()) return showToast("Servicio no encontrado", true);
    const data = docSnap.data();

    const bSnap = await getDocs(collection(db, "rescates", id, "bitacora"));
    let bitacora = [];
    bSnap.forEach(d => bitacora.push(d.data()));
    bitacora.sort((a, b) => a.ts - b.ts);

    const ventasSnap = await getDocs(query(collection(db, "ventas"), where("sosId", "==", id), limit(1)));
    let venta = null;
    ventasSnap.forEach(v => { venta = v.data(); });

    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const addFooter = window._setupProfessionalPDF(pdfDoc, 'REPORTE DE SERVICIO OBR', null);
    const pageWidth = pdfDoc.internal.pageSize.getWidth();

    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(30, 41, 59);
    pdfDoc.setFont("helvetica", "normal");

    // Tarjeta de datos del cliente
    let y = 40;
    pdfDoc.setDrawColor(230);
    pdfDoc.setFillColor(248, 248, 248);
    pdfDoc.roundedRect(15, y, pageWidth - 30, 30, 3, 3, 'FD');
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text(`Servicio: ${data.shortId || id}`, 20, y + 10);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.text(`Cliente: ${data.clientName || data.phone || 'No identificado'}`, 20, y + 17);
    pdfDoc.text(`Moto: ${data.marca || ''} ${data.modelo || ''}`, 20, y + 24);
    y += 40;

    // Falla reportada
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text("Falla reportada:", 20, y);
    y += 6;
    pdfDoc.setFont("helvetica", "normal");
    const fallaLines = pdfDoc.splitTextToSize(data.falla || '', pageWidth - 40);
    pdfDoc.text(fallaLines, 20, y);
    y += fallaLines.length * 5 + 10;

    // Timeline de bitácora
    if (bitacora.length > 0) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Bitácora del taller:", 20, y);
        y += 8;
        pdfDoc.setFont("helvetica", "normal");
        bitacora.forEach(entry => {
            if (y > 260) { pdfDoc.addPage(); y = 20; }
            const entryText = `${new Date(entry.ts).toLocaleString()} - ${entry.mechName}: ${entry.text}`;
            const lines = pdfDoc.splitTextToSize(entryText, pageWidth - 40);
            pdfDoc.text(lines, 20, y);
            y += lines.length * 5 + 3;
        });
        y += 10;
    }

    // Tabla de venta si existe
    if (venta) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Detalle de Venta:", 20, y);
        y += 8;
        const body = venta.ticket.map(item => [item.name, `$${item.price.toFixed(2)}`, item.garantia || '']);
        pdfDoc.autoTable({
            startY: y,
            head: [['Producto', 'Precio', 'Garantía']],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, textColor: [30,41,59] },
            headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
            columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 25, halign: 'right' }, 2: { cellWidth: 40 } },
            margin: { left: 20 }
        });
        y = pdfDoc.lastAutoTable.finalY + 10;
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(`Total: $${venta.total.toFixed(2)}`, 20, y);
        y += 15;
    } else if (data.costoRescateEstimado) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(`Costo estimado: $${data.costoRescateEstimado}`, 20, y);
        y += 10;
    }

    // Mapa de trayectoria del mecánico (si existe)
    if (data.mech_track && data.mech_track.length > 1) {
        try {
            // Cargar html2canvas si aún no está disponible
            await window.loadHtml2Canvas();
            
            // Crear div oculto para renderizar el mapa
            const mapId = 'temp-track-map-' + Date.now();
            const mapDiv = document.createElement('div');
            mapDiv.id = mapId;
            mapDiv.style.width = '500px';
            mapDiv.style.height = '300px';
            mapDiv.style.position = 'absolute';
            mapDiv.style.top = '-2000px';
            mapDiv.style.left = '-2000px';
            mapDiv.style.zIndex = '-1';
            mapDiv.style.visibility = 'hidden';
            document.body.appendChild(mapDiv);

            const trackMap = L.map(mapId, { 
                zoomControl: false, 
                attributionControl: false,
                scrollWheelZoom: false,
                dragging: false 
            }).setView([data.mech_track[0].lat, data.mech_track[0].lng], 13);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(trackMap);
            
            const coords = data.mech_track.map(p => [p.lat, p.lng]);
            L.polyline(coords, { color: '#FF6B00', weight: 4, opacity: 0.8 }).addTo(trackMap);
            
            // Marcadores de inicio y fin
            L.circleMarker(coords[0], { radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1 }).addTo(trackMap)
                .bindPopup('Inicio del recorrido');
            L.circleMarker(coords[coords.length-1], { radius: 6, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(trackMap)
                .bindPopup('Llegada al servicio');
            
            trackMap.fitBounds(L.latLngBounds(coords).pad(0.2));
            
            // Forzar recálculo de tamaño y esperar carga de teselas
            mapDiv.style.visibility = 'visible';
            setTimeout(() => trackMap.invalidateSize(), 300);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Capturar el mapa como imagen
            const canvas = await html2canvas(mapDiv, { useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            
            // Insertar imagen en el PDF
            if (y > 220) { pdfDoc.addPage(); y = 25; }
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setFontSize(10);
            pdfDoc.text("Ruta seguida por el mecánico:", 20, y);
            y += 8;
            pdfDoc.addImage(imgData, 'PNG', 20, y, pageWidth - 40, 75);
            y += 85;
            
            // Limpiar div temporal
            document.body.removeChild(mapDiv);
        } catch (mapError) {
            console.warn('No se pudo generar el mapa:', mapError);
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(150);
            pdfDoc.text("(Mapa de ruta no disponible)", 20, y + 10);
            y += 15;
        }
    }

    addFooter(pdfDoc);
    pdfDoc.save(`Reporte_${data.shortId || id}.pdf`);
};

window.editService = (serviceId) => {
    getDoc(doc(db, "servicios", serviceId)).then(snap => {
        if (!snap.exists()) return;
        const s = snap.data();
        window.promptModal("Nuevo nombre del servicio:", s.name, async (newName) => {
            if (!newName) return;
            window.promptModal("Nuevo precio:", s.price.toString(), async (newPriceStr) => {
                const newPrice = parseFloat(newPriceStr);
                if (isNaN(newPrice)) return showToast("Precio inválido", true);
                await updateDoc(doc(db, "servicios", serviceId), { name: newName, price: newPrice });
                showToast("Servicio actualizado");
                loadServicesCatalog();
                refreshCatalogUI();
            });
        });
    });
};

window.deleteService = (serviceId) => {
    window.confirmModal("¿Eliminar este servicio del catálogo?", async () => {
        await deleteDoc(doc(db, "servicios", serviceId));
        showToast("Servicio eliminado");
        loadServicesCatalog();
        refreshCatalogUI();
    });
};

function refreshCatalogUI() {
    if (document.getElementById('a-view-config') && !document.getElementById('a-view-config').classList.contains('hidden')) {
        const catalogList = document.getElementById('admin-service-catalog');
        if (catalogList) {
            getDocs(collection(db, "servicios")).then(snap => {
                catalogList.innerHTML = '';
                snap.forEach(d => {
                    const s = d.data();
                    catalogList.innerHTML += `<div class="flex justify-between bg-white/5 p-2 rounded text-xs">
                        <span>${s.name} ($${s.price})</span>
                        <div>
                            <button onclick="window.editService('${d.id}')" class="text-blue-400 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="window.deleteService('${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`;
                });
            });
        }
    }
}

// === FUNCIONES DE ALMACÉN: eliminar, ocultar, modificar stock ===
window.eliminarProductoInventario = (productId) => {
    window.confirmModal("¿Eliminar este producto del almacén permanentemente?", async () => {
        await deleteDoc(doc(db, "inventario", productId));
        showToast("Producto eliminado");
        window.adminLoadInventory();
        loadPublicStore();
    });
};

window.toggleProductoVisible = async (productId, visible) => {
    await updateDoc(doc(db, "inventario", productId), { visible: !visible });
    showToast(visible ? "Producto oculto de tienda" : "Producto visible en tienda");
    window.adminLoadInventory();
    loadPublicStore();
};

window.modificarStock = (productId) => {
    const p = adminInventoryList.find(x => x.id === productId);
    if (!p) return;
    window.promptModal("Nuevo stock:", p.stock.toString(), async (newStock) => {
        if (newStock === null || newStock === '') return;
        const stockNum = parseInt(newStock);
        if (isNaN(stockNum)) return showToast("Valor inválido", true);
        
        // Preguntar si quiere cambiar también los precios
        window.confirmModal("¿Quieres actualizar también los precios de venta?", 
            async () => {
                window.promptModal("Nuevo precio de compra (costo):", p.cost?.toString() || '0', async (newCost) => {
                    if (newCost === null || newCost === '') return;
                    const costNum = parseFloat(newCost);
                    if (isNaN(costNum)) return showToast("Valor inválido", true);
                    
                    // Recalcular automáticamente los tres precios
                    const newTaller = (costNum * 1.3).toFixed(2);
                    const newMember = (costNum * 1.4).toFixed(2);
                    const newPublic = (costNum * 1.6).toFixed(2);
                    
                    await updateDoc(doc(db, "inventario", productId), {
                        stock: stockNum,
                        cost: costNum,
                        priceTaller: parseFloat(newTaller),
                        priceMember: parseFloat(newMember),
                        pricePublic: parseFloat(newPublic),
                        originalPrice: parseFloat(newPublic)
                    });
                    showToast(`Stock y precios actualizados. Público: $${newPublic}`);
                    window.adminLoadInventory();
                    loadPublicStore();
                });
            },
            async () => {
                // Solo actualizar stock
                await updateDoc(doc(db, "inventario", productId), { stock: stockNum });
                showToast("Stock actualizado");
                window.adminLoadInventory();
                loadPublicStore();
            }
        );
    });
};

// ======================================================
// ==================== CAJA / POS ======================
// ======================================================

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
window.addToCart = (productName, price) => {
    if (!window.cart) window.cart = [];
    window.cart.push({ name: productName, price: price });
    // Actualizar contadores visuales
    const cartCountEl = document.getElementById('cart-count');
    if (cartCountEl) cartCountEl.innerText = window.cart.length;
    const cartCountMobile = document.getElementById('cart-count-mobile');
    if (cartCountMobile) cartCountMobile.innerText = window.cart.length;
    showToast(`${productName} añadido al carrito`);
    // Renderizar carrito en modal si está abierto
    window.renderCartItems?.();
};

window.renderCartItems = () => {
    const itemsContainer = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (!itemsContainer || !totalEl) return;
    itemsContainer.innerHTML = '';
    let total = 0;
    (window.cart || []).forEach((item, idx) => {
        total += item.price;
        itemsContainer.innerHTML += `<div class="flex justify-between items-center text-white text-sm bg-white/5 p-2 rounded-lg mb-2">
            <span>${item.name}</span>
            <div>
                <span class="font-bold">$${item.price.toFixed(2)}</span>
                <button onclick="window.removeFromCart(${idx})" class="text-red-400 ml-2"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    });
    totalEl.innerText = total.toFixed(2);
};
window.removeFromCart = (idx) => {
    window.cart.splice(idx, 1);
    window.renderCartItems();
    document.getElementById('cart-count').innerText = window.cart.length;
    document.getElementById('cart-count-mobile').innerText = window.cart.length;
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
        window.promptModal("Garantía para este producto:\n(Dejar vacío = Sin garantía, o escribe: 15 días, 1 mes, 2 meses, 3 meses, No aplica)", "", (garantia) => {
            window.posTicket.push({ type: 'almacen', id: p.id, name: p.name, price: p.priceTaller, cost: p.cost, garantia: garantia || 'Sin garantía' });
            window.renderTicket(); showToast("Agregado");
        });
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

// ===== CHECKOUT Y FINALIZAR VENTA =====
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

        for (let g of garantias) {
            await addDoc(collection(db, "garantias"), {
                ...g,
                ventaId: docRef.id,
                clienteCel: phone ? "+52"+phone : null,
                fechaVenta: new Date().toISOString()
            });
        }

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

        window.imprimirTicketVenta(docRef.id, saleData);

        const ticketRespaldo = [...window.posTicket];
        
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
        window.adminLoadSales();
        window.adminListenServices();
        if (phone) {
            try {
                window.sendTicketWhatsAppAfterCheckout(phone, totalToPay, ticketRespaldo);
            } catch (e) {
                console.warn('Error al enviar WhatsApp:', e);
            }
        }
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
window.imprimirTicketVenta = (ventaId, saleData) => {
    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    
    pdfDoc.setFillColor(255, 107, 0);
    pdfDoc.rect(0, 0, 210, 30, 'F');
    const logoImg = new Image();
    logoImg.src = 'logo.png';
    const generar = () => {
        if (logoImg.complete && logoImg.naturalWidth > 0) {
            pdfDoc.addImage(logoImg, 'PNG', 10, 3, 20, 20);
        }
        pdfDoc.setFontSize(18);
        pdfDoc.setTextColor(255, 255, 255);
        pdfDoc.text("COMPROBANTE DE VENTA", logoImg.complete ? 35 : 14, 15);
        pdfDoc.setTextColor(0,0,0);
        pdfDoc.setFontSize(8);
        pdfDoc.text(`Ticket: ${saleData.shortId}`, 14, 40);
        pdfDoc.text(`Fecha: ${new Date(saleData.fecha).toLocaleString()}`, 14, 46);
        pdfDoc.text(`Método: ${saleData.metodoPago}`, 14, 52);
        if (saleData.clienteCel) pdfDoc.text(`Cliente: ${saleData.clienteCel}`, 14, 58);

        const body = saleData.ticket.map(item => [
            item.name,
            `$${item.price.toFixed(2)}`,
            item.garantia || 'Sin garantía'
        ]);
        pdfDoc.autoTable({
            startY: 65,
            head: [['Producto', 'Precio', 'Garantía']],
            body: body,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 25, halign: 'right' },
                2: { cellWidth: 40 }
            },
            margin: { left: 14 }
        });

        const finalY = pdfDoc.lastAutoTable.finalY + 10;
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(`Total: $${saleData.total.toFixed(2)}`, 14, finalY);
        pdfDoc.setFontSize(7);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text("Gracias por su compra. Conserve este ticket para garantías.", 14, finalY + 10);

        try {
            const blob = pdfDoc.output('blob');
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');
            if (printWindow) printWindow.onload = () => printWindow.print();
            const link = document.createElement('a');
            link.href = url;
            link.download = `Venta_${saleData.shortId}.pdf`;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
        } catch(e) { console.warn('Auto-impresión bloqueada'); pdfDoc.save(`Venta_${saleData.shortId}.pdf`); }
    };
    if (logoImg.complete) generar();
    else { logoImg.onload = generar; logoImg.onerror = generar; }
};

window.sendTicketWhatsAppAfterCheckout = (phone, total, ticketItems) => {
    if (!ticketItems || !ticketItems.length) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const items = ticketItems.map(i => `- ${i.name}: $${i.price} ${i.garantia ? '(Garantía: '+i.garantia+')' : ''}`).join('\n');
    const msg = `🧾 *Ticket OBR*\n${items}\n\n*Total: $${total}*`;
    const url = `https://api.whatsapp.com/send?phone=+52${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

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
    const saleData = snap.data();
    // Llama a la misma función de impresión (que ahora imprime automáticamente)
    window.imprimirTicketVenta(ventaId, saleData);
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

window.loadGarantias = async () => {
    const container = document.getElementById('garantias-list');
    if (!container) return;
    const ahora = new Date();
    const snap = await getDocs(collection(db, "garantias"));
    const batch = [];
    snap.forEach(d => {
        const g = d.data();
        if (g.estado === 'activa' && g.fechaFin && new Date(g.fechaFin) < ahora) {
            batch.push(updateDoc(doc(db, "garantias", d.id), { estado: 'vencida' }));
        }
    });
    if (batch.length) await Promise.all(batch);
    
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
// ======================================================
// === INVENTARIO Y PRODUCTOS ===
// ======================================================
window.adminLoadInventory = async () => {
    try {
        const snap = await getDocs(collection(db, "inventario"));
        adminInventoryList = [];
        let listHtml = '';
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            adminInventoryList.push(d);
            let precioHtml = `$${d.pricePublic?.toFixed(2)}`;
            if (d.originalPrice && d.originalPrice > d.pricePublic) {
                precioHtml = `<span class="line-through text-gray-500 text-xs mr-1">$${d.originalPrice.toFixed(2)}</span><span class="text-naranja font-black text-lg">$${d.pricePublic.toFixed(2)}</span>`;
            } else {
                precioHtml = `<span class="text-naranja font-black text-lg">$${d.pricePublic?.toFixed(2)}</span>`;
            }
            const eyeIcon = d.visible === false ? 'fa-eye-slash' : 'fa-eye';
            listHtml += `<div class="bg-white/5 p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col justify-between" onclick="window.openProductDetail?.('${doc.id}')">
                <div>
                    <p class="text-white font-bold text-sm mb-1">${d.name}</p>
                    <p class="text-naranja font-black text-lg">${precioHtml}</p>
                </div>
                <div class="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                    <span class="text-xs text-gray-400">Stock: <b class="${d.stock>0?'text-green-400':'text-red-500'}">${d.stock}</b></span>
                    ${d.category ? `<span class="text-[10px] text-gray-500 uppercase bg-white/5 px-2 py-0.5 rounded">${d.category}</span>` : ''}
                    <div class="flex space-x-1">
                        <button onclick="event.stopPropagation(); window.modificarStock('${doc.id}')" class="text-blue-400 text-xs"><i class="fas fa-edit"></i></button>
                        <button onclick="event.stopPropagation(); window.toggleProductoVisible('${doc.id}', ${d.visible !== false})" class="text-yellow-400 text-xs"><i class="fas ${eyeIcon}"></i></button>
                        <button onclick="event.stopPropagation(); window.eliminarProductoInventario('${doc.id}')" class="text-red-400 text-xs"><i class="fas fa-trash"></i></button>
                    </div>
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
        const originalPrice = parseFloat(publicPrice);
        // Validar que la categoría no esté vacía
const category = document.getElementById('inv-category')?.value || '';
if (!category) return showToast("Selecciona una categoría para el producto", true);
        await addDoc(collection(db, "inventario"), { 
            name, 
            desc: document.getElementById('inv-desc')?.value.trim() || '', 
            stock: parseInt(document.getElementById('inv-stock')?.value) || 0, 
            cost: parseFloat(document.getElementById('inv-cost')?.value) || 0, 
            priceTaller: parseFloat(taller), 
            priceMember: parseFloat(member), 
            pricePublic: originalPrice, 
            originalPrice: originalPrice,
            category,
            imgUrl: mediaUrl, 
            visible: true,
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

// ======================================================
// === PROMOCIONES Y DESCUENTOS ===
// ======================================================
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
        newPrice = discount;
    }
    await updateDoc(productRef, { pricePublic: newPrice, originalPrice: originalPrice });
    showToast(`Descuento aplicado: ahora $${newPrice.toFixed(2)}`);
    window.adminLoadInventory();
    loadPublicStore();
    window.renderDiscountedProductsList();
};

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

// ======================================================
// === ADMIN LEALTAD Y CÓDIGOS (con notificación) ===
// ======================================================
window.adminSaveLoyalty = async () => {
    const code = document.getElementById('loyalty-code')?.value.trim().toUpperCase();
    if (!code) return showToast("Ingresa un código", true);
    const condition = document.getElementById('loyalty-condition')?.value;
    const rewardType = document.getElementById('loyalty-reward-type')?.value;
    const rewardVal = document.getElementById('loyalty-reward-val')?.value.trim();
    const audience = document.getElementById('loyalty-audience')?.value;
    const maxUsos = parseInt(document.getElementById('loyalty-max-usos')?.value) || 0;
    if (!rewardVal) return showToast("Valor de recompensa requerido", true);

    const promoData = {
        codigo: code,
        tipoRecompensa: rewardType,
        valorRecompensa: rewardVal,
        active: true,
        maxUsos: maxUsos,
        usos: 0,
        condition,
        audience,
        timestamp: Date.now()
    };
    await addDoc(collection(db, "promociones"), promoData);
    showToast("Promoción activada. Notificando usuarios...");
    window.adminLoadLoyalty();

    // Notificar usuarios según audiencia
    const usersSnap = await getDocs(collection(db, "users"));
    const msg = `🎉 ¡Nuevo código de descuento! Usa "${code}" y obtén ${rewardType === 'desc_porc' ? rewardVal + '% de descuento' : '$' + rewardVal + ' de descuento'}.`;
    usersSnap.forEach(async (userDoc) => {
        const user = userDoc.data();
        let notificar = false;
        if (audience === 'both') notificar = true;
        else if (audience === 'vip' && (user.role === 'membresia' || user.role === 'admin')) notificar = true;
        else if (audience === 'general' && user.role !== 'membresia' && user.role !== 'admin') notificar = true;

        if (notificar) {
            await rtdbSet(dbRef(rtdb, 'notificaciones/' + userDoc.id), { msg });
        }
    });
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
    window.confirmModal("¿Eliminar esta promoción?", async () => {
        await deleteDoc(doc(db, "promociones", promoId));
        showToast("Promoción eliminada");
        window.adminLoadLoyalty();
    });
};

// ======================================================
// === VIDEO BANNER (con previsualización) ===
// ======================================================
window.renderVideoScheduleDays = () => {
    const container = document.getElementById('video-schedule-days');
    if (!container) return;
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let html = '';
    dias.forEach((dia, index) => {
        const currentURL = globalSettings.videoSchedule?.[index] || '';
        const tieneVideo = currentURL && currentURL.trim() !== '';
        const mostrarBotonAnterior = index > 0; // No mostrar en lunes
        html += `
        <div class="bg-black/40 p-4 rounded-2xl border border-white/10">
            <div class="flex justify-between items-center mb-2">
                <p class="font-black text-sm text-white">${dia}</p>
                <div class="flex space-x-1">
                    ${mostrarBotonAnterior ? `<button onclick="window.usePreviousDayVideo(${index})" class="text-[9px] bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded-lg font-bold uppercase" title="Usar video del día anterior"><i class="fas fa-copy mr-1"></i>Usar anterior</button>` : ''}
                    ${tieneVideo ? `<button onclick="window.removeDayVideo(${index})" class="text-[9px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg font-bold uppercase"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
            <input type="file" accept="video/*" id="video-input-${index}" class="hidden" onchange="window.handleVideoFile(this, ${index})" />
            <button onclick="document.getElementById('video-input-${index}').click()" class="w-full bg-white/5 border border-dashed border-white/20 p-4 rounded-xl text-xs text-gray-400 hover:border-naranja transition-colors mb-2">
                <i class="fas fa-cloud-upload-alt mr-2"></i>Seleccionar archivo
            </button>
            <div id="video-progress-${index}" class="hidden mt-2">
                <div class="w-full bg-gray-700 rounded-full h-2">
                    <div id="video-progress-bar-${index}" class="bg-naranja h-2 rounded-full" style="width: 0%"></div>
                </div>
                <p id="video-progress-text-${index}" class="text-[9px] text-gray-400 mt-1">0%</p>
            </div>
            <div id="video-preview-${index}" class="mt-2 ${tieneVideo ? '' : 'hidden'}">
                ${tieneVideo ? `<video src="${currentURL}" controls class="w-full max-h-32 rounded-lg object-contain bg-black"></video>` : ''}
                <p class="text-[9px] text-gray-400 mt-1 truncate" id="video-name-${index}">${tieneVideo ? currentURL.split('/').pop().substring(0, 40) : 'Sin video'}</p>
            </div>
        </div>`;
    });
    container.innerHTML = html;
};

window.handleVideoFile = (input, dayIndex) => {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Validar tamaño (50 MB máximo)
        if (file.size > 50 * 1024 * 1024) {
            showToast("El video no debe superar 50 MB", true);
            return;
        }

        const progressDiv = document.getElementById(`video-progress-${dayIndex}`);
        const progressBar = document.getElementById(`video-progress-bar-${dayIndex}`);
        const progressText = document.getElementById(`video-progress-text-${dayIndex}`);

        // Mostrar barra de progreso
        if (progressDiv) progressDiv.classList.remove('hidden');
        
        // Subir a Storage
        const path = `videos_promocionales/${Date.now()}_${file.name}`;
        const storageRef = sRef(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressText) progressText.innerText = `${Math.round(progress)}%`;
            },
            (error) => {
                console.error('Error al subir video:', error);
                showToast("Error al subir el video", true);
                if (progressDiv) progressDiv.classList.add('hidden');
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                // Guardar URL en settings
                if (!globalSettings.videoSchedule) globalSettings.videoSchedule = {};
                globalSettings.videoSchedule[dayIndex] = downloadURL;
                
                // Ocultar barra de progreso
                if (progressDiv) progressDiv.classList.add('hidden');
                
                // Refrescar el modal
                window.renderVideoScheduleDays();
                showToast("Video subido correctamente");
            }
        );
    }
};

window.saveVideoSchedule = async () => {
    await setDoc(doc(db, "settings", "general"), { videoSchedule: globalSettings.videoSchedule }, { merge: true });
    showToast("Programación de videos guardada");
    toggleModal('modal-video-schedule', false);
    // Recargar video del día en el previsualizador
    window.loadPromoVideo();
    window.loadPromoPreview?.();
};

// ======================================================
// === AJUSTES GENERALES (GUARDAR) ===
// ======================================================
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
window.adminSaveMemPrice = async () => {
    const priceInput = document.getElementById('config-mem-price');
    if (!priceInput) return;
    const price = parseFloat(priceInput.value);
    if (isNaN(price) || price <= 0) return showToast("Ingresa un precio válido", true);
    globalSettings.membershipPrice = price;
    await setDoc(doc(db, "settings", "general"), { membershipPrice: price }, { merge: true });
    showToast(`Precio de membresía guardado: $${price.toFixed(2)}`);
    priceInput.value = price.toFixed(2);
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

window.togglePriceMode = () => {
    const mode = document.getElementById('config-price-mode')?.value;
    const fijoDiv = document.getElementById('config-price-fijo');
    const kmDiv = document.getElementById('config-price-km');
    if (fijoDiv) fijoDiv.style.display = mode === 'fijo' ? 'block' : 'none';
    if (kmDiv) kmDiv.style.display = mode === 'km' ? 'block' : 'none';
};

// ======================================================
// === CATÁLOGO DE SERVICIOS (con IA y edición) ===
// ======================================================
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
    refreshCatalogUI();
};

// Generar descripción IA para servicio (Ajustes)
window.generateAIDescription = () => {
    const nameEl = document.getElementById('new-service-name');
    const descEl = document.getElementById('new-service-desc');
    if(nameEl && descEl) {
        const name = nameEl.value.trim() || 'este servicio';
        descEl.value = `Servicio profesional OBR: ${name}. Realizado por mecánicos especializados con herramientas de alta calidad.`;
    }
};

// Nueva función: generar descripción IA para producto (Almacén)
window.generateAIInvDescription = () => {
    const nameEl = document.getElementById('inv-name');
    const descEl = document.getElementById('inv-desc');
    if (!nameEl || !descEl) return;
    const name = nameEl.value.trim() || 'este producto';
    const prompts = [
        `Repuesto original OBR: ${name}. La mejor calidad para tu moto. Aprovecha esta pieza de alto rendimiento.`,
        `${name} – Fabricado con los más altos estándares de calidad. Dale a tu moto el cuidado que merece con este componente OBR.`,
        `¿Buscas durabilidad? ${name} es la elección perfecta. Compatible, resistente y listo para instalarse.`,
        `${name}: la solución definitiva para mantener tu moto en perfecto estado. Solo en OBR.`,
        `Calidad y precio se unen en ${name}. No comprometas el rendimiento de tu moto, elige OBR.`,
        `Diseñado para durar. ${name} te ofrece la tranquilidad de una pieza fiable para el día a día.`,
        `${name} – Recomendado por mecánicos profesionales. Instálalo y siente la diferencia en cada kilómetro.`,
        `Tecnología y resistencia en ${name}. Pensado para quienes exigen lo mejor de su moto.`,
        `${name}: pieza esencial para el mantenimiento preventivo de tu motocicleta. Disponible ahora en OBR.`,
        `Confía en la calidad OBR. ${name} es justo lo que necesitas para seguir rodando sin preocupaciones.`
    ];
    descEl.value = prompts[Math.floor(Math.random() * prompts.length)];
};

// ======================================================
// === ADMIN USUARIOS Y DETALLE DE CLIENTES / STAFF ===
// ======================================================
window.adminAddUser = async () => {
    const phone = document.getElementById('add-user-phone')?.value.trim();
    const name = document.getElementById('add-user-name')?.value.trim();
    const role = document.getElementById('add-user-role')?.value;
    if (!phone || !name) return showToast("Completa celular y nombre", true);
    const fakeEmail = `${phone}@motorescateobr.com`;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, '123456');
        await setDoc(doc(db, "users", userCredential.user.uid), { phone: "+52"+phone, name, role, pwd: '123456', firstLogin: true, vistasPermitidas: ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas'] });
        showToast('Usuario creado. Deberá cambiar contraseña en su primer inicio.');
        window.adminLoadUsers();
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
const card = `<div class="bg-white/5 p-4 rounded-xl text-white text-sm flex justify-between items-center cursor-pointer" onclick="window.openUserDetail('${d.id}')">
    <span class="flex-1 truncate text-base">${u.name || (u.phone ? u.phone.replace('+52','') : 'Sin nombre')}</span>
    <div class="flex items-center space-x-2 ml-3">
        ${u.role === 'cliente' ? `<button onclick="event.stopPropagation(); window.promoteToVIP('${d.id}')" class="bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs font-bold uppercase flex items-center"><i class="fas fa-crown mr-1"></i>VIP</button>` : ''}
        ${u.role === 'membresia' ? `<button onclick="event.stopPropagation(); window.demoteFromVIP('${d.id}')" class="bg-gray-600 text-white px-3 py-1 rounded-lg text-xs font-bold uppercase flex items-center"><i class="fas fa-user mr-1"></i>Quitar</button>` : ''}
    </div>
</div>`;
        if (u.role === 'cliente' && normalList) normalList.innerHTML += card;
        else if (u.role === 'membresia' && vipList) vipList.innerHTML += card;
        else if (['admin','mecanico','taller','socio'].includes(u.role) && staffList) staffList.innerHTML += `<div class="bg-white/5 p-4 rounded-xl text-white text-sm flex justify-between items-center cursor-pointer" onclick="window.openStaffDetail('${d.id}')">
    <span class="text-base font-bold">${u.name || u.phone}</span><span class="text-yellow-400 text-sm"><i class="fas fa-star"></i> --</span>
</div>`;
    });
};

window.openUserDetail = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return showToast("Usuario no encontrado", true);
    const user = userDoc.data();
    document.getElementById('ud-name').innerText = user.name || 'Sin nombre';
    document.getElementById('ud-phone').innerText = user.phone;

const rescatesSnap = await getDocs(query(collection(db, "rescates"), where("phone", "==", user.phone)));
let rescates = [];
rescatesSnap.forEach(r => rescates.push(r));
rescates.sort((a, b) => b.data().timestamp - a.data().timestamp);
const historyDiv = document.getElementById('ud-history');
historyDiv.innerHTML = '';
rescates.forEach(r => {
    const rData = r.data();
    historyDiv.innerHTML += `<div class="bg-white/5 p-2 rounded text-xs text-white"><span class="font-bold">${rData.shortId || ''}</span> - ${rData.falla}</div>`;
});

    const comprasSnap = await getDocs(query(collection(db, "ventas"), where("clienteCel", "==", user.phone), orderBy("fecha", "desc"), limit(10)));
    const comprasDiv = document.getElementById('ud-compras');
    if (comprasDiv) {
        comprasDiv.innerHTML = '';
        comprasSnap.forEach(c => {
            const cData = c.data();
            comprasDiv.innerHTML += `<div class="bg-white/5 p-2 rounded text-xs text-white"><span class="font-bold">${cData.shortId}</span> - $${cData.total?.toFixed(2)}</div>`;
        });
    }

    const vipHistoryDiv = document.getElementById('ud-vip-history');
    if (vipHistoryDiv) {
        if (user.membresiaExp) {
            const expDate = new Date(user.membresiaExp);
            vipHistoryDiv.innerHTML = `<p class="text-xs text-yellow-400 font-bold">Membresía VIP vigente hasta ${expDate.toLocaleDateString()}</p>`;
        } else if (user.historialVIP && user.historialVIP.length) {
            vipHistoryDiv.innerHTML = user.historialVIP.map(h => `<p class="text-[10px] text-gray-400">Del ${new Date(h.inicio).toLocaleDateString()} al ${new Date(h.fin).toLocaleDateString()}</p>`).join('');
        } else {
            vipHistoryDiv.innerHTML = '<p class="text-xs text-gray-500">Nunca ha sido VIP</p>';
        }
    }

const vipBtn = document.getElementById('promote-vip-btn');
if (vipBtn) {
    vipBtn.classList.remove('hidden');
    if (user.role === 'membresia') {
        vipBtn.innerHTML = '<i class="fas fa-user mr-1"></i>Quitar VIP';
        vipBtn.className = 'bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase flex-shrink-0 mt-1';
        vipBtn.onclick = () => window.demoteFromVIP(uid);
    } else {
        vipBtn.innerHTML = '<i class="fas fa-crown mr-1"></i>VIP';
        vipBtn.className = 'bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase flex-shrink-0 mt-1';
        vipBtn.onclick = () => window.promoteToVIP(uid);
    }
}

    const bloquearBtn = document.getElementById('bloquear-usuario-btn');
    if (bloquearBtn) {
        bloquearBtn.classList.remove('hidden');
        bloquearBtn.onclick = () => window.toggleBloquearUsuario(uid, !user.bloqueado);
        bloquearBtn.innerText = user.bloqueado ? 'Desbloquear' : 'Bloquear';
    }
window._currentDetailUid = uid;
document.getElementById('edit-user-btn').onclick = () => window.adminEditUser(uid);
document.getElementById('delete-user-btn').onclick = () => window.adminDeleteUser(uid);
    toggleModal('modal-user-detail', true);
};

window.promoteToVIP = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    const user = userDoc.data();
    const now = Date.now();
    const exp = new Date(now);
    exp.setMonth(exp.getMonth() + 1);
    const historialVIP = user.historialVIP || [];
    historialVIP.push({ inicio: now, fin: exp.getTime() });
    await updateDoc(doc(db, "users", uid), { role: 'membresia', membresiaExp: exp.getTime(), historialVIP });
    // Enviar WhatsApp de bienvenida
    const mensajeVIP = encodeURIComponent(`🎉 ¡Felicitaciones ${user.name}! Has sido ascendido a SOCIO VIP de OBR. Disfruta de envíos gratis, descuentos exclusivos y atención prioritaria. Bienvenido al club.`);
    window.open(`https://api.whatsapp.com/send?phone=${user.phone}&text=${mensajeVIP}`, '_blank');

    // Enviar notificación sonora y visual dentro de la app
    const notifMsg = `🎉 ¡${user.name} ha sido promovido a VIP!`;
    showToast("Usuario promovido a VIP. WhatsApp enviado.");
    rtdbSet(dbRef(rtdb, 'notificaciones/' + uid), { msg: notifMsg });
    playSound('notif');
    speakTTS(notifMsg);
    window.adminLoadUsers();
    // Refrescar el detalle si el modal sigue abierto
    if (document.getElementById('modal-user-detail') && !document.getElementById('modal-user-detail').classList.contains('hidden')) {
        window.openUserDetail(uid);
    }
};

window.demoteFromVIP = async (uid) => {
    window.confirmModal("¿Quitar membresía VIP a este usuario? Volverá a Cliente Estándar.", async () => {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return showToast("Usuario no encontrado", true);
        const user = userSnap.data();
        const now = Date.now();
        const historialVIP = user.historialVIP || [];
        // Si tiene membresía activa, cerramos el período actual
        if (user.membresiaExp && user.membresiaExp > now) {
            for (let i = historialVIP.length - 1; i >= 0; i--) {
                if (historialVIP[i].fin > now || !historialVIP[i].fin) {
                    historialVIP[i].fin = now;
                    break;
                }
            }
        }
        await updateDoc(userRef, { role: 'cliente', membresiaExp: null, historialVIP });
        showToast("Usuario vuelve a Cliente Estándar");
        window.adminLoadUsers();
        if (document.getElementById('modal-user-detail') && !document.getElementById('modal-user-detail').classList.contains('hidden')) {
            window.openUserDetail(uid);
        }
    });
};

window.toggleBloquearUsuario = async (uid, bloquear) => {
    await updateDoc(doc(db, "users", uid), { bloqueado: bloquear });
    showToast(bloquear ? "Usuario bloqueado" : "Usuario desbloqueado");
    window.adminLoadUsers();
    if (!document.getElementById('modal-user-detail').classList.contains('hidden')) {
        window.openUserDetail(uid);
    }
};

window.adminEditUser = async (uid) => {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return showToast("Usuario no encontrado", true);
    const user = userSnap.data();
    const currentName = user.name || '';
    const currentPhone = (user.phone || '').replace('+52', '');
    window.promptModal("Nuevo nombre:", currentName, async (newName) => {
        if (newName === null) return; // cancelado
        window.promptModal("Nuevo teléfono (10 dígitos):", currentPhone, async (newPhone) => {
            if (newPhone === null) return;
            const cleanPhone = newPhone.trim();
            if (cleanPhone && !/^\d{10}$/.test(cleanPhone)) {
                return showToast("El teléfono debe tener 10 dígitos", true);
            }
            const updates = {};
            if (newName && newName !== currentName) updates.name = newName;
            if (cleanPhone && '+52' + cleanPhone !== user.phone) updates.phone = '+52' + cleanPhone;
            if (Object.keys(updates).length === 0) {
                showToast("Sin cambios");
                return;
            }
            await updateDoc(doc(db, "users", uid), updates);
            showToast("Usuario actualizado");
            window.adminLoadUsers();
            if (!document.getElementById('modal-user-detail')?.classList.contains('hidden')) {
                window.openUserDetail(uid);
            }
        });
    });
};

window.adminDeleteUser = (uid) => {
    window.confirmModal("¿Eliminar este usuario? Esta acción no se puede deshacer.", async () => {
        await deleteDoc(doc(db, "users", uid));
        showToast("Usuario eliminado");
        toggleModal('modal-user-detail', false);
        window.adminLoadUsers();
    });
};

// ======================================================
// === DETALLE DE MECÁNICO (STAFF) con permisos de vista ===
// ======================================================
window.openStaffDetail = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return;
    const user = userDoc.data();

    const rescatesSnap = await getDocs(query(collection(db, "rescates"), where("mech_uid", "==", uid), orderBy("timestamp", "desc")));
    let rescates = [];
    rescatesSnap.forEach(r => rescates.push({ id: r.id, ...r.data() }));
    rescates.sort((a, b) => b.timestamp - a.timestamp);

    let servicios = rescates.length;
    let ingresos = 0;
    rescates.forEach(r => { if (r.costoRescateEstimado) ingresos += r.costoRescateEstimado; });

    const satisfactionSnap = await getDocs(query(collection(db, "satisfaction"), where("uid", "==", uid), orderBy("timestamp", "desc")));
    let resenas = [];
    satisfactionSnap.forEach(s => resenas.push(s.data()));
    const calificaciones = resenas.map(r => r.rating);
    const promedio = calificaciones.length ? (calificaciones.reduce((a,b)=>a+b,0)/calificaciones.length).toFixed(1) : 'N/A';

    // Permisos
    const vistas = ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas'];
    const vistasNombres = ['Caja','Taller','SOS','Almacén','Promos','Usuarios','Ajustes','Estadíst.','Citas'];
    const vistasActuales = user.vistasPermitidas || vistas;
    let vistasHTML = vistas.map((v,i) => {
        const checked = vistasActuales.includes(v) ? 'checked' : '';
        return `<label class="flex items-center space-x-2 text-xs text-white cursor-pointer">
            <input type="checkbox" ${checked} onchange="window.toggleVistaPermitida('${uid}', '${v}', this.checked)">
            <span>${vistasNombres[i]}</span>
        </label>`;
    }).join('');

    // Estructura del modal en 2 columnas (izquierda: perfil, stats, permisos; derecha: servicios recientes, reseñas)
    const html = `
    <div class="flex flex-col lg:flex-row gap-6">
        <!-- Columna izquierda -->
        <div class="lg:w-1/3 space-y-4">
            <div class="flex items-center space-x-4">
                <div class="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-2xl"><i class="fas fa-user-cog"></i></div>
                <div>
                    <h3 class="text-xl font-black text-white">${user.name}</h3>
                    <p class="text-xs text-gray-400">${user.role}</p>
                </div>
            </div>
            <div class="flex items-center space-x-2">
                ${[1,2,3,4,5].map(i => `<i class="fas fa-star text-lg ${i <= promedio ? 'text-yellow-400' : 'text-gray-600'}"></i>`).join('')}
                <span class="text-yellow-400 font-black text-lg ml-2">${promedio}</span>
                <span class="text-gray-400 text-xs">(${resenas.length} reseñas)</span>
            </div>
            <div class="bg-white/5 p-4 rounded-xl border border-white/10">
                <p class="text-xs text-gray-400">Servicios realizados</p>
                <p class="text-2xl font-black text-white">${servicios}</p>
            </div>
            <div class="bg-white/5 p-4 rounded-xl border border-white/10">
                <p class="text-xs text-gray-400">Ingresos generados</p>
                <p class="text-2xl font-black text-naranja">$${ingresos.toFixed(2)}</p>
            </div>
            <div class="bg-white/5 p-4 rounded-xl border border-white/10">
                <p class="text-xs font-black text-blue-400 uppercase mb-3">Permisos de Vista</p>
                <div class="grid grid-cols-2 gap-2">${vistasHTML}</div>
            </div>
            <div class="flex space-x-2">
                <button onclick="window.togglePausarCuenta('${uid}', ${!user.pausada})" class="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded-xl font-black uppercase text-xs">${user.pausada ? 'Reactivar Cuenta' : 'Pausar Cuenta'}</button>
                <button onclick="window.downloadStaffReport('${uid}')" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl font-black uppercase text-xs">Descargar Reporte</button>
            </div>
        </div>
        <!-- Columna derecha -->
        <div class="lg:w-2/3 space-y-6">
            <div>
                <h4 class="text-sm font-black text-white uppercase border-b border-white/10 pb-2 mb-3">Últimos Servicios</h4>
                <div class="space-y-2 max-h-60 overflow-y-auto hide-scroll">
                    ${rescates.length === 0 ? '<p class="text-xs text-gray-500 italic">Sin servicios registrados.</p>' :
                    rescates.slice(0,10).map(r => `
                        <div class="bg-black/30 p-3 rounded-xl flex justify-between items-center">
                            <div>
                                <p class="text-xs font-bold text-white">${r.shortId || 'Sin ID'}</p>
                                <p class="text-[10px] text-gray-400 truncate max-w-[200px]">${r.falla || ''}</p>
                            </div>
                            <span class="text-[10px] text-naranja font-bold">$${r.costoRescateEstimado?.toFixed(2) || '0.00'}</span>
                        </div>`).join('')
                    }
                </div>
            </div>
            <div>
                <h4 class="text-sm font-black text-white uppercase border-b border-white/10 pb-2 mb-3">Reseñas de Clientes</h4>
                <div class="space-y-3 max-h-60 overflow-y-auto hide-scroll">
                    ${resenas.length === 0 ? '<p class="text-xs text-gray-500 italic">Sin reseñas aún.</p>' :
                    resenas.map(r => `
                        <div class="bg-black/30 p-4 rounded-xl">
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex items-center space-x-1">
                                    ${[1,2,3,4,5].map(i => `<i class="fas fa-star text-xs ${i <= r.rating ? 'text-yellow-400' : 'text-gray-600'}"></i>`).join('')}
                                </div>
                                <span class="text-[10px] text-gray-500">${new Date(r.timestamp).toLocaleDateString()}</span>
                            </div>
                            <p class="text-xs text-gray-300">${r.comments || 'Sin comentario'}</p>
                            ${r.mechName ? `<p class="text-[10px] text-gray-500 mt-1">Atendido por: ${r.mechName}</p>` : ''}
                        </div>`).join('')
                    }
                </div>
            </div>
        </div>
    </div>`;

    const modalId = 'modal-staff-detail';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-6xl max-h-[90vh] rounded-[2rem] p-6 relative border border-blue-500/30 shadow-2xl overflow-y-auto" id="${modalId}-content"><button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white z-10"><i class="fas fa-times"></i></button></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = `<button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white z-10"><i class="fas fa-times"></i></button>${html}`;
    toggleModal(modalId, true);
};

window.toggleVistaPermitida = async (uid, vista, permitir) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    const user = userDoc.data();
    let vistas = user.vistasPermitidas || ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas'];
    if (permitir) {
        if (!vistas.includes(vista)) vistas.push(vista);
    } else {
        vistas = vistas.filter(v => v !== vista);
    }
    await updateDoc(doc(db, "users", uid), { vistasPermitidas: vistas });
};

window.togglePausarCuenta = async (uid, pausar) => {
    await updateDoc(doc(db, "users", uid), { pausada: pausar });
    showToast(pausar ? "Cuenta pausada" : "Cuenta reactivada");
};

window.downloadStaffReport = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return showToast("Usuario no encontrado", true);
    const user = userDoc.data();

    const rescatesSnap = await getDocs(query(collection(db, "rescates"), where("mech_uid", "==", uid), orderBy("timestamp", "desc")));
    const rescates = [];
    rescatesSnap.forEach(r => rescates.push({ id: r.id, ...r.data() }));

    const satisfactionSnap = await getDocs(query(collection(db, "satisfaction"), where("uid", "==", uid)));
    const calificaciones = [];
    satisfactionSnap.forEach(s => calificaciones.push(s.data().rating));
    const promedio = calificaciones.length ? (calificaciones.reduce((a,b)=>a+b,0)/calificaciones.length).toFixed(1) : 'N/A';

    const totalIngresos = rescates.reduce((sum, r) => sum + (r.costoRescateEstimado || 0), 0);

    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const addFooter = window._setupProfessionalPDF(pdfDoc, 'REPORTE DE STAFF OBR', null);
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    let y = 40;

    // Tarjeta de perfil
    pdfDoc.setFillColor(245, 245, 245);
    pdfDoc.roundedRect(15, y, pageWidth - 30, 35, 3, 3, 'FD');
    pdfDoc.setFontSize(12);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(30,41,59);
    pdfDoc.text(`${user.name || 'Sin nombre'}`, 20, y + 10);
    pdfDoc.setFontSize(9);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.text(`Rol: ${user.role || 'staff'}`, 20, y + 18);
    pdfDoc.text(`Teléfono: ${user.phone || 'N/A'}`, 20, y + 26);
    y += 45;

    // Métricas rápidas
    const metricas = [
        { label: 'Servicios realizados', value: rescates.length.toString() },
        { label: 'Calificación promedio', value: `${promedio} ⭐` },
        { label: 'Ingresos generados', value: `$${totalIngresos.toFixed(2)}` }
    ];
    const cardWidth = (pageWidth - 32) / 3;
    let x = 15;
    metricas.forEach(m => {
        pdfDoc.setFillColor(248, 248, 248);
        pdfDoc.roundedRect(x, y, cardWidth - 3, 16, 2, 2, 'FD');
        pdfDoc.setFontSize(6);
        pdfDoc.setTextColor(100);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(m.label, x + 2, y + 5);
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(30,41,59);
        pdfDoc.text(m.value, x + 2, y + 12);
        x += cardWidth;
    });
    y += 24;

    // Tabla de servicios recientes
    if (rescates.length > 0) {
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Últimos servicios atendidos:", 20, y);
        y += 8;
        const body = rescates.slice(0, 20).map(r => [
            new Date(r.timestamp).toLocaleDateString('es-MX'),
            r.shortId || 'Sin ID',
            r.falla?.substring(0, 30) || '',
            `$${(r.costoRescateEstimado || 0).toFixed(2)}`
        ]);
        pdfDoc.autoTable({
            startY: y,
            head: [['Fecha', 'ID', 'Descripción', 'Costo']],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, textColor: [30,41,59] },
            headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
            margin: { left: 20 }
        });
        y = pdfDoc.lastAutoTable.finalY + 10;
    } else {
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(100);
        pdfDoc.text("Sin servicios registrados.", 20, y);
        y += 10;
    }

    // Reseñas recientes (si hay)
    if (calificaciones.length > 0) {
        if (y > 230) { pdfDoc.addPage(); y = 25; }
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text("Reseñas de clientes:", 20, y);
        y += 8;
        pdfDoc.setFontSize(8);
        pdfDoc.setFont("helvetica", "normal");
        const resenas = [];
        satisfactionSnap.forEach(s => resenas.push(s.data()));
        resenas.sort((a,b) => b.timestamp - a.timestamp);
        resenas.slice(0, 10).forEach(r => {
            if (y > 270) { pdfDoc.addPage(); y = 20; }
            const estrellas = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
            pdfDoc.text(`${new Date(r.timestamp).toLocaleDateString('es-MX')} - ${estrellas}`, 20, y);
            y += 5;
            if (r.comments) {
                const commentLines = pdfDoc.splitTextToSize(`"${r.comments}"`, pageWidth - 40);
                pdfDoc.text(commentLines, 25, y);
                y += commentLines.length * 5 + 2;
            }
        });
    }

    addFooter(pdfDoc);
    pdfDoc.save(`Reporte_${user.name || 'staff'}.pdf`);
};
// ======================================================
// === SOS MEJORADO (mapa oscuro/claro automático, filtros correctos, botón PDF en completados) ===
// ======================================================
window.filterSOS = (status) => {
    window.currentSOSFilter = status || 'pending';
    renderSOSGlobalMap();
};

window.renderSOSGlobalMap = async () => {
    const mapEl = document.getElementById('admin-sos-global-map');
    if (!mapEl) return;

    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://carto.com/">CARTO</a>';

    if (!adminSOSGlobalMapInst) {
        adminSOSGlobalMapInst = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView([TALLER_LAT, TALLER_LNG], 11);
        L.tileLayer(layerUrl, { attribution }).addTo(adminSOSGlobalMapInst);
        L.marker([TALLER_LAT, TALLER_LNG], {
            icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36, 36], iconAnchor: [18, 36] }),
            interactive: false
        }).addTo(adminSOSGlobalMapInst);
    } else {
        // Actualizar capa del mapa si es necesario
        adminSOSGlobalMapInst.eachLayer(layer => {
            if (layer instanceof L.TileLayer) adminSOSGlobalMapInst.removeLayer(layer);
        });
        L.tileLayer(layerUrl, { attribution }).addTo(adminSOSGlobalMapInst);
    }

    Object.values(adminSOSMarkers).forEach(m => {
        if (adminSOSGlobalMapInst) adminSOSGlobalMapInst.removeLayer(m);
    });
    adminSOSMarkers = {};

    const allSnap = await getDocs(collection(db, "rescates"));
    const listEl = document.getElementById('admin-sos-list');
    listEl.innerHTML = '';
    let markersGroup = [];

    const filterStatus = window.currentSOSFilter || 'pending';

    allSnap.forEach(docSnap => {
        const d = docSnap.data();
        // Si el filtro es 'accepted', mostrar también 'accepted' y 'repairing'
if (filterStatus === 'accepted') {
    if (d.status !== 'accepted' && d.status !== 'repairing') return;
} else {
    if (d.status !== filterStatus) return;
}

        const lat = d.lat || TALLER_LAT;
        const lng = d.lng || TALLER_LNG;

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'gps-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-ambulance text-white"></i></div>', iconSize: [28, 28], iconAnchor: [14, 28] })
        }).addTo(adminSOSGlobalMapInst);

        marker.bindPopup(`<b>${d.phone || ''}</b><br>${d.falla}<br>Estado: ${d.status}`);
        adminSOSMarkers[docSnap.id] = marker;
        markersGroup.push(marker);

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
        } else if (d.status === 'completed') {
            actions += `<button onclick="event.stopPropagation(); window.downloadCompletedServicePDF('${docSnap.id}')" class="bg-purple-600 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase">📄 PDF</button>`;
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

    if (markersGroup.length > 0) {
        const group = new L.featureGroup(markersGroup);
        adminSOSGlobalMapInst.fitBounds(group.getBounds().pad(0.1));
    } else {
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
    window.confirmModal("¿Cancelar este servicio SOS?", async () => {
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
    });
};

window.changeSOSStatus = async (id, newStatus) => {
    const docRef = doc(db, "rescates", id);
    const now = Date.now();
    const updates = {};
    let notifMsg = '';
    let finalizar = false;

    switch(newStatus) {
        case 'repairing': updates.status = 'repairing'; updates.repairedAt = now; notifMsg = 'El mecánico está reparando tu moto.'; break;
        case 'to_shop': updates.status = 'to_shop'; updates.shopAt = now; notifMsg = 'Tu moto será llevada al taller.'; break;
        case 'ready': updates.status = 'completed'; updates.tallerStatus = 'lista'; notifMsg = 'Tu moto está lista para entregar.'; finalizar = true; break;
        case 'cancelled': updates.status = 'cancelled'; notifMsg = 'El taller ha cancelado el servicio.'; finalizar = true; break;
    }
    await updateDoc(docRef, updates);

    // Si es un estado final, consolidar trayectoria del mecánico
    if (finalizar && window.activeMechanicSOSId === id) {
        const trackingRef = dbRef(rtdb, `sos_tracking/${id}/${auth.currentUser.uid}/points`);
        try {
            const trackingSnap = await new Promise((resolve) => {
                onValue(trackingRef, resolve, { onlyOnce: true });
            });
            if (trackingSnap.exists()) {
                const points = [];
                trackingSnap.forEach(child => points.push(child.val()));
                points.sort((a,b) => a.ts - b.ts);
                await updateDoc(docRef, { mech_track: points });
            }
            await remove(dbRef(rtdb, `sos_tracking/${id}`));
        } catch(e) {
            console.warn('Error al consolidar trayectoria:', e);
        }
        window.activeMechanicSOSId = null;
    }

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
    const mechSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["mecanico", "admin"])));
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
    window.activeMechanicSOSId = sosId;
    const sosSnap = await getDoc(doc(db, "rescates", sosId));
    if (sosSnap.exists() && sosSnap.data().uid) {
        // Notificar al mecánico asignado
rtdbSet(dbRef(rtdb, 'notificaciones/' + mechUid), { msg: `🔧 Te han asignado un nuevo auxilio: ${sosId}` });
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
    rtdbSet(dbRef(rtdb, 'notificaciones/' + auth.currentUser.uid), { msg: `🔧 Has tomado el caso: ${window.currentSOSId}` });
    window.activeMechanicSOSId = window.currentSOSId;
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

// ======================================================
// === CITAS (con validación de usuario e invitación por WhatsApp) ===
// ======================================================
window.adminCrearCita = async () => {
    const phone = document.getElementById('cita-phone')?.value.trim();
    const moto = document.getElementById('cita-moto')?.value.trim();
    const trabajo = document.getElementById('cita-trabajo')?.value.trim();
    const fecha = document.getElementById('cita-fecha')?.value;
    const hora = document.getElementById('cita-hora')?.value;
    if (!phone || !moto || !trabajo || !fecha || !hora) return showToast("Completa todos los campos", true);

    const fechaObj = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    if (fechaObj < hoy) return showToast("No puedes agendar una cita en una fecha pasada", true);

    // Verificar si el usuario existe
    const userSnap = await getDocs(query(collection(db, "users"), where("phone", "==", "+52"+phone), limit(1)));
    if (userSnap.empty) {
        // Mostrar opción de invitar
        const inviteHTML = `
            <div class="text-white text-center">
                <p class="mb-4">El número <span class="text-naranja font-bold">+52 ${phone}</span> no está registrado en OBR.</p>
                <button onclick="window.invitarClienteWhatsApp('${phone}')" class="w-full bg-green-600 text-white p-3 rounded-xl font-black uppercase mb-2 flex items-center justify-center"><i class="fab fa-whatsapp mr-2"></i> Invitar a OBR por WhatsApp</button>
                <button onclick="toggleModal('modal-invite-cliente', false)" class="w-full bg-gray-600 text-white p-3 rounded-xl font-black uppercase">Cancelar</button>
            </div>
        `;
        const modalId = 'modal-invite-cliente';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[400] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-xs rounded-[2rem] p-6 relative border border-green-500/30" id="${modalId}-content"></div>`;
            document.body.appendChild(modalEl);
        }
        document.getElementById(`${modalId}-content`).innerHTML = inviteHTML;
        toggleModal(modalId, true);
        return;
    }

    await addDoc(collection(db, "citas"), {
    phone: "+52" + phone,
    moto,
    trabajo,
    fecha,
    hora,
    estado: 'pendiente',   // <-- AÑADE ESTA LÍNEA
    timestamp: Date.now()
});
    showToast("Cita guardada correctamente");
    toggleModal('modal-nueva-cita', false);
    window.adminLoadCitas();
};

window.invitarClienteWhatsApp = (phone) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const mensaje = encodeURIComponent("¡Hola! 👋 Te invitamos a unirte a *OBR (Moto Rescate)*, donde podrás solicitar auxilio vial, agendar citas y mucho más. Descarga la app aquí: https://exploracionesobr.github.io/RESCATE-OBR");
    window.open(`https://api.whatsapp.com/send?phone=+52${cleanPhone}&text=${mensaje}`, '_blank');
    toggleModal('modal-invite-cliente', false);
};

window.adminLoadCitas = async () => {
    const snap = await getDocs(query(collection(db, "citas"), orderBy("fecha", "asc")));
    const list = document.getElementById('admin-citas-list');
    if (!list) return;
    list.innerHTML = '';
    snap.forEach(d => {
        const c = d.data();
        list.innerHTML += `<div class="bg-white/5 p-3 rounded-xl text-xs text-white" onclick="window.openCitaDetail('${d.id}')">
            <p class="font-bold">${c.fecha} ${c.hora}</p>
            <p>${c.phone} - ${c.moto}</p>
            <p class="text-gray-400">${c.trabajo}</p>
        </div>`;
    });
};

// ======================================================
// === FOTOS EXTRA ===
// ======================================================
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
            if (fotosContainer) fotosContainer.innerHTML = existingUrls.map(url => `<img src="${url}" class="h-20 w-20 object-contain rounded-xl border border-white/10 cursor-pointer" onclick="window.openImageLightbox('${url}')">`).join('');
        }
    };
    input.click();
};

// ======================================================
// === ESTADÍSTICAS (con más detalles) ===
// ======================================================
window.adminLoadSales = async () => {
    try {
        const snap = await getDocs(collection(db, "ventas"));
        adminSalesCache.ventas = [];
        snap.forEach(d => adminSalesCache.ventas.push(d.data()));
    } catch(e) {}
};

window.loadStats = async () => {
    const fromDate = document.getElementById('stats-from')?.value;
    const toDate = document.getElementById('stats-to')?.value;
    let salesData = adminSalesCache.ventas || [];
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
    const inversion = totalCosto;
    const salidas = window.retiros.reduce((s,r)=>s+(r.monto||0),0);
    const summaryGrid = document.getElementById('stats-summary-grid');
    if (summaryGrid) {
        summaryGrid.innerHTML = `
            <div class="bg-white/5 p-3 rounded-xl"><p class="text-xs text-gray-400">Ventas Totales</p><p class="text-xl font-black">$${totalVentas.toFixed(2)}</p></div>
            <div class="bg-white/5 p-3 rounded-xl"><p class="text-xs text-gray-400">Ganancia Bruta</p><p class="text-xl font-black">$${(totalVentas - totalCosto).toFixed(2)}</p></div>
            <div class="bg-white/5 p-3 rounded-xl"><p class="text-xs text-gray-400">Inversión (Costo)</p><p class="text-xl font-black">$${inversion.toFixed(2)}</p></div>
            <div class="bg-white/5 p-3 rounded-xl"><p class="text-xs text-gray-400">Salidas (Retiros)</p><p class="text-xl font-black">$${salidas.toFixed(2)}</p></div>
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
    let totalV = 0, totalC = 0;
    const bodyData = [];
    snap.forEach(d => {
        const v = d.data();
        totalV += v.total || 0;
        totalC += v.costo || 0;
        bodyData.push([new Date(v.fecha).toLocaleDateString('es-MX'), v.desc?.substring(0, 30) || '', `$${(v.total || 0).toFixed(2)}`]);
    });

    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const addFooter = window._setupProfessionalPDF(pdfDoc, 'ESTADÍSTICAS OBR', null);
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    let y = 40;

    // Tarjetas de resumen
    const resumenes = [
        { label: 'Ventas Totales', value: `$${totalV.toFixed(2)}` },
        { label: 'Ganancia Bruta', value: `$${(totalV - totalC).toFixed(2)}` },
        { label: 'Inversión (Costo)', value: `$${totalC.toFixed(2)}` }
    ];

    const cardWidth = (pageWidth - 32) / 3;
    let x = 12;
    resumenes.forEach(r => {
        pdfDoc.setFillColor(245, 245, 245);
        pdfDoc.roundedRect(x, y, cardWidth - 3, 18, 3, 3, 'FD');
        pdfDoc.setFontSize(7);
        pdfDoc.setTextColor(100);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(r.label, x + 3, y + 6);
        pdfDoc.setFontSize(12);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(30,41,59);
        pdfDoc.text(r.value, x + 3, y + 14);
        x += cardWidth;
    });
    y += 25;

    // Gráfico de barras (si está visible en pantalla, lo capturamos)
    const chartCanvas = document.getElementById('stats-chart');
    if (chartCanvas) {
        try {
            await window.loadHtml2Canvas();
            const chartImg = await html2canvas(chartCanvas);
            pdfDoc.addImage(chartImg, 'PNG', 20, y, pageWidth - 40, 70);
            y += 80;
        } catch(e) {
            console.warn('No se pudo capturar el gráfico');
        }
    }

    // Tabla de ventas
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(30,41,59);
    pdfDoc.text("Detalle de Ventas", 20, y);
    y += 6;
    pdfDoc.autoTable({
        startY: y,
        head: [['Fecha', 'Descripción', 'Total']],
        body: bodyData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, textColor: [30,41,59] },
        headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
        margin: { left: 20 }
    });

    addFooter(pdfDoc);
    pdfDoc.save(`Estadisticas_OBR_${new Date().toISOString().slice(0,10)}.pdf`);
};

window.exportCSV = (tipo) => {
    if (tipo === 'ventas') {
        const rows = [['Fecha', 'Descripción', 'Total']];
        (adminSalesCache.ventas || []).forEach(v => rows.push([new Date(v.fecha).toLocaleDateString(), v.desc, v.total]));
        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ventas_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else if (tipo === 'inventario') {
        const rows = [['Nombre', 'Stock', 'Costo', 'Precio Público']];
        adminInventoryList.forEach(p => rows.push([p.name, p.stock, p.cost, p.pricePublic]));
        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `inventario_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
// === PANEL DE NOTIFICACIONES EN CAJA (CITAS Y COBROS) ===
window.cargarNotificacionesCitas = async () => {
    const hoy = new Date().toISOString().split('T')[0];
    const q = query(collection(db, "citas"),
                    where("fecha", "==", hoy),
                    orderBy("hora", "asc"));
    const snap = await getDocs(q);
    const lista = document.getElementById('citas-pendientes-list');
    const resumen = document.getElementById('citas-resumen');
    if (!lista || !resumen) return;
    lista.innerHTML = '';
    let contadorHoy = 0;
    let contadorPorHora = {};
    snap.forEach(doc => {
        const c = doc.data();
        if (c.estado && c.estado !== 'pendiente') return;
        contadorHoy++;
        const horaKey = c.hora.substring(0, 5);
        contadorPorHora[horaKey] = (contadorPorHora[horaKey] || 0) + 1;
        const tipoCliente = c.phone ? (c.phone.startsWith('VIP') ? 'VIP' : 'Usuario') : 'Sin registro';
        lista.innerHTML += `
        <div class="bg-black/30 p-3 rounded-xl border border-white/10 flex justify-between items-start">
            <div class="flex-1">
                <p class="text-xs font-bold text-white">${c.fecha} ${c.hora} - ${c.trabajo}</p>
                <p class="text-[10px] text-gray-400">${c.moto} | ${tipoCliente}</p>
            </div>
            <div class="flex space-x-1 ml-2">
                <button onclick="window.aceptarCita('${doc.id}')" class="bg-green-600 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase">Aceptar</button>
                <button onclick="window.rechazarCita('${doc.id}')" class="bg-red-600 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase">Rechazar</button>
            </div>
        </div>`;
    });
    resumen.innerText = `Hoy: ${contadorHoy} citas | ${Object.entries(contadorPorHora).map(([h, n]) => h + ': ' + n).join(', ')}`;
};

window.aceptarCita = async (citaId) => {
    await updateDoc(doc(db, "citas", citaId), { estado: 'aceptada' });
    showToast("Cita aceptada");
    window.cargarNotificacionesCitas();
};

window.rechazarCita = async (citaId) => {
    await updateDoc(doc(db, "citas", citaId), { estado: 'rechazada' });
    showToast("Cita rechazada");
    window.cargarNotificacionesCitas();
};

window.cargarCobrosMecanicosPanel = async () => {
    const lista = document.getElementById('cobros-mecanicos-list');
    if (!lista) return;
    const snap = await getDocs(query(collection(db, "cobros_pendientes"), where("estado", "==", "pendiente")));
    lista.innerHTML = '';
    snap.forEach(doc => {
        const c = doc.data();
        lista.innerHTML += `
        <div class="flex justify-between items-center bg-black/30 p-2 rounded-lg">
            <div>
                <p class="text-xs text-white font-bold">${c.mech_name || 'Mecánico'}</p>
                <p class="text-[10px] text-gray-400">${c.concepto} - $${c.monto.toFixed(2)}</p>
            </div>
            <button onclick="window.marcarCobroPagado?.('${doc.id}')" class="text-[0.6rem] bg-green-600 text-white px-2 py-0.5 rounded font-bold uppercase">Pagado</button>
        </div>`;
    });
    if (snap.empty) lista.innerHTML = '<p class="text-xs text-gray-500">Sin cobros pendientes</p>';
};

// ======================================================
// === ADMIN REFRESH CONFIG UI ===
// ======================================================
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
    window.togglePriceMode();
    const memPriceInput = document.getElementById('config-mem-price');
if (memPriceInput && globalSettings.membershipPrice) {
    memPriceInput.value = globalSettings.membershipPrice;
}
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

window.usePreviousDayVideo = (dayIndex) => {
    const prevDay = dayIndex - 1;
    const prevURL = globalSettings.videoSchedule?.[prevDay];
    if (!prevURL || prevURL.trim() === '') {
        return showToast("El día anterior no tiene video asignado", true);
    }
    globalSettings.videoSchedule[dayIndex] = prevURL;
    window.renderVideoScheduleDays();
    showToast("Video copiado del día anterior");
};

window.removeDayVideo = (dayIndex) => {
    window.confirmModal("¿Eliminar el video asignado a este día?", () => {
        globalSettings.videoSchedule[dayIndex] = '';
        window.renderVideoScheduleDays();
        showToast("Video eliminado de este día");
    });
};

// Inicializar mapa de geofence
window.renderAdminMap = () => {
    const mapEl = document.getElementById('admin-geofence-map');
    if (!mapEl || adminGeoMap) return;
    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    adminGeoMap = L.map(mapEl).setView([TALLER_LAT, TALLER_LNG], 13);
    L.tileLayer(layerUrl, { attribution: '&copy; <a href="https://carto.com/">CARTO</a>' }).addTo(adminGeoMap);
    L.marker([TALLER_LAT, TALLER_LNG], { icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] }) }).addTo(adminGeoMap);
    adminGeoCircle = L.circle([TALLER_LAT, TALLER_LNG], { radius: globalSettings.radiusKm * 1000, color: '#FF6B00', fillOpacity: 0.1 }).addTo(adminGeoMap);
};

window.updateGeofenceRadius = (val) => {
    const radiusKm = parseFloat(val);
    document.getElementById('radius-display').innerText = radiusKm;
    if (adminGeoCircle) adminGeoCircle.setRadius(radiusKm * 1000);
};
window.loadPromoVideo = () => {
    const container = document.getElementById('video-banner-container');
    if (!container) return;
    const now = new Date();
    const dayIndex = now.getDay(); // 0=Domingo, 1=Lunes...
    const todayVideo = globalSettings.videoSchedule?.[dayIndex];
    if (todayVideo && todayVideo.trim() !== '') {
        container.innerHTML = `<video src="${todayVideo}" controls autoplay muted loop class="w-full max-h-[300px] object-contain rounded-xl"></video>`;
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
};
window.loadPromoPreview = () => {
    const previewContainer = document.getElementById('promo-video-preview');
    const player = document.getElementById('promo-video-player');
    const nameDisplay = document.getElementById('promo-video-name');
    if (!previewContainer || !player) return;

    const now = new Date();
    const dayIndex = now.getDay(); // 0=Domingo
    const todayVideo = globalSettings.videoSchedule?.[dayIndex];
    
    if (todayVideo && todayVideo.trim() !== '') {
        previewContainer.classList.remove('hidden');
        player.src = todayVideo;
        player.load();
        nameDisplay.innerText = todayVideo.split('/').pop() || 'Video promocional';
    } else {
        previewContainer.classList.add('hidden');
    }
};
window.initAdminNotifications = () => {
    // Listener de nuevas citas
    let lastCitaCount = 0;
    onSnapshot(collection(db, "citas"), (snap) => {
        const currentCount = snap.size;
        if (lastCitaCount > 0 && currentCount > lastCitaCount) {
            playSound('alert');
            speakTTS('Nueva cita agendada.');
            showToast("📅 Nueva cita agendada", false);
        }
        lastCitaCount = currentCount;
    });

    // Listener de nuevas SOS pendientes
    let lastSOSCount = 0;
    const qSOS = query(collection(db, "rescates"), where("status", "==", "pending"));
    onSnapshot(qSOS, (snap) => {
        const currentCount = snap.size;
        if (lastSOSCount > 0 && currentCount > lastSOSCount) {
            playSound('alert');
            speakTTS('¡Nueva solicitud de auxilio!');
            showToast("🚨 ¡Nueva solicitud de auxilio!", false);
        }
        lastSOSCount = currentCount;
    });
};

// ======================================================
// === INVENTARIO FLOTANTE (CONTEO RÁPIDO) ===
// ======================================================
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

// ======================================================
// === CORTE DE CAJA ===
// ======================================================
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
    const pdfDoc = new jsPDF();
    pdfDoc.setFillColor(255, 107, 0);
    pdfDoc.rect(0, 0, 210, 30, 'F');
    pdfDoc.setFontSize(18);
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.text("CORTE DE CAJA OBR", 14, 18);
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.setFontSize(10);
    const ventasHoy = (adminSalesCache?.ventas || []).filter(v => new Date(v.fecha).toDateString() === new Date().toDateString());
    const totalVentas = ventasHoy.reduce((s,v)=>s+(v.total||0),0);
    const totalRetiros = (window.retiros||[]).reduce((s,r)=>s+(r.monto||0),0);
    pdfDoc.text(`Fondo Inicial: $${window.fondoInicial.toFixed(2)}`, 14, 40);
    pdfDoc.text(`Ventas del día: $${totalVentas.toFixed(2)}`, 14, 48);
    pdfDoc.text(`Retiros: $${totalRetiros.toFixed(2)}`, 14, 56);
    pdfDoc.text(`Efectivo en caja: $${(window.fondoInicial+totalVentas-totalRetiros).toFixed(2)}`, 14, 64);
    pdfDoc.save(`Corte_Caja_${new Date().toISOString().slice(0,10)}.pdf`);
};

// ======================================================
// === BÚSQUEDA DE ESTADO DE SERVICIO (PÚBLICO) ===
// ======================================================
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
// ======================================================
// === CIERRE Y STUBS (SIN MANIFIESTO DINÁMICO) ===
// ======================================================
tailwind.config = {
    theme: {
        extend: {
            colors: {
                asfalto: '#1A1A1A',
                naranja: '#FF6B00'
            }
        }
    }
};

// Ya no se genera el manifiesto dinámico. Se usará el archivo manifest.json enlazado en el HTML.

// Refresco periódico
setInterval(() => {
    if (auth.currentUser) {
        updateLandingStatus();
        if (['admin','mecanico','taller','socio'].includes(window.currentUserDoc?.role)) {
            window.adminLoadInventory();
            window.adminLoadSales();
            window.posFilterProducts();
        }
    }
}, 30000);

// Evento para el botón de contacto en el cliente
window.addEventListener('click', function(e) {
    if (e.target.closest('#btn-contacto-taller')) {
        e.stopPropagation();
        e.preventDefault();
        const optionsHTML = `
            <div class="text-center">
                <p class="text-white font-bold mb-4">Contactar al Taller</p>
                <button onclick="window.open('tel:6311551533')" class="w-full bg-green-600 text-white p-3 rounded-xl font-black mb-2 flex items-center justify-center"><i class="fas fa-phone mr-2"></i> Llamar 631 155 1533</button>
                <button onclick="window.open('tel:6441106011')" class="w-full bg-green-600 text-white p-3 rounded-xl font-black mb-4 flex items-center justify-center"><i class="fas fa-phone mr-2"></i> Llamar 644 110 6011</button>
                <button onclick="toggleModal('modal-contact-taller', false)" class="text-gray-400 text-sm">Cancelar</button>
            </div>
        `;
        const modalId = 'modal-contact-taller';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[350] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-xs rounded-[2rem] p-6 relative border border-blue-500/30" id="${modalId}-content"></div>`;
            document.body.appendChild(modalEl);
        }
        document.getElementById(`${modalId}-content`).innerHTML = optionsHTML;
        toggleModal(modalId, true);
    }
});
window.exportUserHistoryPDF = async () => {
    const uid = window._currentDetailUid;
    if (!uid) return showToast("Error: usuario no identificado", true);
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return showToast("Usuario no encontrado", true);
    const user = userDoc.data();
    const rescatesSnap = await getDocs(query(collection(db, "rescates"), where("phone", "==", user.phone), orderBy("timestamp", "desc")));
    let historial = [];
    rescatesSnap.forEach(d => historial.push(d.data()));

    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const addFooter = window._setupProfessionalPDF(pdfDoc, `HISTORIAL DE SERVICIOS - ${user.name || user.phone}`, null);
    const pageWidth = pdfDoc.internal.pageSize.getWidth();

    let y = 38;
    pdfDoc.setFontSize(9);
    pdfDoc.setTextColor(30,41,59);

    // Tarjetas de resumen (estilo imagen)
    const totalServicios = historial.length;
    const ultimoServicio = historial[0];
    const totalFacturado = historial.reduce((sum, r) => sum + (r.costoRescateEstimado || 0), 0);
    const clienteFrecuente = totalServicios >= 3 ? 'Sí' : 'No';

    const metricas = [
        { label: 'Servicios realizados', value: totalServicios.toString() },
        { label: 'Último servicio', value: ultimoServicio ? new Date(ultimoServicio.timestamp).toLocaleDateString('es-MX') : 'N/A' },
        { label: 'Estado cliente', value: clienteFrecuente === 'Sí' ? 'FRECUENTE' : 'OCASIONAL' },
        { label: 'Total facturado', value: `$${totalFacturado.toFixed(2)}` }
    ];

    const cardWidth = (pageWidth - 32) / 4;
    let x = 12;
    metricas.forEach(m => {
        pdfDoc.setFillColor(245, 245, 245);
        pdfDoc.roundedRect(x, y, cardWidth - 2, 16, 2, 2, 'FD');
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(6);
        pdfDoc.setTextColor(100);
        pdfDoc.text(m.label, x + 2, y + 5);
        pdfDoc.setFontSize(9);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(30,41,59);
        pdfDoc.text(m.value, x + 2, y + 12);
        x += cardWidth;
    });
    y += 22;

    // Listado de servicios con tarjetas y badges
    pdfDoc.setFontSize(8);
    historial.forEach((r, index) => {
        if (y > 260) { pdfDoc.addPage(); y = 25; }
        // Fondo de tarjeta
        pdfDoc.setFillColor(250, 250, 250);
        pdfDoc.roundedRect(12, y, pageWidth - 24, 22, 2, 2, 'FD');
        
        // Fecha
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(30,41,59);
        pdfDoc.text(new Date(r.timestamp).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }), 16, y + 6);
        // Descripción
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(r.falla.replace(/\[.*?\]/g, '').trim().substring(0, 50), 80, y + 6);
        // Badge de estado
        const estado = r.status || 'pending';
        const color = estado === 'completed' ? [34, 197, 94] : estado === 'cancelled' ? [239, 68, 68] : [251, 191, 36];
        pdfDoc.setFillColor(...color);
        pdfDoc.roundedRect(pageWidth - 45, y + 1, 30, 8, 2, 2, 'F');
        pdfDoc.setFontSize(6);
        pdfDoc.setTextColor(255,255,255);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(estado.toUpperCase(), pageWidth - 43, y + 7);
        // Costo
        pdfDoc.setFontSize(7);
        pdfDoc.setTextColor(30,41,59);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.text(`$${(r.costoRescateEstimado || 0).toFixed(2)}`, pageWidth - 55, y + 15);
        
        y += 26;
    });

    if (historial.length === 0) {
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(100);
        pdfDoc.text("Sin servicios registrados.", 16, y);
    }

    addFooter(pdfDoc);
    pdfDoc.save(`Historial_${user.name || 'usuario'}.pdf`);
};
// ===== DISEÑO PROFESIONAL DE PDFs =====
window._setupProfessionalPDF = (doc, title, logoImg = null) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    // Fondo blanco total
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 297, 'F');
    
    // Encabezado: barra naranja con logo y título
    doc.setFillColor(255, 107, 0);
    doc.rect(0, 0, pageWidth, 28, 'F');
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        doc.addImage(logoImg, 'PNG', 12, 4, 18, 18);
    }
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title, logoImg ? 35 : 12, 18);
    
    // Línea delgada decorativa debajo del encabezado
    doc.setDrawColor(255, 107, 0);
    doc.setLineWidth(0.8);
    doc.line(12, 29, pageWidth - 12, 29);
    
    // Footer en cada página
    const addFooter = (pdf) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(6.5);
            pdf.setTextColor(140);
            pdf.setFont("helvetica", "normal");
            pdf.text("OBR Moto Rescate | Documento generado el " + new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }), 12, pdf.internal.pageSize.getHeight() - 10);
            pdf.text(`Página ${i} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 25, pdf.internal.pageSize.getHeight() - 10);
        }
    };
    return addFooter;
};
window.requestAppPermissions = async () => {
    const stored = localStorage.getItem('obr_permissions_granted');
    if (stored === 'true') return;

    // Crear modal personalizado para solicitar permisos
    const modalId = 'modal-permisos';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-blue-500/30 text-center">
                <i class="fas fa-shield-alt text-4xl text-blue-400 mb-4"></i>
                <h2 class="text-xl font-black text-white mb-2">Permisos de la App</h2>
                <p class="text-xs text-gray-300 mb-6">OBR necesita algunos permisos para funcionar correctamente. Puedes cambiarlos después en Ajustes.</p>
                <div class="space-y-3 text-left text-sm text-gray-400 mb-6">
                    <div class="flex items-center space-x-3"><i class="fas fa-bell text-blue-400"></i><span>Notificaciones</span></div>
                    <div class="flex items-center space-x-3"><i class="fas fa-map-marker-alt text-green-400"></i><span>Ubicación</span></div>
                </div>
                <div class="flex space-x-2">
                    <button id="permisos-aceptar" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black uppercase text-xs">Aceptar</button>
                    <button id="permisos-denegar" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase text-xs">Ahora no</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        document.getElementById('permisos-aceptar').onclick = async () => {
            toggleModal(modalId, false);
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(()=>{}, ()=>{});
            }
            localStorage.setItem('obr_permissions_granted', 'true');
            window.initServiceWorker?.(); // opcional
        };
        document.getElementById('permisos-denegar').onclick = () => {
            toggleModal(modalId, false);
            localStorage.setItem('obr_permissions_granted', 'false');
        };
    }
    toggleModal(modalId, true);
};
// Stubs para funciones no implementadas completamente
window.sendContactFromModal = window.sendContactFromModal || function() {
    const name = document.getElementById('modal-contact-name')?.value.trim();
    const phone = document.getElementById('modal-contact-phone')?.value.trim();
    const msg = document.getElementById('modal-contact-msg')?.value.trim();
    if(!name || !msg) return showToast("Nombre y mensaje requeridos", true);
    window.open(`https://wa.me/526311551533?text=${encodeURIComponent(`Hola, soy ${name}${phone ? ' ('+phone+')' : ''}. ${msg}`)}`, '_blank');
};
window.loadChatList = window.loadChatList || async function() {};
window.sendMessage = window.sendMessage || async function() {};
window.openChat = window.openChat || function(uid, isClient) {
    activeChatUid = uid;
    document.getElementById('chat-title').innerText = isClient ? 'Soporte OBR' : (window.currentUserDoc?.name || 'Chat');
    toggleModal('modal-chat', true);
};
window.closeChat = window.closeChat || function() {
    activeChatUid = null;
    toggleModal('modal-chat', false);
};
window.loadMechPendingCharges = window.loadMechPendingCharges || async function() {};
window.renderPendingMechanicPayments = window.renderPendingMechanicPayments || async function() {};
window.openCitaDetail = window.openCitaDetail || function(id) {
    getDoc(doc(db, "citas", id)).then(snap => {
        if (!snap.exists()) return;
        const c = snap.data();
        document.getElementById('edit-cita-id').value = id;
        document.getElementById('edit-cita-phone').value = c.phone.replace('+52', '');
        document.getElementById('edit-cita-moto').value = c.moto;
        document.getElementById('edit-cita-trabajo').value = c.trabajo;
        document.getElementById('edit-cita-fecha').value = c.fecha;
        document.getElementById('edit-cita-hora').value = c.hora;
        toggleModal('modal-edit-cita', true);
    });
};
window.clientEditCita = window.clientEditCita || function(id) {
    getDoc(doc(db, "citas", id)).then(snap => {
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
                <button onclick="window.clientSubmitCitaChange('${id}')" class="w-full bg-yellow-600 hover:bg-yellow-500 text-white p-3 rounded-xl font-black uppercase">Enviar Solicitud de Cambio</button>
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
window.clientSubmitCitaChange = window.clientSubmitCitaChange || async function(id) {
    const fecha = document.getElementById('client-edit-cita-fecha')?.value;
    const hora = document.getElementById('client-edit-cita-hora')?.value;
    const trabajo = document.getElementById('client-edit-cita-trabajo')?.value.trim();
    if (!fecha || !hora || !trabajo) return showToast("Completa todos los campos", true);
    await addDoc(collection(db, "citas", id, "cambios_solicitados"), {
        fecha, hora, trabajo,
        solicitadoPor: auth.currentUser.uid,
        nombre: window.currentUserDoc.name,
        timestamp: Date.now(),
        estado: 'pendiente'
    });
    showToast("Solicitud enviada al taller");
    toggleModal('modal-client-edit-cita', false);
};
window.enviarSolicitudCambioCita = window.enviarSolicitudCambioCita || async function() {};
window.adminUpdateCita = window.adminUpdateCita || async function() {
    const id = document.getElementById('edit-cita-id').value;
    const phone = document.getElementById('edit-cita-phone').value.trim();
    const moto = document.getElementById('edit-cita-moto').value.trim();
    const trabajo = document.getElementById('edit-cita-trabajo').value.trim();
    const fecha = document.getElementById('edit-cita-fecha').value;
    const hora = document.getElementById('edit-cita-hora').value;
    if (!phone || !moto || !trabajo || !fecha || !hora) return showToast("Completa todos los campos", true);
    await updateDoc(doc(db, "citas", id), {
        phone: "+52" + phone,
        moto,
        trabajo,
        fecha,
        hora
    });
    showToast("Cita actualizada");
    toggleModal('modal-edit-cita', false);
    window.adminLoadCitas();
};
window.adminDeleteCita = window.adminDeleteCita || async function() {
    const id = document.getElementById('edit-cita-id').value;
    window.confirmModal("¿Eliminar esta cita?", async () => {
        await deleteDoc(doc(db, "citas", id));
        showToast("Cita eliminada");
        toggleModal('modal-edit-cita', false);
        window.adminLoadCitas();
    });
};
window.printTicket = window.printTicket || function() {};
window.filterStore = window.filterStore || function() {};
window.autoCalcInv = window.autoCalcInv || function() {
    const cost = parseFloat(document.getElementById('inv-cost')?.value) || 0;
    if (cost) {
        document.getElementById('inv-price-taller').value = (cost * 1.3).toFixed(2);
        document.getElementById('inv-price-member').value = (cost * 1.4).toFixed(2);
        document.getElementById('inv-price-public').value = (cost * 1.6).toFixed(2);
    }
};
window.loadMyOrders = window.loadMyOrders || async function() {};
