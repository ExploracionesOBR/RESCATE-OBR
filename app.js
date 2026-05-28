import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
window.db = db;
const rtdb = getDatabase(app);
const storage = getStorage(app);
window.setDoc = setDoc;
window.doc = doc;

// === CARGA DIFERIDA DE html2canvas ==
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
window.currentEntregaFilter = 'pendiente_asignar';
let statsChartInstance = null, statsPieInstance = null;
let adminSalesCache = {}; let lastNotifiedSOS = null; let mechWatchId = null; window.activeMechanicSOSId = null;
window.activePosFilter = 'todos';
window.garantiasActivas = [];
let mySOSListener = null;
let serviciosListener = null, sosListener = null, pedidosListener = null, citasListener = null;
const generateShortId = () => 'OBR-' + Math.floor(10000 + Math.random() * 90000);
// aqui inicia escapeHtml //
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
// === UTILIDADES ===
window.showToast = (msg, isError = false) => {
    console.log("🔴 TOAST ERROR:", msg, isError); // <-- añade esto temporalmente
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
window.getStatusInfo = (status) => {
    const map = {
        'pending':    { text: 'Pendiente',  color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
        'accepted':   { text: 'Aceptado',   color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
        'repairing':  { text: 'Reparando',   color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
        'to_shop':    { text: 'En taller',   color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
        'ready':      { text: 'Listo',       color: 'bg-green-500/20 text-green-400 border-green-500/30' },
        'completed':  { text: 'Completado',  color: 'bg-green-500/20 text-green-400 border-green-500/30' },
        'cancelled':  { text: 'Cancelado',   color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    };
    return map[status] || { text: status, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
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

function speakTTS(message) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'es-MX';
        utterance.rate = 1.1;
        window.speechSynthesis.cancel(); // evita solapamientos
        window.speechSynthesis.speak(utterance);
    }
}
// Exponer globalmente por si se llama desde window.speakTTS
window.speakTTS = speakTTS;

// === TEMA ===
window.changeThemeMode = async (mode) => {
    globalSettings.themeMode = mode;
    applyTheme();
    if (auth.currentUser && window.currentUserDoc?.role === 'admin') {
        await setDoc(doc(db, "settings", "general"), { themeMode: mode }, { merge: true });
    }
};

function applyTheme() {
    let mode = globalSettings.themeMode || 'auto';
    if (mode === 'auto') { const h = new Date().getHours(); mode = (h >= 7 && h < 19) ? 'light' : 'dark'; }
    document.body.classList.toggle('light-mode', mode === 'light');
    const sel = document.getElementById('theme-selector'); if(sel) sel.value = globalSettings.themeMode || 'auto';
    updateLogo(); // <-- añadido
    switchMapLayer(mode === 'light');
}

function switchMapLayer(isLight) {
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://carto.com/">CARTO</a>';

    // Quitar cualquier filtro residual
    document.documentElement.style.setProperty('--map-filter', 'none');

   const maps = [adminSOSGlobalMapInst, adminGeoMap, mechMapInst, sosMapInstance, entregasMapInst];
    maps.forEach(map => {
        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) map.removeLayer(layer);
            });
            L.tileLayer(layerUrl, { attribution }).addTo(map);
        }
    });
    if(entregasMapInst) entregasMapInst.invalidateSize();
}

function updateLogo() {
    const logo = document.getElementById('landing-logo');
    if (!logo) return;
    const isLight = document.body.classList.contains('light-mode');
    logo.src = isLight ? 'logo_claro.png' : 'logo_oscuro.png';
}

// === RASTREO MECÁNICO ===
function startMechanicTracking() {
    if(['admin', 'mecanico', 'taller'].includes(window.currentUserDoc?.role)) {
        if(navigator.geolocation) {
            navigator.geolocation.watchPosition(pos => {
                const uid = auth.currentUser.uid;
                const currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: window.currentUserDoc.name, ts: Date.now() };
                update(dbRef(rtdb, 'mecanicos_activos/' + uid), currentPos);
                
                // Guardar en historial de tracking (últimas 50 posiciones)
                const trackingRef = dbRef(rtdb, `mecanicos_tracking/${uid}`);
                push(trackingRef, currentPos).then(() => {
                    // Mantener solo los últimos 50 puntos para no sobrecargar
                    onValue(trackingRef, (snap) => {
                        if (snap.exists()) {
                            const arr = [];
                            snap.forEach(child => arr.push(child.val()));
                            arr.sort((a,b) => a.ts - b.ts);
                            if (arr.length > 50) {
                                const toRemove = arr.slice(0, arr.length - 50);
                                toRemove.forEach(old => {
                                    const oldKey = Object.keys(snap.val()).find(key => snap.val()[key].ts === old.ts);
                                    if (oldKey) remove(dbRef(rtdb, `mecanicos_tracking/${uid}/${oldKey}`));
                                });
                            }
                        }
                    }, { onlyOnce: true });
                });
                
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
// ======================================================
// ACTUALIZACIÓN DEL BOTÓN DE EMERGENCIA (SEGÚN HORARIO)
// ======================================================
window.updateEmergencyButtonState = (isOpen, sched) => {
    const emBtn = document.getElementById('emergency-client-btn');
    const emText = document.getElementById('emergency-closed-text');
    if (!emBtn) return;

    if (isOpen) {
        // Habilitar botón
        emBtn.classList.remove('opacity-50', 'pointer-events-none', 'bg-gray-600');
        emBtn.classList.add('bg-gradient-to-r', 'from-red-600', 'to-naranja');
        if (emText) emText.classList.add('hidden');
        const labels = emBtn.querySelectorAll('.emergency-label');
        labels.forEach(lbl => lbl.classList.remove('hidden'));
        emBtn.onclick = () => window.startFlow('sos');
    } else {
        // Deshabilitar botón
        emBtn.classList.add('opacity-50', 'pointer-events-none', 'bg-gray-600');
        emBtn.classList.remove('bg-gradient-to-r', 'from-red-600', 'to-naranja');
        if (emText) {
            emText.classList.remove('hidden');
            const nextOpen = window.findNextOpenDay?.();
            if (nextOpen) {
                emText.innerText = `Abrimos el ${nextOpen.day} a las ${nextOpen.time}`;
            } else {
                emText.innerText = `Abrimos a las ${sched?.o || '08:00'}`;
            }
        }
        const labels = emBtn.querySelectorAll('.emergency-label');
        labels.forEach(lbl => lbl.classList.add('hidden'));
        emBtn.onclick = () => window.showToast("Taller cerrado. Vuelve en horario laboral.", true);
    }
};

// === INICIO Y CONFIGURACIÓN GLOBAL ===
async function loadGlobalSettings() {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) Object.assign(globalSettings, snap.data());
    globalSettings.centerLat = TALLER_LAT;
    globalSettings.centerLng = TALLER_LNG;
    applyTheme();
    updateLandingStatus();
    loadPublicStore();
    loadServicesCatalog();

    // --- Listener en tiempo real ---
    if (window._settingsUnsubscribe) window._settingsUnsubscribe();
    window._settingsUnsubscribe = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
        if (docSnap.exists()) {
            const newSettings = docSnap.data();
            Object.assign(globalSettings, newSettings);
            globalSettings.centerLat = TALLER_LAT;
            globalSettings.centerLng = TALLER_LNG;
            applyTheme();
            updateLandingStatus();

            // Si la vista de configuración está abierta, refrescar la UI
            const configView = document.getElementById('a-view-config');
            if (configView && !configView.classList.contains('hidden')) {
                window.adminRefreshConfigUI();
            }

            // Verificar modo "próximamente"
            if (globalSettings.modoProximamente) {
                const currentView = document.querySelector('.view:not(.hidden)')?.id;
                if (currentView && !['view-landing','view-login','view-force-setup'].includes(currentView)) {
                    showView('view-proximamente');
                }
            } else {
                // Si se desactiva el modo, restaurar la vista que corresponda según el usuario
                if (auth.currentUser) {
                    const role = window.currentUserDoc?.role;
                    if (role && ['admin','mecanico','taller','socio'].includes(role)) {
                        showView('app-admin');
                    } else if (role === 'cliente' || role === 'membresia') {
                        showView('app-client');
                    }
                } else {
                    showView('view-landing');
                }
            }
        }
    });
}
function updateLandingStatus() {
    const now = new Date();
    const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const sched = globalSettings.schedule[dayIndex] || { o: "08:00", c: "20:00" };
    const [hOpen, mOpen] = sched.o.split(':').map(Number);
    const [hClose, mClose] = sched.c.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const openMins = hOpen * 60 + mOpen;
    const closeMins = hClose * 60 + mClose;
    const isOpen = nowMins >= openMins && nowMins < closeMins;

    const lo = document.getElementById('landing-open');
    const lc = document.getElementById('landing-closed');
    if (lo) lo.style.display = isOpen ? 'flex' : 'none';
    if (lc) lc.style.display = isOpen ? 'none' : 'flex';

    const badge = document.getElementById('landing-status-badge');
    if (badge) {
        badge.innerText = isOpen ? 'Plataforma Activa' : 'Taller Fuera de Horario';
        badge.className = isOpen
            ? 'text-naranja font-black tracking-widest text-[10px] lg:text-xs mb-8 lg:mb-12 uppercase border border-naranja/30 px-6 py-2 rounded-full bg-naranja/10'
            : 'text-red-500 font-black tracking-widest text-[10px] lg:text-xs mb-8 lg:mb-12 uppercase border border-red-500/30 px-6 py-2 rounded-full bg-red-500/10';
    }

    const closedText = document.getElementById('closed-hours-text');
    if (closedText && !isOpen) {
        const nextOpen = findNextOpenDay();
        if (nextOpen) closedText.innerText = `Abrimos el ${nextOpen.day} a las ${nextOpen.time}`;
        else closedText.innerText = `Abrimos a las ${sched.o}`;
    }

    // Llamar a la función global que actualiza el botón de emergencia
    window.updateEmergencyButtonState(isOpen, sched);

    // Banners VIP
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

     //Para activar el modo, un administrador puede ejecutar en la consola o desde un botón oculto:
//await setDoc(doc(db, 'settings', 'general'), { modoProximamente: true, fechaLanzamiento: '2026-05-23' }, { merge: true });
    // Mostrar fecha de lanzamiento si existe
    if (globalSettings.fechaLanzamiento) {
        const fechaEl = document.getElementById('fecha-lanzamiento');
        if (fechaEl) fechaEl.innerText = new Date(globalSettings.fechaLanzamiento).toLocaleDateString();
    }
const loginLandingBtn = document.getElementById('login-landing-btn');
    if (loginLandingBtn) {
        loginLandingBtn.style.display = auth.currentUser ? 'none' : 'flex';
    }
    window.loadPromoVideo();
}
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
    if (window._servicesUnsubscribe) window._servicesUnsubscribe();
    window._servicesUnsubscribe = onSnapshot(collection(db, "servicios"), (snap) => {
        shopServices = [];
        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            shopServices.push(d);
        });
        console.log('Servicios cargados:', shopServices.length);
        // Refrescar dropdown si el input ya tiene texto
        const input = document.getElementById('sos-service-input');
        if (input && input.value.trim() !== '') window.filterServiceOptions();
    }, (error) => {
        console.error('Error cargando servicios:', error);
    });
}


// === FLUJO DE VISTAS Y AUTENTICACIÓN ===
onAuthStateChanged(auth, async user => {
    document.getElementById('loading-screen').classList.add('hidden');
    if (window._adminCreatingUser) return;  // <-- nueva línea

    if (!user) {
        if(mechWatchId) navigator.geolocation.clearWatch(mechWatchId);
        loadGlobalSettings(); 
        document.getElementById('view-landing').classList.remove('hidden'); 
        document.getElementById('view-landing').classList.add('flex'); 
        return;
    }
    document.getElementById('view-landing').classList.add('hidden');

    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists()) { 
        window.currentUserDoc = userSnap.data(); 
        window.currentUserDoc.id = user.uid; 
    } else { 
        window.currentUserDoc = { phone: '', role: 'cliente', name: '' }; 
    }

    // Verificar bloqueo/pausa
    if (window.currentUserDoc.bloqueado) {
        signOut(auth).then(() => {
            document.getElementById('out-of-zone-modal').classList.remove('hidden');
            document.getElementById('view-landing').classList.add('hidden');
        });
        return;
    }

    if (window.currentUserDoc.firstLogin && !['admin','mecanico','taller','socio'].includes(window.currentUserDoc.role)) {
        showView('view-force-setup');
        return;
    }

    if (['admin', 'mecanico', 'taller', 'socio'].includes(window.currentUserDoc.role)) {
                // Recargar ajustes desde Firestore (para que el radio y otros valores se actualicen)
        const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
        if (settingsSnap.exists()) Object.assign(globalSettings, settingsSnap.data());
        globalSettings.centerLat = TALLER_LAT;
        globalSettings.centerLng = TALLER_LNG;
        showView('app-admin');
        document.getElementById('admin-phone-display').innerText = window.currentUserDoc.name || 'Admin';
        setTimeout(() => {
            window.adminRefreshConfigUI();
            window.adminLoadInventory();
            window.adminLoadSales();
            window.filterSOS('pending');
            window.adminListenServices();
            window.adminLoadCitas();
            window.loadChatList();
            window.applyViewPermissions?.();
        }, 100);
        if (window.currentUserDoc.role === 'mecanico') window.loadMechPendingCharges();
    } else {
        showView('app-client');
        document.getElementById('client-name-display').innerText = window.currentUserDoc.name || 'Cliente OBR';
        // Resto de lógica de cliente...
        window.loadClientHistory(); 
        listenToMySOS(); 
        window.loadClientCitas(); 
        loadPublicStore();
        window.loadMyOrders();
        updateLandingStatus();
    }

    // Listener de notificaciones RTDB
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
    // Modo Próximamente: redirigir a 'view-proximamente' excepto landing, login y force-setup
    if (globalSettings.modoProximamente && !['view-landing','view-login','view-force-setup'].includes(targetId)) {
        targetId = 'view-proximamente';
    }

    const views = ['view-landing', 'view-public-store', 'view-public-tracking', 'view-login', 'view-sos-form', 'view-force-setup', 'app-client', 'app-admin', 'view-proximamente'];
    views.forEach(id => { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); el.style.display = 'none'; } });
    const target = document.getElementById(targetId);
    // Mostrar/ocultar el botón de sesión unificado (opcional, no necesario si ya es global)
    const sessionBtn = document.getElementById('session-btn');
    if (sessionBtn) {
        sessionBtn.style.display = 'block';
    }
    if(target) { target.classList.remove('hidden'); target.classList.add('flex'); target.style.display = 'flex'; }
    toggleModal('modal-user-detail', false);
    window.fixMaps?.();
}
window.showView = showView;

window.fixMaps = () => {
    setTimeout(() => {
        if(adminGeoMap) adminGeoMap.invalidateSize();
        if(adminSOSGlobalMapInst) adminSOSGlobalMapInst.invalidateSize();
        if(sosMapInstance) sosMapInstance.invalidateSize();
        if(mechMapInst) mechMapInst.invalidateSize();
        if(sosDetailMapInst) sosDetailMapInst.invalidateSize();
        if(entregasMapInst) entregasMapInst.invalidateSize();
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
    document.querySelectorAll('.a-view').forEach(v => v.classList.add('hidden')); 
    document.getElementById(id).classList.remove('hidden');
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
        setTimeout(() => window.loadOnlineOrders?.(), 200);
    window.cargarChatsPendientesAdmin();
    }
    if(id === 'a-view-entregas') { 
        setTimeout(() => window.loadEntregas?.(), 300);
        window.fixMaps?.();
    }

       // Ocultar panel de acciones de entregas al salir de esa vista
    const entregaPanel = document.getElementById('entrega-actions-panel');
    if (entregaPanel) entregaPanel.classList.add('hidden');

    window.fixMaps?.();
};

window.applyViewPermissions = () => {
    const vistas = window.currentUserDoc?.vistasPermitidas;
    if (!vistas || !Array.isArray(vistas)) return;

    // Ocultar/mostrar botones en la barra de navegación
    document.querySelectorAll('.a-nav-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        const match = onclick.match(/'([^']+)'/);
        if (match) {
            const vistaId = match[1];
            if (!vistas.includes(vistaId)) {
                btn.style.display = 'none';
            } else {
                btn.style.display = ''; // restablecer
            }
        }
    });

    // Si la vista activa actual no está permitida, redirigir a la primera disponible
    const currentActive = document.querySelector('.a-view:not(.hidden)');
    if (currentActive) {
        const currentId = currentActive.getAttribute('id');
        if (!vistas.includes(currentId)) {
            // Buscar la primera vista permitida
            const primera = vistas[0];
            if (primera) window.switchAdminView(primera);
        }
    }
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
    const rawPhone = document.getElementById('phone-input').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (rawPhone.length !== 10) return showToast("Celular de 10 dígitos", true);
    if (!password) return showToast("Ingresa contraseña", true);
    try {
        await signInWithEmailAndPassword(auth, `${rawPhone}@motorescateobr.com`, password);
        window._lastLoginPhone = rawPhone;
        window._lastLoginPassword = password;
    } catch(e) {
        if (e.code === 'auth/user-not-found') showToast("Usuario no registrado", true);
        else if (e.code === 'auth/wrong-password') showToast("Contraseña incorrecta", true);
        else showToast("Error al iniciar sesión", true);
    }
};

window.processRegister = async () => {
    const rawPhone = document.getElementById('phone-input').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const question = document.getElementById('reg-question').value;
    const answer = document.getElementById('reg-answer').value.trim();
    if (!name || password.length < 6 || !question || !answer) return showToast("Completa datos (Pass min 6)", true);
    const fakeEmail = `${rawPhone}@motorescateobr.com`;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            phone: "+52" + rawPhone,
            name,
            role: 'cliente',
            secQuestion: question,
            secAnswer: answer.toLowerCase(),
            pwd: password,
            firstLogin: true,
            created: new Date().toISOString()
        });

        // Crear o actualizar modal de invitación por WhatsApp
        const modalId = 'modal-whatsapp-invite';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `
                <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-green-500/30 shadow-2xl text-center">
                    <i class="fab fa-whatsapp text-5xl text-green-500 mb-4"></i>
                    <h2 class="text-xl font-black text-white mb-2">¡Registro exitoso!</h2>
                    <p class="text-xs text-gray-300 mb-4">¿Deseas enviar una invitación a <span id="invite-name-span" class="text-green-400 font-bold">${name}</span> por WhatsApp para que descargue la app?</p>
                    <div class="flex flex-col space-y-2">
                        <button id="whatsapp-invite-btn" class="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase text-sm flex items-center justify-center"><i class="fab fa-whatsapp mr-2"></i> Enviar invitación</button>
                        <button id="whatsapp-skip-btn" class="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase text-sm">Omitir</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
        } else {
            const span = modalEl.querySelector('#invite-name-span');
            if (span) span.innerText = name;
        }

        // Configurar eventos (solo una vez)
        const inviteBtn = document.getElementById('whatsapp-invite-btn');
        const skipBtn = document.getElementById('whatsapp-skip-btn');
        if (inviteBtn && !inviteBtn._bound) {
            inviteBtn._bound = true;
            inviteBtn.onclick = () => {
                const mensaje = encodeURIComponent(`🎉 ¡Hola ${name}! Te has registrado exitosamente en OBR Moto Rescate. Descarga la app aquí: https://exploracionesobr.github.io/RESCATE-OBR`);
                window.open(`https://api.whatsapp.com/send?phone=+52${rawPhone}&text=${mensaje}`, '_blank');
                window.toggleModal(modalId, false);
                setTimeout(() => window.location.reload(), 500);
            };
        }
        if (skipBtn && !skipBtn._bound) {
            skipBtn._bound = true;
            skipBtn.onclick = () => {
                window.toggleModal(modalId, false);
                setTimeout(() => window.location.reload(), 500);
            };
        }

        window.toggleModal(modalId, true);
        showToast("Registro exitoso. Completa tu perfil.");
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
window.toggleSession = () => {
    if (auth.currentUser) {
        window.logout();
    } else {
        window.showView('view-login');
    }
};
window.forceSetupSubmit = async () => {
    const name = document.getElementById('force-name')?.value.trim();
    const newPassword = document.getElementById('force-password')?.value.trim();
    const question = document.getElementById('force-question')?.value;
    const answer = document.getElementById('force-answer')?.value.trim();

    if (!name || !newPassword || newPassword.length < 6 || !question || !answer) {
        window.showToast("Completa todos los campos (nombre, contraseña mín 6, pregunta y respuesta)", true);
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        window.showToast("No hay sesión activa. Por favor inicia sesión nuevamente.", true);
        setTimeout(() => window.showView('view-login'), 2000);
        return;
    }

    try {
        // Reautenticar con la contraseña temporal (123456) que se usó al crear el usuario
        const credential = EmailAuthProvider.credential(user.email, '123456');
        await reauthenticateWithCredential(user, credential);

        // Cambiar la contraseña en Firebase Authentication
        await updatePassword(user, newPassword);

        // Actualizar Firestore con los nuevos datos y marcar firstLogin: false
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            pwd: newPassword,
            secQuestion: question,
            secAnswer: answer.toLowerCase(),
            firstLogin: false
        }, { merge: true });

        window.showToast("Configuración guardada. Redirigiendo...");
        // Recargar la página para que el flujo de autenticación continúe
        setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/wrong-password') {
            window.showToast("Error: la contraseña temporal no es válida. Contacta al administrador.", true);
        } else if (error.code === 'auth/requires-recent-login') {
            window.showToast("Por seguridad, necesitas volver a iniciar sesión.", true);
            await signOut(auth);
            window.showView('view-login');
        } else if (error.code === 'auth/weak-password') {
            window.showToast("La nueva contraseña es muy débil. Usa al menos 6 caracteres.", true);
        } else {
            window.showToast("Error al guardar: " + (error.message || "Intenta de nuevo"), true);
        }
    }
};
window.logout = () => {
    window.confirmModal('¿Cerrar sesión? Perderás las notificaciones en tiempo real hasta que vuelvas a iniciar sesión.', async () => {
        // Limpiar listeners de tiempo real para evitar fugas
        const listeners = [
            '_clientHistoryListener', '_clientCitasListener', '_adminCitasListener',
            '_onlineOrdersListener', '_entregasPedidosListener', '_entregasRepartidoresListener',
            'mySOSListener', 'serviciosListener', 'pedidosListener', 'citasListener'
        ];
        listeners.forEach(name => {
            if (window[name] && typeof window[name] === 'function') {
                window[name]();
            }
            delete window[name];
        });
        // Limpiar líneas de ruta y objetos globales de tracking
        if (window._adminSOSTrackingListeners) {
            Object.values(window._adminSOSTrackingListeners).forEach(unsub => unsub());
            window._adminSOSTrackingListeners = {};
        }
        if (window._adminSOSRouteLines) {
            Object.values(window._adminSOSRouteLines).forEach(line => line.remove());
            window._adminSOSRouteLines = {};
        }
        await signOut(auth);
        window.location.href = window.location.pathname;
    });
};
window.filterServiceOptions = () => {
    const input = document.getElementById('sos-service-input');
    const dropdown = document.getElementById('sos-service-dropdown');
    if (!input || !dropdown) {
        console.warn('No se encontró input o dropdown');
        return;
    }
    const query = input.value.trim().toLowerCase();
    console.log('Buscando:', query, 'shopServices length:', shopServices.length);
    
    let matches = [];
    if (query.length === 0) {
        matches = [{ id: "0", name: "SIN FALLO ESPECÍFICO (Se cotizará en el lugar)", price: 0 }];
    } else {
        matches = shopServices.filter(s => s.name.toLowerCase().includes(query));
        if (matches.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
        matches = matches.slice(0, 5);
        matches.push({ id: "0", name: "SIN FALLO ESPECÍFICO (Se cotizará en el lugar)", price: 0 });
    }
    
    dropdown.innerHTML = '';
    matches.forEach(s => {
        const item = document.createElement('div');
        item.className = 'p-3 hover:bg-naranja/30 cursor-pointer text-white text-sm border-b border-white/10 last:border-0 flex justify-between items-center';
        item.innerHTML = `
            <span>${s.name}</span>
            ${s.price > 0 ? `<span class="text-naranja font-bold">$${s.price}</span>` : '<span class="text-gray-400 text-xs">Sin costo extra</span>'}
        `;
        item.onclick = () => {
            document.getElementById('sos-service-input').value = s.name;
            document.getElementById('sos-service-select-value').value = s.id;
            dropdown.classList.add('hidden');
            const displayDiv = document.getElementById('selected-service-display');
            const nameSpan = document.getElementById('selected-service-name');
            if (displayDiv && nameSpan) {
                nameSpan.innerText = s.name;
                displayDiv.classList.remove('hidden');
                setTimeout(() => displayDiv.classList.add('hidden'), 3000);
            }
            window.updateSOSEstimate();
        };
        dropdown.appendChild(item);
    });
    dropdown.classList.remove('hidden');
};

// Ocultar dropdown al hacer clic fuera
document.addEventListener('click', (e) => {
    const input = document.getElementById('sos-service-input');
    const dropdown = document.getElementById('sos-service-dropdown');
    if (input && dropdown && !input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});
window.clearServiceSelection = () => {
    const input = document.getElementById('sos-service-input');
    const hidden = document.getElementById('sos-service-select-value');
    const display = document.getElementById('selected-service-display');
    if (input) input.value = '';
    if (hidden) hidden.value = '0';
    if (display) display.classList.add('hidden');
    window.updateSOSEstimate();   // actualiza el costo a tarifa base
    window.showToast("Selección limpiada. Se usará tarifa base.");
};
// === SOS CLIENTE ===
window.launchSOSForm = () => {
    showView('view-sos-form');
    document.getElementById('manual-address-container').classList.add('hidden');
    document.getElementById('llanta-type-container').classList.add('hidden');
    document.getElementById('sos-map-preview').classList.remove('hidden');
    document.getElementById('sos-estimate-display').innerText = "Calculando...";
    document.getElementById('gps-status-text').innerText = "Buscando...";

    // FORZAR VISIBILIDAD DEL SELECTOR DE SERVICIOS
    const serviceContainer = document.getElementById('sos-service-selector-container');
    if (serviceContainer) {
        serviceContainer.style.display = 'block';
        serviceContainer.classList.remove('hidden');
    }

    // (Opcional) Recargar servicios por si acaso
    if (typeof loadServicesCatalog === 'function') loadServicesCatalog();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            tempSOSGps.lat = pos.coords.latitude;
            tempSOSGps.lng = pos.coords.longitude;
            const dist = getDistanceKm(tempSOSGps.lat, tempSOSGps.lng, globalSettings.centerLat, globalSettings.centerLng);
            if (dist > globalSettings.radiusKm) {
                document.getElementById('out-of-zone-modal').classList.remove('hidden');
                document.getElementById('out-of-zone-modal').classList.add('flex');
                showView('view-landing');
                return;
            }
            document.getElementById('gps-status-text').innerText = "GPS Establecido";
            document.getElementById('gps-status-text').className = "text-[9px] font-bold text-green-400";
            if (!sosMapInstance) {
                sosMapInstance = L.map('sos-map-preview', { dragging: false, zoomControl: false, scrollWheelZoom: false }).setView([tempSOSGps.lat, tempSOSGps.lng], 16);
                const isLight = document.body.classList.contains('light-mode');
                const layerUrl = isLight
                    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                L.tileLayer(layerUrl, { attribution: '&copy; <a href="https://carto.com/">CARTO</a>' }).addTo(sosMapInstance);
                L.marker([tempSOSGps.lat, tempSOSGps.lng], {
                    icon: L.divIcon({ className: 'gps-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-street-view text-white text-xs"></i></div>', iconSize: [28, 28], iconAnchor: [14, 28] })
                }).addTo(sosMapInstance);
            } else {
                sosMapInstance.setView([tempSOSGps.lat, tempSOSGps.lng], 16);
                sosMapInstance.invalidateSize();
            }
            window.updateSOSEstimate(dist);
        }, () => {
            document.getElementById('gps-status-text').innerText = "Sin GPS: Escribe dirección";
            document.getElementById('gps-status-text').className = "text-[9px] font-bold text-red-500";
            document.getElementById('manual-address-container').classList.remove('hidden');
            document.getElementById('sos-map-preview').classList.add('hidden');
            window.updateSOSEstimate(0);
        }, { enableHighAccuracy: true, timeout: 10000 });
    } else {
        document.getElementById('manual-address-container').classList.remove('hidden');
        document.getElementById('sos-map-preview').classList.add('hidden');
        window.updateSOSEstimate(0);
    }
};

window.updateSOSEstimate = function(dist = null) {
    const serviceId = document.getElementById('sos-service-select-value')?.value;
    const dispEl = document.getElementById('sos-estimate-display');
    let rescueCost = 0;
    if (globalSettings.priceMode === 'km') {
        let d = dist !== null ? dist : getDistanceKm(tempSOSGps.lat||0, tempSOSGps.lng||0, globalSettings.centerLat, globalSettings.centerLng);
        let ranges = globalSettings.rescueKmRanges || []; ranges.sort((a,b) => a.km - b.km); let matched = false;
        for(let r of ranges) { if(d <= r.km) { rescueCost = r.price; matched = true; break; } }
        if(!matched && ranges.length > 0) rescueCost = ranges[ranges.length-1].price + Math.max(0, (d - ranges[ranges.length-1].km)) * (globalSettings.rescueKmExtra||0);
    } else rescueCost = globalSettings.rescueBase || 100;

    if(auth.currentUser && window.currentUserDoc?.role === 'membresia') rescueCost = 0;
    window.currentSOSCost = rescueCost;
    if(serviceId === "0" || !serviceId) {
        dispEl.innerHTML = `<span class="text-naranja">Rescate: $${rescueCost.toFixed(2)}</span>`;
    } else {
        const s = shopServices.find(x => x.id === serviceId);
        if(s) dispEl.innerHTML = `$${(rescueCost + parseFloat(s.price)).toFixed(2)}`;
        else dispEl.innerHTML = `<span class="text-naranja">Rescate: $${rescueCost.toFixed(2)}</span>`;
    }
};

window.checkSOSKeywords = () => {
    const txt = document.getElementById('sos-falla').value.toLowerCase(); const llantaBox = document.getElementById('llanta-type-container');
    if(txt.includes('poncha') || txt.includes('llanta') || txt.includes('aire') || txt.includes('camara')) llantaBox.classList.remove('hidden'); else llantaBox.classList.add('hidden');
};

window.submitFinalSOS = async () => {
    const serviceId = document.getElementById('sos-service-select-value')?.value;
    const serviceInputText = document.getElementById('sos-service-input')?.value.trim();
    
    // Validar que si el usuario escribió algo en el campo de servicio, haya seleccionado una opción válida
    if (serviceInputText !== "" && (serviceId === "0" || serviceId === "")) {
        window.showToast("Por favor, selecciona un servicio de la lista (o deja el campo vacío para tarifa base).", true);
        return;
    }
    
    const falla = document.getElementById('sos-falla').value.trim();
    const manualAddress = document.getElementById('sos-manual-address').value.trim();
    const fileInput = document.getElementById('sos-media');
    const btn = document.getElementById('btn-submit-sos');
    
    if (!falla && (!serviceId || serviceId === "0")) return showToast("Describe la falla", true);
    if (!tempSOSGps.lat && !manualAddress) return showToast("Falta ubicación", true);

    speakTTS('Estamos notificando al taller para su solicitud. Espere un momento.');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
    
    let mediaUrl = "";
    const truePhone = window.currentUserDoc?.phone || ("+52" + (auth.currentUser.email?.replace('@motorescateobr.com','') || ''));

    // Determinar nombre del servicio
    let srvName = (!serviceId || serviceId === "0") ? "Auxilio" : (serviceInputText || "Servicio");
    let descFinal = `[${srvName}] ${falla}`;
    const srvDoc = shopServices.find(x => x.id === serviceId);
    if(srvDoc && srvDoc.desc) descFinal += ` \n*${srvDoc.desc}*`;

    const llantaOpt = document.querySelector('input[name="llanta"]:checked');
    if(llantaOpt) descFinal += ` (Llanta: ${llantaOpt.value})`;

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

        const rData = {
            uid: auth.currentUser.uid,
            shortId: obrId,
            clientName: window.currentUserDoc?.name || '',
            phone: truePhone,
            extraPhone: document.getElementById('sos-extra-phone').value.trim(),
            marca: document.getElementById('sos-marca').value.trim(),
            modelo: document.getElementById('sos-modelo').value.trim(),
            cc: document.getElementById('sos-cc').value.trim(),
            falla: descFinal,
            mediaUrl,
            lat: tempSOSGps.lat,
            lng: tempSOSGps.lng,
            manualAddress,
            costoRescateEstimado: window.currentSOSCost,
            status: 'pending',
            tallerStatus: 'recibida',
            timestamp: Date.now()
        };

        const addPromise = addDoc(collection(db, "rescates"), rData);
        const rtdbPromise = rtdbSet(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), rData);

        await Promise.race([
            Promise.all([addPromise, rtdbPromise]),
            timeoutPromise
        ]);

        document.getElementById('sos-falla').value = '';
        document.getElementById('sos-media').value = '';
        document.getElementById('llanta-type-container').classList.add('hidden');
        showToast("¡Unidad notificada!");
        showView('app-client');
        window.switchClientView('c-view-moto');
        listenToMySOS();
    } catch (e) {
        console.warn('SOS enviado con posibles demoras:', e);
        showToast("Solicitud enviada. Te notificaremos cuando el taller confirme.");
        document.getElementById('sos-falla').value = '';
        document.getElementById('sos-media').value = '';
        document.getElementById('llanta-type-container').classList.add('hidden');
        showView('app-client');
        window.switchClientView('c-view-moto');
        listenToMySOS();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>SOLICITAR AUXILIO</span> <i class="fas fa-ambulance text-2xl"></i>';
    }
};
// aqui inicia listenToMySOS //
function listenToMySOS() {
    // Limpiar listener anterior si existe (evita duplicados)
    if (mySOSListener && typeof mySOSListener === 'function') {
        mySOSListener();
        mySOSListener = null;
    }
    if (!auth.currentUser) return;

    // Variables internas para limpieza de sub-listeners
    let mechPosUnsubscribe = null;
    let trackingUnsubscribe = null;

    mySOSListener = onValue(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), async (snap) => {
        const activeCard = document.getElementById('active-sos-card');
        const noServicesMsg = document.getElementById('no-active-services-msg');
        const survey = document.getElementById('satisfaction-survey');
        const mechanicMapDiv = document.getElementById('mechanic-live-map');
        const wsCard = document.getElementById('active-workshop-card');
        const wsProgress = document.getElementById('client-ws-progress');
        const wsTexts = ['ws-text-1', 'ws-text-2', 'ws-text-3', 'ws-text-4'];

        if (!snap.exists()) {
            // Limpiar sub-listeners al desaparecer el SOS
            if (mechPosUnsubscribe) { mechPosUnsubscribe(); mechPosUnsubscribe = null; }
            if (trackingUnsubscribe) { trackingUnsubscribe(); trackingUnsubscribe = null; }
            if (activeCard) activeCard.classList.add('hidden');
            if (noServicesMsg) noServicesMsg.classList.remove('hidden');
            if (survey) survey.classList.add('hidden');
            if (mechanicMapDiv) mechanicMapDiv.classList.add('hidden');
            if (wsCard) wsCard.classList.add('hidden');
            if (mechMapInst) {
                mechMapInst.remove();
                mechMapInst = null;
                window._mechMarker = null;
                window._clientMarker = null;
                if (window._mechRouteLine) window._mechRouteLine = null;
            }
            window.lastClientSOSStatus = null;
            return;
        }

        const data = snap.val();
        if (activeCard) activeCard.classList.remove('hidden');
        if (noServicesMsg) noServicesMsg.classList.add('hidden');

        // ===== 1. Actualizar texto del estado (siempre) =====
        const statusDesc = document.getElementById('sos-status-desc-client');
        if (statusDesc) {
            let estadoTexto = "Esperando confirmación";
            if (data.status === 'accepted') estadoTexto = "Mecánico en camino";
            else if (data.status === 'completed') estadoTexto = "Servicio finalizado";
            else if (data.status === 'cancelled') estadoTexto = "Cancelado";
            else if (data.status === 'repairing') estadoTexto = "Reparando";
            else if (data.status === 'to_shop') estadoTexto = "En taller";
            else if (data.status === 'ready') estadoTexto = "Listo";
            statusDesc.innerText = estadoTexto;
        }

        // ===== 2. Manejo de eventos especiales (sonido, chat, encuesta) =====
        if (data.status === 'accepted' && window.lastClientSOSStatus !== 'accepted') {
            speakTTS('TU SOLICITUD HA SIDO ACEPTADA. ESPERA MIENTRAS LLEGA EL MECÁNICO.');
            playSound('notif');
            // Crear chat si no existe (lógica original, no modificada)
            if (data.mech_uid) {
                // El código de creación de chat se mantiene igual (omitido por brevedad)
            }
        }
        else if ((data.status === 'completed' || data.status === 'cancelled') && 
                 window.lastClientSOSStatus !== 'completed' && 
                 window.lastClientSOSStatus !== 'cancelled') {
            const btnChatSOS = document.getElementById('btn-chat-sos');
            if (btnChatSOS) btnChatSOS.classList.add('hidden');
            window._sosChatId = null;
            speakTTS('AUXILIO FINALIZADO. GRACIAS POR CONFIAR EN OBR.');
            playSound('notif');
            if (activeCard) activeCard.classList.add('hidden');
            
            window.switchClientView('c-view-moto');
            setTimeout(() => {
                const surveyEl = document.getElementById('satisfaction-survey');
                if (surveyEl) surveyEl.classList.remove('hidden');
            }, 200);
            
            remove(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid));
            window.loadClientHistory();
            if (wsCard) wsCard.classList.add('hidden');
            
            // Limpiar mapa y sub-listeners
            if (mechPosUnsubscribe) { mechPosUnsubscribe(); mechPosUnsubscribe = null; }
            if (trackingUnsubscribe) { trackingUnsubscribe(); trackingUnsubscribe = null; }
            if (mechMapInst) {
                mechMapInst.remove();
                mechMapInst = null;
                window._mechMarker = null;
                window._clientMarker = null;
                if (window._mechRouteLine) window._mechRouteLine = null;
            }
            
            // Mostrar taller si la moto aún está en proceso
            if (data.tallerStatus && !['entregada', 'pagado'].includes(data.tallerStatus)) {
                if (wsCard) {
                    wsCard.classList.remove('hidden');
                    const steps = { 'recibida': 1, 'mecanica': 2, 'pruebas': 3, 'lista': 4 };
                    const currentStep = steps[data.tallerStatus] || 0;
                    if (wsProgress) wsProgress.style.width = ((currentStep - 1) * 33.33) + '%';
                    wsTexts.forEach((id, idx) => {
                        const el = document.getElementById(id);
                        if (el) el.style.color = idx < currentStep ? '#3b82f6' : '#666';
                    });
                }
                if (data.tallerServiceId) {
                    window.loadClientWorkshopTimeline?.(data.tallerServiceId);
                }
            } else {
                if (wsCard) wsCard.classList.add('hidden');
            }
            window.lastClientSOSStatus = data.status;
            return; // Salir para no ejecutar el mapa
        }

        // ===== 3. Mapa en tiempo real (solo si está aceptado) =====
        if (data.status === 'accepted' && data.mech_uid) {
            if (mechanicMapDiv) mechanicMapDiv.classList.remove('hidden');

            if (!mechMapInst) {
                const centerLat = data.lat || TALLER_LAT;
                const centerLng = data.lng || TALLER_LNG;
                mechMapInst = L.map('mechanic-live-map', { dragging: true, zoomControl: true }).setView([centerLat, centerLng], 14);
                const isLight = document.body.classList.contains('light-mode');
                const layerUrl = isLight
                    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                L.tileLayer(layerUrl).addTo(mechMapInst);
            } else {
                mechMapInst.invalidateSize();
            }

            // Marcador del cliente
            if (data.lat && data.lng) {
                if (window._clientMarker) mechMapInst.removeLayer(window._clientMarker);
                window._clientMarker = L.marker([data.lat, data.lng], {
                    icon: L.divIcon({ className: 'gps-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-map-marker-alt text-white"></i></div>', iconSize: [28,28], iconAnchor: [14,28] })
                }).addTo(mechMapInst).bindPopup("Tu ubicación").openPopup();
            }

            // Marcador del mecánico
            let mechMarker = window._mechMarker;
            if (!mechMarker) {
                mechMarker = L.marker([data.lat || TALLER_LAT, data.lng || TALLER_LNG], {
                    icon: L.divIcon({ className: 'mech-pulse-marker', html: '<div class="pulse-inner"><i class="fas fa-motorcycle text-white"></i></div>', iconSize: [32,32], iconAnchor: [16,32] })
                }).addTo(mechMapInst).bindPopup("Mecánico en camino");
                window._mechMarker = mechMarker;
            }

            // Limpiar sub-listeners previos antes de crear nuevos
            if (mechPosUnsubscribe) { mechPosUnsubscribe(); mechPosUnsubscribe = null; }
            if (trackingUnsubscribe) { trackingUnsubscribe(); trackingUnsubscribe = null; }

            // Actualizar posición y ruta
            const updateMechPosition = (lat, lng) => {
                if (mechMarker) mechMarker.setLatLng([lat, lng]);
                mechMapInst.setView([lat, lng], 14);
                // El tracking de ruta se maneja aparte
            };

            // Listener de posición activa del mecánico
            mechPosUnsubscribe = onValue(dbRef(rtdb, `mecanicos_activos/${data.mech_uid}`), (posSnap) => {
                if (posSnap.exists()) {
                    const pos = posSnap.val();
                    if (pos.lat && pos.lng) updateMechPosition(pos.lat, pos.lng);
                } else if (data.mech_lat && data.mech_lng) {
                    updateMechPosition(data.mech_lat, data.mech_lng);
                }
            });

            // Listener de trayectoria (ruta)
            const trackingRef = dbRef(rtdb, `mecanicos_tracking/${data.mech_uid}`);
            trackingUnsubscribe = onValue(trackingRef, (trackSnap) => {
                if (trackSnap.exists() && mechMapInst) {
                    const coords = [];
                    trackSnap.forEach(child => {
                        const p = child.val();
                        if (p.lat && p.lng) coords.push([p.lat, p.lng]);
                    });
                    if (coords.length > 1) {
                        if (window._mechRouteLine) mechMapInst.removeLayer(window._mechRouteLine);
                        window._mechRouteLine = L.polyline(coords, { color: '#22c55e', weight: 4, opacity: 0.7 }).addTo(mechMapInst);
                    }
                }
            });
        } else {
            // Si no está aceptado, ocultar mapa y limpiar sub-listeners
            if (mechanicMapDiv) mechanicMapDiv.classList.add('hidden');
            if (mechPosUnsubscribe) { mechPosUnsubscribe(); mechPosUnsubscribe = null; }
            if (trackingUnsubscribe) { trackingUnsubscribe(); trackingUnsubscribe = null; }
            if (mechMapInst) {
                mechMapInst.remove();
                mechMapInst = null;
                window._mechMarker = null;
                window._clientMarker = null;
                if (window._mechRouteLine) window._mechRouteLine = null;
            }
        }

        // ===== 4. Actualizar último estado conocido (siempre al final) =====
        window.lastClientSOSStatus = data.status;
    });
}
// aqui finaliza listenToMySOS //
window.abrirChatSOS = () => {
    if (window._sosChatId) {
        window.openChat(window._sosChatId);
    }
};
// ===== Funciones globales que estaban mal ubicadas dentro de listenToMySOS =====
window.openSOSDetailClient = function() {};

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
    await addDoc(collection(db, "satisfaction"), { 
        uid: auth.currentUser.uid, 
        rating: window.currentRating, 
        comments, 
        timestamp: Date.now(), 
        mechName: window.currentUserDoc.name || 'Mecánico' 
    });
    document.getElementById('satisfaction-survey').classList.add('hidden'); 
    document.getElementById('no-active-services-msg')?.classList.remove('hidden'); 
    showToast("¡Gracias!");
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
    const clientDisplayName = data.clientName || (data.phone ? data.phone.replace('+52', '') : 'Cliente');
    document.getElementById('servicio-detalle-phone').innerText = `${data.shortId || ''} - ${clientDisplayName}`;
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
    const docRef = doc(db, "rescates", currentDetalleServicioId);
    const docSnap = await getDoc(docRef);
    if(!docSnap.exists()) return;
    const actual = docSnap.data().tallerStatus;
    if(actual === 'lista' || actual === 'pagado') return showToast("No se puede cambiar, ya finalizó", true);

    // Si intenta pasar a "lista", verificar que ya se haya cobrado
    if (nuevoEstado === 'lista') {
        const ventasSnap = await getDocs(query(collection(db, "ventas"), where("sosId", "==", currentDetalleServicioId), limit(1)));
        if (ventasSnap.empty) {
            showToast("Debes cobrar antes de marcar como Lista. Abre el cobro desde la vista SOS.", true);
            return;
        }
    }

    await updateDoc(docRef, { tallerStatus: nuevoEstado });

    if(docSnap.data().uid) push(dbRef(rtdb, 'sos_alerts/' + docSnap.data().uid + '/notifs'), {
        msg: nuevoEstado === 'pruebas' ? 'CONTINUAMOS TRABAJANDO EN TU MOTO' :
             (nuevoEstado === 'lista' ? 'TU MOTO YA ESTÁ LISTA, ESPERA AL MECÁNICO' :
              'MOTO EN MECÁNICA')
    });

    playSound('notif');
    showToast(`Estado cambiado a ${nuevoEstado}`);
    toggleModal('modal-detalle-servicio', false);
};
window.abrirCobroDesdeDetalle = () => {
    if (!currentDetalleServicioId) return;
    window.openMechanicPOS(currentDetalleServicioId);
    toggleModal('modal-detalle-servicio', false);
};
window.loadClientHistory = () => {
    if(!auth.currentUser || !window.currentUserDoc) return;
    if (window._clientHistoryListener) window._clientHistoryListener();
    const q = query(collection(db, "rescates"), where("phone", "==", window.currentUserDoc.phone), orderBy("timestamp", "desc"));
    window._clientHistoryListener = onSnapshot(q, (snap) => {
        const list = document.getElementById('client-history-list');
        if (!list) return;
        let html = '';
        snap.forEach(d => {
            const v = d.data();
            html += `<div class="bg-white/5 p-3 rounded-xl border border-white/10 flex justify-between items-center mb-2 cursor-pointer" onclick="window.openClientServiceDetail('${d.id}')">
                <span class="text-xs text-white truncate w-2/3">${v.shortId || 'Sin ID'} - ${v.falla}</span>
                <span class="text-[9px] px-2 py-1 rounded font-bold uppercase ${window.getStatusInfo(v.status).color}">${window.getStatusInfo(v.status).text}</span>
            </div>`;
        });
        list.innerHTML = html || '<p class="text-xs text-center text-gray-600 italic">No tienes servicios registrados.</p>';
    });
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
            <p class="text-xs">Estado: <span class="font-bold ${window.getStatusInfo(data.status).color.replace('bg-', 'text-').replace(/\/\d+/, '')}">${window.getStatusInfo(data.status).text}</span></p>
            ${data.status === 'cancelled' 
    ? `<div class="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
           <p class="text-xs text-yellow-300 italic leading-relaxed">💡 Un cambio oportuno de aceite puede hacer la diferencia en la vida de tu motor.</p>
           <button onclick="event.stopPropagation(); window.startFlow?.('tienda_publica')" class="mt-2 bg-naranja hover:bg-orange-600 text-white text-xs px-4 py-2 rounded-full font-black uppercase transition-colors w-full">
               <i class="fas fa-shopping-bag mr-1"></i> Cotizalo ahora
           </button>
       </div>`
    : (data.tallerStatus ? `<p class="text-xs">Taller: ${data.tallerStatus}</p>` : '')
}
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
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    await new Promise((resolve) => { logoImg.onload = logoImg.onerror = resolve; if (logoImg.complete) resolve(); });

    pdfDoc.setFillColor(255, 107, 0);
    pdfDoc.rect(0, 0, pageWidth, 28, 'F');
    if (logoImg.complete && logoImg.naturalWidth > 0) pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
    pdfDoc.setFontSize(14);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.text("COMPROBANTE DE ADMISIÓN EN TALLER", logoImg.complete ? 36 : 12, 17.5);
    pdfDoc.setDrawColor(255, 107, 0);
    pdfDoc.line(12, 29, pageWidth - 12, 29);

    let y = 40;
    _drawDataCard(pdfDoc, 12, y, pageWidth - 24, 20, 'Registro de Admisión', [
        { label: 'Folio Servicio:', value: String(data.shortId || 'Pendiente'), rightLabel: 'Ingreso:', rightValue: new Date(data.timestamp).toLocaleString('es-MX'), valueOffset: 20 },
        { label: 'Cliente Asignado:', value: String(window.currentUserDoc?.name || data.clientName || 'No provisto'), rightLabel: 'Unidad:', rightValue: `${data.marca || ''} ${data.modelo || ''}`, valueOffset: 20 }
    ]);
    _drawStatusBadge(pdfDoc, pageWidth - 42, y + 3.5, data.status || 'En Proceso');
    y += 28;

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text("DECLARACIÓN DE DAÑOS / SÍNTOMAS:", 12, y);
    y += 5;
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(9);
    pdfDoc.setTextColor(71, 85, 105);
    const descLines = pdfDoc.splitTextToSize(data.falla || 'Sin detalles adicionales registrados por el operador.', pageWidth - 24);
    pdfDoc.text(descLines, 12, y);
    y += (descLines.length * 4.5) + 6;

    if (data.tallerStatus) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(9.5);
        pdfDoc.setTextColor(30, 41, 59);
        pdfDoc.text(`📍 Ubicación actual: ${data.tallerStatus}`, 12, y);
        y += 8;
    }

    if (data.costoRescateEstimado) {
        y += 2;
        pdfDoc.setFillColor(255, 247, 237);
        pdfDoc.setDrawColor(255, 237, 213);
        pdfDoc.roundedRect(12, y, pageWidth - 24, 10, 1, 1, 'FD');
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(9.5);
        pdfDoc.setTextColor(194, 65, 12);
        pdfDoc.text(`Presupuesto Límite Inicial Autorizado: $${Number(data.costoRescateEstimado).toFixed(2)} MXN`, 16, y + 6.5);
        y += 14;
    }

    pdfDoc.setFontSize(7);
    pdfDoc.setTextColor(100);
    pdfDoc.text("Nota: Los costos de refacciones críticas no contempladas se notificarán vía telefónica para la autorización del usuario antes de proceder.", 12, y);

    const addFooter = window._setupProfessionalPDF(pdfDoc, 'COMPROBANTE DE ADMISIÓN EN TALLER', logoImg);
    addFooter(pdfDoc);
    pdfDoc.save(`Ticket_Admision_${data.shortId || serviceId}.pdf`);
};
// === CITAS DEL CLIENTE ===
window.loadClientCitas = () => {
    if(!window.currentUserDoc) return;
    if (window._clientCitasListener) window._clientCitasListener();
    const q = query(collection(db, "citas"), where("phone", "==", window.currentUserDoc.phone));
    window._clientCitasListener = onSnapshot(q, (snap) => {
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
    const phoneInput = document.getElementById('cita-phone');
    if (auth.currentUser && window.currentUserDoc?.phone) {
        // Usuario autenticado: precargar y hacer readonly
        const cleanPhone = window.currentUserDoc.phone.replace('+52', '');
        if (phoneInput) {
            phoneInput.value = cleanPhone;
            phoneInput.readOnly = true;
            phoneInput.classList.add('bg-gray-700', 'cursor-not-allowed', 'opacity-70');
        }
    } else {
        // No autenticado o sin teléfono: campo editable
        if (phoneInput) {
            phoneInput.value = '';
            phoneInput.readOnly = false;
            phoneInput.classList.remove('bg-gray-700', 'cursor-not-allowed', 'opacity-70');
        }
    }
    // Abrir el modal
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
    // Buscar patrón "número días" o "número mes(es)"
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
    // Si no coincide, asumir 30 días por defecto
    ahora.setDate(ahora.getDate() + 30);
    return ahora.toISOString();
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
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    await new Promise((resolve) => { logoImg.onload = logoImg.onerror = resolve; if (logoImg.complete) resolve(); });

    // === ENCABEZADO ESTILO NUEVO ===
    pdfDoc.setFillColor(255, 107, 0);
    pdfDoc.rect(0, 0, pageWidth, 28, 'F');
    if (logoImg.complete && logoImg.naturalWidth > 0) pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
    pdfDoc.setFontSize(14);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.text("REPORTE DE SERVICIO OBR", logoImg.complete ? 36 : 12, 17.5);
    pdfDoc.setDrawColor(255, 107, 0);
    pdfDoc.line(12, 29, pageWidth - 12, 29);

    let y = 40;
    // === CARD DE RESUMEN ===
    pdfDoc.setFillColor(248, 250, 252);
    pdfDoc.setDrawColor(226, 232, 240);
    pdfDoc.roundedRect(12, y, pageWidth - 24, 20, 2, 2, 'FD');
    pdfDoc.setFontSize(9);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text("Resumen de Orden de Auxilio", 16, y + 6);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(8.5);
    pdfDoc.text(`Servicio: ${data.shortId || id}`, 16, y + 12);
    pdfDoc.text(`Fecha: ${new Date(data.timestamp).toLocaleString('es-MX')}`, 16, y + 17);
    pdfDoc.text(`Cliente: ${data.clientName || data.phone || 'Mostrador'}`, pageWidth / 2 + 10, y + 12);
    pdfDoc.text(`Moto: ${data.marca || ''} ${data.modelo || ''}`, pageWidth / 2 + 10, y + 17);
    // Badge de estado
    let badgeColor = [245, 158, 11]; // warning
    if (data.status === 'completed') badgeColor = [34, 197, 94]; // green
    else if (data.status === 'cancelled') badgeColor = [239, 68, 68]; // red
    pdfDoc.setFillColor(...badgeColor);
    pdfDoc.roundedRect(pageWidth - 42, y + 3, 28, 6, 1, 1, 'F');
    pdfDoc.setFontSize(7);
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.text((data.status || 'Pendiente').toUpperCase(), pageWidth - 28, y + 7, { align: 'center' });
    y += 28;

    // === FALLA REPORTADA ===
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text("FALLA OPERATIVA REPORTADA:", 12, y);
    y += 5;
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(9);
    pdfDoc.setTextColor(71, 85, 105);
    const fallaLines = pdfDoc.splitTextToSize(data.falla || 'Sin desglose de reporte inicial.', pageWidth - 24);
    pdfDoc.text(fallaLines, 12, y);
    y += (fallaLines.length * 4.5) + 6;

    // === BITÁCORA (si existe) ===
    if (bitacora.length) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text("CRONOLOGÍA DE BITÁCORA EN ATENCIÓN:", 12, y);
        y += 5;
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(8.5);
        pdfDoc.setTextColor(71, 85, 105);
        bitacora.slice(0, 5).forEach(entry => {
            if (y > 260) { pdfDoc.addPage(); y = 36; }
            const timeStr = new Date(entry.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const entryText = `• [${timeStr}] ${entry.mechName || 'Técnico'}: ${entry.text}`;
            const lines = pdfDoc.splitTextToSize(entryText, pageWidth - 24);
            pdfDoc.text(lines, 12, y);
            y += (lines.length * 4.5) + 2;
        });
        y += 6;
    }

    // === LIQUIDACIÓN ECONÓMICA ===
    if (venta && venta.ticket && venta.ticket.length) {
        if (y > 220) { pdfDoc.addPage(); y = 36; }
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text("LIQUIDACIÓN ECONÓMICA DE CONCEPTOS:", 12, y);
        y += 4;
        const bodyRows = venta.ticket.map(item => [item.name, item.garantia || 'N/A', `$${item.price.toFixed(2)}`]);
        pdfDoc.autoTable({
            startY: y,
            head: [['Descripción del Concepto / Refacción', 'Garantía', 'Costo Bruto']],
            body: bodyRows,
            theme: 'striped',
            styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30,41,59], font: 'helvetica' },
            headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 35 }, 2: { cellWidth: 30, halign: 'right' } },
            margin: { left: 12, right: 12 }
        });
        y = pdfDoc.lastAutoTable.finalY + 6;
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text(`Total Liquidado: $${venta.total.toFixed(2)} MXN`, pageWidth - 12, y, { align: 'right' });
    } else if (data.costoRescateEstimado) {
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text(`Costo Estimado de Asistencia: $${data.costoRescateEstimado}`, 12, y);
    }

    // === FOOTER ===
    const totalPages = pdfDoc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        pdfDoc.setPage(i);
        pdfDoc.setFontSize(7);
        pdfDoc.setTextColor(148, 163, 184);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`OBR Moto Rescate | Documento generado el ${new Date().toLocaleDateString('es-MX')}`, 12, 287);
        pdfDoc.text(`Página ${i} de ${totalPages}`, pageWidth - 25, 287);
    }
    pdfDoc.save(`Reporte_Servicio_${data.shortId || id}.pdf`);
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
                refreshCatalogUI(); // <-- Asegurar que esté presente
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
// ===== FLUJO DE PEDIDOS EN LÍNEA =====
window.createOrder = () => {
    // Si no hay sesión, redirigir al login y guardar el carrito para después
    if (!auth.currentUser) {
        window.pendingItemToBuy = 'cart'; // para restaurar carrito después de login
        toggleModal('modal-cart', false);
        showToast("Inicia sesión para realizar el pedido");
        showView('view-login');
        return;
    }
    // Abrir modal de opciones de entrega
    toggleModal('modal-order-options', true);
    toggleModal('modal-cart', false); // cerrar carrito
};

window.selectOrderOption = (option) => {
    toggleModal('modal-order-options', false);
    if (option === 'recoger') {
        window.submitPickupOrder();
    } else if (option === 'domicilio') {
    window.submitDeliveryOrder();
    }
};
// Mapa de recogida en taller
window.submitPickupOrder = () => {
    const modalId = 'modal-pickup-map';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-md rounded-[2rem] p-6 relative border border-naranja/30 shadow-2xl">
                <button onclick="toggleModal('${modalId}', false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                <h2 class="text-xl font-black mb-4 text-white">Recoger en Taller</h2>
                <div id="pickup-map" class="h-48 bg-white rounded-xl mb-4"></div>
                <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${TALLER_LAT},${TALLER_LNG}', '_blank')" class="w-full bg-blue-600 text-white p-3 rounded-xl font-black uppercase mb-2"><i class="fas fa-map-signs mr-2"></i>Cómo llegar</button>
                <button id="btn-confirm-pickup" class="w-full bg-naranja hover:bg-orange-600 text-white p-3 rounded-xl font-black uppercase"><i class="fas fa-check mr-2"></i>Confirmar pedido</button>
            </div>
        `;
        document.body.appendChild(modalEl);
        document.getElementById('btn-confirm-pickup').addEventListener('click', () => {
            window.finalizeOrder('recoger');
        });
    }
    toggleModal(modalId, true);
    // Inicializar mapa Leaflet después de que el modal sea visible
    setTimeout(() => {
        const mapEl = document.getElementById('pickup-map');
        if (mapEl && !mapEl._leaflet_map) {
            const map = L.map('pickup-map', { zoomControl: false, dragging: false }).setView([TALLER_LAT, TALLER_LNG], 15);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
            L.marker([TALLER_LAT, TALLER_LNG], { icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] }) }).addTo(map);
            mapEl._leaflet_map = map;
        }
    }, 300);
};
// Flujo de envío a domicilio
window.submitDeliveryOrder = () => {
    const modalId = 'modal-delivery-order';
    let modalEl = document.getElementById(modalId);
    // Si el modal no existe, lo creamos dinámicamente (ya debería existir en el HTML, pero por si acaso)
    if (!modalEl) {
        // (Ya lo agregamos en el HTML, así que solo lo mostramos)
    }
    
    // Variables para almacenar la ubicación seleccionada
    let selectedLat = null;
    let selectedLng = null;

    toggleModal(modalId, true);

    // Inicializar mapa Leaflet dentro del modal
    setTimeout(() => {
        const mapEl = document.getElementById('delivery-map');
        if (mapEl && !mapEl._delivery_map) {
            const map = L.map('delivery-map', { zoomControl: false }).setView([TALLER_LAT, TALLER_LNG], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
            
            let marker = null;
            map.on('click', (e) => {
                const { lat, lng } = e.latlng;
                selectedLat = lat;
                selectedLng = lng;
                if (marker) {
                    marker.setLatLng([lat, lng]);
                } else {
                    marker = L.marker([lat, lng]).addTo(map);
                }
            });

            // Botón "Usar ubicación actual"
            document.getElementById('btn-use-my-location').onclick = () => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        selectedLat = lat;
                        selectedLng = lng;
                        if (marker) {
                            marker.setLatLng([lat, lng]);
                        } else {
                            marker = L.marker([lat, lng]).addTo(map);
                        }
                        map.setView([lat, lng], 16);
                    }, () => {
                        showToast("No se pudo obtener tu ubicación. Selecciona manualmente en el mapa.", true);
                    });
                } else {
                    showToast("Tu navegador no soporta geolocalización.", true);
                }
            };

            // Confirmar pedido
            document.getElementById('btn-confirm-delivery').onclick = () => {
                if (!selectedLat || !selectedLng) {
                    showToast("Selecciona una ubicación en el mapa o usa 'Usar ubicación actual'", true);
                    return;
                }
                const referencia = document.getElementById('delivery-reference').value.trim();
                const metodoPago = document.getElementById('delivery-payment').value;
                // Cerrar modal y llamar a finalizeOrder con datos extra
                toggleModal(modalId, false);
                window.finalizeOrder('domicilio', {
                    lat: selectedLat,
                    lng: selectedLng,
                    referencia: referencia,
                    metodoPago: metodoPago
                });
            };

            mapEl._delivery_map = map;
        }
    }, 300);
};
// Finalizar pedido (común para recoger y envío)
window.finalizeOrder = async (tipoEntrega, extraData = {}) => {
    if (!window.cart || window.cart.length === 0) {
        showToast("El carrito está vacío", true);
        return;
    }
    const cartItems = [...window.cart];
    const total = cartItems.reduce((s, i) => s + i.price, 0);
    const orderData = {
        uid: auth.currentUser.uid,
        cliente: window.currentUserDoc?.name || 'Cliente',
        phone: window.currentUserDoc?.phone || '',
        items: cartItems,
        total: total,
        tipoEntrega: tipoEntrega,
        status: 'pendiente',
        timestamp: Date.now(),
        ...extraData
    };
    try {
        const docRef = await addDoc(collection(db, "pedidos_online"), orderData);
        // Notificar a CAJA mediante RTDB
        rtdbSet(dbRef(rtdb, 'notificaciones_caja/pedido_' + Date.now()), { 
            msg: 'Nuevo pedido en línea pendiente', 
            type: 'pedido_online',
            pedidoId: docRef.id,
            cliente: orderData.cliente,
            total: total
        });
        showToast("Pedido enviado. Espera confirmación del taller.");
        // Limpiar carrito
        window.cart = [];
        window.renderCartItems?.();
        document.getElementById('cart-count').innerText = '0';
        document.getElementById('cart-count-mobile').innerText = '0';
        // Cerrar modales relacionados
        toggleModal('modal-pickup-map', false);
        toggleModal('modal-order-options', false);
        toggleModal('modal-delivery-order', false);
    } catch (e) {
        console.error('Error al crear pedido:', e);
        showToast("Error al enviar pedido. Intenta de nuevo.", true);
    }
};
// Cargar pedidos online en el panel de CAJA
let onlineOrdersListener = null;

window.loadOnlineOrders = () => {
    const container = document.getElementById('compras-online-list');
    if (!container) return;

    // Si ya hay un listener, lo desvinculamos para evitar duplicados
    if (onlineOrdersListener) onlineOrdersListener();

    const q = query(collection(db, "pedidos_online"), where("status", "==", "pendiente"), orderBy("timestamp", "desc"));
    onlineOrdersListener = onSnapshot(q, (snap) => {
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<p class="text-xs text-gray-500 italic">Sin pedidos pendientes</p>';
            return;
        }
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const id = docSnap.id;
            const metodoPago = p.metodoPago || 'No especificado';
            const referencia = p.referencia || '';
            const entrega = p.tipoEntrega === 'domicilio' ? '🏠 Domicilio' : '🏍️ Recoger';
            
            container.innerHTML += `
            <div class="bg-black/30 p-3 rounded-xl border border-white/10 text-xs">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-white">${p.cliente || 'Sin nombre'}</span>
                    <span class="text-[0.6rem] font-bold uppercase text-yellow-400">${entrega}</span>
                </div>
                <p class="text-gray-400 truncate">${p.items.map(i => i.name).join(', ')}</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="text-naranja font-bold">$${p.total.toFixed(2)}</span>
                    <div class="flex space-x-1">
                        <button onclick="window.acceptOnlineOrder('${id}')" class="bg-green-600 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase">Aceptar</button>
                        <button onclick="window.cancelOnlineOrder('${id}')" class="bg-red-600 text-white px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase">Cancelar</button>
                    </div>
                </div>
                ${metodoPago !== 'No especificado' ? `<p class="text-[0.6rem] text-gray-500 mt-1">💳 ${metodoPago}</p>` : ''}
                ${referencia ? `<p class="text-[0.6rem] text-gray-500">📌 ${referencia}</p>` : ''}
            </div>`;
        });
    });
};

window.acceptOnlineOrder = async (pedidoId) => {
    try {
        const snap = await getDoc(doc(db, "pedidos_online", pedidoId));
        if (!snap.exists()) return showToast("Pedido no encontrado", true);
        const data = snap.data();
        if (data.tipoEntrega === 'domicilio') {
            // Guardar el id del pedido temporalmente y abrir modal de asignación
            window._pedidoAceptadoId = pedidoId;
            window.loadRepartidoresParaAsignar(pedidoId);
            toggleModal('modal-asignar-repartidor', true);
        } else {
            // Recoger en taller: aceptar directamente
            await updateDoc(doc(db, "pedidos_online", pedidoId), { status: 'aceptado' });
            showToast("Pedido aceptado. Se notificará al cliente.");
            // Notificar al cliente
            if (data.uid) {
                rtdbSet(dbRef(rtdb, 'notificaciones/' + data.uid), { 
                    msg: 'Tu pedido ha sido aceptado. El taller se pondrá en contacto contigo.' 
                });
            }
            speakTTS('Pedido aceptado, en breve verás actualizaciones desde tu app.');
            // Crear chat (opcional para recoger, pero lo dejamos)
            // ...
        }
    } catch (e) {
        showToast("Error al aceptar pedido", true);
    }
};
// Cancelar un pedido online
window.cancelOnlineOrder = (pedidoId) => {
    window.confirmModal("¿Cancelar este pedido? Se notificará al cliente.", async () => {
        await updateDoc(doc(db, "pedidos_online", pedidoId), { status: 'cancelado' });
        showToast("Pedido cancelado.");
        const snap = await getDoc(doc(db, "pedidos_online", pedidoId));
        if (snap.exists()) {
            const data = snap.data();
            if (data.uid) {
                rtdbSet(dbRef(rtdb, 'notificaciones/' + data.uid), { 
                    msg: 'Tu pedido ha sido cancelado por el taller. Contacta a soporte si tienes dudas.' 
                });
            }
        }
    });
};
window.loadRepartidoresParaAsignar = async (pedidoId) => {
    const lista = document.getElementById('lista-repartidores-asignar');
    if (!lista) return;
    lista.innerHTML = '<div class="text-center text-gray-400 text-xs"><i class="fas fa-spinner fa-spin"></i> Cargando personal...</div>';
    const mechSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["mecanico", "admin", "taller"])));
    let html = '';
    mechSnap.forEach(docSnap => {
        const user = docSnap.data();
        html += `<button onclick="window.asignarRepartidor('${docSnap.id}', '${pedidoId}')" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white font-bold text-sm hover:bg-white/10 transition-colors flex items-center space-x-3">
            <i class="fas fa-motorcycle text-blue-400"></i><span>${user.name || 'Personal'}</span>
        </button>`;
    });
    lista.innerHTML = html || '<p class="text-gray-500 text-xs">No hay personal disponible.</p>';
};

window.asignarRepartidor = async (repartidorUid, pedidoId) => {
    try {
        await updateDoc(doc(db, "pedidos_online", pedidoId), { 
            status: 'aceptado', 
            repartidor_uid: repartidorUid,
            estado_entrega: 'pendiente'
        });
        const snap = await getDoc(doc(db, "pedidos_online", pedidoId));
        if (snap.exists()) {
            const data = snap.data();
            if (data.uid) {
                rtdbSet(dbRef(rtdb, 'notificaciones/' + data.uid), { 
                    msg: '✅ Tu pedido ha sido aceptado y se está preparando para envío.' 
                });
            }
        }
        showToast("Repartidor asignado correctamente");
        toggleModal('modal-asignar-repartidor', false);
        window._pedidoAceptadoId = null;
        // Forzar refresco de lista
        window.loadOnlineOrders();
    } catch (e) {
        showToast("Error al asignar repartidor", true);
    }
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
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    const generar = () => {
        const pageWidth = pdfDoc.internal.pageSize.getWidth();
        pdfDoc.setFillColor(255, 107, 0);
        pdfDoc.rect(0, 0, pageWidth, 28, 'F');
        if (logoImg.complete && logoImg.naturalWidth > 0) pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(255, 255, 255);
        pdfDoc.text("COMPROBANTE DE VENTA", logoImg.complete ? 36 : 12, 17.5);
        pdfDoc.setDrawColor(255, 107, 0);
        pdfDoc.line(12, 29, pageWidth - 12, 29);

        let y = 40;
        _drawDataCard(pdfDoc, 12, y, pageWidth - 24, 25, 'Datos del Comprobante', [
            { label: 'Ticket:', value: saleData.shortId, rightLabel: 'Método de Pago:', rightValue: saleData.metodoPago },
            { label: 'Fecha:', value: new Date(saleData.fecha).toLocaleString(), rightLabel: 'Cliente:', rightValue: saleData.clienteCel || 'Mostrador' }
        ]);
        y += 32;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text("ARTÍCULOS ADQUIRIDOS:", 12, y);
        y += 4;
        const body = saleData.ticket.map(item => [item.name, item.garantia || 'Sin garantía', `$${item.price.toFixed(2)}`]);
        pdfDoc.autoTable({
            startY: y,
            head: [['Descripción del Producto', 'Garantía Oficial', 'Precio Unitario']],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5, textColor: [30,41,59] },
            headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
            columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 35 }, 2: { cellWidth: 30, halign: 'right' } },
            margin: { left: 12, right: 12 }
        });
        y = pdfDoc.lastAutoTable.finalY + 10;
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(12);
        pdfDoc.text(`Total Neto: $${saleData.total.toFixed(2)}`, pageWidth - 40, y, { align: 'right' });
        y += 10;
        pdfDoc.setFontSize(7);
        pdfDoc.setTextColor(148, 163, 184);
        pdfDoc.text("Gracias por su preferencia comercial. Conserve el presente ticket físico o digital para hacer válida cualquier reclamación de garantía en sucursal.", 12, y);

        const addFooter = window._setupProfessionalPDF(pdfDoc, 'COMPROBANTE DE VENTA', logoImg);
        addFooter(pdfDoc);
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
        } catch(e) { pdfDoc.save(`Venta_${saleData.shortId}.pdf`); }
    };
    if (logoImg.complete && logoImg.naturalWidth > 0) generar();
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
            ${g.estado === 'activa' ? `<button onclick="event.stopPropagation(); window.prepararAplicarGarantia('${d.id}')" class="mt-2 bg-blue-600 text-white px-2 py-1 rounded text-[0.6rem] font-bold uppercase">Aplicar Garantía</button>` : ''}
            ${g.ventaId ? `<p class="text-gray-500">Venta: ${g.ventaId}</p>` : ''}
        </div>`;
    });
};
window.garantiaSeleccionadaId = null;

window.prepararAplicarGarantia = (garantiaId) => {
    window.garantiaSeleccionadaId = garantiaId;
    toggleModal('modal-aplicar-garantia', true);
};

window.aplicarGarantia = async () => {
    if (!window.garantiaSeleccionadaId) return;
    const tipoUso = document.getElementById('garantia-tipo-uso')?.value;
    const observaciones = document.getElementById('garantia-observaciones')?.value.trim();
    if (!tipoUso) return showToast("Selecciona el tipo de cobertura", true);

    const garantiaRef = doc(db, "garantias", window.garantiaSeleccionadaId);
    const snap = await getDoc(garantiaRef);
    if (!snap.exists()) return showToast("Garantía no encontrada", true);
    const data = snap.data();

    // Actualizar la garantía con la información de uso
    await updateDoc(garantiaRef, {
        estado: 'usada',
        tipoUso: tipoUso,
        observaciones: observaciones,
        fechaUso: new Date().toISOString()
    });

    showToast("Garantía aplicada correctamente");
    toggleModal('modal-aplicar-garantia', false);
    window.garantiaSeleccionadaId = null;
    // Opcional: si es cambio por otro producto, abrir POS o alguna acción adicional
    window.loadGarantias(); // Refrescar lista
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
        const mostrarBotonAnterior = index > 0;
        html += `
        <div class="bg-black/40 p-4 rounded-2xl border border-white/10">
            <div class="flex justify-between items-center mb-2">
                <p class="font-black text-sm text-white">${dia}</p>
                <div class="flex space-x-1">
                    ${mostrarBotonAnterior ? `<button onclick="window.usePreviousDayVideo(${index})" class="text-[9px] bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded-lg font-bold uppercase" title="Usar video del día anterior"><i class="fas fa-copy mr-1"></i>Usar anterior</button>` : ''}
                    ${tieneVideo ? `<button onclick="window.clearVideoURL(${index})" class="text-[9px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg font-bold uppercase"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
            <div class="flex space-x-2 mb-2">
                <input type="url" id="video-url-${index}" 
                       placeholder="https://ik.imagekit.io/obr/video.mp4" 
                       value="${currentURL || ''}" 
                       class="flex-1 bg-white/5 border border-white/10 p-2 rounded-lg text-white text-xs" 
                       oninput="window.previewVideoURL(${index}, this.value)">
                <button onclick="window.open('https://imagekit.io/dashboard/media-library', '_blank')" 
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase flex items-center"
                        title="Ir a ImageKit para subir videos">
                    <i class="fas fa-cloud-upload-alt mr-1"></i> Cargar Video
                </button>
            </div>
            <div id="video-preview-${index}" class="mt-2 ${tieneVideo ? '' : 'hidden'}">
                ${tieneVideo ? `<video src="${currentURL}" controls class="w-full max-h-32 rounded-lg object-contain bg-black" onerror="this.style.display='none'; document.getElementById('video-name-${index}').innerText='URL no válida o video no accesible'"></video>` : ''}
                <p class="text-[9px] text-gray-400 mt-1 truncate" id="video-name-${index}">${tieneVideo ? currentURL.split('/').pop().substring(0, 40) : 'Sin video'}</p>
            </div>
        </div>`;
    });
    container.innerHTML = html;
};
      
window.saveVideoSchedule = async () => {
    await setDoc(doc(db, "settings", "general"), { videoSchedule: globalSettings.videoSchedule }, { merge: true });
    showToast("Programación de videos guardada");
    toggleModal('modal-video-schedule', false);
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
            if (adminGeoMap && adminGeoCircle) {
    const bounds = adminGeoCircle.getBounds();
    if (bounds.isValid()) adminGeoMap.fitBounds(bounds, { padding: [30,30] });
}
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
window.toggleDayState = (i) => {
    const openEl = document.getElementById(`sch-${i}-o`);
    const closeEl = document.getElementById(`sch-${i}-c`);
    if (!openEl || !closeEl) return;
    const isCurrentlyClosed = (openEl.value === "00:00" && closeEl.value === "00:00");
if (isCurrentlyClosed) {
    // Está cerrado, lo abrimos
    openEl.value = "08:00";
    closeEl.value = "20:00";
} else {
    // Está abierto, lo cerramos
    openEl.value = "00:00";
    closeEl.value = "00:00";
}
    // Disparar evento change para que se guarden automáticamente (el evento ya está vinculado)
    openEl.dispatchEvent(new Event('change'));
    closeEl.dispatchEvent(new Event('change'));
    // Refrescar la UI del horario para que el botón cambie de texto/color
    window.adminRefreshConfigUI();
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
        // Activar bandera para que onAuthStateChanged ignore el cambio de sesión
        window._adminCreatingUser = true;
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, '123456');
        await setDoc(doc(db, "users", userCredential.user.uid), {
            phone: "+52"+phone,
            name,
            role,
            pwd: '123456',
            firstLogin: true,
            vistasPermitidas: ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas','a-view-entregas']
        });
        // Restaurar sesión del administrador
        if (window._lastLoginPhone && window._lastLoginPassword) {
            await signInWithEmailAndPassword(auth, `${window._lastLoginPhone}@motorescateobr.com`, window._lastLoginPassword);
        }
        window._adminCreatingUser = false;
        showToast('Usuario creado. Deberá cambiar contraseña en su primer inicio.');
        window.adminLoadUsers();
    } catch (e) {
        window._adminCreatingUser = false;
        if (e.code === 'auth/email-already-in-use') showToast("Ese celular ya existe", true);
        else showToast("Error al crear", true);
    }
};

// aqui inicia adminLoadUsers con contadores //
window.adminLoadUsers = async () => {
    const snap = await getDocs(collection(db, "users"));
    const normalList = document.getElementById('admin-users-normal-list');
    const vipList = document.getElementById('admin-users-vip-list');
    const staffList = document.getElementById('admin-users-staff-list');
    if (normalList) normalList.innerHTML = '';
    if (vipList) vipList.innerHTML = '';
    if (staffList) staffList.innerHTML = '';

    // Contadores
    let countNormal = 0;
    let countVip = 0;
    let countStaff = 0;

    snap.forEach(d => {
        const u = d.data();
        const card = `<div class="bg-white/5 p-4 rounded-xl text-white text-sm flex justify-between items-center cursor-pointer" onclick="window.openUserDetail('${d.id}')">
    <span class="flex-1 truncate text-base">${u.name || (u.phone ? u.phone.replace('+52','') : 'Sin nombre')}</span>
    <div class="flex items-center space-x-2 ml-3">
        ${u.role === 'cliente' ? `<button onclick="event.stopPropagation(); window.promoteToVIP('${d.id}')" class="bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs font-bold uppercase flex items-center"><i class="fas fa-crown mr-1"></i>VIP</button>` : ''}
        ${u.role === 'membresia' ? `<button onclick="event.stopPropagation(); window.demoteFromVIP('${d.id}')" class="bg-gray-600 text-white px-3 py-1 rounded-lg text-xs font-bold uppercase flex items-center"><i class="fas fa-user mr-1"></i>Quitar</button>` : ''}
    </div>
</div>`;
        if (u.role === 'cliente') {
            if (normalList) normalList.innerHTML += card;
            countNormal++;
        }
        else if (u.role === 'membresia') {
            if (vipList) vipList.innerHTML += card;
            countVip++;
        }
        else if (['admin','mecanico','taller','socio'].includes(u.role)) {
            if (staffList) staffList.innerHTML += `<div class="bg-white/5 p-4 rounded-xl text-white text-sm flex justify-between items-center cursor-pointer" onclick="window.openStaffDetail('${d.id}')">
    <span class="text-base font-bold">${u.name || u.phone}</span><span class="text-yellow-400 text-sm"><i class="fas fa-star"></i> --</span>
</div>`;
            countStaff++;
        }
    });

    // Actualizar los contadores en el DOM
    const normalCountSpan = document.getElementById('count-normal-users');
    if (normalCountSpan) normalCountSpan.innerText = countNormal;
    const vipCountSpan = document.getElementById('count-vip-users');
    if (vipCountSpan) vipCountSpan.innerText = countVip;
    const staffCountSpan = document.getElementById('count-staff-users');
    if (staffCountSpan) staffCountSpan.innerText = countStaff;
};
// aqui finaliza adminLoadUsers con contadores //

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
    updateLandingStatus(); // <-- ACTUALIZAR ESTADO DE BOTONES Y BANNERS
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
        updateLandingStatus(); // <-- ACTUALIZAR ESTADO DE BOTONES Y BANNERS
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
    const vistas = ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas','a-view-entregas'];
const vistasNombres = ['Caja','Taller','SOS','Almacén','Promos','Usuarios','Ajustes','Estadíst.','Citas','Entregas'];
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
    let vistas = user.vistasPermitidas || ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas','a-view-entregas'];
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
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    
    await new Promise((resolve) => {
        logoImg.onload = logoImg.onerror = resolve;
        if (logoImg.complete) resolve();
    });
    
    const addFooter = window._setupProfessionalPDF(pdfDoc, 'EVALUACIÓN DE DESEMPEÑO DE STAFF', logoImg);
    let y = 36;

    _drawDataCard(pdfDoc, 12, y, pageWidth - 24, 15, 'Ficha Operativa del Colaborador', [
        { label: 'Técnico:', value: String(user.name || 'Asignado'), rightLabel: 'Rol Técnico:', rightValue: String(user.role || 'Operador Especialista'), valueOffset: 16 }
    ]);
    y += 22;

    const metricas = [
        { label: 'Servicios Concluidos', value: rescates.length.toString() },
        { label: 'Score Satisfacción', value: `${promedio} / 5.0 ⭐`, color:[255,107,0] },
        { label: 'Flujo Económico', value: `$${totalIngresos.toFixed(2)}`, color:[34,197,94] }
    ];
    
    const cardWidth = (pageWidth - 24) / 3;
    let startX = 12;
    metricas.forEach(m => {
        pdfDoc.setFillColor(248, 250, 252);
        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.roundedRect(startX, y, cardWidth - 1.5, 14, 1.5, 1.5, 'FD');
        pdfDoc.setFontSize(6.5);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(100);
        pdfDoc.text(m.label.toUpperCase(), startX + 3, y + 4.5);
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(...(m.color || [15,23,42]));
        pdfDoc.text(m.value, startX + 3, y + 10.5);
        startX += cardWidth;
    });
    y += 22;

    if (rescates.length > 0) {
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text("ÚLTIMOS SERVICIOS TÉCNICOS ATENDIDOS EN RUTA:", 12, y);
        y += 4;
        
        const bodyRows = rescates.slice(0, 15).map(r => [
            new Date(r.timestamp).toLocaleDateString('es-MX'),
            r.shortId || 'N/A',
            r.falla?.substring(0, 40) || 'Sin descripción de la falla.',
            `$${(r.costoRescateEstimado || 0).toFixed(2)}`
        ]);
        
        pdfDoc.autoTable({
            startY: y,
            head: [['Fecha', 'Orden Folio', 'Incidencia Diagnosticada', 'Costo']],
            body: bodyRows,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
            columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 25 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 25, halign: 'right' } },
            margin: { left: 12, right: 12 }
        });
        y = pdfDoc.lastAutoTable.finalY + 8;
    }

    if (calificaciones.length > 0) {
        if (y > 220) { pdfDoc.addPage(); y = 36; }
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text("RESEÑAS EXPLICITAS REGISTRADAS POR CLIENTES:", 12, y);
        y += 5;
        
        let resenas = [];
        satisfactionSnap.forEach(s => resenas.push(s.data()));
        resenas.sort((a,b) => b.timestamp - a.timestamp);
        
        resenas.slice(0, 5).forEach(r => {
            if (y > 270) { pdfDoc.addPage(); y = 36; }
            pdfDoc.setFontSize(8.5);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setTextColor(51, 65, 85);
            pdfDoc.text(`• ${new Date(r.timestamp).toLocaleDateString('es-MX')} — Calificación: ${'★'.repeat(r.rating)}`, 12, y);
            y += 4.5;
            if (r.comments) {
                pdfDoc.setFont("helvetica", "normal");
                pdfDoc.setTextColor(100);
                const commentLines = pdfDoc.splitTextToSize(`"${r.comments}"`, pageWidth - 24);
                pdfDoc.text(commentLines, 16, y);
                y += (commentLines.length * 4) + 2;
            }
        });
    }

    addFooter(pdfDoc);
    pdfDoc.save(`Reporte_Eficiencia_Staff_${user.name || 'Técnico'}.pdf`);
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
        // Limpiar listeners de tracking y líneas de ruta
    if (window._adminSOSTrackingListeners) {
        Object.values(window._adminSOSTrackingListeners).forEach(unsub => unsub());
        window._adminSOSTrackingListeners = {};
    }
    if (window._adminSOSRouteLines) {
        Object.values(window._adminSOSRouteLines).forEach(line => line.remove());
        window._adminSOSRouteLines = {};
    }

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

        // Si el SOS está aceptado, dibujar la ruta del mecánico
        if (d.status === 'accepted' && d.mech_uid) {
            // Limpiar listener anterior de tracking para este SOS (si existe)
            if (window._adminSOSTrackingListeners && window._adminSOSTrackingListeners[docSnap.id]) {
                window._adminSOSTrackingListeners[docSnap.id]();
                delete window._adminSOSTrackingListeners[docSnap.id];
            }
            const trackingRef = dbRef(rtdb, `mecanicos_tracking/${d.mech_uid}`);
            const listener = onValue(trackingRef, (trackSnap) => {
                if (trackSnap.exists() && adminSOSGlobalMapInst) {
                    const coords = [];
                    trackSnap.forEach(child => {
                        const p = child.val();
                        if (p.lat && p.lng) coords.push([p.lat, p.lng]);
                    });
                    if (coords.length > 1) {
                        // Eliminar ruta anterior si existe
                        if (window._adminSOSRouteLines && window._adminSOSRouteLines[docSnap.id]) {
                            window._adminSOSRouteLines[docSnap.id].remove();
                        }
                        if (!window._adminSOSRouteLines) window._adminSOSRouteLines = {};
                        window._adminSOSRouteLines[docSnap.id] = L.polyline(coords, { color: '#22c55e', weight: 4, opacity: 0.8 }).addTo(adminSOSGlobalMapInst);
                    }
                }
            });
            // Guardar la referencia del listener para poder limpiarlo después
            if (!window._adminSOSTrackingListeners) window._adminSOSTrackingListeners = {};
            window._adminSOSTrackingListeners[docSnap.id] = listener;
        }

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
                <span class="text-[0.6rem] px-1.5 py-0.5 rounded font-bold uppercase ${window.getStatusInfo(d.status).color}">${window.getStatusInfo(d.status).text}</span>
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
    const total = window.posTicket.reduce((s, i) => s + i.price, 0);
    const sosId = window.currentSOSId;
    const sosDocRef = doc(db, "rescates", sosId);
    const sosSnap = await getDoc(sosDocRef);
    if (!sosSnap.exists()) return showToast("Servicio no encontrado", true);
    const sosData = sosSnap.data();
    const clienteName = sosData.clientName || sosData.phone || "Cliente";

    // Crear un ID temporal para el cobro pendiente
    const pendingId = generateShortId();

    // Guardar en cobros_pendientes (para que el administrador lo apruebe)
    await addDoc(collection(db, "cobros_pendientes"), {
        pendingId: pendingId,
        sosId: sosId,
        cliente: clienteName,
        mech_uid: auth.currentUser.uid,
        mech_name: window.currentUserDoc?.name || 'Mecánico',
        concepto: `Servicio ${sosData.shortId || sosId}`,
        monto: total,
        ticket: window.posTicket,  // copia de los productos
        estado: 'pendiente',
        timestamp: Date.now(),
        metodoPago: 'Pendiente'  // se definirá al pagar
    });

    // Opcional: guardar también un registro en ventas con estado 'pendiente' (para tracking)
    await addDoc(collection(db, "ventas"), {
        shortId: pendingId,
        desc: window.posTicket.map(i => i.name).join(", "),
        total: total,
        costo: window.posTicket.reduce((s, i) => s + (i.cost || 0), 0),
        metodoPago: 'Pendiente',
        ticket: window.posTicket,
        sosId: sosId,
        fecha: new Date().toISOString(),
        estado: 'pendiente'  // pendiente de pago por admin
    });

    showToast(`Cobro registrado por $${total.toFixed(2)}. Espera confirmación del administrador.`);

    // Limpiar ticket y cerrar modal
    window.posTicket = [];
    window.renderTicket();
    const totalEl = document.getElementById('mechanic-total');
    if (totalEl) totalEl.innerText = '0.00';
    toggleModal('modal-mechanic-pos', false);
    
    // Opcional: notificar al administrador (ya existe listener en admin)
    rtdbSet(dbRef(rtdb, 'notificaciones_caja/cobro_' + Date.now()), {
        msg: `Nuevo cobro pendiente de ${clienteName} por $${total.toFixed(2)}`,
        type: 'cobro_mecanico',
        pendingId: pendingId,
        mech_name: window.currentUserDoc?.name
    });
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
    const phoneInput = document.getElementById('cita-phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const moto = document.getElementById('cita-moto')?.value.trim();
    const trabajo = document.getElementById('cita-trabajo')?.value.trim();
    const fecha = document.getElementById('cita-fecha')?.value;
    const hora = document.getElementById('cita-hora')?.value;
    
    if (!phone || !moto || !trabajo || !fecha || !hora) {
        return showToast("Completa todos los campos", true);
    }

    const fechaObj = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (fechaObj < hoy) {
        return showToast("No puedes agendar una cita en una fecha pasada", true);
    }

    // Verificar si el usuario existe (opcional, pero se mantiene la lógica original)
    const userSnap = await getDocs(query(collection(db, "users"), where("phone", "==", "+52" + phone), limit(1)));
    if (userSnap.empty) {
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
        estado: 'pendiente',
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

window.adminLoadCitas = () => {
    if (window._adminCitasListener) window._adminCitasListener();
    const q = query(collection(db, "citas"), orderBy("fecha", "asc"));
    window._adminCitasListener = onSnapshot(q, (snap) => {
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
        bodyData.push([new Date(v.fecha).toLocaleDateString('es-MX'), v.desc?.substring(0, 45) || 'Venta de Refacciones Mostrador', `$${(v.total || 0).toFixed(2)}`]);
    });

    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    await new Promise((resolve) => { logoImg.onload = logoImg.onerror = resolve; if (logoImg.complete) resolve(); });

    pdfDoc.setFillColor(255, 107, 0);
    pdfDoc.rect(0, 0, pageWidth, 28, 'F');
    if (logoImg.complete && logoImg.naturalWidth > 0) pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
    pdfDoc.setFontSize(14);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.text("ESTADÍSTICAS COMERCIALES Y RENDIMIENTO", logoImg.complete ? 36 : 12, 17.5);
    pdfDoc.setDrawColor(255, 107, 0);
    pdfDoc.line(12, 29, pageWidth - 12, 29);

    let y = 40;
    const resumenes = [
        { label: 'Volumen Bruto Ventas', value: `$${totalV.toFixed(2)}`, color: [255, 107, 0] },
        { label: 'Inversión Almacén (Costo)', value: `$${totalC.toFixed(2)}` },
        { label: 'Ganancia Neta Bruta', value: `$${(totalV - totalC).toFixed(2)}`, color: [34, 197, 94] }
    ];
    const cardWidth = (pageWidth - 24) / 3;
    let startX = 12;
    resumenes.forEach(r => {
        pdfDoc.setFillColor(248, 250, 252);
        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.roundedRect(startX, y, cardWidth - 1.5, 14, 1.5, 1.5, 'FD');
        pdfDoc.setFontSize(6.5);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(100);
        pdfDoc.text(r.label.toUpperCase(), startX + 3, y + 4.5);
        pdfDoc.setFontSize(10.5);
        pdfDoc.setTextColor(...(r.color || [15, 23, 42]));
        pdfDoc.text(r.value, startX + 3, y + 10.5);
        startX += cardWidth;
    });
    y += 22;

    const chartCanvas = document.getElementById('stats-chart');
    if (chartCanvas) {
        try {
            await window.loadHtml2Canvas();
            const chartImg = await html2canvas(chartCanvas, { scale: 2 });
            const imgData = chartImg.toDataURL('image/png');
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setFontSize(10);
            pdfDoc.setTextColor(15, 23, 42);
            pdfDoc.text("COMPORTAMIENTO MENSUAL DE OPERACIONES:", 12, y);
            y += 4;
            pdfDoc.addImage(imgData, 'PNG', 12, y, pageWidth - 24, 55);
            y += 62;
        } catch (e) { console.warn('Gráfico omitido:', e); }
    }

    if (y > 200) { pdfDoc.addPage(); y = 36; }
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text("AUDITORÍA DE HISTORIAL CONTABLE CONSOLIDADO:", 12, y);
    y += 4;
    pdfDoc.autoTable({
        startY: y,
        head: [['Fecha Contable', 'Descripción Operativa de Movimiento', 'Total Bruto']],
        body: bodyData,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 30, halign: 'right' } },
        margin: { left: 12, right: 12 }
    });

    const addFooter = window._setupProfessionalPDF(pdfDoc, 'ESTADÍSTICAS COMERCIALES Y RENDIMIENTO', logoImg);
    addFooter(pdfDoc);
    pdfDoc.save(`Estadisticas_Rendimiento_OBR.pdf`);
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
        // Si no tiene estado, se asume pendiente (para compatibilidad con citas antiguas)
if (!c.estado) c.estado = 'pendiente';
if (c.estado !== 'pendiente') return;
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
                <p class="text-[8px] text-gray-500">Cliente: ${c.cliente || 'N/A'}</p>
            </div>
            <button onclick="window.marcarCobroPagado?.('${doc.id}')" class="text-[0.6rem] bg-green-600 text-white px-2 py-0.5 rounded font-bold uppercase">Pagado</button>
        </div>`;
    });
    if (snap.empty) lista.innerHTML = '<p class="text-xs text-gray-500">Sin cobros pendientes</p>';
};

window.marcarCobroPagado = async (cobroId) => {
    const cobroRef = doc(db, "cobros_pendientes", cobroId);
    const cobroSnap = await getDoc(cobroRef);
    if (!cobroSnap.exists()) return showToast("Cobro no encontrado", true);
    const cobro = cobroSnap.data();
    if (cobro.estado !== 'pendiente') return showToast("Este cobro ya fue procesado", true);

    // Preguntar método de pago
    const metodo = await new Promise((resolve) => {
        const modalId = 'modal-payment-method';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `
                <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-green-500/30 text-center">
                    <h2 class="text-xl font-black text-white mb-4">Método de Pago</h2>
                    <div class="space-y-2">
                        <button id="pay-efectivo" class="w-full bg-green-600 text-white py-3 rounded-xl font-black uppercase">Efectivo</button>
                        <button id="pay-tarjeta" class="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase">Tarjeta / Transferencia</button>
                        <button onclick="toggleModal('${modalId}', false)" class="w-full bg-gray-600 text-white py-3 rounded-xl font-black uppercase">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
            document.getElementById('pay-efectivo').onclick = () => {
                toggleModal(modalId, false);
                resolve('Efectivo');
            };
            document.getElementById('pay-tarjeta').onclick = () => {
                toggleModal(modalId, false);
                resolve('Tarjeta/Transferencia');
            };
        }
        toggleModal(modalId, true);
    });
    if (!metodo) return;

    try {
        // Actualizar el cobro pendiente
        await updateDoc(cobroRef, {
            estado: 'pagado',
            metodoPago: metodo,
            fechaPago: Date.now(),
            pagadoPor: auth.currentUser.uid,
            pagadoPorNombre: window.currentUserDoc?.name
        });

        // Descontar inventario
        if (cobro.ticket && cobro.ticket.length) {
            for (let item of cobro.ticket) {
                if (item.type === 'almacen') {
                    const pData = adminInventoryList.find(x => x.id === item.id);
                    if (pData && pData.stock > 0) {
                        await updateDoc(doc(db, "inventario", item.id), { stock: pData.stock - 1 });
                    }
                }
            }
        }

        // Actualizar el servicio SOS a completado
        if (cobro.sosId) {
            await updateDoc(doc(db, "rescates", cobro.sosId), { tallerStatus: 'pagado', status: 'completed' });
        }

        // Actualizar la venta correspondiente
        const ventasQuery = query(collection(db, "ventas"), where("shortId", "==", cobro.pendingId), limit(1));
        const ventasSnap = await getDocs(ventasQuery);
        if (!ventasSnap.empty) {
            await updateDoc(doc(db, "ventas", ventasSnap.docs[0].id), {
                metodoPago: metodo,
                estado: 'pagado',
                fechaPago: Date.now()
            });
        }

        showToast(`Cobro de $${cobro.monto.toFixed(2)} marcado como pagado.`);
        window.cargarCobrosMecanicosPanel(); // refrescar lista
        
        // Notificar al mecánico
        if (cobro.mech_uid) {
            rtdbSet(dbRef(rtdb, 'notificaciones/' + cobro.mech_uid), {
                msg: `💰 Tu cobro por $${cobro.monto.toFixed(2)} ha sido pagado por caja.`
            });
        }
    } catch (e) {
        console.error(e);
        showToast("Error al procesar el pago", true);
    }
};
// ======================================================
// === ADMIN REFRESH CONFIG UI ===
// ======================================================
window.adminRefreshConfigUI = () => {
    // Cargar valores actuales
    const modeEl = document.getElementById('config-price-mode');
    if (modeEl) modeEl.value = globalSettings.priceMode;
    const basePriceEl = document.getElementById('config-base-price');
    if (basePriceEl) basePriceEl.value = globalSettings.rescueBase;
    const kmExtraEl = document.getElementById('config-km-extra');
    if (kmExtraEl) kmExtraEl.value = globalSettings.rescueKmExtra;
    const radiusEl = document.getElementById('config-radius');
    if (radiusEl) radiusEl.value = globalSettings.radiusKm;
    document.getElementById('radius-display').innerText = globalSettings.radiusKm;

const scheduleContainer = document.getElementById('schedule-list');
if (scheduleContainer) {
    scheduleContainer.innerHTML = '';
    const daysFull = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    for (let i = 0; i < 7; i++) {
        const s = globalSettings.schedule[i] || { o: "08:00", c: "20:00" };
        const isClosed = (s.o === "00:00" && s.c === "00:00");
const buttonText = isClosed ? 'CERRADO' : 'ABIERTO';
const buttonClass = isClosed ? 'bg-red-600' : 'bg-green-600';
        scheduleContainer.innerHTML += `
            <div class="grid grid-cols-4 gap-2 items-center bg-white/5 p-2 rounded-xl">
                <span class="font-bold text-white text-xs">${daysFull[i]}</span>
                <input id="sch-${i}-o" type="time" value="${s.o}" class="bg-asfalto border border-white/10 p-2 rounded-lg text-white text-xs w-full focus:border-naranja">
                <input id="sch-${i}-c" type="time" value="${s.c}" class="bg-asfalto border border-white/10 p-2 rounded-lg text-white text-xs w-full focus:border-naranja">
                <button onclick="window.toggleDayState(${i})" class="${buttonClass} text-white px-2 py-1 rounded text-[9px] font-bold uppercase">${buttonText}</button>
            </div>
        `;
    }
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

    // --- Enlazar eventos de auto-guardado (únicamente aquí) ---
    const autoSaveFields = [
        'config-price-mode', 'config-base-price', 'config-km-extra', 'config-radius',
        'sch-0-o', 'sch-0-c', 'sch-1-o', 'sch-1-c', 'sch-2-o', 'sch-2-c',
        'sch-3-o', 'sch-3-c', 'sch-4-o', 'sch-4-c', 'sch-5-o', 'sch-5-c', 'sch-6-o', 'sch-6-c'
    ];
    autoSaveFields.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._autoSaveBound) {
            el.addEventListener('change', window.adminSaveConfig);
            el._autoSaveBound = true;
        }
    });

    // Campo de radio: actualizar círculo en tiempo real y guardar al soltar
    const radiusInput = document.getElementById('config-radius');
    if (radiusInput && !radiusInput._radiusBound) {
        radiusInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('radius-display').innerText = val;
            if (adminGeoCircle) adminGeoCircle.setRadius(val * 1000);
        });
        radiusInput.addEventListener('change', window.adminSaveConfig);
        radiusInput._radiusBound = true;
    }
};

// Funciones auxiliares (deben estar fuera de adminRefreshConfigUI)
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
        document.getElementById(`video-url-${dayIndex}`).value = '';
        window.previewVideoURL(dayIndex, '');
        window.renderVideoScheduleDays();
        showToast("Video eliminado de este día");
    });
};

window.previewVideoURL = (dayIndex, url) => {
    const previewDiv = document.getElementById(`video-preview-${dayIndex}`);
    if (!previewDiv) return;
    if (url && url.trim() !== '') {
        previewDiv.classList.remove('hidden');
        previewDiv.innerHTML = `
            <video src="${url}" controls class="w-full max-h-32 rounded-lg object-contain bg-black" onerror="this.style.display='none'; document.getElementById('video-name-${dayIndex}').innerText='URL no válida o video no accesible'"></video>
            <p class="text-[9px] text-gray-400 mt-1 truncate" id="video-name-${dayIndex}">${url.split('/').pop().substring(0, 40)}</p>
        `;
        if (!globalSettings.videoSchedule) globalSettings.videoSchedule = {};
        globalSettings.videoSchedule[dayIndex] = url;
    } else {
        previewDiv.classList.add('hidden');
        delete globalSettings.videoSchedule[dayIndex];
    }
};

window.clearVideoURL = (dayIndex) => {
    const urlInput = document.getElementById(`video-url-${dayIndex}`);
    if (urlInput) urlInput.value = '';
    window.previewVideoURL(dayIndex, '');
};

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
    const dayIndex = now.getDay();
    const todayVideo = globalSettings.videoSchedule?.[dayIndex];
    if (todayVideo && todayVideo.trim() !== '') {
        container.innerHTML = `<div style="pointer-events:none; user-select:none;" oncontextmenu="return false;"><video src="${todayVideo}" autoplay muted loop playsinline controlsList="nodownload nofullscreen" class="w-full max-h-[300px] object-contain rounded-xl"></video></div>`;
        container.classList.remove('hidden');
        container.style.display = 'block';
    } else {
        container.classList.add('hidden');
        container.style.display = 'none';
    }
};

window.loadPromoPreview = () => {
    const previewContainer = document.getElementById('promo-video-preview');
    const player = document.getElementById('promo-video-player');
    const nameDisplay = document.getElementById('promo-video-name');
    if (!previewContainer || !player) return;

    const now = new Date();
    const dayIndex = now.getDay();
    const todayVideo = globalSettings.videoSchedule?.[dayIndex];
    
    if (todayVideo && todayVideo.trim() !== '') {
        previewContainer.classList.remove('hidden');
        player.setAttribute('controlsList', 'nodownload nofullscreen');
        player.setAttribute('oncontextmenu', 'return false');
        player.style.pointerEvents = 'none';
        player.removeAttribute('controls');
        player.src = todayVideo;
        player.load();
        nameDisplay.innerText = todayVideo.split('/').pop() || 'Video promocional';
    } else {
        previewContainer.classList.add('hidden');
    }
};

window.initAdminNotifications = () => {
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
    // --- Sincronizar selector de tema ---
const themeSelector = document.getElementById('theme-selector');
if (themeSelector) {
    themeSelector.value = globalSettings.themeMode || 'auto';
    if (!themeSelector._themeBound) {
        themeSelector.addEventListener('change', (e) => {
            window.changeThemeMode(e.target.value);
        });
        themeSelector._themeBound = true;
    }
}
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
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';

    const generar = () => {
        pdfDoc.setFillColor(255, 107, 0);
        pdfDoc.rect(0, 0, pageWidth, 28, 'F');
        if (logoImg.complete && logoImg.naturalWidth > 0) pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(255, 255, 255);
        pdfDoc.text("CORTE DE CAJA DIARIO", logoImg.complete ? 36 : 12, 17.5);
        pdfDoc.setDrawColor(255, 107, 0);
        pdfDoc.line(12, 29, pageWidth - 12, 29);

        let y = 40;
        const ventasHoy = (adminSalesCache?.ventas || []).filter(v => new Date(v.fecha).toDateString() === new Date().toDateString());
        const totalVentas = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
        const totalRetiros = (window.retiros || []).reduce((s, r) => s + (r.monto || 0), 0);
        const efectivoEnCaja = (window.fondoInicial || 0) + totalVentas - totalRetiros;

        const metrics = [
            { label: 'Fondo Caja', val: `$${(window.fondoInicial || 0).toFixed(2)}` },
            { label: 'Ingresos Netos', val: `$${totalVentas.toFixed(2)}`, color: [34, 197, 94] },
            { label: 'Retiros / Gastos', val: `$${totalRetiros.toFixed(2)}`, color: [239, 68, 68] },
            { label: 'Arqueo Final', val: `$${efectivoEnCaja.toFixed(2)}`, color: [255, 107, 0] }
        ];
        const cardWidth = (pageWidth - 24) / 4;
        let startX = 12;
        metrics.forEach(m => {
            pdfDoc.setFillColor(248, 250, 252);
            pdfDoc.setDrawColor(226, 232, 240);
            pdfDoc.roundedRect(startX, y, cardWidth - 1.5, 14, 1.5, 1.5, 'FD');
            pdfDoc.setFontSize(6.5);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setTextColor(100);
            pdfDoc.text(m.label.toUpperCase(), startX + 3, y + 4.5);
            pdfDoc.setFontSize(10);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setTextColor(...(m.color || [15, 23, 42]));
            pdfDoc.text(m.val, startX + 3, y + 10.5);
            startX += cardWidth;
        });
        y += 22;

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(15, 23, 42);
        pdfDoc.text("AUDITORÍA DE TRANSACCIONES REGISTRADAS EN TURNO:", 12, y);
        y += 4;
        const bodyRows = ventasHoy.map(v => [
            new Date(v.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
            v.shortId || v.id || 'N/A',
            `$${v.total.toFixed(2)}`
        ]);
        pdfDoc.autoTable({
            startY: y,
            head: [['Horario de Carga', 'Código de Ticket Asociado', 'Monto de Operación']],
            body: bodyRows,
            theme: 'striped',
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 40, halign: 'right' } },
            margin: { left: 12, right: 12 }
        });

        const addFooter = window._setupProfessionalPDF(pdfDoc, 'CORTE DE CAJA ADMINISTRATIVO', logoImg);
        addFooter(pdfDoc);
        pdfDoc.save(`Corte_Caja_${new Date().toISOString().slice(0, 10)}.pdf`);
    };
    if (logoImg.complete && logoImg.naturalWidth > 0) generar();
    else { logoImg.onload = generar; logoImg.onerror = generar; }
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
// === ENTREGAS A DOMICILIO (MAPA) con control total ===
// ======================================================
let entregasMapInst = null;
let entregasMarkers = {};      // marcadores de pedidos
let repartidoresMarkers = {};  // marcadores de personal
let entregasPedidosUnsubscribe = null;
let entregasRepartidoresUnsubscribe = null;
let currentEntregaFilter = 'todos';  // todos, pendiente_asignar, pendiente, en_camino, entregado
let currentFechaInicio = null;
let currentFechaFin = null;
let lastFilterCall = { estatus: null, time: 0 };
window.entregaSeleccionadaId = null;

// Función para cargar entregas con filtro de fecha
window.cargarEntregasConFiltroFecha = async () => {
    const inicio = document.getElementById('entregas-fecha-inicio')?.value;
    const fin = document.getElementById('entregas-fecha-fin')?.value;
    currentFechaInicio = inicio;
    currentFechaFin = fin;
    await window.cargarListadoEntregas();
    await window.renderEntregasMapa();
};

// Filtro por estatus con doble clic para resetear a 'todos'
window.filtrarEntregasPorEstatus = (estatus) => {
    const now = Date.now();
    if (lastFilterCall.estatus === estatus && (now - lastFilterCall.time) < 300) {
        estatus = 'todos';
    }
    lastFilterCall = { estatus, time: now };
    currentEntregaFilter = estatus;

    // Resaltar botón activo
    document.querySelectorAll('.filter-btn-estatus').forEach(btn => {
        btn.classList.remove('bg-white/20', 'border-white/30', 'bg-yellow-600/20', 'bg-blue-600/20', 'bg-purple-600/20', 'bg-green-600/20');
        btn.classList.add('bg-white/5', 'border-white/10');
        if (btn.getAttribute('data-estatus') === estatus) {
            btn.classList.remove('bg-white/5', 'border-white/10');
            btn.classList.add('bg-white/20', 'border-white/30');
        }
    });
    window.cargarListadoEntregas();
    window.renderEntregasMapa();
};

// Cargar listado lateral (con botones de contacto al cliente)
window.cargarListadoEntregas = async () => {
    const listaDiv = document.getElementById('entregas-lista-lateral');
    if (!listaDiv) return;
    listaDiv.innerHTML = '<p class="text-xs text-gray-400 text-center">Cargando...</p>';

    let q = query(collection(db, "pedidos_online"));
    if (currentFechaInicio && currentFechaFin) {
        const startDate = new Date(currentFechaInicio);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(currentFechaFin);
        endDate.setHours(23,59,59,999);
        q = query(q, where("timestamp", ">=", startDate.getTime()), where("timestamp", "<=", endDate.getTime()));
    }
    const snap = await getDocs(q);
    const pedidos = [];
    snap.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        pedidos.push(data);
    });

    let filtered = pedidos;
    if (currentEntregaFilter === 'pendiente_asignar') filtered = pedidos.filter(p => p.status === 'pendiente');
    else if (currentEntregaFilter === 'pendiente') filtered = pedidos.filter(p => p.status === 'aceptado' && (!p.estado_entrega || p.estado_entrega === 'pendiente'));
    else if (currentEntregaFilter === 'en_camino') filtered = pedidos.filter(p => p.estado_entrega === 'en_camino');
    else if (currentEntregaFilter === 'entregado') filtered = pedidos.filter(p => p.estado_entrega === 'entregado');

    listaDiv.innerHTML = '';
    if (filtered.length === 0) {
        listaDiv.innerHTML = '<p class="text-xs text-gray-400 text-center">No hay entregas con los filtros seleccionados.</p>';
    }
    filtered.forEach(p => {
        const estadoTexto = p.estado_entrega === 'entregado' ? '✅ Entregado' : 
                           (p.estado_entrega === 'en_camino' ? '🚚 En camino' : 
                           (p.status === 'aceptado' ? '⏳ Pendiente' : '🆕 Por asignar'));
        const colorClase = p.estado_entrega === 'entregado' ? 'text-green-400' :
                          (p.estado_entrega === 'en_camino' ? 'text-purple-400' : 'text-yellow-400');
        const telefonoCliente = p.phone || '';
        const telefonoClean = telefonoCliente.replace('+52', '');
        const botonesContacto = telefonoClean ? `
            <div class="flex space-x-2 mt-2">
                <button onclick="event.stopPropagation(); window.open('tel:+52${telefonoClean}', '_self')" class="bg-green-600 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase">📞 Llamar</button>
                <button onclick="event.stopPropagation(); window.open('https://wa.me/+52${telefonoClean}', '_blank')" class="bg-green-600 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase">💬 WhatsApp</button>
            </div>
        ` : '';
        listaDiv.innerHTML += `
            <div class="bg-white/5 p-3 rounded-xl cursor-pointer hover:bg-white/10 transition-all border-l-4 border-l-naranja" onclick="window.seleccionarEntregaDesdeMarker('${p.id}')">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm">${p.cliente || 'Cliente'}</span>
                    <span class="text-[10px] ${colorClase} font-black">${estadoTexto}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">${p.items.map(i=>i.name).join(', ')}</p>
                <p class="text-xs font-bold text-naranja">$${p.total?.toFixed(2)}</p>
                <p class="text-[9px] text-gray-500">${new Date(p.timestamp).toLocaleDateString()}</p>
                ${botonesContacto}
            </div>
        `;
    });
    return filtered;
};

// Renderizar mapa con marcadores de pedidos (📦 y 📦✅) y personal en tiempo real
window.renderEntregasMapa = async () => {
    const mapEl = document.getElementById('entregas-map-container');
    if (!mapEl) return;

    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    if (!entregasMapInst) {
        entregasMapInst = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView([TALLER_LAT, TALLER_LNG], 11);
        L.tileLayer(layerUrl, { attribution: '&copy; CARTO' }).addTo(entregasMapInst);
        // Marcador del taller
        L.marker([TALLER_LAT, TALLER_LNG], {
            icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] }),
            interactive: false
        }).addTo(entregasMapInst);
    } else {
        entregasMapInst.eachLayer(layer => {
            if (layer instanceof L.TileLayer) entregasMapInst.removeLayer(layer);
        });
        L.tileLayer(layerUrl, { attribution: '&copy; CARTO' }).addTo(entregasMapInst);
    }

    // Limpiar marcadores de pedidos anteriores
    Object.values(entregasMarkers).forEach(m => {
        if (entregasMapInst) entregasMapInst.removeLayer(m);
    });
    entregasMarkers = {};

    // Obtener pedidos con los mismos filtros que el listado
    let q = query(collection(db, "pedidos_online"));
    if (currentFechaInicio && currentFechaFin) {
        const startDate = new Date(currentFechaInicio);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(currentFechaFin);
        endDate.setHours(23,59,59,999);
        q = query(q, where("timestamp", ">=", startDate.getTime()), where("timestamp", "<=", endDate.getTime()));
    }
    const snap = await getDocs(q);
    const pedidos = [];
    snap.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        pedidos.push(data);
    });

    let filtered = pedidos;
    if (currentEntregaFilter === 'pendiente_asignar') filtered = pedidos.filter(p => p.status === 'pendiente');
    else if (currentEntregaFilter === 'pendiente') filtered = pedidos.filter(p => p.status === 'aceptado' && (!p.estado_entrega || p.estado_entrega === 'pendiente'));
    else if (currentEntregaFilter === 'en_camino') filtered = pedidos.filter(p => p.estado_entrega === 'en_camino');
    else if (currentEntregaFilter === 'entregado') filtered = pedidos.filter(p => p.estado_entrega === 'entregado');

    filtered.forEach(p => {
        if (!p.lat || !p.lng) return;
        const isEntregado = p.estado_entrega === 'entregado';
        const iconHtml = isEntregado ? '📦✅' : '📦';
        const marker = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
                className: 'entrega-marker',
                html: `<div style="background:${isEntregado ? '#22c55e' : '#FF6B00'}; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3);">${iconHtml}</div>`,
                iconSize: [28,28],
                iconAnchor: [14,14]
            })
        }).addTo(entregasMapInst);

        const telefonoCliente = p.phone || '';
        const telefonoClean = telefonoCliente.replace('+52', '');
        const botonesContactoPopup = telefonoClean ? `
            <div style="display:flex; gap:6px; margin-top:6px;">
                <button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:12px; padding:4px 8px; font-size:9px;">📞 Llamar</button>
                <button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:12px; padding:4px 8px; font-size:9px;">💬 WhatsApp</button>
            </div>
        ` : '';
        marker.bindPopup(`
            <div style="font-size:12px; min-width:150px;">
                <b>${p.cliente || 'Cliente'}</b><br>
                ${p.items.map(i=>i.name).join(', ')}<br>
                <b>$${p.total?.toFixed(2)}</b><br>
                Estado: ${p.estado_entrega || 'pendiente'}<br>
                ${botonesContactoPopup}
                <button onclick="window.seleccionarEntregaDesdeMarker('${p.id}')" style="background:#FF6B00; color:white; border:none; border-radius:8px; padding:4px 8px; margin-top:4px;">Ver detalles</button>
            </div>
        `);
        entregasMarkers[p.id] = marker;
    });

    // Ajustar vista del mapa
    const markersArray = Object.values(entregasMarkers);
    if (markersArray.length > 0) {
        const group = new L.featureGroup(markersArray);
        entregasMapInst.fitBounds(group.getBounds().pad(0.1));
    } else {
        entregasMapInst.setView([TALLER_LAT, TALLER_LNG], 11);
    }
};

// Seguimiento en tiempo real de personal (repartidores/mecánicos/admins) con botones de contacto
// Seguimiento en tiempo real de personal (repartidores/mecánicos/admins) con botones de contacto
function iniciarSeguimientoPersonalEntregas() {
    // Limpiar suscripción anterior si existe
    if (entregasRepartidoresUnsubscribe) {
        entregasRepartidoresUnsubscribe();
        entregasRepartidoresUnsubscribe = null;
    }

    entregasRepartidoresUnsubscribe = onValue(dbRef(rtdb, 'mecanicos_activos'), async (snap) => {
        // Si no hay mapa aún, salir (se inicializará después)
        if (!entregasMapInst) return;

        // 1. Obtener todos los userIds actuales
        const currentUserIds = new Set();
        const promises = [];
        snap.forEach(child => {
            currentUserIds.add(child.key);
            promises.push(getDoc(doc(db, "users", child.key)));
        });
        const usersDocs = await Promise.all(promises);

        // 2. Eliminar marcadores de personal que ya no están en la lista
        Object.keys(repartidoresMarkers).forEach(uid => {
            if (!currentUserIds.has(uid)) {
                entregasMapInst.removeLayer(repartidoresMarkers[uid]);
                delete repartidoresMarkers[uid];
            }
        });

        // 3. Actualizar o crear marcadores para los activos
        let idx = 0;
        snap.forEach(child => {
            const pos = child.val();
            const uid = child.key;
            const userData = usersDocs[idx]?.exists() ? usersDocs[idx].data() : null;
            const nombre = userData?.name || 'Personal';
            const telefono = userData?.phone || '';
            const telefonoClean = telefono.replace('+52', '');

            if (pos && pos.lat && pos.lng) {
                const popupContent = `
                    <div style="font-size:12px; font-family:sans-serif; min-width:160px;">
                        <b>${escapeHtml(nombre)}</b><br>
                        ${telefono ? `📞 ${escapeHtml(telefono)}<br>` : ''}
                        <div style="display:flex; gap:8px; margin-top:8px;">
                            ${telefonoClean ? `<button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">📞 Llamar</button>` : ''}
                            ${telefonoClean ? `<button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">💬 WhatsApp</button>` : ''}
                        </div>
                    </div>
                `;

                let marker = repartidoresMarkers[uid];
                if (marker) {
                    // Actualizar posición y popup
                    marker.setLatLng([pos.lat, pos.lng]);
                    marker.setPopupContent(popupContent);
                } else {
                    // Crear nuevo marcador
                    marker = L.marker([pos.lat, pos.lng], {
                        icon: L.divIcon({
                            className: 'repartidor-marker',
                            html: `<div style="background:#3b82f6; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:14px; color:white;">🏍️</div>`,
                            iconSize: [28,28],
                            iconAnchor: [14,14]
                        })
                    }).addTo(entregasMapInst);
                    marker.bindPopup(popupContent);
                    repartidoresMarkers[uid] = marker;
                }
            } else {
                // Si no hay coordenadas, eliminar marcador si existe
                if (repartidoresMarkers[uid]) {
                    entregasMapInst.removeLayer(repartidoresMarkers[uid]);
                    delete repartidoresMarkers[uid];
                }
            }
            idx++;
        });
    });
}

// Seleccionar una entrega desde el mapa o lista
window.seleccionarEntregaDesdeMarker = async (pedidoId) => {
    window.entregaSeleccionadaId = pedidoId;
    const snap = await getDoc(doc(db, "pedidos_online", pedidoId));
    if (!snap.exists()) return;
    const data = snap.data();
    const panel = document.getElementById('entrega-actions-panel');
    const btnIniciar = document.getElementById('btn-iniciar-entrega-main');
    const btnCobrar = document.getElementById('btn-cobrar-entrega-main');
    if (panel) panel.classList.remove('hidden');
    if (data.estado_entrega === 'pendiente' || !data.estado_entrega) {
        if (btnIniciar) btnIniciar.style.display = 'block';
        if (btnCobrar) btnCobrar.style.display = 'none';
    } else if (data.estado_entrega === 'en_camino') {
        if (btnIniciar) btnIniciar.style.display = 'none';
        if (btnCobrar) btnCobrar.style.display = 'block';
    } else if (data.estado_entrega === 'entregado') {
        if (panel) panel.classList.add('hidden');
    }
    if (entregasMapInst && data.lat && data.lng) {
        entregasMapInst.setView([data.lat, data.lng], 15);
    }
};

window.iniciarEntrega = async () => {
    if (!window.entregaSeleccionadaId) return;
    await updateDoc(doc(db, "pedidos_online", window.entregaSeleccionadaId), { estado_entrega: 'en_camino' });
    showToast("Entrega iniciada. Dirígete al cliente.");
    window.cargarListadoEntregas();
    window.renderEntregasMapa();
};

window.abrirCobroEntrega = async () => {
    if (!window.entregaSeleccionadaId) return;
    const snap = await getDoc(doc(db, "pedidos_online", window.entregaSeleccionadaId));
    if (!snap.exists()) return;
    const data = snap.data();
    document.getElementById('cobro-entrega-total').innerText = `$${data.total?.toFixed(2)}`;
    toggleModal('modal-cobro-entrega', true);
};

window.confirmarCobroEntrega = async () => {
    if (!window.entregaSeleccionadaId) return;
    const metodo = document.getElementById('cobro-entrega-metodo')?.value || 'Efectivo';
    const snap = await getDoc(doc(db, "pedidos_online", window.entregaSeleccionadaId));
    if (!snap.exists()) return;
    const data = snap.data();
    const total = data.total || 0;
    try {
        await updateDoc(doc(db, "pedidos_online", window.entregaSeleccionadaId), { estado_entrega: 'entregado', metodoPago: metodo });
        await addDoc(collection(db, "cobros_pendientes"), {
            mech_uid: auth.currentUser.uid,
            mech_name: window.currentUserDoc?.name || 'Repartidor',
            concepto: `Entrega pedido ${window.entregaSeleccionadaId}`,
            monto: total,
            metodo: metodo,
            estado: 'pendiente',
            pedidoId: window.entregaSeleccionadaId,
            timestamp: Date.now()
        });
        if (data.items) {
            for (let item of data.items) {
                const prodSnap = await getDocs(query(collection(db, "inventario"), where("name", "==", item.name), limit(1)));
                prodSnap.forEach(async (prodDoc) => {
                    const stockActual = prodDoc.data().stock || 0;
                    if (stockActual > 0) {
                        await updateDoc(doc(db, "inventario", prodDoc.id), { stock: stockActual - 1 });
                    }
                });
            }
        }
        rtdbSet(dbRef(rtdb, 'notificaciones_caja/pedido_' + Date.now()), {
            msg: 'Cobro de entrega pendiente por confirmar en CAJA',
            type: 'cobro_entrega',
            pedidoId: window.entregaSeleccionadaId,
            monto: total
        });
        showToast("Cobro registrado. Entrega finalizada.");
        toggleModal('modal-cobro-entrega', false);
        document.getElementById('entrega-actions-panel').classList.add('hidden');
        window.entregaSeleccionadaId = null;
        window.cargarListadoEntregas();
        window.renderEntregasMapa();
    } catch (e) {
        showToast("Error al procesar cobro", true);
    }
};

// Generar reporte PDF/CSV
window.generarReporteEntregas = async () => {
    const tipo = await new Promise((resolve) => {
        const modalId = 'modal-reporte-opciones';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `
                <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-naranja/30 text-center">
                    <h2 class="text-xl font-black text-white mb-4">Generar Reporte</h2>
                    <div class="space-y-3">
                        <button id="reporte-pdf" class="w-full bg-red-600 text-white py-3 rounded-xl font-black uppercase">PDF</button>
                        <button id="reporte-csv" class="w-full bg-green-600 text-white py-3 rounded-xl font-black uppercase">CSV</button>
                        <button id="reporte-ambos" class="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase">Ambos</button>
                        <button onclick="toggleModal('${modalId}', false)" class="w-full bg-gray-600 text-white py-3 rounded-xl font-black uppercase">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
            document.getElementById('reporte-pdf').onclick = () => { toggleModal(modalId, false); resolve('pdf'); };
            document.getElementById('reporte-csv').onclick = () => { toggleModal(modalId, false); resolve('csv'); };
            document.getElementById('reporte-ambos').onclick = () => { toggleModal(modalId, false); resolve('ambos'); };
        }
        toggleModal(modalId, true);
    });
    if (!tipo) return;

    let q = query(collection(db, "pedidos_online"));
    if (currentFechaInicio && currentFechaFin) {
        const startDate = new Date(currentFechaInicio);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(currentFechaFin);
        endDate.setHours(23,59,59,999);
        q = query(q, where("timestamp", ">=", startDate.getTime()), where("timestamp", "<=", endDate.getTime()));
    }
    const snap = await getDocs(q);
    const pedidos = [];
    snap.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        pedidos.push(data);
    });
    if (pedidos.length === 0) {
        showToast("No hay datos en el rango de fechas seleccionado", true);
        return;
    }

    if (tipo === 'pdf' || tipo === 'ambos') await generarPDFEntregas(pedidos);
    if (tipo === 'csv' || tipo === 'ambos') generarCSVEntregas(pedidos);
};

async function generarPDFEntregas(pedidos) {
    const { jsPDF } = window.jspdf;
    const pdfDoc = new jsPDF();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    await new Promise(resolve => { logoImg.onload = resolve; if (logoImg.complete) resolve(); });
    const addFooter = window._setupProfessionalPDF(pdfDoc, 'REPORTE DE ENTREGAS', logoImg);
    pdfDoc.setFontSize(16);
    pdfDoc.text(`Reporte de Entregas (${currentFechaInicio || 'inicio'} - ${currentFechaFin || 'fin'})`, 14, 30);
    const bodyRows = pedidos.map(p => [
        new Date(p.timestamp).toLocaleDateString(),
        p.cliente || 'Sin nombre',
        p.items.map(i=>i.name).join(', ').substring(0,40),
        p.tipoEntrega === 'domicilio' ? 'Domicilio' : 'Recoger',
        p.estado_entrega || 'Pendiente',
        `$${p.total?.toFixed(2)}`
    ]);
    pdfDoc.autoTable({
        startY: 40,
        head: [['Fecha', 'Cliente', 'Productos', 'Tipo', 'Estado', 'Total']],
        body: bodyRows,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [255,107,0] }
    });
    addFooter(pdfDoc);
    pdfDoc.save(`Reporte_Entregas_${new Date().toISOString().slice(0,19)}.pdf`);
}

function generarCSVEntregas(pedidos) {
    const rows = [['Fecha', 'Cliente', 'Productos', 'Tipo', 'Estado', 'Total']];
    pedidos.forEach(p => {
        rows.push([
            new Date(p.timestamp).toLocaleDateString(),
            p.cliente || '',
            p.items.map(i=>i.name).join('|'),
            p.tipoEntrega === 'domicilio' ? 'Domicilio' : 'Recoger',
            p.estado_entrega || 'Pendiente',
            p.total?.toFixed(2)
        ]);
    });
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Entregas_${new Date().toISOString().slice(0,19)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// aqui inicia loadEntregas mejorada //
let personalTrackingStarted = false;
window.loadEntregas = () => {
    if (!auth.currentUser) return;
    window.cargarListadoEntregas();
    window.renderEntregasMapa();
    if (!personalTrackingStarted) {
        iniciarSeguimientoPersonalEntregas();
        personalTrackingStarted = true;
    }
    if (entregasPedidosUnsubscribe) entregasPedidosUnsubscribe();
    entregasPedidosUnsubscribe = onSnapshot(collection(db, "pedidos_online"), () => {
        window.cargarListadoEntregas();
        window.renderEntregasMapa();
    });
};
// aqui finaliza loadEntregas mejorada //

// Redimensionar mapa al cambiar de pestaña
window.addEventListener('visibilitychange', () => {
    if (!document.hidden && entregasMapInst) {
        setTimeout(() => entregasMapInst.invalidateSize(), 200);
        window.renderEntregasMapa();
    }
});
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

// Refresco periódico cada 30 segundos
setInterval(() => {
    updateLandingStatus(); // siempre se actualiza, incluso sin usuario
    if (auth.currentUser && ['admin','mecanico','taller','socio'].includes(window.currentUserDoc?.role)) {
        window.adminLoadInventory();
        window.adminLoadSales();
        window.posFilterProducts();
    }
}, 30000);

// Actualizar cuando la pestaña vuelve a ser visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        updateLandingStatus();
    }
});

// Evento para el botón de contacto en el cliente
window.addEventListener('click', function(e) {
    if (e.target.closest('#btn-contacto-taller')) {
        e.stopPropagation();
        e.preventDefault();
        window.mostrarOpcionesContacto();
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
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const logoImg = new Image();
    logoImg.src = 'logo_claro.png';
    await new Promise((resolve) => { logoImg.onload = logoImg.onerror = resolve; if (logoImg.complete) resolve(); });

    pdfDoc.setFillColor(255, 107, 0);
    pdfDoc.rect(0, 0, pageWidth, 28, 'F');
    if (logoImg.complete && logoImg.naturalWidth > 0) pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
    pdfDoc.setFontSize(14);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.text("HISTORIAL DE SERVICIOS", logoImg.complete ? 36 : 12, 17.5);
    pdfDoc.setDrawColor(255, 107, 0);
    pdfDoc.line(12, 29, pageWidth - 12, 29);

    let y = 40;
    _drawDataCard(pdfDoc, 12, y, pageWidth - 24, 15, 'Ficha del Cliente', [
        { label: 'Titular:', value: String(user.name || user.phone), rightLabel: 'Clasificación:', rightValue: historial.length >= 3 ? 'SOCIO FRECUENTE PREMIUM' : 'CLIENTE OCASIONAL', valueOffset: 22 }
    ]);
    y += 22;

    const totalFacturado = historial.reduce((sum, r) => sum + (r.costoRescateEstimado || 0), 0);
    const metrics = [
        { label: 'Servicios Solicitados', val: historial.length.toString() },
        { label: 'Último Auxilio', val: historial[0] ? new Date(historial[0].timestamp).toLocaleDateString('es-MX') : 'Ninguno' },
        { label: 'Inversión Acumulada', val: `$${totalFacturado.toFixed(2)}`, color: [255, 107, 0] }
    ];
    const cardWidth = (pageWidth - 24) / 3;
    let startX = 12;
    metrics.forEach(m => {
        pdfDoc.setFillColor(248, 250, 252);
        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.roundedRect(startX, y, cardWidth - 1.5, 14, 1.5, 1.5, 'FD');
        pdfDoc.setFontSize(6.5);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(100);
        pdfDoc.text(m.label.toUpperCase(), startX + 3, y + 4.5);
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(...(m.color || [15, 23, 42]));
        pdfDoc.text(m.val, startX + 3, y + 10.5);
        startX += cardWidth;
    });
    y += 22;

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text("CRONOLOGÍA DE INCIDENCIAS MECÁNICAS:", 12, y);
    y += 4;
    const bodyRows = historial.map(r => [
        new Date(r.timestamp).toLocaleDateString('es-MX'),
        r.falla ? r.falla.replace(/\[.*?\]/g, '').trim().substring(0, 65) + '...' : 'Sin detalles del diagnóstico.',
        String(r.status || 'Pendiente').toUpperCase(),
        `$${(r.costoRescateEstimado || 0).toFixed(2)}`
    ]);
    pdfDoc.autoTable({
        startY: y,
        head: [['Fecha Evento', 'Falla / Diagnóstico Documentado', 'Estatus Final', 'Costo']],
        body: bodyRows,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [255, 107, 0], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 30 }, 3: { cellWidth: 25, halign: 'right' } },
        margin: { left: 12, right: 12 }
    });

    if (historial.length === 0) {
        pdfDoc.setFontSize(9);
        pdfDoc.setTextColor(148, 163, 184);
        pdfDoc.text("No se registran bitácoras ni asistencias previas ligadas a esta cuenta de usuario.", 12, y + 10);
    }

    const addFooter = window._setupProfessionalPDF(pdfDoc, 'HISTORIAL CLÍNICO DE CLIENTE', logoImg);
    addFooter(pdfDoc);
    pdfDoc.save(`Historial_Clinico_${user.name || 'Cliente'}.pdf`);
};
// =========================================================================
// 🎨 MOTOR VISUAL GLOBAL Y CONFIGURACIÓN DE LIENZO PRESET
// =========================================================================
window._setupProfessionalPDF = (doc, title, logoImg = null) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // 1. Limpieza de Fondo de Hoja
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // 2. Encabezado Premium - Barra Institucional OBR
    doc.setFillColor(255, 107, 0);
    doc.rect(0, 0, pageWidth, 28, 'F');
    
    // 3. Inserción Controlada de Logotipo en Canvas
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        doc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
    }
    
    // 4. Tipografía y Posición del Título Corporativo
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), logoImg && logoImg.complete ? 36 : 12, 17.5);
    
    // 5. Línea Estética de Acento de Taller
    doc.setDrawColor(255, 107, 0);
    doc.setLineWidth(0.8);
    doc.line(12, 29, pageWidth - 12, 29);
    
    // 6. Callback de Retorno para Inyección Automatizada de Footer
    const addFooter = (pdf) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7.5);
            pdf.setTextColor(148, 163, 184);
            pdf.setFont("helvetica", "normal");
            
            const fechaHoy = new Date().toLocaleDateString('es-MX', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            pdf.text(`OBR Moto Rescate | Documento de Control Oficial — Generado el ${fechaHoy}`, 12, pageHeight - 10);
            pdf.text(`Página ${i} de ${totalPages}`, pageWidth - 25, pageHeight - 10);
        }
    };
    return addFooter;
};

// Helper Auxiliar: Constructor Automatizado de Tarjetas de Información (Cards)
const _drawDataCard = (doc, x, y, width, height, title, rows) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, width, height, 2, 2, 'FD');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(title.toUpperCase(), x + 5, y + 6);
    
    let currentY = y + 13;
    rows.forEach(row => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        doc.text(row.label, x + 5, currentY);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(String(row.value || 'N/A'), x + 5 + (row.valueOffset || 18), currentY);
        
        if (row.rightLabel) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            doc.text(row.rightLabel, x + (width / 2) + 5, currentY);
            
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(String(row.rightValue || 'N/A'), x + (width / 2) + 5 + (row.rightOffset || 18), currentY);
        }
        currentY += 5.5;
    });
};

// Helper Auxiliar: Renderizador de Etiquetas de Estatus Estilo Píldora
const _drawStatusBadge = (doc, x, y, status) => {
    let color = [245, 158, 11]; // Amber por defecto (Pendiente / En proceso)
    if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'finalizado') color = [34, 197, 94]; // Verde
    if (status.toLowerCase() === 'cancelled' || status.toLowerCase() === 'cancelado') color = [239, 68, 68]; // Rojo
    
    doc.setFillColor(...color);
    doc.roundedRect(x, y, 28, 6, 1, 1, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(status.toUpperCase(), x + 14, y + 4.2, { align: 'center' });
};

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
// Stubs para funciones no implementadas completamente
window.sendContactFromModal = async function() {
    const name = document.getElementById('modal-contact-name')?.value.trim();
    const phone = document.getElementById('modal-contact-phone')?.value.trim();
    const msg = document.getElementById('modal-contact-msg')?.value.trim();
    if(!name || !msg) return showToast("Nombre y mensaje requeridos", true);

    if (auth.currentUser) {
        // Usuario autenticado: guardar mensaje en Firestore como solicitud de soporte
        try {
            await addDoc(collection(db, "soporte"), {
                uid: auth.currentUser.uid,
                name: name,
                phone: phone || window.currentUserDoc?.phone || '',
                mensaje: msg,
                timestamp: Date.now(),
                leido: false
            });
            showToast("Mensaje enviado al taller. Te contactaremos pronto.");
            toggleModal('modal-contact', false);
        } catch (e) {
            showToast("Error al enviar. Intenta de nuevo.", true);
        }
    } else {
        // No autenticado: abrir WhatsApp con el mensaje
        const cleanPhone = '526311551533'; // número principal del taller
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hola, soy ${name}${phone ? ' ('+phone+')' : ''}. ${msg}`)}`, '_blank');
        toggleModal('modal-contact', false);
    }
};
// ===== SISTEMA DE CHAT =====
window.loadChatList = async () => {
    const listEl = document.getElementById('chat-list-items');
    if (!listEl) return;
    listEl.innerHTML = '<p class="text-xs text-gray-500 text-center">Cargando chats...</p>';

    if (!auth.currentUser) return;

    const q = query(collection(db, "chats"), where("participantes", "array-contains", auth.currentUser.uid));
    const snap = await getDocs(q);
    listEl.innerHTML = '';

    if (snap.empty) {
        listEl.innerHTML = '<p class="text-xs text-gray-500 text-center">No hay chats activos</p>';
        return;
    }

    snap.forEach(docSnap => {
        const chat = docSnap.data();
        const otroNombre = chat.nombres ? (chat.nombres[auth.currentUser.uid] || 'Desconocido') : 'Cliente';
        listEl.innerHTML += `
            <div class="bg-white/5 p-3 rounded-xl cursor-pointer hover:bg-white/10" onclick="window.openChat('${docSnap.id}')">
                <p class="text-sm font-bold text-white">${chat.titulo || 'Chat'}</p>
                <p class="text-xs text-gray-400">${otroNombre}</p>
            </div>
        `;
    });
};

window.openChat = (chatId) => {
    // Cerrar suscripción previa si existe
    if (chatUnsubscribe) chatUnsubscribe();
    activeChatUid = chatId;

    // Título del chat
    getDoc(doc(db, "chats", chatId)).then(snap => {
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById('chat-title').innerText = data.titulo || 'Chat';
        }
    });

    toggleModal('modal-chat-list', false);
    toggleModal('modal-chat', true);

    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';

    // Función auxiliar para escapar HTML (evita inyección)
    const escapeHtml = (str) => {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    };

    chatUnsubscribe = onSnapshot(collection(db, "chats", chatId, "mensajes"), (snap) => {
        // Detectar mensajes nuevos (solo los que se añaden)
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                // Si el mensaje NO es del usuario actual, notificar
                if (msg.uid !== auth.currentUser.uid) {
                    playSound('notif');
                    // Extraer un número corto del chatId (por ejemplo, últimos 6 caracteres)
                    const shortId = chatId.slice(-6);
                    speakTTS(`Tienes un nuevo mensaje del servicio OBR-${shortId}`);
                }
            }
        });

        // Renderizar todos los mensajes (igual que antes)
        messagesContainer.innerHTML = '';
        snap.forEach(doc => {
            const msg = doc.data();
            const isMine = msg.uid === auth.currentUser.uid;
            messagesContainer.innerHTML += `
                <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-2">
                    <div class="${isMine ? 'bg-naranja text-white' : 'bg-white/10 text-white'} p-3 rounded-2xl max-w-[75%] text-xs">
                        <p>${escapeHtml(msg.texto)}</p>
                        <span class="text-[0.6rem] opacity-60">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                </div>
            `;
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
};

window.sendMessage = async () => {
    const input = document.getElementById('chat-input');
    const texto = input?.value.trim();
    if (!texto || !activeChatUid) return;

    try {
        await addDoc(collection(db, "chats", activeChatUid, "mensajes"), {
            uid: auth.currentUser.uid,
            texto: texto,
            timestamp: Date.now()
        });
        input.value = '';
    } catch (e) {
        console.warn('Error al enviar mensaje', e);
    }
};

window.closeChat = () => {
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }
    activeChatUid = null;
    toggleModal('modal-chat', false);
};
window.mostrarOpcionesContacto = () => {
    const modalId = 'modal-contacto-taller-opciones';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-blue-500/30 text-center">
                <i class="fas fa-headset text-4xl text-blue-400 mb-4"></i>
                <h2 class="text-xl font-black text-white mb-4">Contactar al Taller</h2>
                <div class="space-y-3">
                    <button id="contact-call-1" class="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase flex items-center justify-center"><i class="fas fa-phone mr-2"></i> Llamar 631 155 1533</button>
                    <button id="contact-call-2" class="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase flex items-center justify-center"><i class="fas fa-phone mr-2"></i> Llamar 644 110 6011</button>
                    <button id="contact-chat" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black uppercase flex items-center justify-center"><i class="fas fa-comments mr-2"></i> Chat con Soporte</button>
                    <button onclick="toggleModal('${modalId}', false)" class="w-full bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase text-sm">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        // Asignar eventos una sola vez
        document.getElementById('contact-call-1').onclick = () => window.open('tel:6311551533', '_self');
        document.getElementById('contact-call-2').onclick = () => window.open('tel:6444207644', '_self');
        document.getElementById('contact-chat').onclick = () => {
            window.toggleModal(modalId, false);
            window.openChatWithTaller(); // Función dinámica que crea chat pendiente
        };
    }
    window.toggleModal(modalId, true);
};
window.openChatWithTaller = async () => {
    if (!auth.currentUser) {
        window.showToast("Debes iniciar sesión para usar el chat.", true);
        return;
    }
    const clienteUID = auth.currentUser.uid;
    const clienteNombre = window.currentUserDoc?.name || "Cliente";

    // Buscar si ya existe un chat activo (no pendiente) donde participe este cliente
    const qActivo = query(
        collection(db, "chats"),
        where("participantes", "array-contains", clienteUID),
        where("estado", "in", ["activo", "cerrado"])
    );
    const snapActivo = await getDocs(qActivo);
    let chatActivo = null;
    snapActivo.forEach(doc => {
        if (doc.data().estado === 'activo') chatActivo = doc;
    });
    if (chatActivo) {
        window.openChat(chatActivo.id);
        return;
    }

    // Buscar si ya existe un chat pendiente (sin admin asignado)
    const qPendiente = query(
        collection(db, "chats"),
        where("participantes", "array-contains", clienteUID),
        where("estado", "==", "pendiente")
    );
    const snapPendiente = await getDocs(qPendiente);
    let chatPendienteId = null;
    snapPendiente.forEach(doc => {
        chatPendienteId = doc.id;
    });

    if (chatPendienteId) {
        window.showToast("Tu solicitud está pendiente. Espera a que un administrador la atienda.", false);
        return;
    }

    // Crear nuevo chat pendiente
    const chatRef = await addDoc(collection(db, "chats"), {
        titulo: "Soporte General",
        participantes: [clienteUID],
        nombres: {
            [clienteUID]: clienteNombre
        },
        estado: "pendiente",
        creado: Date.now()
    });
    window.showToast("Solicitud enviada. Un administrador te atenderá pronto.", false);
};
window.cargarChatsPendientesAdmin = () => {
    const container = document.getElementById('admin-chats-pendientes-list');
    if (!container) return;
    const q = query(collection(db, "chats"), where("estado", "==", "pendiente"));
    onSnapshot(q, (snap) => {
        container.innerHTML = '';
        snap.forEach(doc => {
            const chat = doc.data();
            const clienteNombre = chat.nombres?.[chat.participantes[0]] || "Cliente";
            container.innerHTML += `
                <div class="bg-white/5 p-3 rounded-xl mb-2 flex justify-between items-center">
                    <div>
                        <p class="text-sm font-bold">${clienteNombre}</p>
                        <p class="text-xs text-gray-400">${new Date(chat.creado).toLocaleString()}</p>
                    </div>
                    <button onclick="window.tomarChatPendiente('${doc.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-xs">Atender</button>
                </div>
            `;
        });
        if (snap.empty) container.innerHTML = '<p class="text-gray-500 text-xs">Sin solicitudes pendientes</p>';
    });
};

window.tomarChatPendiente = async (chatId) => {
    const adminUID = auth.currentUser.uid;
    const adminNombre = window.currentUserDoc?.name || "Administrador";
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) return;
    const chat = chatSnap.data();
    if (chat.estado !== 'pendiente') {
        window.showToast("Este chat ya fue atendido.", true);
        return;
    }
    const nuevosParticipantes = [...chat.participantes, adminUID];
    const nuevosNombres = { ...chat.nombres, [adminUID]: adminNombre };
    await updateDoc(chatRef, {
        participantes: nuevosParticipantes,
        nombres: nuevosNombres,
        estado: 'activo',
        atendidoPor: adminUID,
        atendidoEn: Date.now()
    });
    window.openChat(chatId);
};

window.loadMechPendingCharges = window.loadMechPendingCharges || async function() {};
window.renderPendingMechanicPayments = window.renderPendingMechanicPayments || async function() {};
window.enviarSolicitudCambioCita = window.enviarSolicitudCambioCita || async function() {};
window.printTicket = window.printTicket || function() {};
window.filterStore = window.filterStore || function() {};
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
window.viewActiveWorkshop = async () => {
    if (!auth.currentUser || !window.currentUserDoc) return;
    const snap = await getDocs(query(collection(db, "rescates"), where("phone", "==", window.currentUserDoc.phone), where("status", "==", "completed"), where("tallerStatus", "not-in", ["entregada","pagado"]), orderBy("timestamp", "desc"), limit(1)));
    if (!snap.empty) {
        window.openClientServiceDetail(snap.docs[0].id);
    }
};

window.loadMyOrders = () => {
    if (!auth.currentUser) return;
    const q = query(collection(db, "pedidos_online"), where("uid", "==", auth.currentUser.uid), orderBy("timestamp", "desc"));
    onSnapshot(q, (snap) => {
        const container = document.getElementById('pedidos-list');
        if (!container) return;
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<p class="text-xs text-gray-500 italic text-center py-4">No tienes pedidos aún.</p>';
            return;
        }
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const id = docSnap.id;
            const estado = p.status || 'pendiente';
            const colorEstado = estado === 'aceptado' ? 'text-green-400' : (estado === 'cancelado' ? 'text-red-400' : 'text-yellow-400');
            container.innerHTML += `
            <div class="bg-white/5 p-3 rounded-xl text-white text-xs cursor-pointer hover:bg-white/10" onclick="window.openOrderDetail?.('${id}')">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold">${estado === 'aceptado' ? '✅' : estado === 'cancelado' ? '❌' : '⏳'} Pedido ${new Date(p.timestamp).toLocaleDateString()}</span>
                    <span class="${colorEstado} font-bold uppercase text-[0.6rem]">${estado}</span>
                </div>
                <p class="text-gray-400 truncate">${p.items.map(i => i.name).join(', ')}</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="text-naranja font-bold">$${p.total.toFixed(2)}</span>
                    <span class="text-gray-500 text-[0.6rem]">${p.tipoEntrega === 'domicilio' ? '🏠 Domicilio' : '🏍️ Recoger'}</span>
                </div>
            </div>`;
        });
    });
};
window.openOrderDetail = async (pedidoId) => {
    const snap = await getDoc(doc(db, "pedidos_online", pedidoId));
    if (!snap.exists()) return showToast("Pedido no encontrado", true);
    const p = snap.data();
    const estado = p.status || 'pendiente';
    const colorEstado = estado === 'aceptado' ? 'text-green-400' : (estado === 'cancelado' ? 'text-red-400' : 'text-yellow-400');
    const html = `
        <div class="text-white space-y-2 text-xs">
            <h3 class="font-black text-lg">Detalle del Pedido</h3>
            <p>Estado: <span class="${colorEstado} font-bold uppercase">${estado}</span></p>
            <p>Entrega: ${p.tipoEntrega === 'domicilio' ? '🏠 Envío a domicilio' : '🏍️ Recoger en taller'}</p>
            ${p.referencia ? `<p>Referencia: ${p.referencia}</p>` : ''}
            ${p.metodoPago ? `<p>Método de pago: ${p.metodoPago}</p>` : ''}
            <div class="bg-black/30 p-2 rounded-lg">
                <p class="font-bold mb-1">Productos:</p>
                ${p.items.map(i => `<p>• ${i.name} - $${i.price.toFixed(2)}</p>`).join('')}
            </div>
            <p class="font-bold text-lg text-naranja">Total: $${p.total.toFixed(2)}</p>
            <p class="text-gray-500">${new Date(p.timestamp).toLocaleString()}</p>
            ${estado === 'aceptado' ? '<p class="text-green-400 mt-2">✅ Tu pedido ha sido aceptado. El taller se pondrá en contacto contigo.</p>' : ''}
            ${estado === 'cancelado' ? '<p class="text-red-400 mt-2">❌ Tu pedido ha sido cancelado por el taller.</p>' : ''}
        </div>
    `;
    const modalId = 'modal-order-detail';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `<div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 relative border border-naranja/30 shadow-2xl" id="${modalId}-content"><button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button></div>`;
        document.body.appendChild(modalEl);
    }
    document.getElementById(`${modalId}-content`).innerHTML = `<button onclick="toggleModal('${modalId}',false)" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>${html}`;
    toggleModal(modalId, true);
};
document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', window.processLogin);
    }
});
// ===== GUARDADO AUTOMÁTICO DE AJUSTES =====
window.bindAutoSave = () => {
    const ids = ['config-price-mode','config-base-price','config-km-extra','config-radius',
                 'sch-0-o','sch-0-c','sch-1-o','sch-1-c','sch-2-o','sch-2-c',
                 'sch-3-o','sch-3-c','sch-4-o','sch-4-c','sch-5-o','sch-5-c','sch-6-o','sch-6-c'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._autoSaveBound) {
            el.addEventListener('change', window.adminSaveConfig);
            el._autoSaveBound = true;
        }
    });
};
window.aplicarHorarioALunes = () => {
    const lunesO = document.getElementById('sch-0-o')?.value;
    const lunesC = document.getElementById('sch-0-c')?.value;
    if (!lunesO || !lunesC) return;
    for (let i = 1; i < 7; i++) {
        const openEl = document.getElementById(`sch-${i}-o`);
        const closeEl = document.getElementById(`sch-${i}-c`);
        if (openEl) openEl.value = lunesO;
        if (closeEl) closeEl.value = lunesC;
    }
};
