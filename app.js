import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, query, where, limit, updateDoc, deleteDoc, orderBy, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getDatabase, ref as dbRef, set, onValue, push, remove, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
// Cargar tema guardado localmente

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
window.auth = auth;   // 👈 EXPONER GLOBALMENTE
const db = getFirestore(app);
window.db = db;
const rtdb = getDatabase(app);
const storage = getStorage(app);
window.setDoc = setDoc;
window.doc = doc;
window.dbRef = dbRef; 


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

// ========== CHAT IA – VERSIÓN DEFINITIVA (con detección dinámica de modelos, sin fallback obsoleto) ==========
(function() {
    // ========== 1. VARIABLES GLOBALES ==========
    let currentGroup = null;
    let currentGroupId = null;
    let groupsUnsubscribe = null;
    let messagesUnsubscribe = null;
    let pendingImages = [];           // Array de objetos { dataUrl, file }
    let modal = null;
    let currentVisionModel = null;
    let currentUtterance = null;

    const MAX_IMAGES = 3;
    const MODEL_CACHE_KEY = 'groq_vision_model';
    const MODEL_CACHE_EXPIRY = 24 * 60 * 60 * 1000;

    function getGroqApiKey() {
        return localStorage.getItem('groq_api_key') || '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';
    }

    // ========== 2. FUNCIONES DE VOZ Y COPIA ==========
    function detenerVoz() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (currentUtterance) currentUtterance = null;
    }

    function speakText(texto, rate = 1.0) {
        if (!window.speechSynthesis) return;
        detenerVoz();
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-MX';
        utterance.rate = rate;
        currentUtterance = utterance;
        utterance.onend = () => { currentUtterance = null; };
        utterance.onerror = () => { currentUtterance = null; };
        window.speechSynthesis.speak(utterance);
    }

    function copyToClipboard(texto) {
        navigator.clipboard.writeText(texto).then(() => {
            if (window.showToast) window.showToast("Mensaje copiado al portapapeles");
        }).catch(() => {
            if (window.showToast) window.showToast("No se pudo copiar", true);
        });
    }

    function limpiarMarkdown(texto) {
        if (!texto) return '';
        let limpio = texto.replace(/\*\*(.*?)\*\*/g, '$1');
        limpio = limpio.replace(/__(.*?)__/g, '$1');
        return limpio;
    }

    // ========== 3. DETECCIÓN DINÁMICA DEL MODELO DE VISIÓN (SIN FALLBACK OBSOLETO) ==========
    async function obtenerMejorModeloVision() {
        const cached = localStorage.getItem(MODEL_CACHE_KEY);
        if (cached) {
            try {
                const { model, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < MODEL_CACHE_EXPIRY) return model;
            } catch(e) {}
        }

        const key = getGroqApiKey();
        try {
            const response = await fetch('https://api.groq.com/openai/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${key}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const modelIds = data.data.map(m => m.id);
            
            // Prioridad: scout → vision → llama → primer modelo disponible
            let workingModel = modelIds.find(m => m.includes('scout')) ||
                               modelIds.find(m => m.includes('vision')) ||
                               modelIds.find(m => m.includes('llama')) ||
                               modelIds[0];
            
            if (!workingModel) {
                throw new Error('No se encontró ningún modelo en Groq');
            }
            
            localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ model: workingModel, timestamp: Date.now() }));
            console.log(`✅ Modelo de visión seleccionado: ${workingModel}`);
            return workingModel;
        } catch (error) {
            console.error('Error obteniendo modelos de Groq:', error);
            throw new Error('No se pudo obtener un modelo de visión válido. Verifica tu API key y conexión.');
        }
    }

    async function initVisionModel() {
        if (!currentVisionModel) {
            try {
                currentVisionModel = await obtenerMejorModeloVision();
            } catch (err) {
                console.warn('No se pudo inicializar modelo de visión:', err.message);
                currentVisionModel = null;
            }
        }
        return currentVisionModel;
    }

    // ========== 4. RENDERIZADO DE MENSAJES (con menú de tres puntos) ==========
    function renderMensajes(mensajes) {
        const container = window._chatMessagesContainer;
        if (!container) return;
        container.innerHTML = '';
        mensajes.forEach((m, idx) => {
            const div = document.createElement('div');
            const esUsuario = m.rol === 'usuario';
            div.className = `flex ${esUsuario ? 'justify-end' : 'justify-start'} mb-4`;
            
            let textoLimpio = limpiarMarkdown(m.texto || '');
            let textoFormateado = textoLimpio.replace(/[&<>]/g, function(match) {
                if (match === '&') return '&amp;';
                if (match === '<') return '&lt;';
                if (match === '>') return '&gt;';
                return match;
            }).replace(/\n/g, '<br>');
            
            const fechaHora = new Date(m.timestamp).toLocaleString();
            let imagenesHtml = '';
            if (m.imagenes && m.imagenes.length) {
                imagenesHtml = `<div class="flex gap-1 mt-2 flex-wrap">${m.imagenes.map(img => `<img src="${img}" class="w-16 h-16 object-cover rounded cursor-pointer" onclick="window.openImageLightbox && window.openImageLightbox('${img}')">`).join('')}</div>`;
            }
            
            const icono = esUsuario ? '🧑‍🔧' : '🤖';
            const nombre = esUsuario ? 'Mecánico' : 'AGENTE OBR';
            const bubbleClass = esUsuario 
                ? 'bg-naranja text-white' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white';
            
            let accionesHtml = '';
            if (!esUsuario && m.texto !== '...' && !m.loading && m.texto) {
                const textoEscapado = textoLimpio.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const menuId = `msg-actions-${idx}-${Date.now()}`;
                accionesHtml = `
                    <div class="message-actions-menu">
                        <button class="message-actions-trigger" data-menu="${menuId}">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div id="${menuId}" class="message-actions-dropdown">
                            <button class="tts-normal-btn" data-text="${textoEscapado}" data-rate="1.0">🔊 Leer normal</button>
                            <button class="tts-fast-btn" data-text="${textoEscapado}" data-rate="1.5">⚡ Leer rápido</button>
                            <button class="copy-btn" data-text="${textoEscapado}">📋 Copiar</button>
                        </div>
                    </div>
                `;
            }
            
            div.innerHTML = `
                <div class="${bubbleClass} max-w-[85%] p-4 rounded-2xl shadow-md">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-lg">${icono}</span>
                        <span class="font-bold text-sm">${nombre}</span>
                        <span class="text-[9px] opacity-60">${fechaHora}</span>
                        ${accionesHtml}
                    </div>
                    <div class="text-sm leading-relaxed">${textoFormateado}</div>
                    ${imagenesHtml}
                </div>
            `;
            container.appendChild(div);
        });
        
        document.querySelectorAll('.message-actions-trigger').forEach(btn => {
            btn.removeEventListener('click', window._handleMessageMenu);
            btn.addEventListener('click', window._handleMessageMenu);
        });
        container.querySelectorAll('.tts-normal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-text');
                if (text) speakText(text, 1.0);
                btn.closest('.message-actions-dropdown')?.classList.remove('show');
            });
        });
        container.querySelectorAll('.tts-fast-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-text');
                if (text) speakText(text, 1.5);
                btn.closest('.message-actions-dropdown')?.classList.remove('show');
            });
        });
        container.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-text');
                if (text) copyToClipboard(text);
                btn.closest('.message-actions-dropdown')?.classList.remove('show');
            });
        });
        
        container.scrollTop = container.scrollHeight;
    }

    window._handleMessageMenu = (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const menuId = btn.getAttribute('data-menu');
        const dropdown = document.getElementById(menuId);
        if (!dropdown) return;
        document.querySelectorAll('.message-actions-dropdown.show').forEach(d => {
            if (d.id !== menuId) d.classList.remove('show');
        });
        dropdown.classList.toggle('show');
        const closeHandler = (event) => {
            if (!dropdown.contains(event.target) && event.target !== btn) {
                dropdown.classList.remove('show');
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    };

    // ========== 5. MANEJO DE MÚLTIPLES IMÁGENES ==========
    function actualizarPreviewImagenes() {
        const container = window._chatPreviewContainer;
        if (!container) return;
        if (pendingImages.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '8px';
        container.style.marginTop = '8px';
        container.innerHTML = '';
        pendingImages.forEach((img, idx) => {
            const previewDiv = document.createElement('div');
            previewDiv.style.position = 'relative';
            previewDiv.style.display = 'inline-block';
            previewDiv.innerHTML = `
                <img src="${img.dataUrl}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid var(--chat-border);">
                <button class="remove-image-preview" data-index="${idx}" style="position:absolute; top:-8px; right:-8px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer; font-size:12px;">✕</button>
            `;
            previewDiv.querySelector('.remove-image-preview').onclick = () => {
                pendingImages.splice(idx, 1);
                actualizarPreviewImagenes();
            };
            container.appendChild(previewDiv);
        });
    }

    function limpiarPreview() {
        pendingImages = [];
        actualizarPreviewImagenes();
    }

    function seleccionarImagen(usarCamara) {
        if (pendingImages.length >= MAX_IMAGES) {
            window.showToast(`Máximo ${MAX_IMAGES} imágenes por mensaje`, true);
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (usarCamara && navigator.mediaDevices) input.capture = 'environment';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            let compressed = file;
            if (file.size > 3 * 1024 * 1024 && typeof window.compressImage === 'function') {
                compressed = await window.compressImage(file);
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                pendingImages.push({ dataUrl: ev.target.result, file: compressed });
                actualizarPreviewImagenes();
            };
            reader.readAsDataURL(compressed);
        };
        input.click();
    }

    // ========== 6. MODAL PARA LISTA DE SERVICIOS ==========
    async function mostrarListaServiciosParaVincular() {
        if (!currentGroup) {
            if (window.showToast) window.showToast("Primero selecciona un grupo", true);
            return;
        }
        try {
            const q = query(collection(db, "rescates"), where("status", "==", "completed"));
            const snap = await getDocs(q);
            if (snap.empty) {
                if (window.showToast) window.showToast("No hay servicios activos en el taller", true);
                return;
            }
            const servicios = [];
            snap.forEach(doc => {
                const data = doc.data();
                if (data.tallerStatus && !['entregada', 'pagado'].includes(data.tallerStatus)) {
                    servicios.push({ id: doc.id, shortId: data.shortId, client: data.clientName || data.phone, status: data.tallerStatus });
                }
            });
            if (servicios.length === 0) {
                if (window.showToast) window.showToast("No hay servicios activos en el taller", true);
                return;
            }
            const modalId = 'modal-servicios-lista';
            let modalEl = document.getElementById(modalId);
            if (!modalEl) {
                modalEl = document.createElement('div');
                modalEl.id = modalId;
                modalEl.className = 'fixed inset-0 bg-black/95 z-[1000010] flex items-center justify-center p-4 hidden backdrop-blur-sm';
                modalEl.innerHTML = `
                    <div class="bg-asfalto w-full max-w-md rounded-[2rem] p-6 border border-blue-500/30">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xl font-black text-white">Selecciona un servicio</h3>
                            <button id="close-servicios-modal" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                        </div>
                        <div id="lista-servicios-container" class="max-h-96 overflow-y-auto space-y-2"></div>
                    </div>
                `;
                document.body.appendChild(modalEl);
                document.getElementById('close-servicios-modal').onclick = () => modalEl.classList.add('hidden');
            }
            const container = modalEl.querySelector('#lista-servicios-container');
            container.innerHTML = '';
            const estadoMap = { 'recibida': '📥 Recibida', 'mecanica': '🔧 Mecánica', 'pruebas': '🧪 Pruebas', 'lista': '✅ Lista' };
            servicios.forEach(serv => {
                const estadoTexto = estadoMap[serv.status] || serv.status;
                const div = document.createElement('div');
                div.className = 'bg-white/5 p-3 rounded-xl cursor-pointer hover:bg-white/10 transition-colors';
                div.innerHTML = `<div class="font-bold">📋 ${serv.shortId}</div><div class="text-xs text-gray-400">👤 ${serv.client} - ${estadoTexto}</div>`;
                div.onclick = async () => {
                    await updateDoc(doc(db, "chat_grupos", currentGroupId), { servicioId: serv.shortId });
                    currentGroup.servicioId = serv.shortId;
                    if (window.showToast) window.showToast(`✅ Grupo vinculado a ${serv.shortId}`);
                    modalEl.classList.add('hidden');
                };
                container.appendChild(div);
            });
            modalEl.classList.remove('hidden');
        } catch (error) {
            console.error('Error al cargar servicios:', error);
            if (window.showToast) window.showToast("Error al cargar servicios", true);
        }
    }

    // ========== 7. EXPORTAR PDF PROFESIONAL ==========
    async function exportarChatPDF() {
        if (!currentGroupId) return;
        if (!window.jspdf) {
            if (window.showToast) window.showToast("La librería PDF no está cargada", true);
            return;
        }
        const mensajesSnap = await getDocs(query(collection(db, "chat_mensajes"), where("grupoId", "==", currentGroupId)));
        const mensajes = [];
        mensajesSnap.forEach(doc => mensajes.push(doc.data()));
        mensajes.sort((a, b) => a.timestamp - b.timestamp);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        const limpiarTextoPDF = (texto) => {
            if (!texto) return '';
            let limpio = texto.replace(/[^\x00-\x7F]/g, '');
            limpio = limpio.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            limpio = limpio.replace(/\s+/g, ' ').trim();
            return limpio;
        };
        
        const logoImg = new Image();
        logoImg.src = 'logo_oscuro.png';
        await new Promise((resolve) => { logoImg.onload = logoImg.onerror = resolve; if (logoImg.complete) resolve(); });
        
        pdf.setFillColor(255, 107, 0);
        pdf.rect(0, 0, pageWidth, 20, 'F');
        if (logoImg.complete && logoImg.naturalWidth > 0) {
            pdf.addImage(logoImg, 'PNG', 10, 4, 15, 15);
        }
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(255, 255, 255);
        pdf.text("REPORTE DE CONVERSACIÓN - AGENTE OBR", logoImg.complete ? 28 : 15, 12.5);
        pdf.setDrawColor(255, 107, 0);
        pdf.line(10, 20, pageWidth - 10, 20);
        
        let y = 30;
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(0, 0, 0);
        pdf.text(`Grupo: ${currentGroup.nombre}`, 10, y);
        pdf.text(`Fecha de exportación: ${new Date().toLocaleString()}`, pageWidth - 60, y);
        y += 10;
        if (currentGroup.servicioId) {
            pdf.setFont("helvetica", "bold");
            pdf.text(`Servicio vinculado: ${currentGroup.servicioId}`, 10, y);
            y += 8;
            pdf.setFont("helvetica", "normal");
        }
        
        const bodyRows = mensajes.map(m => {
            const autor = m.rol === 'usuario' ? 'Mecánico' : 'AGENTE OBR';
            const fecha = new Date(m.timestamp).toLocaleString();
            let texto = limpiarTextoPDF(m.texto || '');
            if (m.imagenes && m.imagenes.length) {
                texto += ` [Se adjuntaron ${m.imagenes.length} imagen(es)]`;
            }
            return [autor, fecha, texto];
        });
        
        pdf.autoTable({
            startY: y,
            head: [['Remitente', 'Fecha/Hora', 'Mensaje']],
            body: bodyRows,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 3, valign: 'top', overflow: 'linebreak' },
            headStyles: { fillColor: [255, 107, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 35 }, 2: { cellWidth: 'auto' } },
            margin: { left: 10, right: 10 }
        });
        
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7);
            pdf.setTextColor(100);
            pdf.text(`AGENTE OBR - Asistente Mecánico Inteligente`, 10, pageHeight - 8);
            pdf.text(`Página ${i} de ${totalPages}`, pageWidth - 20, pageHeight - 8);
        }
        pdf.save(`chat_${currentGroup.nombre.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    }

    // ========== 8. ACCIONES DE GRUPO (Firestore) ==========
    async function cargarGrupos() {
        if (groupsUnsubscribe) groupsUnsubscribe();
        const q = query(collection(db, "chat_grupos"), orderBy("creado", "desc"));
        groupsUnsubscribe = onSnapshot(q, (snap) => {
            const grupos = [];
            snap.forEach(doc => {
                grupos.push({ idDoc: doc.id, ...doc.data() });
            });
            renderListaGrupos(grupos);
            if (grupos.length === 0) {
                crearGrupoPorDefecto();
            } else if (!currentGroupId && grupos.length) {
                seleccionarGrupo(grupos[0]);
            }
        });
    }

    function renderListaGrupos(grupos) {
        const groupsList = window._chatGroupsList;
        if (!groupsList) return;
        groupsList.innerHTML = '';
        grupos.forEach(g => {
            const div = document.createElement('div');
            div.className = 'grupo-item';
            if (currentGroupId === g.idDoc) div.classList.add('active');
            div.innerHTML = `<span>${escapeHtml(g.nombre)}</span>${g.servicioId ? '<span class="text-accent text-xs ml-2">📎</span>' : ''}`;
            div.onclick = () => seleccionarGrupo(g);
            groupsList.appendChild(div);
        });
    }

    async function seleccionarGrupo(grupo) {
        if (!grupo || !grupo.idDoc) return;
        currentGroupId = grupo.idDoc;
        currentGroup = grupo;
        if (messagesUnsubscribe) messagesUnsubscribe();
        const q = query(collection(db, "chat_mensajes"), where("grupoId", "==", grupo.idDoc));
        messagesUnsubscribe = onSnapshot(q, (snap) => {
            const mensajes = [];
            snap.forEach(doc => mensajes.push(doc.data()));
            mensajes.sort((a, b) => a.timestamp - b.timestamp);
            renderMensajes(mensajes);
            const welcomeScreen = document.querySelector('#welcome-screen-ia');
            if (welcomeScreen) {
                welcomeScreen.style.display = mensajes.length ? 'none' : 'flex';
            }
        });
        const gruposActuales = await obtenerGrupos();
        renderListaGrupos(gruposActuales);
    }

    async function obtenerGrupos() {
        const snap = await getDocs(collection(db, "chat_grupos"));
        const grupos = [];
        snap.forEach(doc => grupos.push({ idDoc: doc.id, ...doc.data() }));
        return grupos;
    }

    async function crearGrupoPorDefecto() {
        const nombre = `General ${new Date().toLocaleDateString()}`;
        const nuevoGrupo = { nombre, servicioId: null, creado: Date.now(), creadoPor: auth.currentUser?.uid || 'unknown' };
        const docRef = await addDoc(collection(db, "chat_grupos"), nuevoGrupo);
        seleccionarGrupo({ idDoc: docRef.id, ...nuevoGrupo });
    }

    async function crearNuevoGrupo() {
        mostrarPrompt('Nombre del grupo', '', async (nombre) => {
            if (!nombre) return;
            const nuevoGrupo = { nombre, servicioId: null, creado: Date.now(), creadoPor: auth.currentUser?.uid };
            const docRef = await addDoc(collection(db, "chat_grupos"), nuevoGrupo);
            await seleccionarGrupo({ idDoc: docRef.id, ...nuevoGrupo });
        });
    }

    async function renombrarGrupo() {
        if (!currentGroup || !currentGroupId) {
            window.showToast("No hay grupo seleccionado", true);
            return;
        }
        mostrarPrompt('Nuevo nombre del grupo', currentGroup.nombre, async (nuevoNombre) => {
            if (!nuevoNombre || nuevoNombre === currentGroup.nombre) return;
            try {
                await updateDoc(doc(db, "chat_grupos", currentGroupId), { nombre: nuevoNombre });
                currentGroup.nombre = nuevoNombre;
                const gruposActuales = await obtenerGrupos();
                renderListaGrupos(gruposActuales);
                window.showToast("Grupo renombrado correctamente");
            } catch (error) {
                console.error(error);
                window.showToast("Error al renombrar grupo", true);
            }
        });
    }

    async function eliminarGrupo() {
        if (!currentGroup) return;
        mostrarConfirm('Eliminar grupo', '¿Eliminar este grupo y todos sus mensajes?', async () => {
            if (messagesUnsubscribe) messagesUnsubscribe();
            const msgsSnap = await getDocs(query(collection(db, "chat_mensajes"), where("grupoId", "==", currentGroupId)));
            for (const docMsg of msgsSnap.docs) await deleteDoc(docMsg.ref);
            await deleteDoc(doc(db, "chat_grupos", currentGroupId));
            currentGroup = null; currentGroupId = null;
            if (window._chatMessagesContainer) window._chatMessagesContainer.innerHTML = '';
            cargarGrupos();
            window.showToast("Grupo eliminado");
        });
    }

    function filtrarGrupos() {
        const term = window._chatSearchInput ? window._chatSearchInput.value.toLowerCase() : '';
        const groupsList = window._chatGroupsList;
        if (groupsList) {
            const items = groupsList.querySelectorAll('.grupo-item');
            items.forEach(item => { item.style.display = item.innerText.toLowerCase().includes(term) ? 'flex' : 'none'; });
        }
    }

    // ========== 9. ENVÍO DE MENSAJES Y CONSULTA A GROQ ==========
    async function enviarMensaje() {
        const texto = window._chatMessageInput ? window._chatMessageInput.value.trim() : '';
        const imagenes = pendingImages.map(img => img.dataUrl);
        if ((!texto && imagenes.length === 0)) return;
        if (!currentGroupId) {
            await crearGrupoYEnviarMensaje(texto, imagenes);
            return;
        }
        await enviarMensajeConTextoEImagen(texto, imagenes);
    }

    async function crearGrupoYEnviarMensaje(texto, imagenes) {
        const nombre = `Consulta ${new Date().toLocaleString()}`;
        const nuevoGrupo = { nombre, servicioId: null, creado: Date.now(), creadoPor: auth.currentUser?.uid || 'unknown' };
        const docRef = await addDoc(collection(db, "chat_grupos"), nuevoGrupo);
        const grupo = { idDoc: docRef.id, ...nuevoGrupo };
        await seleccionarGrupo(grupo);
        await enviarMensajeConTextoEImagen(texto, imagenes);
    }

    async function enviarMensajeConTextoEImagen(texto, imagenes) {
        if (!currentGroupId) return;
        
        // Detectar comando API
        if (texto && texto.trim().startsWith('API :')) {
            const match = texto.match(/API\s*:\s*"([^"]+)"/);
            if (match && match[1]) {
                localStorage.setItem('groq_api_key', match[1]);
                window.showToast("✅ API key actualizada correctamente");
                await addDoc(collection(db, "chat_mensajes"), {
                    grupoId: currentGroupId, rol: 'asistente',
                    texto: '✅ API key actualizada. A partir de ahora usaré la nueva clave.',
                    timestamp: Date.now(), loading: false
                });
            } else {
                window.showToast("❌ Formato incorrecto. Usa: API : \"tu_api_key\"", true);
                await addDoc(collection(db, "chat_mensajes"), {
                    grupoId: currentGroupId, rol: 'asistente',
                    texto: '❌ Formato incorrecto. Ejemplo: `API : "gsk_xxxxx"`',
                    timestamp: Date.now(), loading: false
                });
            }
            if (window._chatMessageInput) window._chatMessageInput.value = '';
            limpiarPreview();
            return;
        }
        
        const mensaje = {
            grupoId: currentGroupId,
            rol: 'usuario',
            texto: texto || (imagenes.length ? '[Imagen adjunta]' : ''),
            timestamp: Date.now(),
            imagenes: imagenes
        };
        await addDoc(collection(db, "chat_mensajes"), mensaje);
        if (window._chatMessageInput) window._chatMessageInput.value = '';
        const imagenesTemp = [...imagenes];
        limpiarPreview();
        const loadingMsg = {
            grupoId: currentGroupId,
            rol: 'asistente',
            texto: '...',
            timestamp: Date.now(),
            loading: true
        };
        const loadingRef = await addDoc(collection(db, "chat_mensajes"), loadingMsg);
        try {
            const respuesta = await consultarGroqVision(texto, currentGroupId, imagenesTemp);
            const respuestaLimpia = limpiarMarkdown(respuesta);
            await updateDoc(loadingRef, { texto: respuestaLimpia, loading: false });
        } catch (err) {
            console.error('Error en enviarMensaje:', err);
            await updateDoc(loadingRef, { texto: `Error: ${err.message}`, loading: false });
        }
    }

    async function consultarGroqVision(prompt, grupoId, imagenes) {
        let key = getGroqApiKey();
        if (!currentVisionModel) {
            await initVisionModel();
            if (!currentVisionModel) {
                throw new Error('No hay modelo de visión disponible. Verifica tu API key y conexión a internet.');
            }
        }
        
        // Obtener historial de mensajes (últimos 5 para contexto)
        const mensajesSnap = await getDocs(query(collection(db, "chat_mensajes"), where("grupoId", "==", grupoId)));
        let mensajes = [];
        mensajesSnap.forEach(doc => mensajes.push(doc.data()));
        mensajes.sort((a, b) => b.timestamp - a.timestamp);
        const ultimos5 = mensajes.slice(0, 5);
        const historial = ultimos5.map(m => `${m.rol === 'usuario' ? 'Usuario' : 'Asistente'}: ${m.texto}`).join('\n');
        
        // Construir el contenido para Groq
        const content = [];
        let promptFinal = `Contexto:\n${historial}\n\nPregunta: ${prompt || 'Analiza la siguiente imagen'}`;
        if (promptFinal.length > 1500) promptFinal = promptFinal.slice(0, 1500);
        content.push({ type: "text", text: promptFinal });
        
        // Añadir imágenes si existen
        for (let img of imagenes) {
            let imageUrl = img;
            if (!imageUrl.startsWith('data:image')) {
                imageUrl = `data:image/jpeg;base64,${img}`;
            }
            content.push({ type: "image_url", image_url: { url: imageUrl } });
        }
        
        const systemPrompt = `Eres un mecánico automotriz y de motocicletas especializado en diagnóstico de fallas, reparación y mantenimiento. Tu única función es responder consultas relacionadas con mecánica de motos y carros. 

REGLAS DE FORMATO (IMPORTANTE):
- NO uses asteriscos dobles (**) ni ninguna otra sintaxis de markdown.
- Usa emojis para hacer las respuestas más visuales (ej: 🔧, 🛠️, ⚠️, ✅, ❌).
- Para listas, usa guiones (-) al inicio de cada línea.
- Separa las ideas con saltos de línea.
- Sé conciso pero informativo.
- Si la consulta no está relacionada con mecánica, responde: "❌ No puedo ayudarte con eso, solo temas de mecánica."`;

        if (content.length === 0) {
            content.push({ type: "text", text: prompt || "Consulta sobre mecánica" });
        }
        
        const requestBody = {
            model: currentVisionModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: content }
            ],
            temperature: 0.7,
            max_tokens: 1024
        };
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', errorText);
            // Si el error es por modelo descontinuado, limpiar caché y reintentar con el modelo más reciente
            if (errorText.includes('decommissioned') || errorText.includes('not found')) {
                localStorage.removeItem(MODEL_CACHE_KEY);
                currentVisionModel = null;
                await initVisionModel();
                if (currentVisionModel) {
                    const retryBody = { ...requestBody, model: currentVisionModel };
                    const retryResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                        body: JSON.stringify(retryBody)
                    });
                    if (!retryResponse.ok) throw new Error(`Error después de reintentar: ${await retryResponse.text()}`);
                    const retryData = await retryResponse.json();
                    return retryData.choices[0].message.content;
                }
            }
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
    }

    // ========== 10. MODALES PERSONALIZADOS ==========
    function mostrarPrompt(titulo, valorDefault, callback) {
        const modalId = 'modal-prompt-custom';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[1000010] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `
                <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-white/10">
                    <p class="text-white font-bold mb-4" id="prompt-title">Título</p>
                    <input id="prompt-input" type="text" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white mb-4">
                    <div class="flex space-x-3">
                        <button id="prompt-ok" class="bg-green-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">Aceptar</button>
                        <button id="prompt-cancel" class="bg-gray-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
        }
        document.getElementById('prompt-title').innerText = titulo;
        const input = document.getElementById('prompt-input');
        input.value = valorDefault;
        const okBtn = document.getElementById('prompt-ok');
        const cancelBtn = document.getElementById('prompt-cancel');
        const close = () => modalEl.classList.add('hidden');
        okBtn.onclick = () => { close(); callback(input.value); };
        cancelBtn.onclick = () => { close(); callback(null); };
        modalEl.classList.remove('hidden');
        input.focus();
    }

    function mostrarConfirm(titulo, mensaje, onConfirm) {
        const modalId = 'modal-confirm-custom';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[1000010] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `
                <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-white/10 text-center">
                    <p id="confirm-msg" class="text-white font-bold mb-6"></p>
                    <div class="flex space-x-3">
                        <button id="confirm-yes" class="bg-green-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">Sí</button>
                        <button id="confirm-no" class="bg-gray-600 text-white px-6 py-3 rounded-xl font-black uppercase text-sm">No</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
        }
        document.getElementById('confirm-msg').innerText = mensaje;
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const close = () => modalEl.classList.add('hidden');
        yesBtn.onclick = () => { close(); onConfirm(); };
        noBtn.onclick = () => { close(); };
        modalEl.classList.remove('hidden');
    }

    // ========== 11. CREACIÓN DEL MODAL PRINCIPAL (con botón de cierre) ==========
    function crearModalChat() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'chat-ia-modal-dinamico';
        modal.style.cssText = `
            display: none !important;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #000000dd;
            backdrop-filter: blur(4px);
            z-index: 1000000;
            flex-direction: column;
            font-family: system-ui, sans-serif;
        `;
        modal.innerHTML = `
            <div class="chat-ia-container">
                <aside class="chat-sidebar">
                    <div class="chat-sidebar-header"><h2>Conversaciones</h2></div>
                    <div class="chat-sidebar-search"><input type="text" id="search-group-ia" placeholder="Buscar conversación..."><i class="fas fa-search"></i></div>
                    <div id="groups-list-ia" class="chat-groups-list"></div>
                    <button id="new-group-ia" class="chat-new-group-btn"><i class="fas fa-plus"></i> Nueva conversación</button>
                </aside>
                <main class="chat-main">
                    <div class="chat-main-header">
                        <div class="chat-header-left">
                            <button class="chat-sidebar-toggle" aria-label="Abrir menú"><i class="fas fa-bars"></i></button>
                            <h1>AGENTE OBR</h1>
                        </div>
                        <div class="chat-actions">
                            <button id="close-chat-ia-modal" class="chat-close-btn" title="Cerrar">
                                <i class="fas fa-times"></i>
                            </button>
                            <div class="chat-actions-menu">
                                <button id="chat-actions-trigger" class="chat-actions-trigger"><i class="fas fa-ellipsis-v"></i></button>
                                <div id="chat-actions-dropdown" class="chat-actions-dropdown">
                                    <button id="link-service-ia" class="action-link">Vincular a servicio</button>
                                    <button id="rename-group-ia" class="action-rename">Renombrar grupo</button>
                                    <button id="delete-group-ia" class="action-delete">Eliminar grupo</button>
                                    <button id="export-pdf-ia" class="action-pdf">Exportar a PDF</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="welcome-screen-ia" class="chat-welcome-screen">
                        <div class="welcome-content">
                            <h1>AGENTE OBR</h1>
                            <p>Tu asistente mecánico inteligente. Pregunta sobre fallas, mantenimiento o diagnósticos.</p>
                            <div class="welcome-cards">
                                <div class="welcome-card"><h3>📝 Ejemplos</h3><ul><li>"¿Por qué mi moto no enciende?"</li><li>"¿Cada cuánto cambiar el aceite?"</li><li>"Ruido en el motor al acelerar"</li></ul></div>
                                <div class="welcome-card"><h3>⚙️ Capacidades</h3><ul><li>Diagnóstico por síntomas</li><li>Análisis de imágenes</li><li>Recomendaciones de taller</li></ul></div>
                                <div class="welcome-card"><h3>🔒 Limitaciones</h3><ul><li>Solo temas mecánicos</li><li>No reemplaza una revisión física</li><li>Los precios son referenciales</li></ul></div>
                            </div>
                        </div>
                    </div>
                    <div id="messages-list-ia" class="chat-messages-list" style="display: none;"></div>
                    <div class="chat-input-area">
                        <div class="chat-input-container">
                            <textarea id="message-input-ia" rows="1" placeholder="Escribe tu consulta..."></textarea>
                            <div class="chat-input-buttons">
                                <button id="camera-ia" class="chat-btn-icon" title="Tomar foto"><i class="fas fa-camera"></i></button>
                                <button id="gallery-ia" class="chat-btn-icon" title="Subir imagen"><i class="fas fa-image"></i></button>
                                <button id="send-message-ia" class="chat-send-btn" title="Enviar"><i class="fas fa-paper-plane"></i></button>
                            </div>
                        </div>
                        <div id="image-preview-ia" class="chat-image-preview" style="display: none; margin-top: 8px; flex-wrap: wrap; gap: 8px;"></div>
                        <div class="chat-input-note"><span>🔊 Botones de voz y copia en cada mensaje. Escribe <strong>API : "clave"</strong> para cambiar la API key.</span></div>
                    </div>
                </main>
            </div>
        `;
        document.body.appendChild(modal);

        // Referencias
        window._chatGroupsList = modal.querySelector('#groups-list-ia');
        window._chatMessagesContainer = modal.querySelector('#messages-list-ia');
        window._chatGroupTitle = null;
        window._chatServiceIdSpan = null;
        window._chatMessageInput = modal.querySelector('#message-input-ia');
        window._chatSendBtn = modal.querySelector('#send-message-ia');
        window._chatCameraBtn = modal.querySelector('#camera-ia');
        window._chatGalleryBtn = modal.querySelector('#gallery-ia');
        window._chatPreviewContainer = modal.querySelector('#image-preview-ia');
        window._chatPreviewImg = null;
        window._chatCancelPreview = null;
        window._chatVincularBtn = modal.querySelector('#link-service-ia');
        window._chatRenombrarBtn = modal.querySelector('#rename-group-ia');
        window._chatEliminarBtn = modal.querySelector('#delete-group-ia');
        window._chatExportarBtn = modal.querySelector('#export-pdf-ia');
        window._chatNewGroupBtn = modal.querySelector('#new-group-ia');
        window._chatSearchInput = modal.querySelector('#search-group-ia');

        // Botón de cierre
        const closeModalBtn = modal.querySelector('#close-chat-ia-modal');
        if (closeModalBtn) {
            closeModalBtn.onclick = () => {
                window.cerrarChatIA();
            };
        }

        // Pantalla de bienvenida con timeout más largo (1500ms)
        const welcomeScreen = modal.querySelector('#welcome-screen-ia');
        const messagesContainer = window._chatMessagesContainer;
        const toggleWelcomeScreen = () => {
            if (!messagesContainer) return;
            const hasMessages = messagesContainer.children.length > 0;
            if (welcomeScreen) welcomeScreen.style.display = hasMessages ? 'none' : 'flex';
            messagesContainer.style.display = hasMessages ? 'flex' : 'none';
        };
        const observerMessages = new MutationObserver(() => toggleWelcomeScreen());
        if (messagesContainer) observerMessages.observe(messagesContainer, { childList: true, subtree: false });
        setTimeout(() => {
            toggleWelcomeScreen();
        }, 1500);

        // Menú de acciones (tres puntos del header)
        const triggerBtn = modal.querySelector('#chat-actions-trigger');
        const dropdown = modal.querySelector('#chat-actions-dropdown');
        if (triggerBtn && dropdown) {
            triggerBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('show'); });
            document.addEventListener('click', () => dropdown.classList.remove('show'));
            dropdown.addEventListener('click', (e) => e.stopPropagation());
        }

        // Sidebar móvil
        const sidebar = modal.querySelector('.chat-sidebar');
        const toggleBtn = modal.querySelector('.chat-sidebar-toggle');
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('open');
            });
            const mainEl = modal.querySelector('.chat-main');
            if (mainEl) {
                mainEl.addEventListener('click', () => {
                    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                        sidebar.classList.remove('open');
                    }
                });
            }
        }

        // Autoajuste textarea
        const textarea = window._chatMessageInput;
        if (textarea) {
            textarea.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
        }

        // Eventos de botones
        if (window._chatSendBtn) window._chatSendBtn.onclick = enviarMensaje;
        if (window._chatCameraBtn) window._chatCameraBtn.onclick = () => seleccionarImagen(true);
        if (window._chatGalleryBtn) window._chatGalleryBtn.onclick = () => seleccionarImagen(false);
        if (window._chatVincularBtn) window._chatVincularBtn.onclick = mostrarListaServiciosParaVincular;
        if (window._chatRenombrarBtn) window._chatRenombrarBtn.onclick = renombrarGrupo;
        if (window._chatEliminarBtn) window._chatEliminarBtn.onclick = eliminarGrupo;
        if (window._chatExportarBtn) window._chatExportarBtn.onclick = exportarChatPDF;
        if (window._chatNewGroupBtn) window._chatNewGroupBtn.onclick = crearNuevoGrupo;
        if (window._chatSearchInput) window._chatSearchInput.oninput = filtrarGrupos;
        if (window._chatMessageInput) {
            window._chatMessageInput.onkeypress = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
            };
        }

        return modal;
    }

    // ========== 12. INICIALIZACIÓN Y CIERRE ==========
    window.cerrarChatIA = () => {
        if (modal) modal.style.display = 'none';
        detenerVoz();
    };

    window.abrirChatIA = async () => {
        if (!modal) {
            crearModalChat();
            await initVisionModel().catch(e => {
                console.warn("No se pudo inicializar modelo de visión:", e.message);
                // currentVisionModel queda null, se manejará en consultarGroqVision
            });
            cargarGrupos();
        }
        if (modal) modal.style.display = 'flex';
    };

    const conectarBotonesExternos = () => {
        const floatBtn = document.getElementById('btn-chat-ai-float');
        if (floatBtn) floatBtn.onclick = window.abrirChatIA;
        const menuBtn = document.getElementById('btn-ia-menu');
        if (menuBtn) menuBtn.onclick = window.abrirChatIA;
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', conectarBotonesExternos);
    } else {
        conectarBotonesExternos();
    }
})();

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

function cargarTemaLocal() {
    const saved = localStorage.getItem('obr_theme_mode');
    if (saved) {
        globalSettings.themeMode = saved;
        applyTheme();
    }
}

let sosMapInstance = null, mechMapInst = null, mechMarkerInst = null;
let adminGeoMap = null, adminGeoCircle = null;
let adminSOSGlobalMapInst = null, adminSOSMarkers = {};
let entregasMapInst = null;
let sosDetailMapInst = null, sosDetailMarker = null, mechSOSMarker = null;
let shopServices = [], adminInventoryList = [];
window.posTicket = []; window.posTotal = 0; window.posTotalCost = 0; window.posDescuento = 0;
window.sosTicket = []; window.sosTotal = 0; window.currentSOSCost = 0; window.currentSOSId = null; window.currentSOSData = null;
window.cart = []; window.cartDescuento = 0; window.retiros = []; window.cajaAbierta = false; window.fondoInicial = 0;
let activeChatUid = null, chatUnsubscribe = null;
window.currentRating = 0; let currentDetalleServicioId = null;
window.currentSOSFilter = 'pending';
window.sosFiltroUnicoId = null;   // ID del servicio a mostrar individualmente
window.currentEntregaFilter = 'pendiente_asignar';
let statsChartInstance = null, statsPieInstance = null;
let adminSalesCache = {}; let lastNotifiedSOS = null; let mechWatchId = null; window.activeMechanicSOSId = null;
window.activePosFilter = 'todos';
window.garantiasActivas = [];
let mySOSListener = null;
let serviciosListener = null, sosListener = null, pedidosListener = null, citasListener = null;
window._servicesCatalogUnsubscribe = null;
const generateShortId = () => 'OBR-' + Math.floor(10000 + Math.random() * 90000);
let clientMapInitialized = false;    // Para crear el mapa una sola vez
let clientMapInstance = null;        // Referencia al mapa Leaflet
let clientMapMarkers = { mech: null, client: null, taller: null };
let clientMapRouteLine = null;
let lastMechPos = null;              // Para calcular distancia
let assignedMechPos = null;          // Posición al momento de asignación
let repairProgressInterval = null;    // Para simular avance de barra
let currentRepairPercent = 0;         // Progreso durante reparación

// aqui inicia obtenerPromedioCalificacion //
async function obtenerPromedioCalificacion(uid) {
    if (!uid) return null;
    const q = query(collection(db, "satisfaction"), where("uid", "==", uid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    let total = 0, count = 0;
    snap.forEach(doc => {
        const rating = doc.data().rating;
        if (typeof rating === 'number') {
            total += rating;
            count++;
        }
    });
    if (count === 0) return null;
    const promedio = total / count;
    return { promedio: promedio.toFixed(1), total: count };
}
// aqui finaliza obtenerPromedioCalificacion //

// ========== RECUPERACIÓN DE CONTRASEÑA ==========
window.backToLoginStep = function() {
    const recoveryStep = document.getElementById('auth-step-recovery');
    const loginStep = document.getElementById('auth-step-login');
    if (recoveryStep) recoveryStep.classList.add('hidden');
    if (loginStep) loginStep.classList.remove('hidden');
    
    const phoneStep = document.getElementById('recovery-phone-step');
    const answerStep = document.getElementById('recovery-answer-step');
    if (phoneStep) phoneStep.style.display = 'block';
    if (answerStep) answerStep.style.display = 'none';
    
    const phoneInput = document.getElementById('recovery-phone-input');
    const answerInput = document.getElementById('recovery-answer-input');
    if (phoneInput) phoneInput.value = '';
    if (answerInput) answerInput.value = '';
    
    window._recoveryUid = null;
};

window.showRecoveryFlow = function() {
    const loginStep = document.getElementById('auth-step-login');
    const recoveryStep = document.getElementById('auth-step-recovery');
    if (loginStep) loginStep.classList.add('hidden');
    if (recoveryStep) recoveryStep.classList.remove('hidden');
    
    const recoveryForm = document.getElementById('recovery-form-area');
    if (!recoveryForm) return;
    
    if (!document.getElementById('recovery-phone-input')) {
        recoveryForm.innerHTML = `
            <div id="recovery-phone-step" class="mb-4">
                <label class="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-1">Número de celular (10 dígitos)</label>
                <input id="recovery-phone-input" type="tel" maxlength="10" placeholder="Ej. 6441234567" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white mb-2">
                <button id="recovery-get-question" class="w-full bg-naranja hover:bg-orange-600 p-2 rounded-xl font-black uppercase text-sm">Buscar pregunta secreta</button>
            </div>
            <div id="recovery-answer-step" style="display:none;">
                <div class="bg-asfalto/50 p-5 rounded-xl border border-white/10 mb-6">
                    <p id="recovery-question-display" class="font-black text-naranja text-base italic leading-tight">¿Pregunta?</p>
                </div>
                <input id="recovery-answer-input" type="text" placeholder="Tu respuesta secreta..." class="w-full bg-white/5 border border-white/10 p-5 mb-8 rounded-xl focus:outline-none focus:border-naranja text-lg transition-all text-white font-bold">
                <button id="recovery-submit-answer" class="w-full bg-naranja hover:bg-orange-600 p-4 rounded-xl font-black uppercase tracking-widest shadow-lg active:scale-95 text-white text-lg mb-4 transition-all">Revelar Contraseña</button>
            </div>
        `;
        
        document.getElementById('recovery-get-question').onclick = async () => {
            const phone = document.getElementById('recovery-phone-input').value.trim();
            if (phone.length !== 10) {
                window.showToast("Ingrese un número de 10 dígitos", true);
                return;
            }
            const fullPhone = "+52" + phone;
            const q = query(collection(db, "users"), where("phone", "==", fullPhone), limit(1));
            const snap = await getDocs(q);
            if (snap.empty) {
                window.showToast("No existe una cuenta con ese número", true);
                return;
            }
            const userDoc = snap.docs[0];
            const userData = userDoc.data();
            if (!userData.secQuestion) {
                window.showToast("Esta cuenta no tiene pregunta de seguridad configurada. Contacta al administrador.", true);
                return;
            }
            window._recoveryUid = userDoc.id;
            document.getElementById('recovery-question-display').innerText = userData.secQuestion;
            document.getElementById('recovery-phone-step').style.display = 'none';
            document.getElementById('recovery-answer-step').style.display = 'block';
        };
        
        document.getElementById('recovery-submit-answer').onclick = async () => {
            const answer = document.getElementById('recovery-answer-input').value.trim().toLowerCase();
            if (!answer) {
                window.showToast("Escribe la respuesta a tu pregunta secreta", true);
                return;
            }
            if (!window._recoveryUid) return;
            const userDoc = await getDoc(doc(db, "users", window._recoveryUid));
            if (!userDoc.exists()) return;
            const userData = userDoc.data();
            if (userData.secAnswer !== answer) {
                window.showToast("Respuesta incorrecta", true);
                return;
            }
            const password = userData.pwd || "No disponible";
            
            // ----- MOSTRAR LA CONTRASEÑA EN UN MODAL (no solo notificación) -----
            const modalId = 'modal-show-password';
            let modalEl = document.getElementById(modalId);
            if (!modalEl) {
                modalEl = document.createElement('div');
                modalEl.id = modalId;
                modalEl.className = 'fixed inset-0 bg-black/95 z-[1000010] flex items-center justify-center p-4 hidden backdrop-blur-sm';
                modalEl.innerHTML = `
                    <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-green-500/30 shadow-2xl text-center">
                        <i class="fas fa-lock-open text-4xl text-green-400 mb-4"></i>
                        <h3 class="text-xl font-black text-white mb-4">Tu contraseña</h3>
                        <div class="bg-white/10 p-3 rounded-xl mb-4 flex items-center justify-between">
                            <input type="text" id="password-display" value="${password}" readonly class="bg-transparent text-white text-lg font-bold text-center w-full outline-none">
                            <button id="copy-password-btn" class="ml-2 bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-black uppercase">Copiar</button>
                        </div>
                        <button id="close-password-modal" class="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded-xl font-black uppercase">Entendido, volver al inicio</button>
                    </div>
                `;
                document.body.appendChild(modalEl);
                
                // Copiar al portapapeles
                document.getElementById('copy-password-btn').addEventListener('click', () => {
                    const passInput = document.getElementById('password-display');
                    passInput.select();
                    document.execCommand('copy');
                    window.showToast("Contraseña copiada", false);
                });
                
                // Cerrar modal y volver al login
                document.getElementById('close-password-modal').addEventListener('click', () => {
                    modalEl.classList.add('hidden');
                    window.backToLoginStep();
                });
            } else {
                // Actualizar el valor del campo si ya existe el modal
                const passInput = document.getElementById('password-display');
                if (passInput) passInput.value = password;
            }
            modalEl.classList.remove('hidden');
        };
    }
};

console.log('ANTES DE UTILIDADES');
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
    if (m) {
        if (show) {
            m.classList.remove('hidden');
            m.style.display = 'flex'; // ✅ FORZAR FLEX
            // Eventos específicos
            if (id === 'modal-video-schedule') window.renderVideoScheduleDays?.();
            if (id === 'modal-garantias') window.loadGarantias?.();
            if (id === 'modal-nueva-cita') {
                const fechaInput = document.getElementById('cita-fecha');
                if (fechaInput) fechaInput.min = new Date().toISOString().split('T')[0];
            }
            if (id === 'modal-edit-cita') {
                const fechaInput = document.getElementById('edit-cita-fecha');
                if (fechaInput) fechaInput.min = new Date().toISOString().split('T')[0];
            }
        } else {
            m.classList.add('hidden');
            m.style.display = 'none';
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
console.log('ANTES DEL TEMA');
// === TEMA ===
window.changeThemeMode = async (mode) => {
    globalSettings.themeMode = mode;
    localStorage.setItem('obr_theme_mode', mode);
    applyTheme();
    if (auth.currentUser && window.currentUserDoc?.role === 'admin') {
        await setDoc(doc(db, "settings", "general"), { themeMode: mode }, { merge: true });
    }
};

function applyTheme() {
    let mode = globalSettings.themeMode || 'auto';
    if (mode === 'auto') {
        const h = new Date().getHours();
        mode = (h >= 7 && h < 19) ? 'light' : 'dark';
    }
    document.body.classList.toggle('light-mode', mode === 'light');
    const sel = document.getElementById('theme-selector');
    if (sel) sel.value = globalSettings.themeMode || 'auto';
    updateLogo();
    switchMapLayer(mode === 'light');
    // Guardar en localStorage
    localStorage.setItem('obr_theme_mode', mode);
}

function switchMapLayer(isLight) {
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://carto.com/">CARTO</a>';
    const maps = [adminSOSGlobalMapInst, adminGeoMap, mechMapInst, sosMapInstance, entregasMapInst];
    maps.forEach(map => {
        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) map.removeLayer(layer);
            });
            L.tileLayer(layerUrl, { attribution }).addTo(map);
        }
    });
    if (entregasMapInst) entregasMapInst.invalidateSize();
}

function updateLogo() {
    const logo = document.getElementById('landing-logo');
    if (!logo) return;
    const isLight = document.body.classList.contains('light-mode');
    logo.src = isLight ? 'logo_claro.png' : 'logo_oscuro.png';
}

// aqui inicia startMechanicTracking (automatico, un registro por usuario)
function startMechanicTracking() {
    const role = window.currentUserDoc?.role;
    if (!['admin', 'mecanico', 'taller'].includes(role)) return;
    if (!navigator.geolocation) return;

    let watchId = null;
    const updatePosition = (pos) => {
        const uid = auth.currentUser.uid;
        const currentPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            name: window.currentUserDoc.name || 'Usuario',
            ts: Date.now()
        };
        // set sobrescribe la entrada (si ya existe, la actualiza; si no, la crea)
       set(dbRef(rtdb, 'mecanicos_activos/' + uid), currentPos).catch(console.error);

        // Historial de tracking (últimos 50 puntos)
        const trackingRef = dbRef(rtdb, `mecanicos_tracking/${uid}`);
        push(trackingRef, currentPos).then(() => {
            onValue(trackingRef, (snap) => {
                if (!snap.exists()) return;
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
            }, { onlyOnce: true });
        });

        // Si hay SOS activo, guardar punto de trayectoria
        if (window.activeMechanicSOSId) {
            push(dbRef(rtdb, `sos_tracking/${window.activeMechanicSOSId}/${uid}/points`), {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                ts: Date.now()
            });
        }
    };

    watchId = navigator.geolocation.watchPosition(updatePosition, (err) => console.error(err), {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 30000
    });
    window._mechWatchId = watchId;
}
// aqui finaliza startMechanicTracking

// ======================================================
// ACTUALIZACIÓN DEL BOTÓN DE EMERGENCIA (SEGÚN HORARIO)
// ======================================================
window.updateEmergencyButtonState = (isOpen, sched) => {
    const emBtn = document.getElementById('emergency-client-btn');
    const emText = document.getElementById('emergency-closed-text');
    if (!emBtn) return;

    // Resetear clases y estilo
    emBtn.classList.remove(
        'opacity-50', 'pointer-events-none', 'bg-gray-600',
        'bg-gradient-to-r', 'from-red-600', 'to-naranja'
    );
    emBtn.style.display = 'flex';

    if (isOpen) {
        emBtn.classList.add('bg-gradient-to-r', 'from-red-600', 'to-naranja');
        emBtn.classList.remove('opacity-50', 'pointer-events-none', 'bg-gray-600');
        if (emText) emText.classList.add('hidden');
        emBtn.onclick = () => window.startFlow('sos');
    } else {
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
        emBtn.onclick = () => window.showToast("Taller cerrado. Vuelve en horario laboral.", true);
    }
};
// === INICIO Y CONFIGURACIÓN GLOBAL ===
async function loadGlobalSettings() {
    // Primero aplicar tema local
    cargarTemaLocal();

    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) Object.assign(globalSettings, snap.data());
    globalSettings.centerLat = TALLER_LAT;
    globalSettings.centerLng = TALLER_LNG;

    // Sincronizar: si es admin, guardar en Firestore; si no, prevalece local
    if (auth.currentUser && window.currentUserDoc?.role === 'admin') {
        const localMode = localStorage.getItem('obr_theme_mode');
        if (localMode && localMode !== globalSettings.themeMode) {
            globalSettings.themeMode = localMode;
            await setDoc(doc(db, 'settings', 'general'), { themeMode: localMode }, { merge: true });
        }
    } else if (!auth.currentUser) {
        // Si no hay usuario, el tema local ya se aplicó
    }
    applyTheme();

    // ✅ CORRECCIÓN: Forzar actualización del botón inmediatamente después de cargar ajustes
    const now = new Date();
    const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const sched = globalSettings.schedule?.[dayIndex] || { o: "08:00", c: "20:00" };
    const [hOpen, mOpen] = sched.o.split(':').map(Number);
    const [hClose, mClose] = sched.c.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const openMins = hOpen * 60 + mOpen;
    const closeMins = hClose * 60 + mClose;
    const isOpen = nowMins >= openMins && nowMins < closeMins;
    window.updateEmergencyButtonState(isOpen, sched);

    updateLandingStatus();
    loadPublicStore();
    loadServicesCatalog();
}
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
                        initClientMap();  // <-- AÑADE ESTA LÍNEA
                    }
                } else {
                    showView('view-landing');
                }
            }
        }
    });
// ... después de speakTTS
function alertarGlobal(mensaje, tipo = 'notif') {
    playSound(tipo);
    speakTTS(mensaje);
    // ...
}
// ... después de la definición de alertarGlobal
function iniciarListenerGlobalSOS() {
    let lastSOSCount = 0;
    const q = query(collection(db, "rescates"), where("status", "==", "pending"));
    onSnapshot(q, (snap) => {
        const currentCount = snap.size;
        if (lastSOSCount > 0 && currentCount > lastSOSCount) {
            const nuevaSOS = currentCount - lastSOSCount;
            if (nuevaSOS > 0) {
                playSound('alert');
                speakTTS('¡Nueva solicitud de auxilio entrante!');
                if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(reg => {
                        reg.showNotification('🚨 Nuevo SOS', {
                            body: `Hay ${nuevaSOS} nueva(s) solicitud(es) de auxilio pendiente(s).`,
                            icon: 'icono.png',
                            vibrate: [200, 100, 200]
                        });
                    });
                }
                showToast(`🚨 ¡${nuevaSOS} nueva solicitud de auxilio entrante!`, false);
            }
        }
        lastSOSCount = currentCount;
    });
}
// ... luego sigue updateLandingStatus ...

function updateLandingStatus() {
    const now = new Date();
    const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const sched = globalSettings.schedule?.[dayIndex] || { o: "08:00", c: "20:00" };
    const [hOpen, mOpen] = sched.o.split(':').map(Number);
    const [hClose, mClose] = sched.c.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const openMins = hOpen * 60 + mOpen;
    const closeMins = hClose * 60 + mClose;
    const isOpen = nowMins >= openMins && nowMins < closeMins;
    window.updateEmergencyButtonState(isOpen, sched);

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
window.mostrarOpcionesContacto = async () => {
    // Obtener el servicio SOS activo del usuario actual
    let servicioActivo = null;
    let mecanicoAsignado = null;
    try {
        const sosSnap = await getDocs(query(collection(db, "rescates"), 
            where("uid", "==", auth.currentUser.uid), 
            where("status", "in", ["accepted", "repairing", "to_shop", "ready"]), 
            limit(1)));
        if (!sosSnap.empty) {
            servicioActivo = sosSnap.docs[0].data();
            if (servicioActivo.mech_uid) {
                const mechDoc = await getDoc(doc(db, "users", servicioActivo.mech_uid));
                if (mechDoc.exists()) {
                    mecanicoAsignado = mechDoc.data();
                }
            }
        }
    } catch(e) { console.warn(e); }

    const modalId = 'modal-contacto-taller-opciones';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
modalEl.className = 'fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-blue-500/30 text-center">
                <i class="fas fa-headset text-4xl text-blue-400 mb-4"></i>
                <h2 class="text-xl font-black text-white mb-4">Contactar al Taller</h2>
                <div class="space-y-3">
                    <button id="contact-call-1" class="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase"><i class="fas fa-phone mr-2"></i> Llamar 631 155 1533</button>
                    <button id="contact-call-2" class="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase"><i class="fas fa-phone mr-2"></i> Llamar 644 110 6011</button>
                    <button id="contact-chat" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black uppercase"><i class="fas fa-comments mr-2"></i> Chat con Soporte</button>
                    <button id="contact-mechanic" class="hidden w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase"><i class="fab fa-whatsapp mr-2"></i> Contactar a mi Mecánico</button>
                    <button onclick="toggleModal('${modalId}', false)" class="w-full bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        document.getElementById('contact-call-1').onclick = () => window.open('tel:6311551533', '_self');
        document.getElementById('contact-call-2').onclick = () => window.open('tel:6444207644', '_self');
        document.getElementById('contact-chat').onclick = () => {
            window.toggleModal(modalId, false);
            window.openChatWithTaller();
        };
        document.getElementById('contact-mechanic').onclick = () => {
            window.toggleModal(modalId, false);
            if (mecanicoAsignado && servicioActivo) {
                const telefonoClean = (mecanicoAsignado.phone || '').replace('+52', '');
                if (telefonoClean) {
                    const tipoServicio = servicioActivo.falla?.match(/\[(.*?)\]/)?.[1] || 'auxilio';
                    const mensaje = `Hola ${mecanicoAsignado.name || 'mecánico'}, tienes mi caso asignado ${servicioActivo.shortId || 'servicio'} para un ${tipoServicio}. Puedes contactarme.`;
                    window.open(`https://wa.me/+52${telefonoClean}?text=${encodeURIComponent(mensaje)}`, '_blank');
                } else {
                    window.showToast("El mecánico no tiene número de teléfono registrado", true);
                }
            }
        };
    }
    // Mostrar/ocultar botón del mecánico según si hay asignado
    const btnMech = document.getElementById('contact-mechanic');
    if (btnMech) {
        if (mecanicoAsignado && (mecanicoAsignado.phone || '').replace('+52', '')) {
            btnMech.classList.remove('hidden');
        } else {
            btnMech.classList.add('hidden');
        }
    }
    window.toggleModal(modalId, true);
};



// === FLUJO DE VISTAS Y AUTENTICACIÓN ===
onAuthStateChanged(auth, async user => {
    // Asegurar tema antes de mostrar cualquier vista
    cargarTemaLocal();
    
    document.getElementById('loading-screen').classList.add('hidden');
    if (window._adminCreatingUser) return;

    if (!user) {
        if(mechWatchId) navigator.geolocation.clearWatch(mechWatchId);
        loadGlobalSettings(); 
        showView('view-landing');
        return;
    }
    
    // Ocultar landing inmediatamente
    showView('view-landing', false); // ocultar sin mostrar otra (no usar showView que muestra)
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
            showView('view-landing');
        });
        return;
    }

    if (window.currentUserDoc.firstLogin && !['admin','mecanico','taller','socio'].includes(window.currentUserDoc.role)) {
        showView('view-force-setup');
        return;
    }

    if (['admin', 'mecanico', 'taller', 'socio'].includes(window.currentUserDoc.role)) {
        const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
        startMechanicTracking();
        if (settingsSnap.exists()) Object.assign(globalSettings, settingsSnap.data());
        globalSettings.centerLat = TALLER_LAT;
        globalSettings.centerLng = TALLER_LNG;
        showView('app-admin');
        document.getElementById('admin-phone-display').innerText = window.currentUserDoc.name || 'Admin';
         iniciarListenerGlobalSOS();
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
        setTimeout(() => {
    if (typeof window.updateEmergencyButtonState === 'function') {
        const now = new Date();
        const dayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const sched = globalSettings.schedule?.[dayIndex] || { o: "08:00", c: "20:00" };
        const [hOpen, mOpen] = sched.o.split(':').map(Number);
        const [hClose, mClose] = sched.c.split(':').map(Number);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const openMins = hOpen * 60 + mOpen;
        const closeMins = hClose * 60 + mClose;
        const isOpen = nowMins >= openMins && nowMins < closeMins;
        window.updateEmergencyButtonState(isOpen, sched);
    }
}, 100);
        document.getElementById('client-name-display').innerText = window.currentUserDoc.name || 'Cliente OBR';
        window.loadClientHistory(); 
        listenToMySOS();
        listenToMyDeliveries(); 
        window.loadClientCitas();
        console.log('Cargando tienda para usuario:', window.currentUserDoc?.phone);
loadPublicStore();
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
    // Volver a la pantalla de landing (o al paso 1 si prefieres)
    showView('view-landing');
    window.pendingItemToBuy = null;
    
    // Ocultar todos los pasos de autenticación y mostrar solo el paso 1
    const steps = ['auth-step-1', 'auth-step-login', 'auth-step-register', 'auth-step-recovery'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const step1 = document.getElementById('auth-step-1');
    if (step1) step1.classList.remove('hidden');
    
    // Limpiar campo de teléfono
    const phoneInput = document.getElementById('phone-input');
    if (phoneInput) phoneInput.value = '';
    
    // Limpiar campos de login
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) loginPassword.value = '';
    
    // Limpiar campos de registro
    const regName = document.getElementById('reg-name');
    if (regName) regName.value = '';
    const regPassword = document.getElementById('reg-password');
    if (regPassword) regPassword.value = '';
    const regQuestion = document.getElementById('reg-question');
    if (regQuestion) regQuestion.value = '';
    const regAnswer = document.getElementById('reg-answer');
    if (regAnswer) regAnswer.value = '';
    
    // Limpiar cualquier dato de recuperación
    window._recoveryUid = null;
    const recoveryAnswer = document.getElementById('recovery-answer-input');
    if (recoveryAnswer) recoveryAnswer.value = '';
    
    console.log('Flujo de autenticación reiniciado');
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
    document.querySelectorAll('.c-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.c-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.c-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if (btn) btn.classList.add('tab-active');

    // Si cambiamos a la pestaña de RESCATE, forzar redimensionamiento del mapa
    if (id === 'c-view-rescate' && window.mechMapInst) {
        setTimeout(() => window.mechMapInst.invalidateSize(), 300);
    }
    
    // Cargar video promocional solo en tienda
    if (id === 'c-view-tienda') window.loadPromoVideo();

    // ✅ CARGAR DATOS SEGÚN LA VISTA SELECCIONADA
    if (id === 'c-view-tienda') {
        if (typeof loadPublicStore === 'function') {
            loadPublicStore();
        } else {
            console.warn('loadPublicStore no está disponible');
        }
    }

    if (id === 'c-view-citas') {
        if (typeof window.loadClientCitas === 'function') {
            window.loadClientCitas();
        } else {
            console.warn('loadClientCitas no está disponible');
        }
    }

    if (id === 'c-view-historial') {
        if (typeof window.loadClientHistory === 'function') {
            window.loadClientHistory();
        } else {
            console.warn('loadClientHistory no está disponible');
        }
    }
if (id === 'c-view-retenes') {
    document.getElementById('c-view-retenes').classList.remove('hidden');
    setTimeout(() => {
        window.renderRetenMap(false);
        if (retenesMapInstance) retenesMapInstance.invalidateSize();
    }, 300);
} else {
    document.getElementById('c-view-retenes').classList.add('hidden');
}
    window.fixMaps?.();
};

window.switchAdminView = (id) => {
    toggleModal('modal-user-detail', false);
    
    // Mostrar/ocultar botón flotante del chat IA
    const chatAiBtn = document.getElementById('btn-chat-ai-float');
    if (chatAiBtn) {
        chatAiBtn.style.display = id === 'a-view-servicios' ? 'flex' : 'none';
    }
    
    // Mostrar/ocultar botón de chat de soporte (solo en POS y Alertas)
    const chatBtn = document.getElementById('admin-chat-float-btn');
    if(chatBtn) chatBtn.classList.toggle('hidden', !['a-view-pos', 'a-view-alertas'].includes(id));
    
    document.querySelectorAll('.a-view').forEach(v => v.classList.add('hidden')); 
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.a-nav-btn').forEach(b => b.classList.remove('tab-active'));
    const btn = Array.from(document.querySelectorAll('.a-nav-btn')).find(b => b.getAttribute('onclick').includes(id));
    if(btn) btn.classList.add('tab-active');

    if(id === 'a-view-config') {
        window.adminRefreshConfigUI();
        window.renderAdminMap();
        if (window._servicesCatalogUnsubscribe) window._servicesCatalogUnsubscribe();
        window._servicesCatalogUnsubscribe = onSnapshot(collection(db, "servicios"), () => refreshCatalogUI());
    }
    if(id === 'a-view-usuarios') window.adminLoadUsers();
    if(id === 'a-view-promos') { 
        window.adminLoadLoyalty(); 
        populatePromoProductSelect(); 
        window.loadPromoPreview?.(); 
    }
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
    
    const entregaPanel = document.getElementById('entrega-actions-panel');
    if (entregaPanel) entregaPanel.classList.add('hidden');

        if (id === 'a-view-retenes') {
        setTimeout(() => window.renderRetenMap(true), 300);
    }
    
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
    
    if (!name || password.length < 6 || !question || !answer) {
        return showToast("Completa datos (Pass min 6)", true);
    }
    
    const fakeEmail = `${rawPhone}@motorescateobr.com`;
    
    try {
        // 1. Crear usuario en Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        const uid = userCredential.user.uid;
        
        // 2. Generar código de referido único (6 caracteres)
        const codigoReferido = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // 3. Leer parámetro 'ref' de la URL (si existe)
        const urlParams = new URLSearchParams(window.location.search);
        const codigoReferente = urlParams.get('ref');
        
        // 4. Guardar datos del usuario en Firestore (incluyendo referidos)
await setDoc(doc(db, "users", uid), {
    phone: "+52" + rawPhone,
    name: name,
    role: 'cliente',
    secQuestion: question,
    secAnswer: answer.toLowerCase(),
    pwd: password,
    firstLogin: false,   // ← Cambiado a false
    created: Date.now(),
    codigoReferido: codigoReferido,
    referidoPor: codigoReferente || null,
    serviciosCompletados: 0
});
        
        // 5. Si viene de un referido, registrar la relación en colección "referidos"
       if (codigoReferente) {
    const qReferente = query(collection(db, "users"), where("codigoReferido", "==", codigoReferente), limit(1));
    const snapReferente = await getDocs(qReferente);
    if (!snapReferente.empty) {
        const referenteDoc = snapReferente.docs[0];
        const referenteId = referenteDoc.id;
        await addDoc(collection(db, "referidos"), {
            referenteId: referenteId,
            referidoId: uid,
            codigoReferente: codigoReferente,
            fechaRegistro: Date.now(),
            estado: 'pendiente',
            servicioCompletado: false,
            serviciosCompletados: 0   // ← AÑADE ESTA LÍNEA si no existe
        });
        // Notificación al referente
        await setDoc(doc(db, "notificaciones", referenteId), {
            msg: `🎉 ¡${name} se registró usando tu código de referido!`,
            timestamp: Date.now(),
            leida: false
        });
    }
}
        
       // 6. Crear o actualizar modal de invitación (para compartir enlace)
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
            <p class="text-xs text-gray-300 mb-4">Comparte este enlace con tus amigos para que también se unan a OBR.</p>
            <div class="bg-white/10 p-2 rounded-lg mb-4">
                <p class="text-[10px] text-gray-400 break-all" id="invite-link-display">https://exploracionesobr.github.io/RESCATE-OBR?ref=${codigoReferido}</p>
            </div>
            <div class="flex flex-col space-y-2">
                <button id="whatsapp-invite-btn" class="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase text-sm flex items-center justify-center"><i class="fab fa-whatsapp mr-2"></i> Enviar por WhatsApp</button>
                <button id="whatsapp-skip-btn" class="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase text-sm">Comenzar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalEl);
}
// Actualizar el enlace (por si cambió)
const linkSpan = document.getElementById('invite-link-display');
if (linkSpan) linkSpan.innerText = `https://exploracionesobr.github.io/RESCATE-OBR?ref=${codigoReferido}`;

// Función para redirigir al dashboard después de cerrar el modal
const redirectToDashboard = () => {
    if (auth.currentUser) {
        const role = window.currentUserDoc?.role;
        if (role === 'admin' || role === 'mecanico' || role === 'taller' || role === 'socio') {
            window.showView('app-admin');
        } else {
            window.showView('app-client');
            window.switchClientView('c-view-rescate');
        }
    }
};

// Configurar eventos (siempre se reasignan para asegurar la redirección)
const inviteBtn = document.getElementById('whatsapp-invite-btn');
const skipBtn = document.getElementById('whatsapp-skip-btn');
if (inviteBtn) {
    inviteBtn.onclick = () => {
        const link = document.getElementById('invite-link-display').innerText;
        const mensaje = encodeURIComponent(`🚀 ¡Descarga OBR Moto Rescate! Auxilio mecánico rápido. Únete aquí: ${link}`);
        window.open(`https://wa.me/?text=${mensaje}`, '_blank');
        window.toggleModal(modalId, false);
        redirectToDashboard();
    };
}
if (skipBtn) {
    skipBtn.onclick = () => {
        window.toggleModal(modalId, false);
        redirectToDashboard();
    };
}

// 7. Mostrar modal y toast
window.toggleModal(modalId, true);
showToast("Registro exitoso. Completa tu perfil.");
        
    } catch (error) {
        console.error("Error en registro:", error);
        if (error.code === 'auth/email-already-in-use') {
            showToast("Ya existe una cuenta con ese número. Inicia sesión.", true);
            document.getElementById('auth-step-register').classList.add('hidden');
            document.getElementById('auth-step-login').classList.remove('hidden');
        } else {
            showToast("Error en registro: " + (error.message || "Intenta de nuevo"), true);
        }
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
        // Solo reautenticar si el usuario tiene la contraseña temporal '123456'
        // Intentamos reautenticar, si falla, asumimos que ya tiene otra contraseña y solo actualizamos Firestore
        let credencialOk = false;
        try {
            const credential = EmailAuthProvider.credential(user.email, '123456');
            await reauthenticateWithCredential(user, credential);
            credencialOk = true;
        } catch (reauthError) {
            // Si la reautenticación falla, probablemente el usuario ya cambió su contraseña
            console.warn("No se pudo reautenticar con '123456', asumiendo que ya tiene otra contraseña");
        }

        if (credencialOk) {
            // Cambiar la contraseña solo si se pudo reautenticar
            await updatePassword(user, newPassword);
        } else {
            // Si no se pudo reautenticar, al menos guardamos los datos en Firestore
            window.showToast("No se pudo cambiar la contraseña automáticamente, pero los datos se guardaron.", false);
        }

        // Actualizar Firestore
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            pwd: newPassword,
            secQuestion: question,
            secAnswer: answer.toLowerCase(),
            firstLogin: false
        }, { merge: true });

        window.showToast("Configuración guardada. Redirigiendo...");
        setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
        console.error(error);
        window.showToast("Error al guardar: " + (error.message || "Intenta de nuevo"), true);
    }
};

window.logout = () => {
    window.confirmModal('¿Cerrar sesión? Perderás las notificaciones en tiempo real hasta que vuelvas a iniciar sesión.', async () => {
        // Limpiar listeners (código original)
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
        if (window._adminSOSTrackingListeners) {
            Object.values(window._adminSOSTrackingListeners).forEach(unsub => unsub());
            window._adminSOSTrackingListeners = {};
        }
        if (window._adminSOSRouteLines) {
            Object.values(window._adminSOSRouteLines).forEach(line => line.remove());
            window._adminSOSRouteLines = {};
        }

        // Eliminar la posicion activa
        const uid = auth.currentUser?.uid;
        if (uid) {
            await remove(dbRef(rtdb, 'mecanicos_activos/' + uid)).catch(console.error);
            if (window._mechWatchId) {
                navigator.geolocation.clearWatch(window._mechWatchId);
                window._mechWatchId = null;
            }
        }

        await signOut(auth);
        window.location.href = window.location.pathname;
    });
};
// aqui finaliza logout
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
        // Mostrar primeros 5 servicios del catálogo + opción genérica
        matches = shopServices.slice(0, 5);
        matches.push({ id: "0", name: "SIN FALLO ESPECÍFICO (Se cotizará en el lugar)", price: 0 });
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
// Ocultar dropdown de servicios al hacer clic fuera
document.addEventListener('click', function(e) {
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
        const rtdbPromise = set(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), rData);
        await Promise.race([Promise.all([addPromise, rtdbPromise]), timeoutPromise]);

        // Éxito
        document.getElementById('sos-falla').value = '';
        document.getElementById('sos-media').value = '';
        document.getElementById('llanta-type-container').classList.add('hidden');
        showToast("¡Unidad notificada!");
        showView('app-client');
        window.switchClientView('c-view-rescate');
        listenToMySOS();

    } catch (e) {
        console.warn('SOS enviado con posibles demoras:', e);
        showToast("Solicitud enviada. Te notificaremos cuando el taller confirme.");
        document.getElementById('sos-falla').value = '';
        document.getElementById('sos-media').value = '';
        document.getElementById('llanta-type-container').classList.add('hidden');
        showView('app-client');
        window.switchClientView('c-view-rescate');
        listenToMySOS();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>SOLICITAR AUXILIO</span> <i class="fas fa-ambulance text-2xl"></i>';
    }
};

function initClientMap() {
    if (window.clientMapInstance) {
        window.clientMapInstance.invalidateSize();
        return;
    }
    const container = document.getElementById('mechanic-live-map');
    if (!container) {
        console.error('Contenedor #mechanic-live-map no encontrado');
        return;
    }
    container.style.height = '250px';
    container.style.minHeight = '250px';
    container.style.display = 'block';
    container.style.opacity = '1';

    window.clientMapInstance = L.map('mechanic-live-map', {
        zoomControl: true,
        attributionControl: false
    }).setView([TALLER_LAT, TALLER_LNG], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd'
    }).addTo(window.clientMapInstance);

    window.clientMapMarkers = window.clientMapMarkers || { mech: null, client: null, taller: null };
    window.clientMapMarkers.taller = L.marker([TALLER_LAT, TALLER_LNG], {
        icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] })
    }).addTo(window.clientMapInstance).bindPopup("🔧 Taller OBR");

    console.log('✅ Mapa cliente inicializado (Routing Machine listo)');
    setTimeout(() => { if (window.clientMapInstance) window.clientMapInstance.invalidateSize(); }, 200);
}

// ========== LISTEN TO MY SOS – VERSIÓN DEFINITIVA (CORREGIDA) ==========
function listenToMySOS() {
    if (window.mySOSListener && typeof window.mySOSListener === 'function') {
        window.mySOSListener();
        window.mySOSListener = null;
    }
    if (!auth.currentUser) return;

    let mechPosUnsubscribe = null;
    let routingControl = null;
    let centrarMapaInterval = null;

    window.mySOSListener = onValue(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid), async (snap) => {
        const activeCard = document.getElementById('active-sos-card');
        const noServicesMsg = document.getElementById('no-active-services-msg');
        const survey = document.getElementById('satisfaction-survey');
        const mechanicMapDiv = document.getElementById('mechanic-live-map');
        const statusDesc = document.getElementById('sos-status-desc-client');
        const progressBar = document.getElementById('sos-progress-bar');
        const emergencyBtn = document.getElementById('emergency-client-btn');
        const chatBtn = document.getElementById('btn-chat-sos');
        const videoContainer = document.getElementById('promo-video-container');

        // 📌 Limpiar intervalos anteriores
        if (centrarMapaInterval) {
            clearInterval(centrarMapaInterval);
            centrarMapaInterval = null;
        }

        // 📌 CASO 1: No hay nodo RTDB (servicio eliminado o finalizado)
        if (!snap.exists()) {
            if (activeCard) activeCard.classList.add('hidden');
            if (noServicesMsg) noServicesMsg.classList.remove('hidden');
            if (emergencyBtn) emergencyBtn.style.display = 'flex';
            if (videoContainer) videoContainer.style.display = 'block';

            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (routingControl) {
                routingControl.remove();
                routingControl = null;
            }
            if (window.clientMapInstance) {
                if (window.clientMapMarkers.mech) {
                    window.clientMapInstance.removeLayer(window.clientMapMarkers.mech);
                    window.clientMapMarkers.mech = null;
                }
                if (window.clientMapMarkers.client) {
                    window.clientMapInstance.removeLayer(window.clientMapMarkers.client);
                    window.clientMapMarkers.client = null;
                }
            }
            window.lastClientSOSStatus = null;
            return;
        }

        const data = snap.val();

        // 📌 CASO 2: Servicio completado o cancelado
        if (data.status === 'completed' || data.status === 'cancelled') {
            if (activeCard) activeCard.classList.add('hidden');
            if (noServicesMsg) noServicesMsg.classList.remove('hidden');
            if (emergencyBtn) emergencyBtn.style.display = 'flex';
            if (videoContainer) videoContainer.style.display = 'block';

            if (data.status === 'completed') {
                const shortId = data.shortId || 'unknown';
                const yaCalifico = localStorage.getItem('calificado_' + shortId) === 'true';
                if (!yaCalifico) {
                    if (survey) survey.classList.remove('hidden');
                    speakTTS('Servicio finalizado. ¡Califica a tu mecánico!');
                }
            }

            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (routingControl) {
                routingControl.remove();
                routingControl = null;
            }
            window.loadClientHistory();
            return;
        }

        // 📌 CASO 3: Servicio activo (pending, accepted, repairing, to_shop, ready)
        if (activeCard) activeCard.classList.remove('hidden');
        if (noServicesMsg) noServicesMsg.classList.add('hidden');
        if (emergencyBtn) emergencyBtn.style.display = 'none';

        // 📌 Barra de progreso según estado
        let currentStep = 0, progressPercent = 0;
        if (data.status === 'pending') { currentStep = 0; progressPercent = 0; }
        else if (data.status === 'accepted') { currentStep = 1; progressPercent = 25; }
        else if (data.status === 'repairing') { currentStep = 2; progressPercent = 50; }
        else if (data.status === 'to_shop' || data.status === 'ready') { currentStep = 3; progressPercent = 75; }
        else if (data.status === 'completed') { currentStep = 4; progressPercent = 100; }

        if (progressBar) progressBar.style.width = progressPercent + '%';

        // 📌 Actualizar pasos visuales
        for (let i = 0; i < 4; i++) {
            const labelEl = document.getElementById('step-' + (i+1) + '-label');
            const dotEl = document.getElementById('step-dot-' + (i+1));
            if (i < currentStep) {
                labelEl?.classList.add('text-red-400', 'font-bold');
                dotEl?.classList.remove('bg-asfalto', 'border-white/20');
                dotEl?.classList.add('bg-red-500', 'border-asfalto');
            } else {
                labelEl?.classList.remove('text-red-400', 'font-bold');
                dotEl?.classList.remove('bg-red-500', 'border-asfalto');
                dotEl?.classList.add('bg-asfalto', 'border-white/20');
            }
        }

        // 📌 Texto de estado
        if (statusDesc) {
            const estados = {
                'pending': 'Buscando mecánico...',
                'accepted': '✅ Mecánico asignado, en camino',
                'repairing': '🔧 Mecánico reparando tu moto',
                'to_shop': '🚚 En camino al taller',
                'ready': '✅ Listo para entrega',
                'completed': '✅ Servicio finalizado'
            };
            statusDesc.innerText = estados[data.status] || 'Esperando confirmación';
        }

        // 📌 Chat button
        if (data.mech_uid && data.chatId) {
            chatBtn.classList.remove('hidden');
        } else {
            chatBtn.classList.add('hidden');
        }

        // 📌 CONTROL DE VIDEO vs MAPA
        if (data.status === 'pending' || !data.mech_uid) {
            // Sin mecánico asignado → mostrar video
            if (videoContainer) videoContainer.style.display = 'block';
            if (mechanicMapDiv) {
                mechanicMapDiv.style.display = 'none';
                mechanicMapDiv.style.zIndex = '0';
            }
            // Limpiar mapa si existía
            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (routingControl) {
                routingControl.remove();
                routingControl = null;
            }
            if (window.clientMapInstance) {
                if (window.clientMapMarkers.mech) {
                    window.clientMapInstance.removeLayer(window.clientMapMarkers.mech);
                    window.clientMapMarkers.mech = null;
                }
                if (window.clientMapMarkers.client) {
                    window.clientMapInstance.removeLayer(window.clientMapMarkers.client);
                    window.clientMapMarkers.client = null;
                }
            }
        } else if (data.status === 'accepted' || data.status === 'repairing' || data.status === 'to_shop' || data.status === 'ready') {
            // Mecánico asignado → ocultar video, mostrar mapa
            if (videoContainer) videoContainer.style.display = 'none';
            if (mechanicMapDiv) {
                mechanicMapDiv.style.display = 'block';
                mechanicMapDiv.style.height = '250px';
                mechanicMapDiv.style.minHeight = '250px';
            }

            // 📌 Inicializar mapa si no existe
            if (!window.clientMapInstance) {
                if (typeof initClientMap === 'function') initClientMap();
            } else {
                window.clientMapInstance.invalidateSize();
            }

            // 📌 Mostrar ubicación del cliente
            if (window.clientMapInstance && data.lat && data.lng) {
                if (window.clientMapMarkers.client) {
                    window.clientMapInstance.removeLayer(window.clientMapMarkers.client);
                }
                window.clientMapMarkers.client = L.marker([data.lat, data.lng], {
                    icon: L.divIcon({
                        className: 'gps-pulse-marker',
                        html: '<div class="pulse-inner" style="background:#FF6B00; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white;"><i class="fas fa-map-marker-alt" style="color:white; font-size:14px;"></i></div>',
                        iconSize: [28, 28],
                        iconAnchor: [14, 28]
                    })
                }).addTo(window.clientMapInstance).bindPopup("📍 Tu ubicación");
            }

            // 📌 Suscribir a la posición del mecánico
            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (data.mech_uid) {
                const mechUserSnap = await getDoc(doc(db, "users", data.mech_uid));
                const mechData = mechUserSnap.exists() ? mechUserSnap.data() : { name: 'Mecánico', phone: '' };
                const calificacion = await obtenerPromedioCalificacion(data.mech_uid);
                const stars = calificacion ? '★'.repeat(Math.round(calificacion.promedio)) + '☆'.repeat(5 - Math.round(calificacion.promedio)) : '☆☆☆☆☆';
                const ratingText = calificacion ? `${calificacion.promedio} ⭐ (${calificacion.total} reseñas)` : 'Sin reseñas';
                const telefono = mechData.phone || '';
                const telefonoClean = telefono.replace('+52', '');
                const nombre = mechData.name || 'Mecánico';
                const popupContent = `
                    <div style="font-size:12px; font-family:sans-serif; min-width:220px; background:${document.body.classList.contains('light-mode') ? '#ffffff' : '#1A1A1A'}; color:${document.body.classList.contains('light-mode') ? '#111111' : '#ffffff'}; border-radius:16px; padding:10px; border:1px solid #FF6B00;">
                        <b>${escapeHtml(nombre)}</b><br>
                        <span style="color:#FFD700; font-size:14px;">${stars}</span> <span style="font-size:10px;">${ratingText}</span><br>
                        ${telefono ? `📞 ${escapeHtml(telefono)}<br>` : ''}
                        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                            ${telefonoClean ? `<button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">📞 Llamar</button>` : ''}
                            ${telefonoClean ? `<button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">💬 WhatsApp</button>` : ''}
                        </div>
                    </div>
                `;

                mechPosUnsubscribe = onValue(dbRef(rtdb, `mecanicos_activos/${data.mech_uid}`), (posSnap) => {
                    if (posSnap.exists() && window.clientMapInstance) {
                        const pos = posSnap.val();
                        if (pos.lat && pos.lng) {
                            // 📌 Actualizar marcador del mecánico
                            if (window.clientMapMarkers.mech) {
                                window.clientMapMarkers.mech.setLatLng([pos.lat, pos.lng]);
                                window.clientMapMarkers.mech.setPopupContent(popupContent);
                            } else {
                                window.clientMapMarkers.mech = L.marker([pos.lat, pos.lng], {
                                    icon: L.divIcon({
                                        className: 'mech-pulse-marker',
                                        html: '<div class="pulse-inner" style="background:#22c55e; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white;"><i class="fas fa-motorcycle" style="color:white; font-size:16px;"></i></div>',
                                        iconSize: [32, 32],
                                        iconAnchor: [16, 32]
                                    })
                                }).addTo(window.clientMapInstance).bindPopup(popupContent);
                            }

                            // 📌 Centrar el mapa dinámicamente en ambos
                            const bounds = [];
                            if (data.lat && data.lng) bounds.push([data.lat, data.lng]);
                            if (pos.lat && pos.lng) bounds.push([pos.lat, pos.lng]);
                            if (bounds.length >= 2) {
                                window.clientMapInstance.fitBounds(bounds, { padding: [50, 50] });
                            } else if (bounds.length === 1) {
                                window.clientMapInstance.setView(bounds[0], 14);
                            }

                            // 📌 Actualizar ruta
                            if (routingControl) {
                                routingControl.setWaypoints([
                                    L.latLng(pos.lat, pos.lng),
                                    L.latLng(data.lat, data.lng)
                                ]);
                            } else {
                                try {
                                    routingControl = L.Routing.control({
                                        waypoints: [
                                            L.latLng(pos.lat, pos.lng),
                                            L.latLng(data.lat, data.lng)
                                        ],
                                        routeWhileDragging: false,
                                        language: 'es',
                                        showAlternatives: false,
                                        show: false,
                                        collapsible: false,
                                        lineOptions: { styles: [{ color: '#440dfa', weight: 6, opacity: 0.9 }] },
                                        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
                                        createMarker: () => null
                                    }).addTo(window.clientMapInstance);
                                } catch (e) {
                                    console.warn('Error al crear routing control:', e);
                                }
                            }

                            // 📌 (Opcional) Calcular distancia y avanzar barra de progreso
                            const dist = getDistanceKm(pos.lat, pos.lng, data.lat, data.lng);
                            if (dist < 1 && data.status === 'accepted') {
                                // Si está muy cerca y aún no está en repairing, notificar
                                // (pero no cambiamos estado automáticamente, solo avanzamos barra visual)
                            }
                        }
                    }
                });
            }

            // 📌 Iniciar intervalo para centrar el mapa periódicamente
            if (window.clientMapInstance) {
                centrarMapaInterval = setInterval(() => {
                    if (window.clientMapInstance) {
                        const bounds = [];
                        if (data.lat && data.lng) bounds.push([data.lat, data.lng]);
                        if (window.clientMapMarkers.mech) {
                            const latlng = window.clientMapMarkers.mech.getLatLng();
                            if (latlng) bounds.push([latlng.lat, latlng.lng]);
                        }
                        if (bounds.length >= 2) {
                            window.clientMapInstance.fitBounds(bounds, { padding: [50, 50] });
                        } else if (bounds.length === 1) {
                            window.clientMapInstance.setView(bounds[0], 14);
                        }
                    }
                }, 3000); // Cada 3 segundos
            }
        } else {
            // Estados no mapeados
            if (mechanicMapDiv) mechanicMapDiv.style.display = 'none';
            if (videoContainer) videoContainer.style.display = 'block';
            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (routingControl) {
                routingControl.remove();
                routingControl = null;
            }
        }
    });
}
// ========== FIN DE listenToMySOS ==========

// ========== LISTEN TO MY DELIVERIES – ENTREGAS ACTIVAS ==========
function listenToMyDeliveries() {
    if (window._deliveryListener && typeof window._deliveryListener === 'function') {
        window._deliveryListener();
        window._deliveryListener = null;
    }
    if (!auth.currentUser) return;

    let mechPosUnsubscribe = null;
    let routingControl = null;

    window._deliveryListener = onValue(dbRef(rtdb, 'pedidos_online/' + auth.currentUser.uid), async (snap) => {
        const activeCard = document.getElementById('active-delivery-card');
        const noServicesMsg = document.getElementById('no-active-services-msg');
        const mechanicMapDiv = document.getElementById('delivery-live-map');
        const statusDesc = document.getElementById('delivery-status-desc-client');
        const progressBar = document.getElementById('delivery-progress-bar');
        const emergencyBtn = document.getElementById('emergency-client-btn');
        const chatBtn = document.getElementById('btn-chat-delivery');
        const deliveryBtn = document.querySelector('.c-nav-btn[onclick*="c-view-entregas"]');

        // Ocultar botón de entregas si no hay entrega activa
        if (!snap.exists() || !snap.val().estado_entrega || snap.val().estado_entrega === 'entregado') {
            if (activeCard) activeCard.classList.add('hidden');
            if (mechanicMapDiv) {
                mechanicMapDiv.classList.add('hidden');
                mechanicMapDiv.style.display = 'none';
            }
            if (chatBtn) chatBtn.classList.add('hidden');
            if (emergencyBtn) emergencyBtn.style.display = 'flex';
            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (routingControl) {
                routingControl.remove();
                routingControl = null;
            }
            if (deliveryBtn) deliveryBtn.style.display = 'none';
            window._lastDeliveryStatus = null;
            return;
        }

        // Mostrar botón de entregas
        if (deliveryBtn) deliveryBtn.style.display = 'flex';

        const data = snap.val();        
        // SI LA ENTREGA ESTÁ COMPLETADA
        if (data.estado_entrega === 'entregado') {
            if (activeCard) activeCard.classList.add('hidden');
            if (mechanicMapDiv) {
                mechanicMapDiv.classList.add('hidden');
                mechanicMapDiv.style.display = 'none';
            }
            if (chatBtn) chatBtn.classList.add('hidden');
            if (emergencyBtn) emergencyBtn.style.display = 'flex';
            if (mechPosUnsubscribe) mechPosUnsubscribe();
            if (routingControl) {
                routingControl.remove();
                routingControl = null;
            }
            if (window.clientMapInstance) {
                window.clientMapInstance.remove();
                window.clientMapInstance = null;
                window.clientMapMarkers = { mech: null, client: null, taller: null };
            }
            // Si no hay rescate activo, mostrar "Sin actividad"
            const sosActive = document.getElementById('active-sos-card');
            if (!sosActive || sosActive.classList.contains('hidden')) {
                if (noServicesMsg) noServicesMsg.classList.remove('hidden');
            }
            return;
        }

        // --- ENTREGA ACTIVA ---
        if (activeCard) activeCard.classList.remove('hidden');
        if (noServicesMsg) noServicesMsg.classList.add('hidden');

        // Mostrar mapa
        if (mechanicMapDiv) {
            mechanicMapDiv.classList.remove('hidden');
            mechanicMapDiv.style.display = 'block';
            mechanicMapDiv.style.height = '250px';
            mechanicMapDiv.style.minHeight = '250px';
        }

        // Ocultar botón emergencia
        if (emergencyBtn) emergencyBtn.style.display = 'none';

        // Chat button
        if (data.chatId) {
            if (chatBtn) chatBtn.classList.remove('hidden');
        } else {
            if (chatBtn) chatBtn.classList.add('hidden');
        }

        // Progreso
        let currentStep = 0, progressPercent = 0;
        if (data.estado_entrega === 'pendiente') { currentStep = 1; progressPercent = 33; }
        else if (data.estado_entrega === 'en_camino') { currentStep = 2; progressPercent = 66; }
        if (progressBar) progressBar.style.width = progressPercent + '%';

        // Actualizar pasos
        for (let i = 0; i < 3; i++) {
            const labelEl = document.getElementById('delivery-step-' + (i+1));
            const dotEl = document.getElementById('delivery-dot-' + (i+1));
            if (i < currentStep) {
                labelEl?.classList.add('text-green-400', 'font-bold');
                dotEl?.classList.remove('bg-asfalto', 'border-white/20');
                dotEl?.classList.add('bg-green-500', 'border-asfalto');
            } else {
                labelEl?.classList.remove('text-green-400', 'font-bold');
                dotEl?.classList.remove('bg-green-500', 'border-asfalto');
                dotEl?.classList.add('bg-asfalto', 'border-white/20');
            }
        }

        // Texto de estado
        if (statusDesc) {
            if (data.estado_entrega === 'pendiente') statusDesc.innerText = "Preparando entrega";
            else if (data.estado_entrega === 'en_camino') statusDesc.innerText = "Repartidor en camino";
            else statusDesc.innerText = "Estado desconocido";
        }

        // --- MAPA Y RUTA (similar a SOS pero con repartidor) ---
        if (data.estado_entrega === 'pendiente' || data.estado_entrega === 'en_camino') {
            const initClientMapIfNeeded = () => {
                if (!mechanicMapDiv) return;
                const rect = mechanicMapDiv.getBoundingClientRect();
                if (rect.height < 100) {
                    setTimeout(initClientMapIfNeeded, 300);
                    return;
                }
                if (!window.clientMapInstance) {
                    if (typeof initClientMap === 'function') initClientMap();
                } else {
                    window.clientMapInstance.invalidateSize();
                }
            };
            initClientMapIfNeeded();

            if (window.clientMapInstance && data.lat && data.lng) {
                // Marcador del cliente (destino)
                if (window.clientMapMarkers.client) window.clientMapInstance.removeLayer(window.clientMapMarkers.client);
                window.clientMapMarkers.client = L.marker([data.lat, data.lng], {
                    icon: L.divIcon({
                        className: 'gps-pulse-marker',
                        html: '<div class="pulse-inner" style="background:#FF6B00; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white;"><i class="fas fa-map-marker-alt" style="color:white; font-size:14px;"></i></div>',
                        iconSize: [28, 28],
                        iconAnchor: [14, 28]
                    })
                }).addTo(window.clientMapInstance).bindPopup("📍 Tu destino");

                // Suscripción a la posición del repartidor
                if (mechPosUnsubscribe) mechPosUnsubscribe();
                if (data.repartidor_uid) {
                    const repartidorSnap = await getDoc(doc(db, "users", data.repartidor_uid));
                    const repartidorData = repartidorSnap.exists() ? repartidorSnap.data() : { name: 'Repartidor', phone: '' };
                    const telefono = repartidorData.phone || '';
                    const telefonoClean = telefono.replace('+52', '');
                    const nombre = repartidorData.name || 'Repartidor';

                    const popupContent = `
                        <div style="font-size:12px; font-family:sans-serif; min-width:220px; background:${document.body.classList.contains('light-mode') ? '#ffffff' : '#1A1A1A'}; color:${document.body.classList.contains('light-mode') ? '#111111' : '#ffffff'}; border-radius:16px; padding:10px; border:1px solid #FF6B00;">
                            <b>${escapeHtml(nombre)}</b><br>
                            ${telefono ? `📞 ${escapeHtml(telefono)}<br>` : ''}
                            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                                ${telefonoClean ? `<button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">📞 Llamar</button>` : ''}
                                ${telefonoClean ? `<button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">💬 WhatsApp</button>` : ''}
                            </div>
                        </div>
                    `;

                    mechPosUnsubscribe = onValue(dbRef(rtdb, `mecanicos_activos/${data.repartidor_uid}`), (posSnap) => {
                        if (posSnap.exists() && window.clientMapInstance) {
                            const pos = posSnap.val();
                            if (pos.lat && pos.lng) {
                                if (window.clientMapMarkers.mech) {
                                    window.clientMapMarkers.mech.setLatLng([pos.lat, pos.lng]);
                                    window.clientMapMarkers.mech.setPopupContent(popupContent);
                                } else {
                                    window.clientMapMarkers.mech = L.marker([pos.lat, pos.lng], {
                                        icon: L.divIcon({
                                            className: 'mech-pulse-marker',
                                            html: '<div class="pulse-inner" style="background:#22c55e; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white;"><i class="fas fa-truck" style="color:white; font-size:16px;"></i></div>',
                                            iconSize: [32, 32],
                                            iconAnchor: [16, 32]
                                        })
                                    }).addTo(window.clientMapInstance).bindPopup(popupContent);
                                }

                                window.clientMapInstance.setView([pos.lat, pos.lng], 14);

                                // Ruta
                                if (routingControl) {
                                    routingControl.setWaypoints([
                                        L.latLng(pos.lat, pos.lng),
                                        L.latLng(data.lat, data.lng)
                                    ]);
                                } else {
                                    try {
                                        routingControl = L.Routing.control({
                                            waypoints: [
                                                L.latLng(pos.lat, pos.lng),
                                                L.latLng(data.lat, data.lng)
                                            ],
                                            routeWhileDragging: false,
                                            language: 'es',
                                            showAlternatives: false,
                                            show: false,
                                            collapsible: false,
                                            lineOptions: { styles: [{ color: '#22c55e', weight: 6, opacity: 0.9 }] },
                                            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
                                            createMarker: () => null
                                        }).addTo(window.clientMapInstance);
                                        setTimeout(() => { if (window.clientMapInstance) window.clientMapInstance.invalidateSize(); }, 200);
                                    } catch (e) { console.warn('Error al crear routing control:', e); }
                                }
                            }
                        }
                    });
                }

                // Ajustar límites
                const bounds = [];
                if (data.lat && data.lng) bounds.push([data.lat, data.lng]);
                if (window.clientMapMarkers.mech) {
                    const latlng = window.clientMapMarkers.mech.getLatLng();
                    if (latlng) bounds.push([latlng.lat, latlng.lng]);
                }
                if (bounds.length >= 2) {
                    window.clientMapInstance.fitBounds(bounds, { padding: [50, 50] });
                } else if (bounds.length === 1) {
                    window.clientMapInstance.setView(bounds[0], 14);
                }
            }
        }

        window._lastDeliveryStatus = data.estado_entrega;
    });
}
// ========== FIN DE listenToMyDeliveries ==========

// ============================================================
//  SECCIÓN RETENES (mapa colaborativo con votación)
// ============================================================

// Variables globales de la sección RETENES
let retenesMapInstance = null;
let retenesMarkers = {};
let retenesUnsubscribe = null;

// Variables para la selección de ubicación en el mapa (modal)
let seleccionLat = null;
let seleccionLng = null;
let mapaSeleccion = null;
let marcadorSeleccion = null;

// ---------- RENDERIZADO DEL MAPA ----------
window.renderRetenMap = async (isAdmin = false) => {
    const containerId = isAdmin ? 'admin-retenes-map-container' : 'retenes-map-container';
    const mapEl = document.getElementById(containerId);
    if (!mapEl) {
        console.error('❌ Contenedor del mapa no encontrado:', containerId);
        return;
    }

    // Asegurar altura mínima
    mapEl.style.height = isAdmin ? '500px' : 'calc(100vh - 140px)';
    mapEl.style.width = '100%';
    

    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    if (!retenesMapInstance) {
        retenesMapInstance = L.map(mapEl, { 
            zoomControl: true, 
            attributionControl: false 
        }).setView([TALLER_LAT, TALLER_LNG], 14);
        
        L.tileLayer(layerUrl, { 
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>' 
        }).addTo(retenesMapInstance);

        // Control de ubicación (mira para centrar)
        const locateControl = L.control.locate({
            position: 'bottomright',
            strings: { title: 'Centrar en mi ubicación' },
            locateOptions: { enableHighAccuracy: true, maxZoom: 16, timeout: 10000 }
        }).addTo(retenesMapInstance);
        
        locateControl.on('locationfound', (e) => {
            retenesMapInstance.setView(e.latlng, 16);
        });
        
        setTimeout(() => { 
            locateControl.start(); 
        }, 500);
    } else {
        // Actualizar capa base
        retenesMapInstance.eachLayer(layer => {
            if (layer instanceof L.TileLayer) retenesMapInstance.removeLayer(layer);
        });
        L.tileLayer(layerUrl, { 
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>' 
        }).addTo(retenesMapInstance);
        retenesMapInstance.invalidateSize();
        retenesMapInstance.setView([TALLER_LAT, TALLER_LNG], 14);
    }

    // Limpiar marcadores anteriores
    Object.values(retenesMarkers).forEach(m => {
        if (retenesMapInstance && m && m.remove) m.remove();
    });
    retenesMarkers = {};

    // Cargar datos de Firestore (solo activos)
    if (retenesUnsubscribe) retenesUnsubscribe();
    const q = query(collection(db, "retenes"), where("status", "==", "active"), orderBy("timestamp", "desc"));
    retenesUnsubscribe = onSnapshot(q, (snap) => {
        const allBounds = [];
        snap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            allBounds.push([data.lat, data.lng]);
            crearMarcadorReten(data, isAdmin);
        });

        // Ajustar límites del mapa para ver todos los retenes
        if (allBounds.length > 0 && !retenesMapInstance._locate) {
            const bounds = L.latLngBounds(allBounds);
            retenesMapInstance.fitBounds(bounds, { padding: [50, 50] });
        }

        if (isAdmin) cargarListaRetenesAdmin();
    });
};

// ---------- CREAR MARCADOR CON TORRETA POLICIAL ----------
function crearMarcadorReten(data, isAdmin) {
    const marker = L.marker([data.lat, data.lng], {
        icon: L.divIcon({
            className: 'police-siren-icon',
            html: `
                <img src="https://www.gifsanimados.org/data/media/930/luz-y-sirena-de-policia-imagen-animada-0008.gif" 
                     alt="Torreta policial" 
                     style="width:50px; height:50px; object-fit:contain; display:block;"
                     onerror="this.src='https://via.placeholder.com/50/FF6B00/FFFFFF?text=🚨'">
            `
        })
    }).addTo(retenesMapInstance);

    let popupContent = `
        <div style="min-width:200px; text-align:center; font-family:sans-serif;">
            <p class="font-bold text-naranja" style="font-weight:800; color:#FF6B00;">🚨 Retén</p>
            <p class="text-xs text-gray-500" style="font-size:12px; color:#888;">${new Date(data.timestamp).toLocaleString()}</p>`;

    if (data.descripcionUbicacion) {
        popupContent += `<p class="text-xs font-semibold text-white" style="font-size:12px;">📍 ${escapeHtml(data.descripcionUbicacion)}</p>`;
    }

    if (data.imageUrl) {
        popupContent += `
            <div class="police-light-box" style="margin:10px auto;">
                <img src="${data.imageUrl}" style="max-width:180px; max-height:180px; border-radius:8px; display:block; margin:0 auto;">
            </div>`;
    } else {
        popupContent += `<p class="text-xs text-gray-400 italic" style="font-size:12px; color:#aaa;">Sin imagen</p>`;
    }

    // Si es admin: botones eliminar/editar
    if (isAdmin) {
        popupContent += `
            <div class="flex gap-2 mt-2" style="display:flex; gap:8px; margin-top:8px;">
                <button onclick="window.eliminarReten('${data.id}')" 
                        style="background:#dc2626; color:white; border:none; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; cursor:pointer;">
                    Eliminar
                </button>
                <button onclick="window.editarReten('${data.id}')" 
                        style="background:#2563eb; color:white; border:none; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; cursor:pointer;">
                    Editar
                </button>
            </div>`;
    } else {
        // Cliente: verificar si ha pasado 1 hora y votación
        const elapsed = Date.now() - data.timestamp;
        if (elapsed > 3600000) { // 1 hora
            const uid = auth.currentUser.uid;
            const yaVotoNO = data.negativeVotes && data.negativeVotes.includes(uid);
            if (!yaVotoNO) {
                popupContent += `
                    <p class="text-xs text-red-500 font-bold mt-2" style="font-size:12px; color:#ef4444; font-weight:700; margin-top:8px;">
                        ⚠️ Este retén tiene más de 1 hora.
                    </p>
                    <p class="text-xs font-bold mt-1" style="font-size:12px; font-weight:700;">¿El retén continúa?</p>
                    <div class="flex gap-2 mt-2" style="display:flex; gap:8px; margin-top:8px;">
                        <button onclick="window.votarReten('${data.id}', 'si')" 
                                style="background:#22c55e; color:white; border:none; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; cursor:pointer;">
                            SI
                        </button>
                        <button onclick="window.votarReten('${data.id}', 'no')" 
                                style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; cursor:pointer;">
                            NO
                        </button>
                        <button onclick="window.votarReten('${data.id}', 'desconozco')" 
                                style="background:#9ca3af; color:white; border:none; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:bold; cursor:pointer;">
                            DESCONOZCO
                        </button>
                    </div>`;
            } else {
                popupContent += `<p class="text-xs text-gray-400 mt-2" style="font-size:12px; color:#aaa; margin-top:8px;">✅ Ya votaste NO en este retén.</p>`;
            }
        }
    }

    marker.bindPopup(popupContent);
    retenesMarkers[data.id] = marker;
}

// ---------- VOTACIÓN ----------
window.votarReten = async (retenId, voto) => {
    const snap = await getDoc(doc(db, "retenes", retenId));
    if (!snap.exists()) return showToast("Retén no encontrado", true);
    const data = snap.data();
    const uid = auth.currentUser.uid;

    if (voto === 'si') {
        // Renovar retén (actualizar timestamp)
        await updateDoc(doc(db, "retenes", retenId), { timestamp: Date.now() });
        showToast("✅ Retén renovado por 1 hora más.");
    } else if (voto === 'no') {
        const votes = data.negativeVotes || [];
        if (votes.includes(uid)) return showToast("Ya votaste NO", true);
        votes.push(uid);
        // Si alcanza 4 o más NO, eliminar el retén
        if (votes.length >= 4) {
            // Eliminar imagen de Storage si existe
            if (data.imageUrl) {
                try {
                    const imageRef = sRef(storage, data.imageUrl);
                    await deleteObject(imageRef);
                } catch (e) { console.warn("No se pudo eliminar la imagen:", e); }
            }
            await deleteDoc(doc(db, "retenes", retenId));
            showToast("🚫 Retén eliminado por múltiples votos NO.");
        } else {
            await updateDoc(doc(db, "retenes", retenId), { negativeVotes: votes });
            showToast(`🚫 Voto NO registrado (${votes.length}/4)`);
        }
    } else if (voto === 'desconozco') {
        showToast("⚠️ Retén sin cambios. Seguirá visible.");
    }
    // Refrescar el mapa
    renderRetenMap(false);
};

// ---------- CREAR RETÉN (MODAL) ----------
window.abrirFormularioReten = () => {
    const modal = document.getElementById('modal-crear-reten');
    if (!modal) return;
    document.getElementById('reten-evidencia').value = '';
    document.getElementById('reten-descripcion-ubicacion').value = '';
    // Reiniciar variables de selección
    seleccionLat = null;
    seleccionLng = null;
    if (mapaSeleccion) {
        mapaSeleccion.remove();
        mapaSeleccion = null;
        marcadorSeleccion = null;
    }
    // Mostrar paso 1, ocultar paso 2 y 3
    document.getElementById('modal-crear-reten-paso-1').classList.remove('hidden');
    document.getElementById('modal-crear-reten-paso-2').classList.add('hidden');
    document.getElementById('modal-crear-reten-paso-3').classList.add('hidden');
    toggleModal('modal-crear-reten', true);
};

// ---------- INICIALIZAR MAPA DE SELECCIÓN ----------
function initMapaSeleccion() {
    const container = document.getElementById('mapa-seleccion-reten');
    if (!container) return;
    if (mapaSeleccion) {
        mapaSeleccion.invalidateSize();
        return;
    }
    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    
    mapaSeleccion = L.map(container, { 
        zoomControl: false, 
        attributionControl: false 
    }).setView([TALLER_LAT, TALLER_LNG], 15);
    
    L.tileLayer(layerUrl, { 
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>' 
    }).addTo(mapaSeleccion);
    
    // Marcador inicial en el centro
    marcadorSeleccion = L.marker([TALLER_LAT, TALLER_LNG], { 
        draggable: true 
    }).addTo(mapaSeleccion);
    
    // Actualizar coordenadas al mover el marcador
    marcadorSeleccion.on('dragend', function() {
        const pos = marcadorSeleccion.getLatLng();
        seleccionLat = pos.lat;
        seleccionLng = pos.lng;
        document.getElementById('coordenadas-seleccionadas').innerText = `Lat: ${seleccionLat.toFixed(4)}, Lng: ${seleccionLng.toFixed(4)}`;
    });
    
    // También permitir clic en el mapa para mover el marcador
    mapaSeleccion.on('click', function(e) {
        const pos = e.latlng;
        seleccionLat = pos.lat;
        seleccionLng = pos.lng;
        marcadorSeleccion.setLatLng(pos);
        document.getElementById('coordenadas-seleccionadas').innerText = `Lat: ${seleccionLat.toFixed(4)}, Lng: ${seleccionLng.toFixed(4)}`;
    });
    
    setTimeout(() => { 
        if (mapaSeleccion) mapaSeleccion.invalidateSize(); 
    }, 200);
}

// ---------- EVENTOS DE BOTONES DEL MODAL ----------
document.addEventListener('click', function(e) {
    // Botón "Seleccionar en el mapa"
    if (e.target.id === 'btn-seleccionar-ubicacion-mapa') {
        document.getElementById('modal-crear-reten-paso-1').classList.add('hidden');
        document.getElementById('modal-crear-reten-paso-2').classList.remove('hidden');
        setTimeout(initMapaSeleccion, 300);
    }
    
    // Botón "Confirmar punto"
    if (e.target.id === 'btn-confirmar-punto-reten') {
        if (seleccionLat === null || seleccionLng === null) {
            window.showToast('Mueve el marcador o haz clic en el mapa para seleccionar un punto.', true);
            return;
        }
        document.getElementById('modal-crear-reten-paso-2').classList.add('hidden');
        document.getElementById('modal-crear-reten-paso-3').classList.remove('hidden');
        // Mostrar coordenadas en el paso 3
        const contenedorExacta = document.getElementById('reten-ubicacion-exacta-container');
        if (contenedorExacta) {
            const p = contenedorExacta.querySelector('p');
            if (p) {
                p.innerText = `📍 Ubicación seleccionada: Lat ${seleccionLat.toFixed(4)}, Lng ${seleccionLng.toFixed(4)}`;
            }
        }
    }
    
    // Botón "Cancelar selección"
    if (e.target.id === 'btn-cancelar-seleccion-reten') {
        document.getElementById('modal-crear-reten-paso-2').classList.add('hidden');
        document.getElementById('modal-crear-reten-paso-1').classList.remove('hidden');
        seleccionLat = null;
        seleccionLng = null;
        if (mapaSeleccion) {
            mapaSeleccion.remove();
            mapaSeleccion = null;
            marcadorSeleccion = null;
        }
    }
});

// ---------- PROCESAR CREAR RETÉN ----------
window.procesarCrearReten = async function() {
    // Validar que se haya seleccionado una ubicación
    if (seleccionLat === null || seleccionLng === null) {
        window.showToast("Selecciona una ubicación en el mapa primero.", true);
        return;
    }
    
    const descripcionUbicacion = document.getElementById('reten-descripcion-ubicacion').value.trim();
    const fileInput = document.getElementById('reten-evidencia');
    let imageUrl = null;
    
    // Subir imagen si existe
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const compressed = await window.compressImage(file);
        imageUrl = await uploadWithTimeout(compressed, `retenes/${auth.currentUser.uid}/${Date.now()}.jpg`);
    }
    
    // Guardar en Firestore
    await addDoc(collection(db, "retenes"), {
        uid: auth.currentUser.uid,
        lat: seleccionLat,
        lng: seleccionLng,
        descripcionUbicacion: descripcionUbicacion || null,
        timestamp: Date.now(),
        imageUrl: imageUrl,
        negativeVotes: [],
        status: 'active'
    });
    
    // Limpiar variables y cerrar modal
    seleccionLat = null;
    seleccionLng = null;
    if (mapaSeleccion) {
        mapaSeleccion.remove();
        mapaSeleccion = null;
        marcadorSeleccion = null;
    }
    
    toggleModal('modal-crear-reten', false);
    window.showToast("✅ Retén creado correctamente.");
    window.renderRetenMap(false);
};

// ---------- ADMIN: LISTA DE RETENES ----------
window.cargarListaRetenesAdmin = async () => {
    const container = document.getElementById('admin-retenes-list');
    if (!container) return;
    const snap = await getDocs(collection(db, "retenes"));
    container.innerHTML = '';
    snap.forEach(doc => {
        const data = doc.data();
        container.innerHTML += `
            <div class="bg-white/5 p-3 rounded-xl border border-yellow-500/30 hover:bg-white/10 cursor-pointer" 
                 onclick="window.focusRetenAdmin('${doc.id}', ${data.lat}, ${data.lng})">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm text-yellow-400">🚨 ${new Date(data.timestamp).toLocaleString()}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-gray-600/50 text-gray-300">${data.negativeVotes?.length || 0} votos NO</span>
                </div>
                <p class="text-xs text-gray-400 truncate">Lat: ${data.lat.toFixed(4)}, Lng: ${data.lng.toFixed(4)}</p>
            </div>`;
    });
};

window.focusRetenAdmin = (id, lat, lng) => {
    if (retenesMapInstance) {
        retenesMapInstance.setView([lat, lng], 16);
        if (retenesMarkers[id]) {
            retenesMarkers[id].openPopup();
        }
    }
};

window.eliminarReten = async (retenId) => {
    if (confirm("¿Eliminar este retén permanentemente?")) {
        const snap = await getDoc(doc(db, "retenes", retenId));
        if (snap.exists() && snap.data().imageUrl) {
            try {
                const imageRef = sRef(storage, snap.data().imageUrl);
                await deleteObject(imageRef);
            } catch (e) { console.warn("No se pudo eliminar la imagen:", e); }
        }
        await deleteDoc(doc(db, "retenes", retenId));
        showToast("Retén eliminado");
        renderRetenMap(true);
    }
};

window.editarReten = (retenId) => {
    window.promptModal("Editar retén (ID):", retenId, (newId) => {
        showToast("Edición no implementada aún");
    });
};


    window.submitDeliverySurvey = async () => {
    // Similar a submitSurvey pero para entregas
    const rating = window.currentDeliveryRating || 5;
    const comments = document.getElementById('delivery-survey-comments')?.value.trim() || '';
    // Guardar en Firestore con tipo 'entrega'
    await addDoc(collection(db, "satisfaction"), {
        uid: auth.currentUser.uid,
        rating: rating,
        comments: comments,
        tipo: 'entrega',
        timestamp: Date.now()
    });
    // Cerrar encuesta y mostrar mensaje
};



window.abrirChatSOS = async () => {
    if (window._sosChatId) {
        window.openChat(window._sosChatId);
        return;
    }
    if (!window.currentSOSId) {
        // Buscar el SOS activo del usuario
        const snap = await getDocs(query(collection(db, "rescates"), where("uid", "==", auth.currentUser.uid), where("status", "in", ["accepted", "repairing", "to_shop", "ready"]), limit(1)));
        if (snap.empty) {
            window.showToast("No tienes un servicio activo con chat disponible.", true);
            return;
        }
        const data = snap.docs[0].data();
        window.currentSOSId = snap.docs[0].id;
        if (data.chatId) {
            window._sosChatId = data.chatId;
            window.openChat(data.chatId);
        } else {
            window.showToast("Aún no hay chat disponible. Espera a que el taller asigne el servicio.", true);
        }
    } else {
        const snap = await getDoc(doc(db, "rescates", window.currentSOSId));
        if (snap.exists() && snap.data().chatId) {
            window._sosChatId = snap.data().chatId;
            window.openChat(window._sosChatId);
        } else {
            window.showToast("Aún no hay chat disponible. Espera a que el taller asigne el servicio.", true);
        }
    }
};
// ===== Funciones globales que estaban mal ubicadas dentro de listenToMySOS =====
window.openSOSDetailClient = function() {};

window.setRating = (rating) => {
    window.currentRating = rating;
    const stars = document.querySelectorAll('#star-rating i');
    stars.forEach(star => {
        const val = parseFloat(star.getAttribute('data-value'));
        if (val <= rating) {
            star.className = 'fas fa-star';
        } else if (val - 0.5 === rating) {
            star.className = 'fas fa-star-half-alt';
        } else {
            star.className = 'far fa-star';
        }
    });
    document.getElementById('survey-comments').classList.toggle('hidden', rating >= 3);
};

// Manejar hover y clic
// Manejar hover y clic con división de media estrella
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('star-rating');
    if (!container) return;

    // Mouseover: mostrar vista previa de la calificación
    container.addEventListener('mouseover', (e) => {
        const star = e.target.closest('i');
        if (!star) return;
        const rect = star.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const val = parseFloat(star.getAttribute('data-value'));
        // Si el mouse está en la mitad izquierda, contar como media estrella
        const hoverRating = x < rect.width / 2 ? val - 0.5 : val;

        const stars = container.querySelectorAll('i');
        stars.forEach(s => {
            const sVal = parseFloat(s.getAttribute('data-value'));
            if (sVal <= hoverRating) {
                s.className = 'fas fa-star';
            } else if (sVal - 0.5 === hoverRating) {
                s.className = 'fas fa-star-half-alt';
            } else {
                s.className = 'far fa-star';
            }
        });
    });

    // Mouseout: restaurar la calificación actual
    container.addEventListener('mouseout', () => {
        if (window.currentRating) {
            window.setRating(window.currentRating);
        } else {
            container.querySelectorAll('i').forEach(s => s.className = 'far fa-star');
        }
    });

    // Click: asignar la calificación definitiva
    container.addEventListener('click', (e) => {
        const star = e.target.closest('i');
        if (!star) return;
        const rect = star.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const val = parseFloat(star.getAttribute('data-value'));
        // Si el clic es en la mitad izquierda, asignar media estrella
        const newRating = x < rect.width / 2 ? val - 0.5 : val;
        window.setRating(newRating);
    });
});

window.submitSurvey = async () => {
    if (!window.currentRating) return showToast("Selecciona una calificación", true);
    const comments = document.getElementById('survey-comments').value.trim();
    if (window.currentRating < 3 && !comments) return showToast("¿Qué mejorarías?", true);

    // Obtener shortId del servicio completado
    const snap = await getDocs(query(collection(db, "rescates"), 
        where("uid", "==", auth.currentUser.uid), 
        where("status", "==", "completed"), 
        orderBy("timestamp", "desc"), 
        limit(1)
    ));
    let shortId = 'unknown';
    if (!snap.empty) {
        shortId = snap.docs[0].data().shortId || 'unknown';
    }

    // Guardar en Firestore
    await addDoc(collection(db, "satisfaction"), {
        uid: auth.currentUser.uid,
        rating: window.currentRating,
        comments,
        timestamp: Date.now(),
        shortId: shortId,
        estado: 'completada',
        mechName: window.currentUserDoc?.name || 'Mecánico'
    });

    // ✅ Guardar en localStorage para NO mostrar la encuesta nuevamente
    localStorage.setItem('calificado_' + shortId, 'true');
    localStorage.removeItem('encuesta_cancelada_' + shortId);
    
     await remove(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid));

    document.getElementById('satisfaction-survey').classList.add('hidden');
    document.getElementById('no-active-services-msg').classList.remove('hidden');
    showToast("¡Gracias!");
};

window.cancelSurvey = async () => {
    // Obtener shortId del servicio completado
    const snap = await getDocs(query(collection(db, "rescates"), 
        where("uid", "==", auth.currentUser.uid), 
        where("status", "==", "completed"), 
        orderBy("timestamp", "desc"), 
        limit(1)
    ));
    let shortId = 'unknown';
    if (!snap.empty) {
        shortId = snap.docs[0].data().shortId || 'unknown';
    }

    // Guardar en Firestore con rating 5 y comentario de cancelación
    await addDoc(collection(db, "satisfaction"), {
        uid: auth.currentUser.uid,
        rating: 5,
        comments: 'El usuario canceló la encuesta. Se asigna calificación máxima automáticamente.',
        timestamp: Date.now(),
        shortId: shortId,
        estado: 'cancelada',
        mechName: window.currentUserDoc?.name || 'Mecánico'
    });

    // ✅ Guardar en localStorage para no volver a mostrar
    localStorage.setItem('calificado_' + shortId, 'true');
    localStorage.setItem('encuesta_cancelada_' + shortId, 'true');

     await remove(dbRef(rtdb, 'sos_alerts/' + auth.currentUser.uid));

    document.getElementById('satisfaction-survey').classList.add('hidden');
    document.getElementById('no-active-services-msg').classList.remove('hidden');
    showToast("Encuesta cancelada. Se asignó calificación de 5 estrellas.");
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

// ======================================================
// === INGRESO DE MOTO AL TALLER CON CHECKLIST PROFESIONAL ===
// ======================================================
let tempEvidencias = {}; // { 'espejos': { texto, fotos:[] }, ... }
// Variables para canvas de daños
let canvasPuntos = []; // almacena { x, y, zona, timestamp }
let canvasCtx = null;
let canvasImagen = null;

// Función para dibujar la silueta base (líneas)
function dibujarSiluetaMoto(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#FF6B00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Ejemplo de líneas (ajusta según tu diseño real)
    // Estas líneas son ilustrativas, debes ajustar las coordenadas a tu canvas real
    ctx.moveTo(width*0.2, height*0.2);
    ctx.lineTo(width*0.4, height*0.1);
    ctx.lineTo(width*0.6, height*0.1);
    ctx.lineTo(width*0.8, height*0.2);
    ctx.lineTo(width*0.8, height*0.8);
    ctx.lineTo(width*0.6, height*0.9);
    ctx.lineTo(width*0.4, height*0.9);
    ctx.lineTo(width*0.2, height*0.8);
    ctx.closePath();
    ctx.stroke();
    // Dibujar ejes o zonas (opcional)
}

// Inicializar canvas cuando se abre el modal
function inicializarCanvasDaños() {
    const canvas = document.getElementById('motoCanvas');
    if (!canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    canvasCtx = canvas.getContext('2d');
    // Cargar imagen de fondo? Si no, dibujar silueta
    dibujarSiluetaMoto(canvasCtx, canvas.width, canvas.height);
    
    // Dibujar puntos guardados
    canvasPuntos.forEach(p => {
        canvasCtx.fillStyle = '#FF6B00';
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
        canvasCtx.fill();
        canvasCtx.fillStyle = 'white';
        canvasCtx.font = 'bold 12px sans-serif';
        canvasCtx.fillText(p.zona, p.x-10, p.y-8);
    });
    
    // Evento click/touch
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        // Determinar zona basada en coordenadas (ejemplo simplificado)
        let zona = '';
        if (canvasX < canvas.width/3) zona = 'Lado izquierdo';
        else if (canvasX > 2*canvas.width/3) zona = 'Lado derecho';
        else if (canvasY < canvas.height/3) zona = 'Frente';
        else if (canvasY > 2*canvas.height/3) zona = 'Detrás';
        else zona = 'Centro';
        canvasPuntos.push({ x: canvasX, y: canvasY, zona, timestamp: Date.now() });
        // Redibujar
        dibujarSiluetaMoto(canvasCtx, canvas.width, canvas.height);
        canvasPuntos.forEach(p => {
            canvasCtx.fillStyle = '#FF6B00';
            canvasCtx.beginPath();
            canvasCtx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
            canvasCtx.fill();
            canvasCtx.fillStyle = 'white';
            canvasCtx.font = 'bold 10px sans-serif';
            canvasCtx.fillText(p.zona, p.x-12, p.y-8);
        });
        actualizarListaPuntos();
    });
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (touch.clientX - rect.left) * scaleX;
        const canvasY = (touch.clientY - rect.top) * scaleY;
        let zona = '';
        if (canvasX < canvas.width/3) zona = 'Lado izquierdo';
        else if (canvasX > 2*canvas.width/3) zona = 'Lado derecho';
        else if (canvasY < canvas.height/3) zona = 'Frente';
        else if (canvasY > 2*canvas.height/3) zona = 'Detrás';
        else zona = 'Centro';
        canvasPuntos.push({ x: canvasX, y: canvasY, zona, timestamp: Date.now() });
        dibujarSiluetaMoto(canvasCtx, canvas.width, canvas.height);
        canvasPuntos.forEach(p => {
            canvasCtx.fillStyle = '#FF6B00';
            canvasCtx.beginPath();
            canvasCtx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
            canvasCtx.fill();
            canvasCtx.fillStyle = 'white';
            canvasCtx.font = 'bold 10px sans-serif';
            canvasCtx.fillText(p.zona, p.x-12, p.y-8);
        });
        actualizarListaPuntos();
    });
    document.getElementById('borrarPuntosCanvas')?.addEventListener('click', () => {
        canvasPuntos = [];
        dibujarSiluetaMoto(canvasCtx, canvas.width, canvas.height);
        actualizarListaPuntos();
    });
}

function actualizarListaPuntos() {
    const container = document.getElementById('puntosMarcados');
    if (!container) return;
    container.innerHTML = '';
    canvasPuntos.forEach((p, idx) => {
        const chip = document.createElement('span');
        chip.className = 'bg-naranja/30 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1';
        chip.innerHTML = `${p.zona} <button data-idx="${idx}" class="remove-punto ml-1 text-red-300 font-bold">✕</button>`;
        chip.querySelector('.remove-punto').onclick = () => {
            canvasPuntos.splice(idx, 1);
            inicializarCanvasDaños(); // redibujar
        };
        container.appendChild(chip);
    });
}

// Llamar a inicializarCanvasDaños cuando se abre el modal
// Dentro de window.abrirModalIngresoServicio, al final, añadir:
// setTimeout(() => inicializarCanvasDaños(), 100);
// Función para abrir el modal (primero valida teléfono)
window.abrirModalIngresoServicio = () => {
    // Limpiar variables
    tempEvidencias = {};
    // Resetear formulario
    const phoneInput = document.getElementById('checklist-phone');
    if (phoneInput) phoneInput.value = '';
    const marca = document.getElementById('checklist-marca');
    if (marca) marca.value = '';
    const modelo = document.getElementById('checklist-modelo');
    if (modelo) modelo.value = '';
    const anio = document.getElementById('checklist-anio');
    if (anio) anio.value = '';
    const cilindraje = document.getElementById('checklist-cilindraje');
    if (cilindraje) cilindraje.value = '';
    const cuadro = document.getElementById('checklist-cuadro');
    if (cuadro) cuadro.value = '';
    const rayaduras = document.getElementById('checklist-rayaduras');
    if (rayaduras) rayaduras.value = '';
    const observaciones = document.getElementById('checklist-observaciones');
    if (observaciones) observaciones.value = '';
    const bateria = document.getElementById('checklist-bateria');
    if (bateria) bateria.value = '';
    const combustible = document.getElementById('checklist-combustible');
    if (combustible) combustible.value = '';
    // Resetear radios
    document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
    // Ocultar todos los paneles de daño
    document.querySelectorAll('[id^="damage-"]').forEach(div => div.classList.add('hidden'));
    // Limpiar previsualizaciones
    document.querySelectorAll('.evidencia-preview').forEach(div => div.innerHTML = '');
    
    // Registrar eventos para mostrar/ocultar paneles de daño (si no están ya asignados)
    document.querySelectorAll('input[type="radio"][data-damage]').forEach(radio => {
        radio.removeEventListener('change', window.toggleDamagePanel);
        radio.addEventListener('change', window.toggleDamagePanel);
    });
    document.querySelectorAll('.btn-evidencia').forEach(btn => {
        btn.removeEventListener('click', window.handleEvidenciaClick);
        btn.addEventListener('click', window.handleEvidenciaClick);
    });
    
    toggleModal('modal-checklist-ingreso', true);
};

// Mostrar/ocultar panel de daño según selección
window.toggleDamagePanel = (e) => {
    const radio = e.target;
    const targetId = radio.getAttribute('data-damage');
    const panel = document.getElementById(`damage-${targetId}`);
    if (radio.value === 'no' && radio.checked) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
        // Limpiar datos de evidencia de ese ítem
        if (tempEvidencias[targetId]) delete tempEvidencias[targetId];
        const preview = panel.querySelector('.evidencia-preview');
        if (preview) preview.innerHTML = '';
    }
};

// Manejar clic en botón de subir evidencia
window.handleEvidenciaClick = (e) => {
    const btn = e.currentTarget;
    const target = btn.getAttribute('data-target');
    const textarea = document.querySelector(`#damage-${target} textarea`);
    const comentario = textarea ? textarea.value : '';
    // Crear input file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        const compressed = await window.compressImage(file);
        const reader = new FileReader();
        reader.onload = (event) => {
            const imgData = event.target.result;
            if (!tempEvidencias[target]) tempEvidencias[target] = { texto: comentario, fotos: [] };
            tempEvidencias[target].texto = comentario;
            tempEvidencias[target].fotos.push(imgData);
            // Mostrar previsualización
            const previewDiv = document.querySelector(`#damage-${target} .evidencia-preview`);
            if (!previewDiv) return;
            const imgDiv = document.createElement('div');
            imgDiv.className = 'relative inline-block mr-2 mb-2';
            imgDiv.innerHTML = `
                <img src="${imgData}" class="w-16 h-16 object-cover rounded-lg border border-white/10">
                <button type="button" class="remove-evidencia absolute -top-2 -right-2 bg-red-600 rounded-full w-5 h-5 text-white text-xs">×</button>
            `;
            imgDiv.querySelector('.remove-evidencia').onclick = () => {
                const index = tempEvidencias[target].fotos.indexOf(imgData);
                if (index !== -1) tempEvidencias[target].fotos.splice(index, 1);
                imgDiv.remove();
                if (tempEvidencias[target].fotos.length === 0 && !tempEvidencias[target].texto) delete tempEvidencias[target];
            };
            previewDiv.appendChild(imgDiv);
        };
        reader.readAsDataURL(compressed);
    };
    input.click();
};

// Función para crear usuario si no existe
async function asegurarUsuario(phoneNumber) {
    if (!phoneNumber || phoneNumber.length !== 10) throw new Error("Teléfono inválido");
    const fullPhone = "+52" + phoneNumber;
    const q = query(collection(db, "users"), where("phone", "==", fullPhone), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const userDoc = snap.docs[0];
        return { uid: userDoc.id, userData: userDoc.data(), created: false };
    } else {
        // Crear usuario en Authentication y Firestore
        const fakeEmail = `${phoneNumber}@motorescateobr.com`;
        let userCredential;
        try {
            userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, "123456");
        } catch (e) {
            if (e.code === 'auth/email-already-in-use') {
                // Si ya existe en Auth pero no en Firestore, lo recuperamos
                userCredential = await signInWithEmailAndPassword(auth, fakeEmail, "123456");
            } else throw e;
        }
        const uid = userCredential.user.uid;
        const userData = {
            phone: fullPhone,
            name: `Cliente ${phoneNumber}`,
            role: 'cliente',
            pwd: '123456',
            firstLogin: true,
            created: Date.now()
        };
        await setDoc(doc(db, "users", uid), userData);
        return { uid, userData, created: true };
    }
}

// Guardar checklist y crear el servicio
window.guardarChecklistIngreso = async () => {
    // 1. Teléfono obligatorio y creación de usuario
    const phone = document.getElementById('checklist-phone').value.trim();
    if (!phone || phone.length !== 10) {
        showToast("El teléfono del cliente es obligatorio (10 dígitos)", true);
        return;
    }
    let cliente;
    try {
        cliente = await asegurarUsuario(phone);
    } catch (e) {
        showToast("Error al verificar/crear usuario: " + e.message, true);
        return;
    }

    // 2. Datos básicos de la moto (incluyendo número de cuadro)
    const marca = document.getElementById('checklist-marca').value.trim();
    const modelo = document.getElementById('checklist-modelo').value.trim();
    if (!marca || !modelo) {
        showToast("Marca y modelo son obligatorios", true);
        return;
    }
    const anio = document.getElementById('checklist-anio').value.trim();
    const cilindraje = document.getElementById('checklist-cilindraje').value.trim();
    const numeroCuadro = document.getElementById('checklist-cuadro')?.value.trim() || '';
    if (!numeroCuadro) {
        showToast("Los últimos 4 dígitos del cuadro son obligatorios", true);
        return;
    }

    // 3. Estado de los elementos (radios)
    const espejos = document.querySelector('input[name="checklist-espejos"]:checked')?.value === 'si';
    const luces = document.querySelector('input[name="checklist-luces"]:checked')?.value === 'si';
    const faro = document.querySelector('input[name="checklist-faro"]:checked')?.value === 'si';
    const tapaderas = document.querySelector('input[name="checklist-tapaderas"]:checked')?.value === 'si';
    const asiento = document.querySelector('input[name="checklist-asiento"]:checked')?.value === 'si';
    const rayaduras = document.getElementById('checklist-rayaduras').value.trim();
    const nivelBateria = document.getElementById('checklist-bateria').value;
    const combustible = document.getElementById('checklist-combustible').value;
    const observaciones = document.getElementById('checklist-observaciones').value.trim();

    // 4. Evidencias (subir fotos a Storage)
    const evidenciasFinal = {};
    for (const [key, data] of Object.entries(tempEvidencias)) {
        const fotosUrls = [];
        for (const base64 of data.fotos) {
            const blob = await (await fetch(base64)).blob();
            const file = new File([blob], `evidencia_${key}_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = await uploadWithTimeout(file, `rescates/checklist/${Date.now()}_${file.name}`);
            if (url) fotosUrls.push(url);
        }
        evidenciasFinal[key] = {
            comentario: data.texto,
            fotos: fotosUrls
        };
    }

    const btn = document.querySelector('#modal-checklist-ingreso button.bg-green-600');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
    }

    try {
        const shortId = generateShortId();
        const servicioData = {
            shortId: shortId,
            uid: cliente.uid,
            phone: "+52" + phone,
            clientName: cliente.userData.name || `Cliente ${phone}`,
            marca, modelo, anio, cc: cilindraje,
            numeroCuadro: numeroCuadro,   // <-- Guardado aquí
            falla: "INGRESO MANUAL CON CHECKLIST",
            status: 'completed',
            tallerStatus: 'recibida',
            timestamp: Date.now(),
            checklist: {
                espejos, luces, faro, tapaderas, asiento,
                rayaduras, nivelBateria, combustible, observaciones,
                evidencias: evidenciasFinal
            }
        };
        await addDoc(collection(db, "rescates"), servicioData);
        showToast("Moto ingresada correctamente");
        toggleModal('modal-checklist-ingreso', false);
        window.adminListenServices();
    } catch (e) {
        console.error(e);
        showToast("Error al guardar: " + e.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save mr-2"></i>INGRESAR';
        }
    }
};
// Reemplazar la función antigua
window.adminIngresarServicioManual = window.abrirModalIngresoServicio;

window.openDetalleServicio = async (id) => {
    const docSnap = await getDoc(doc(db, "rescates", id));
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    currentDetalleServicioId = id;
    
    // Declaración única
    let soloLectura = data.tallerStatus === 'lista' || data.tallerStatus === 'pagado' || data.status === 'completed';
    const isPending = data.status === 'pending';
    const isAccepted = data.status === 'accepted' || data.status === 'repairing';

    // Llenar información y fotos (código existente)
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
        if (actionsContainer) {
            actionsContainer.classList.remove('hidden');
            // Limpiar y reconstruir botones según estado
            actionsContainer.innerHTML = '';
            if (isPending) {
                actionsContainer.innerHTML = `
                    <button onclick="window.asignarMecanicoDesdeDetalle('${id}')" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-[10px] lg:text-xs transition-colors shadow-lg active:scale-95">
                        <i class="fas fa-user-plus mr-2"></i>Asignar Mecánico
                    </button>
                    <button onclick="window.cancelSOS('${id}')" class="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl uppercase text-[10px] lg:text-xs transition-colors shadow-lg active:scale-95">
                        <i class="fas fa-times mr-2"></i>Cancelar
                    </button>
                `;
            } else if (isAccepted) {
                actionsContainer.innerHTML = `
                    <button onclick="window.cambiarEstadoServicio('mecanica')" class="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-black py-3 rounded-xl uppercase text-[10px] lg:text-xs transition-colors shadow-lg active:scale-95">Mecánica</button>
                    <button onclick="window.cambiarEstadoServicio('pruebas')" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-[10px] lg:text-xs transition-colors shadow-lg active:scale-95">Pruebas</button>
                    <button onclick="window.abrirCobroDesdeDetalle()" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl uppercase text-[10px] lg:text-xs transition-colors shadow-lg active:scale-95">Cobrar</button>
                    <button onclick="window.ingresarATaller()" class="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-black py-3 rounded-xl uppercase text-[10px] lg:text-xs transition-colors shadow-lg active:scale-95">LLEVAR A TALLER</button>
                `;
            } else {
                // Otros estados (no debería ocurrir)
                actionsContainer.innerHTML = `
                    <button onclick="window.cambiarEstadoServicio('mecanica')" class="flex-1 bg-yellow-600 ...">Mecánica</button>
                    <button onclick="window.cambiarEstadoServicio('pruebas')" class="flex-1 bg-blue-600 ...">Pruebas</button>
                    <button onclick="window.abrirCobroDesdeDetalle()" class="flex-1 bg-indigo-600 ...">Cobrar</button>
                    <button onclick="window.ingresarATaller()" class="flex-1 bg-purple-600 ...">LLEVAR A TALLER</button>
                `;
            }
        }
        if (comentarioInput) comentarioInput.disabled = false;
        if (comentarioBtn) comentarioBtn.classList.remove('hidden');
    }

    window.loadServicioBitacora(id);
    toggleModal('modal-detalle-servicio', true);
};

window.asignarMecanicoDesdeDetalle = (sosId) => {
    window.currentSOSId = sosId;
    loadMecanicosActivosParaAsignar(sosId);
    toggleModal('modal-asignar-mecanico', true);
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
    
    let nuevoStatus = '';
    if (nuevoEstado === 'mecanica') nuevoStatus = 'repairing';
    else if (nuevoEstado === 'pruebas') nuevoStatus = 'to_shop';
    else if (nuevoEstado === 'lista') nuevoStatus = 'completed';
    else return;
    
    await updateDoc(docRef, { 
        tallerStatus: nuevoEstado,
        status: nuevoStatus
    });
    
    // Notificar al cliente via RTDB
    if(docSnap.data().uid) {
        const updates = { status: nuevoStatus, tallerStatus: nuevoEstado };
        await set(dbRef(rtdb, 'sos_alerts/' + docSnap.data().uid), { ...docSnap.data(), ...updates });
        await push(dbRef(rtdb, 'sos_alerts/' + docSnap.data().uid + '/notifs'), { 
            msg: nuevoEstado === 'mecanica' ? 'El mecánico está reparando tu moto.' :
                  (nuevoEstado === 'pruebas' ? 'Tu moto está en pruebas.' :
                  'Tu moto está lista para entregar.')
        });
    }
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
    if (window._clientDetailUnsubscribe) {
        window._clientDetailUnsubscribe();
        window._clientDetailUnsubscribe = null;
    }

    const modalId = 'modal-client-service-detail';
    const modalEl = document.getElementById(modalId);
    if (!modalEl) {
        console.error('❌ Modal no encontrado en el DOM');
        return;
    }

    const contentDiv = document.getElementById(`${modalId}-content`);
    if (!contentDiv) {
        console.error('❌ Contenido del modal no encontrado');
        return;
    }

    // ✅ Forzar visibilidad inmediata
    modalEl.style.display = 'flex';
    modalEl.classList.remove('hidden');
    contentDiv.innerHTML = '<p class="text-center text-gray-400">Cargando detalles...</p>';

    window._clientDetailUnsubscribe = onSnapshot(doc(db, "rescates", id), async (docSnap) => {
        if (!docSnap.exists()) {
            contentDiv.innerHTML = '<p class="text-white">Servicio no encontrado</p>';
            return;
        }
        const data = docSnap.data();
        if (data.uid !== auth.currentUser.uid && data.phone !== window.currentUserDoc.phone) {
            contentDiv.innerHTML = '<p class="text-white">No tienes permiso para ver este servicio</p>';
            return;
        }

        // 📌 Buscar venta asociada
        let pdfUrl = null;
        let ventaId = null;
        let ventaShortId = null;
        try {
            const ventaSnapshot = await getDocs(query(collection(db, "ventas"), where("sosId", "==", id), limit(1)));
            if (!ventaSnapshot.empty) {
                const ventaDoc = ventaSnapshot.docs[0];
                ventaId = ventaDoc.id;
                const ventaData = ventaDoc.data();
                pdfUrl = ventaData.pdfUrl || null;
                ventaShortId = ventaData.shortId || ventaId;
            }
        } catch (error) {
            console.error('Error al obtener venta asociada:', error);
        }

        const statusInfo = window.getStatusInfo(data.status);
        let btnDescarga = '';
        if (data.status === 'completed' || data.status === 'accepted' || data.status === 'repairing') {
            if (pdfUrl) {
                btnDescarga = `<button onclick="window.descargarPDF('${pdfUrl}', '${ventaShortId || id}')" class="mt-2 bg-green-600 text-white text-xs px-3 py-2 rounded-xl font-black uppercase">📥 Descargar Comprobante</button>`;
            } else if (ventaId) {
                btnDescarga = `<button onclick="window.reimprimirVenta('${ventaId}')" class="mt-2 bg-blue-600 text-white text-xs px-3 py-2 rounded-xl font-black uppercase">🔄 Generar y descargar</button>`;
            } else {
                btnDescarga = `<p class="mt-2 text-yellow-400 text-xs font-bold">⏳ Tu comprobante estará disponible pronto.</p>`;
            }
        }

        // 📌 Actualizar contenido con botón de cierre incluido
        contentDiv.innerHTML = `
            <div class="relative">
                <button onclick="window.toggleModal('${modalId}', false)" 
                        class="absolute top-0 right-0 text-gray-400 hover:text-white p-2 z-10">
                    <i class="fas fa-times text-xl"></i>
                </button>
                <div class="text-white space-y-2 pt-6">
                    <h3 class="font-black text-lg">Servicio: ${data.shortId || 'Sin ID'}</h3>
                    <p class="text-xs text-gray-400">Moto: ${data.marca || ''} ${data.modelo || ''} (${data.cc || ''})</p>
                    <p class="text-sm">${data.falla}</p>
                    <p class="text-xs">Estado: <span class="font-bold ${statusInfo.color.replace('bg-', 'text-').replace(/\/\d+/, '')}">${statusInfo.text}</span></p>
                    ${btnDescarga}
                    <p class="text-xs text-gray-500">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
            </div>
        `;
    });
};

// Control de barra de progreso para PDF
let progressTimeout = null;

function showPDFProgress() {
    const container = document.getElementById('pdf-progress-container');
    const bar = document.getElementById('pdf-progress-bar');
    const text = document.getElementById('pdf-progress-text');
    if (container) container.classList.remove('hidden');
    if (bar) bar.style.width = '0%';
    if (text) text.innerText = 'Preparando documento...';
    
    let progress = 0;
    if (progressTimeout) clearInterval(progressTimeout);
    progressTimeout = setInterval(() => {
        progress += 5;
        if (progress > 90) {
            clearInterval(progressTimeout);
            progressTimeout = null;
        }
        const bar = document.getElementById('pdf-progress-bar');
        const text = document.getElementById('pdf-progress-text');
        if (bar) bar.style.width = progress + '%';
        if (text) {
            if (progress < 30) text.innerText = 'Generando mapa...';
            else if (progress < 60) text.innerText = 'Creando documento...';
            else if (progress < 90) text.innerText = 'Añadiendo contenido...';
        }
    }, 300);
}

function hidePDFProgress() {
    if (progressTimeout) {
        clearInterval(progressTimeout);
        progressTimeout = null;
    }
    const container = document.getElementById('pdf-progress-container');
    const bar = document.getElementById('pdf-progress-bar');
    if (bar) bar.style.width = '100%';
    if (container) {
        // Esperar 2 segundos antes de ocultar la barra
        setTimeout(() => {
            container.classList.add('hidden');
            if (bar) bar.style.width = '0%';
        }, 2000);
    }
}

window.showPDFProgress = showPDFProgress;
window.hidePDFProgress = hidePDFProgress;


window.downloadClientTicket = async function(serviceId) {
    const ventasSnap = await getDocs(query(collection(db, "ventas"), where("sosId", "==", serviceId), limit(1)));
    if (!ventasSnap.empty) {
        const ventaDoc = ventasSnap.docs[0];
        const ventaData = ventaDoc.data();
        if (ventaData.pdfUrl) {
            window.descargarPDF(ventaData.pdfUrl, ventaData.shortId || ventaDoc.id);
            return;
        }
        await window.reimprimirVenta(ventaDoc.id);
        return;
    }
    window.showToast('No se encontró una venta asociada a este servicio.', true);
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
    
    let conversacion = [];
    if (data.chatId) {
        const chatMsgsSnap = await getDocs(collection(db, "chats", data.chatId, "mensajes"));
        chatMsgsSnap.forEach(doc => {
            const msg = doc.data();
            conversacion.push({
                nombre: msg.uid === data.uid ? "Cliente" : "Mecánico",
                texto: msg.texto,
                timestamp: msg.timestamp
            });
        });
        conversacion.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    let rutaPuntos = [];
    let mechNombre = "Mecánico";
    if (data.mech_uid) {
        const mechUserSnap = await getDoc(doc(db, "users", data.mech_uid));
        if (mechUserSnap.exists()) mechNombre = mechUserSnap.data().name || "Mecánico";
        const trackingRef = dbRef(rtdb, `sos_tracking/${id}/${data.mech_uid}/points`);
        const trackSnap = await get(trackingRef);
        if (trackSnap.exists()) {
            trackSnap.forEach(child => {
                const punto = child.val();
                if (punto.lat && punto.lng) rutaPuntos.push([punto.lat, punto.lng]);
            });
        }
    }
    if (rutaPuntos.length === 0 && data.mech_uid) {
        const posMechSnap = await get(dbRef(rtdb, `mecanicos_activos/${data.mech_uid}`));
        if (posMechSnap.exists()) {
            const pos = posMechSnap.val();
            if (pos.lat && pos.lng) rutaPuntos.push([pos.lat, pos.lng]);
        }
    }
    if (data.lat && data.lng) rutaPuntos.push([data.lat, data.lng]);
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    const logoImg = new Image();
    logoImg.src = 'logo_oscuro.png';
    await new Promise((resolve) => { logoImg.onload = logoImg.onerror = resolve; if (logoImg.complete) resolve(); });
    
    pdf.addPage();
    _addHeader(pdf, logoImg, pageWidth, "REPORTE DE SERVICIO OBR");
    let y = 40;
    
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Folio: ${data.shortId || id}`, 12, y);
    pdf.text(`Fecha: ${new Date(data.timestamp).toLocaleString('es-MX')}`, 12, y + 6);
    pdf.text(`Cliente: ${data.clientName || data.phone || 'Mostrador'}`, 12, y + 12);
    pdf.text(`Moto: ${data.marca || ''} ${data.modelo || ''} (${data.cc || ''})`, 12, y + 18);
    y += 30;
    
    if (venta && venta.ticket && venta.ticket.length) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text("CONCEPTOS FACTURADOS:", 12, y);
        y += 6;
        const bodyRows = venta.ticket.map(item => [item.name, item.garantia || 'N/A', `$${item.price.toFixed(2)}`]);
        pdf.autoTable({
            startY: y,
            head: [['Descripción', 'Garantía', 'Precio']],
            body: bodyRows,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 2.5 },
            headStyles: { fillColor: [255, 107, 0], textColor: [255, 255, 255] },
            columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 }, 2: { cellWidth: 30, halign: 'right' } },
            margin: { left: 12, right: 12 }
        });
        y = pdf.lastAutoTable.finalY + 8;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(`Total: $${venta.total.toFixed(2)} MXN`, pageWidth - 12, y, { align: 'right' });
    } else if (data.costoRescateEstimado) {
        pdf.setFont("helvetica", "bold");
        pdf.text(`Costo estimado: $${data.costoRescateEstimado.toFixed(2)}`, 12, y);
    }
    
    if (data.checklist) {
        y += 15;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text("CHECKLIST DE INGRESO:", 12, y);
        y += 5;
        pdf.setFontSize(8.5);
        pdf.setFont("helvetica", "normal");
        const ch = data.checklist;
        pdf.text(`• Espejos: ${ch.espejos ? '✓ Correctos' : '✗ Dañados'}`, 12, y);
        pdf.text(`• Luces: ${ch.luces ? '✓ Funcionan' : '✗ No funcionan'}`, 12, y + 5);
        pdf.text(`• Faro: ${ch.faro ? '✓ Funciona' : '✗ No funciona'}`, 12, y + 10);
        pdf.text(`• Tapaderas: ${ch.tapaderas ? '✓ Correctas' : '✗ Rotas'}`, 12, y + 15);
        pdf.text(`• Asiento: ${ch.asiento ? '✓ Bueno' : '✗ Roto'}`, 12, y + 20);
        pdf.text(`• Rayaduras: ${ch.rayaduras || 'Ninguna'}`, 12, y + 25);
        pdf.text(`• Observaciones: ${ch.observaciones || 'Ninguna'}`, 12, y + 30);
    }
    
    _addFooter(pdf, pageWidth, pageHeight);
    
    pdf.addPage();
    _addHeader(pdf, logoImg, pageWidth, "DETALLE DEL SERVICIO");
    y = 35;
    const col1 = 12;
    const col2 = 75;
    const col3 = 135;
    const colWidth = 55;
    
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("EVIDENCIA DEL USUARIO", col1, y);
    y += 5;
    if (data.mediaUrl) {
        let imgUrl = data.mediaUrl;
        if (!imgUrl.startsWith('http')) imgUrl = '';
        if (imgUrl) {
            try {
                const imgData = await fetch(imgUrl).then(res => res.blob()).then(blob => URL.createObjectURL(blob));
                const img = new Image();
                await new Promise((resolve) => { img.onload = resolve; img.src = imgData; });
                const imgWidth = 50;
                const imgHeight = (img.height * imgWidth) / img.width;
                pdf.addImage(img, 'JPEG', col1, y, imgWidth, imgHeight);
                y += imgHeight + 4;
                URL.revokeObjectURL(imgData);
            } catch(e) { console.warn("No se pudo cargar imagen", e); }
        } else {
            pdf.text("Sin imagen", col1, y);
            y += 6;
        }
    } else {
        pdf.text("Sin evidencia fotográfica", col1, y);
        y += 6;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const fallaText = pdf.splitTextToSize(data.falla || "Sin descripción", colWidth);
    pdf.text(fallaText, col1, y);
    y += (fallaText.length * 4) + 10;
    
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("RUTA DEL MECÁNICO", col2, y);
    y += 5;
    const mapImage = await _generateRouteMapImage(rutaPuntos, data.lat, data.lng);
if (mapImage) {
    console.log('📸 MapImage recibido en PDF, longitud:', mapImage.length);
    try {
        pdf.addImage(mapImage, 'JPEG', col2, y, 55, 55);
        console.log('✅ Imagen añadida al PDF');
        y += 60;
    } catch (e) {
        console.error('❌ Error al añadir imagen al PDF:', e);
    }
} else {
    console.warn('⚠️ mapImage es null o undefined');
    pdf.text("No se pudo generar el mapa", col2, y);
    y += 6;
}
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "italic");
    const instrucciones = _getRouteInstructions(rutaPuntos);
    const instrLines = pdf.splitTextToSize(instrucciones, colWidth);
    pdf.text(instrLines, col2, y);
    y += instrLines.length * 4 + 8;
    
    pdf.setFontSize(6);
    pdf.setTextColor(150, 150, 150);
    const fadeText = "• • • Fin del reporte • • •";
    pdf.text(fadeText, col2 + colWidth/2, pageHeight - 15, { align: 'center' });
    
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text("CHAT ENTRE CLIENTE Y MECÁNICO", col3, y - (instrLines.length * 4 + 8) + 5);
    let chatY = y - (instrLines.length * 4 + 8) + 12;
    if (conversacion.length === 0) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text("No hay conversación registrada", col3, chatY);
    } else {
        pdf.setFontSize(7);
        for (let msg of conversacion.slice(-15)) {
            if (chatY > pageHeight - 20) {
                pdf.addPage();
                _addHeader(pdf, logoImg, pageWidth, "DETALLE DEL SERVICIO (cont.)");
                chatY = 35;
                pdf.text("CHAT (continuación)", col3, chatY);
                chatY += 6;
            }
            const time = new Date(msg.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const line = `${time} ${msg.nombre}: ${msg.texto.substring(0, 60)}`;
            pdf.text(line, col3, chatY);
            chatY += 4;
        }
    }
    
    _addFooter(pdf, pageWidth, pageHeight);
    pdf.save(`Reporte_Servicio_${data.shortId || id}.pdf`);
};

function _addHeader(pdf, logoImg, pageWidth, title) {
    pdf.setFillColor(255, 107, 0);
    pdf.rect(0, 0, pageWidth, 28, 'F');
    if (logoImg.complete && logoImg.naturalWidth > 0) {
        pdf.addImage(logoImg, 'PNG', 10, 4, 20, 20);
    }
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text(title, logoImg.complete ? 34 : 12, 17);
    pdf.setDrawColor(255, 107, 0);
    pdf.line(10, 29, pageWidth - 10, 29);
}

function _addFooter(pdf, pageWidth, pageHeight) {
    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(100);
        pdf.text(`OBR Moto Rescate - Documento generado el ${new Date().toLocaleDateString('es-MX')}`, 10, pageHeight - 10);
        pdf.text(`Página ${i} de ${totalPages}`, pageWidth - 25, pageHeight - 10);
    }
}

async function _generateRouteMapImage(puntos, clienteLat, clienteLng) {
    console.log('🚀 INICIO _generateRouteMapImage');
    console.log('📌 Puntos:', puntos);
    console.log('📍 Cliente - Lat:', clienteLat, 'Lng:', clienteLng);
    
    if (!puntos || puntos.length < 1) {
        console.warn('⚠️ No hay puntos para dibujar el mapa');
        return null;
    }
    
    const div = document.createElement('div');
    div.style.width = '600px';
    div.style.height = '500px';
    div.style.position = 'fixed';
    div.style.left = '-9999px';
    div.style.top = '-9999px';
    div.style.zIndex = '-1';
    div.style.backgroundColor = '#ffffff';
    div.style.visibility = 'visible';
    document.body.appendChild(div);
    
    try {
        const layerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const map = L.map(div, {
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: false
        });
        L.tileLayer(layerUrl).addTo(map);
        
        // Determinar centro del mapa
        let centerLat = TALLER_LAT;
        let centerLng = TALLER_LNG;
        if (puntos && puntos.length > 0) {
            centerLat = puntos[0][0];
            centerLng = puntos[0][1];
        }
        map.setView([centerLat, centerLng], 13);
        
        await new Promise((resolve) => {
            map.whenReady(() => {
                map.invalidateSize();
                setTimeout(resolve, 500);
            });
        });
        
        // ✅ DIBUJAR LA RUTA (POLILÍNEA)
        if (puntos && puntos.length > 1) {
            const latlngs = puntos.map(p => L.latLng(p[0], p[1]));
            const polyline = L.polyline(latlngs, { 
                color: '#FF6B00', 
                weight: 6, 
                opacity: 0.9,
                smoothFactor: 1
            }).addTo(map);
            
            // Centrar el mapa en la ruta
            const bounds = L.latLngBounds(latlngs);
            map.fitBounds(bounds, { padding: [50, 50] });
            console.log('✅ Ruta dibujada con', puntos.length, 'puntos');
        }
        
        // ✅ MARCADOR DE INICIO (MECÁNICO)
        if (puntos && puntos.length > 0 && puntos[0]) {
            L.marker(puntos[0], {
                icon: L.divIcon({
                    className: 'mech-pulse-marker',
                    html: '<div style="background:#22c55e; width:24px; height:24px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center;"><i class="fas fa-motorcycle" style="color:white; font-size:12px;"></i></div>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);
        }
        
        // ✅ MARCADOR DE DESTINO (CLIENTE)
        if (clienteLat && clienteLng) {
            L.marker([clienteLat, clienteLng], {
                icon: L.divIcon({
                    className: 'gps-pulse-marker',
                    html: '<div style="background:#FF6B00; width:24px; height:24px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center;"><i class="fas fa-map-marker-alt" style="color:white; font-size:12px;"></i></div>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);
        }
        
        // Esperar carga de tiles
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Capturar imagen
        await window.loadHtml2Canvas();
        const canvas = await html2canvas(div, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            allowTaint: false,
            logging: false
        });
        const imgData = canvas.toDataURL('image/png');
        console.log('✅ Imagen generada correctamente');
        return imgData;
    } catch (error) {
        console.error('❌ Error crítico al generar el mapa:', error);
        return null;
    } finally {
        if (div.parentNode) document.body.removeChild(div);
    }
}
function _getRouteInstructions(puntos) {
    if (puntos.length < 2) return "Ruta no disponible";
    const distTotal = puntos.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const prev = puntos[i-1];
        const d = getDistanceKm(prev[0], prev[1], p[0], p[1]);
        return acc + d;
    }, 0);
    return `El mecánico recorrió aproximadamente ${distTotal.toFixed(1)} km para llegar al cliente. La ruta seguida se muestra en el mapa. Tiempo estimado: ${Math.round(distTotal * 3)} minutos.`;
}
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
    const catalogList = document.getElementById('admin-service-catalog');
    if (!catalogList) return;
    // Siempre consultar datos frescos
    getDocs(collection(db, "servicios")).then(snap => {
        catalogList.innerHTML = '';
        snap.forEach(d => {
            const s = d.data();
            catalogList.innerHTML += `<div class="flex justify-between bg-white/5 p-2 rounded text-xs">
                <span>${escapeHtml(s.name)} ($${s.price})</span>
                <div>
                    <button onclick="window.editService('${d.id}')" class="text-blue-400 mr-2"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteService('${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        });
        if (snap.empty) catalogList.innerHTML = '<p class="text-gray-500 text-xs">No hay servicios registrados.</p>';
    }).catch(err => console.error('Error cargando servicios:', err));
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

window.imprimirTicketVenta = async (ventaId, saleData, esCotizacion = false) => {
    return new Promise(async (resolve, reject) => {
        const { jsPDF } = window.jspdf;
        const pdfDoc = new jsPDF({
            compress: true,
            unit: 'mm',
            format: 'a4'
        });
        const logoImg = new Image();
        logoImg.src = 'logo_oscuro.png';

        const generar = async () => {
            try {
                const pageWidth = pdfDoc.internal.pageSize.getWidth();
                const pageHeight = pdfDoc.internal.pageSize.getHeight();
if (esCotizacion) {
    for (let p = 1; p <= pdfDoc.internal.getNumberOfPages(); p++) {
        pdfDoc.setPage(p);

        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setFontSize(36);
        pdfDoc.setTextColor(240, 240, 240);

        const espacioX = 90;
        const espacioY = 70;

        for (let fila = 0; fila < 10; fila++) {

            const offsetX = (fila % 2) ? 45 : 0;

            for (let x = -50; x < pageWidth + 100; x += espacioX) {

                pdfDoc.text(
                    "COTIZACIÓN",
                    x + offsetX,
                    fila * espacioY,
                    {
                        angle: -45
                    }
                );

            }
        }
    }
}

                // 📌 Obtener nombre real del cliente (reemplaza "Mostrador")
                let nombreCliente = saleData.clientName || saleData.clienteCel || 'Mostrador';

                if (saleData.uid) {
                    try {
                        const userSnap = await getDoc(doc(db, "users", saleData.uid));
                        if (userSnap.exists()) {
                            const userData = userSnap.data();
                            nombreCliente = userData.name || userData.phone || nombreCliente;
                        }
                    } catch (e) {
                        console.warn('No se pudo obtener el nombre del usuario por UID:', e);
                    }
                } else if (saleData.clienteCel && saleData.clienteCel !== 'Mostrador') {
                    const phoneToSearch = saleData.clienteCel.startsWith('+52') 
                        ? saleData.clienteCel 
                        : '+52' + saleData.clienteCel.replace(/[^0-9]/g, '');
                    try {
                        const q = query(collection(db, "users"), where("phone", "==", phoneToSearch), limit(1));
                        const snap = await getDocs(q);
                        if (!snap.empty) {
                            const userData = snap.docs[0].data();
                            nombreCliente = userData.name || userData.phone || nombreCliente;
                        }
                    } catch (e) {
                        console.warn('No se pudo buscar el usuario por teléfono:', e);
                    }
                }

                const clienteDisplay = nombreCliente || saleData.clienteCel || 'Mostrador';

                // 📌 Encabezado
                pdfDoc.setFillColor(255, 107, 0);
                pdfDoc.rect(0, 0, pageWidth, 28, 'F');
                if (logoImg.complete && logoImg.naturalWidth > 0) {
                    pdfDoc.addImage(logoImg, 'PNG', 12, 4, 20, 20);
                }
                pdfDoc.setFontSize(14);
                pdfDoc.setFont("helvetica", "bold");
                pdfDoc.setTextColor(255, 255, 255);
                pdfDoc.text(esCotizacion ? "COTIZACIÓN OBR" : "COMPROBANTE DE VENTA", logoImg.complete ? 36 : 12, 17.5);
                pdfDoc.setDrawColor(255, 107, 0);
                pdfDoc.line(12, 29, pageWidth - 12, 29);

                let y = 40;

                // 📌 Datos del comprobante (con nombre real del cliente)
                _drawDataCard(pdfDoc, 12, y, pageWidth - 24, 25, 'Datos del Comprobante', [
                    { label: 'Ticket:', value: saleData.shortId, rightLabel: 'Método de Pago:', rightValue: saleData.metodoPago || 'No especificado' },
                    { label: 'Fecha:', value: new Date(saleData.fecha).toLocaleString(), rightLabel: 'Cliente:', rightValue: clienteDisplay }
                ]);
                y += 32;

                // 📌 Artículos adquiridos
                pdfDoc.setFont("helvetica", "bold");
                pdfDoc.setFontSize(10);
                pdfDoc.setTextColor(15, 23, 42);
                pdfDoc.text("ARTÍCULOS ADQUIRIDOS:", 12, y);
                y += 4;

                let ticketItems = [];
                if (saleData.servicioNombre) {
                    let nombreLimpio = saleData.servicioNombre.replace(/\[.*?\]/g, '').replace(/\*/g, '').replace(/\[|\]/g, '').trim();
                    if (!nombreLimpio) nombreLimpio = saleData.servicioNombre;
                    ticketItems.push([nombreLimpio, 'Sin garantía', `$${saleData.rescueCost?.toFixed(2) || '$0.00'}`]);
                }
                if (saleData.ticket && saleData.ticket.length > 0) {
                    saleData.ticket.forEach(item => {
                        if (item.type !== 'servicio' && item.type !== 'rescate') {
                            ticketItems.push([item.name, item.garantia || 'Sin garantía', `$${item.price.toFixed(2)}`]);
                        }
                    });
                }
                if (saleData.costoEnvio && saleData.costoEnvio > 0) {
                    ticketItems.push(['Costo de envío', 'N/A', `$${saleData.costoEnvio.toFixed(2)}`]);
                }
                if (saleData.descuento && saleData.descuento > 0) {
                    ticketItems.push(['Descuento aplicado', 'N/A', `-$${saleData.descuento.toFixed(2)}`]);
                }
                if (ticketItems.length === 0) ticketItems.push(['Sin productos', 'N/A', '$0.00']);

                pdfDoc.autoTable({
                    startY: y,
                    head: [['Descripción del Producto', 'Garantía Oficial', 'Precio Unitario']],
                    body: ticketItems,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 2.5, textColor: [30,41,59] },
                    headStyles: { fillColor: [255, 107, 0], textColor: [255,255,255] },
                    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 35 }, 2: { cellWidth: 30, halign: 'right' } },
                    margin: { left: 12, right: 12 }
                });
                y = pdfDoc.lastAutoTable.finalY + 10;

                // 📌 Desglose completo de precios (Subtotal, IVA, Descuento, Total)
                const subTotal = saleData.ticket ? saleData.ticket.reduce((s, i) => s + (i.price || 0), 0) : 0;
                const iva = subTotal * 0.16;
                const totalCalculado = subTotal + iva - (saleData.descuento || 0);

                pdfDoc.setFont("helvetica", "normal");
                pdfDoc.setFontSize(10);
                pdfDoc.setTextColor(15, 23, 42);

                pdfDoc.text(`Subtotal: $${subTotal.toFixed(2)}`, pageWidth - 40, y, { align: 'right' });
                y += 6;

                if (saleData.descuento > 0) {
                    pdfDoc.text(`Descuento: -$${saleData.descuento.toFixed(2)}`, pageWidth - 40, y, { align: 'right' });
                    y += 6;
                }

                pdfDoc.text(`IVA (16%): $${iva.toFixed(2)}`, pageWidth - 40, y, { align: 'right' });
                y += 8;

                pdfDoc.setFont("helvetica", "bold");
                pdfDoc.setFontSize(12);
                if (esCotizacion) {
                    pdfDoc.text(`Total Estimado: $${totalCalculado.toFixed(2)}`, pageWidth - 40, y, { align: 'right' });
                    y += 6;
                    pdfDoc.setFontSize(8);
                    pdfDoc.setTextColor(148, 163, 184);
                    pdfDoc.text('* Esta cotización no representa un comprobante de pago. Los precios son referenciales y pueden cambiar.', 12, y);
                    y += 10;
                } else {
                    pdfDoc.text(`Total Neto: $${totalCalculado.toFixed(2)}`, pageWidth - 40, y, { align: 'right' });
                    y += 10;
                }

                // 📌 Footer profesional
                const addFooter = window._setupProfessionalPDF(pdfDoc, esCotizacion ? 'COTIZACIÓN OBR' : 'COMPROBANTE DE VENTA', logoImg);
                addFooter(pdfDoc);

                const pdfBlob = pdfDoc.output('blob');
                resolve(pdfBlob);
            } catch (error) {
                reject(error);
            }
        };

        if (logoImg.complete && logoImg.naturalWidth > 0) {
            await generar();
        } else {
            logoImg.onload = generar;
            logoImg.onerror = generar;
        }
    });
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


window.descargarPDF = async (url, nombreArchivo) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al descargar el PDF');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `comprobante_${nombreArchivo}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        showToast('✅ Comprobante descargado correctamente.');
    } catch (error) {
        console.error('Error al descargar PDF:', error);
        showToast('No se pudo descargar el comprobante.', true);
    }
};

async function subirPDFaSupabase(pdfBlob, ventaId) {
    const supabaseUrl = 'https://kdwoflalureesxmvbonf.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtkd29mbGFsdXJlZXN4bXZib25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDEzNDcsImV4cCI6MjA5Njk3NzM0N30.o7dt0lmFAFKgIie5q6Ryvjf-OcNc_WeoCAMcAlgdm9c';

    const { createClient } = window.supabase;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Usar el cliente oficial para subir el archivo
        const { data, error } = await supabase
            .storage
            .from('pdfs')
            .upload(`venta_${ventaId}.pdf`, pdfBlob, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (error) {
            throw error;
        }

        // Obtener la URL pública
        const { data: urlData } = supabase
            .storage
            .from('pdfs')
            .getPublicUrl(`venta_${ventaId}.pdf`);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Error subiendo a Supabase:', error);
        // Fallback a base64 (solo para descarga inmediata)
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(pdfBlob);
        });
        return base64;
    }
}


window.reimprimirVenta = async (ventaId) => {
    const snap = await getDoc(doc(db, "ventas", ventaId));
    if (!snap.exists()) return showToast("Venta no encontrada", true);
    const saleData = snap.data();

    try {
        const pdfBlob = await window.imprimirTicketVenta(ventaId, saleData);
        const urlLocal = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = urlLocal;
        link.download = `${ventaId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(urlLocal), 5000);

        subirPDFaSupabase(pdfBlob, ventaId)
            .then(pdfUrl => {
                if (pdfUrl.startsWith('https://')) {
                    updateDoc(doc(db, "ventas", ventaId), { pdfUrl: pdfUrl })
                        .then(() => console.log('✅ PDF URL guardada en Firestore'))
                        .catch(err => console.warn('Firestore update error:', err));
                }
            })
            .catch(err => console.warn('Subida falló (PDF ya descargado):', err));

        showToast('✅ PDF generado y descargado.');
    } catch (error) {
        console.error('Error al generar PDF:', error);
        showToast('Error al generar el PDF.', true);
    }
};

// ========== COTIZACIÓN ==========

window.cargarPromocionesCotizacion = async function() {
    const select = document.getElementById('pos-cotizacion-promo');
    if (!select) return;

    // Mostrar estado de carga
    select.innerHTML = '<option value="">Cargando promociones...</option>';

    try {
        // Consultar promociones activas
        const q = query(collection(db, "promociones"), where("active", "==", true));
        const snap = await getDocs(q);

        // Limpiar y agregar opción por defecto
        let html = '<option value="">Sin promoción</option>';

        snap.forEach(doc => {
            const p = doc.data();
            const label = `${p.codigo} - ${p.tipoRecompensa === 'desc_porc' ? p.valorRecompensa + '%' : '$' + p.valorRecompensa}`;
            html += `<option value="${doc.id}">${label}</option>`;
        });

        select.innerHTML = html;
        window.showToast('✅ Promociones cargadas');
    } catch (error) {
        console.error('Error cargando promociones:', error);
        select.innerHTML = '<option value="">Sin promoción</option>';
        window.showToast('❌ Error al cargar promociones', true);
    }
};

// ========== COTIZACIÓN (FUNCIÓN GLOBAL) ==========
window.generarCotizacionPDF = async function() {
    console.log('🔄 Generando cotización con nombre real del cliente...');
    if (!window.posTicket || !window.posTicket.length) {
        window.showToast("El ticket está vacío. Agrega productos para cotizar.", true);
        return;
    }

    try {
        // 📌 Obtener el teléfono del cliente desde el input del POS
        const rawPhone = document.getElementById('pos-customer-phone')?.value.trim() || '';
        let nombreCliente = 'Mostrador';
        let uidCliente = null;

        // 📌 Buscar el cliente en Firestore por teléfono
        if (rawPhone) {
            const phoneToSearch = '+52' + rawPhone.replace(/[^0-9]/g, '');
            try {
                const q = query(collection(db, "users"), where("phone", "==", phoneToSearch), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const userData = snap.docs[0].data();
                    nombreCliente = userData.name || userData.phone || rawPhone;
                    uidCliente = snap.docs[0].id;
                } else {
                    // Si no se encuentra en users, usar el teléfono como nombre
                    nombreCliente = rawPhone;
                }
            } catch (e) {
                console.warn('Error al buscar cliente en Firestore:', e);
                nombreCliente = rawPhone || 'Mostrador';
            }
        }

        // 📌 Construir datos de cotización
        const cotizacionData = {
            shortId: 'COT-' + new Date().toISOString().slice(0,10),
            fecha: new Date().toISOString(),
            clienteCel: nombreCliente,
            uid: uidCliente,
            ticket: window.posTicket,
            total: window.posTicket.reduce((s, i) => s + i.price, 0) + 
                   (window.posTicket.reduce((s, i) => s + i.price, 0) * 0.16) - 
                   (window.posDescuento || 0),
            descuento: window.posDescuento || 0,
            metodoPago: 'Cotización',
            clientName: nombreCliente
        };

        // 📌 Generar PDF llamando a imprimirTicketVenta con esCotizacion = true
        const pdfBlob = await window.imprimirTicketVenta(null, cotizacionData, true);

        // 📌 Descargar PDF
        const urlLocal = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = urlLocal;
        link.download = `Cotizacion_${new Date().toISOString().slice(0,10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(urlLocal), 5000);

        window.showToast('✅ Cotización generada correctamente.');
    } catch (error) {
        console.error('❌ Error al generar cotización:', error);
        window.showToast('Error al generar cotización', true);
    }
};

window.sendTicketWhatsAppAfterCheckout = (phone, total, ticketItems) => {
    if (!ticketItems || !ticketItems.length) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const items = ticketItems.map(i => `- ${i.name}: $${i.price} ${i.garantia ? '(Garantía: '+i.garantia+')' : ''}`).join('\n');
    const msg = `🧾 *Ticket OBR*\n${items}\n\n*Total: $${total}*`;
    const url = `https://api.whatsapp.com/send?phone=+52${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

let ventasRealizadasUnsubscribe = null;

window.loadVentasRealizadas = () => {
    const container = document.getElementById('ventas-realizadas-list');
    if (!container) return;

    if (ventasRealizadasUnsubscribe) ventasRealizadasUnsubscribe();
    ventasRealizadasUnsubscribe = null;

    const q = query(collection(db, "ventas"), orderBy("fecha", "desc"), limit(30));
    ventasRealizadasUnsubscribe = onSnapshot(q, (snap) => {
        container.innerHTML = '';
        snap.forEach(docSnap => {
            const v = docSnap.data();
            const itemsCount = v.ticket ? v.ticket.length : 0;
            const tienePDF = v.pdfUrl ? true : false;

            let accionHTML = '';
if (tienePDF) {
    accionHTML = `
        <button onclick="window.descargarPDF('${v.pdfUrl}', '${v.shortId || docSnap.id}')" 
                class="w-8 h-8 bg-naranja rounded-full flex items-center justify-center text-white hover:opacity-80 transition-opacity"
                title="Descargar comprobante">
            <i class="fas fa-download"></i>
        </button>
    `;
} else {
                accionHTML = `
                    <div class="flex items-center gap-3">
                        <button onclick="window.reimprimirVenta('${docSnap.id}')" 
                                class="bg-blue-600 text-white px-3 py-1 rounded text-[9px] font-bold uppercase hover:bg-blue-500 transition-colors">
                            Reimprimir
                        </button>
                        <i class="fas fa-exclamation-triangle text-yellow-400 text-lg" title="PDF no disponible, genera uno nuevo"></i>
                    </div>
                `;
            }

            container.innerHTML += `
                <div class="bg-white/5 border border-white/10 p-3 rounded-xl text-xs text-white">
                    <div class="flex justify-between">
                        <span class="font-bold">${v.shortId}</span>
                        <span>${new Date(v.fecha).toLocaleDateString()}</span>
                    </div>
                    <p class="text-gray-400">${v.desc?.substring(0, 50) || `${itemsCount} productos`}</p>
                    <p class="text-naranja font-black">$${v.total?.toFixed(2) || '0.00'}</p>
                    <div class="flex justify-end mt-1">
                        ${accionHTML}
                    </div>
                </div>
            `;
        });
    });
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
// Llamar a initReferidosAdmin al cambiar a la vista de promos
if (typeof window.switchAdminView === 'function') {
    const originalSwitchAdminView = window.switchAdminView;
    window.switchAdminView = function(viewId) {
        originalSwitchAdminView.call(this, viewId);
        if (viewId === 'a-view-promos') {
            setTimeout(initReferidosAdmin, 200);
        }
    };
} else {
    // Fallback: observar cambios en la clase hidden del elemento
    const promosView = document.getElementById('a-view-promos');
    if (promosView) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    if (!promosView.classList.contains('hidden')) {
                        initReferidosAdmin();
                    }
                }
            });
        });
        observer.observe(promosView, { attributes: true });
    }
}
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
    const vistas = ['a-view-pos','a-view-servicios','a-view-alertas','a-view-inventario','a-view-promos','a-view-usuarios','a-view-config','a-view-stats','a-view-citas','a-view-entregas','a-view-retenes'];
const vistasNombres = ['Caja','Taller','SOS','Almacén','Promos','Usuarios','Ajustes','Estadíst.','Citas','Entregas','Retenes'];
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
    logoImg.src = 'logo_oscuro.png';
    
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
// === SOS COMPLETO (mapa, listado, personal en tiempo real, filtros, reportes) ===
// ======================================================
// Variables globales (se asume que existen: adminSOSGlobalMapInst, adminSOSMarkers, _adminSOSTrackingListeners, _adminSOSRouteLines)
window.currentSOSFilter = window.currentSOSFilter || 'pending';
let sosFechaInicio = null;
let sosFechaFin = null;
let lastSOSCount = 0;
let sosPersonalMarkers = {};      // marcadores de personal (uno por UID)
let sosPersonalUnsubscribe = null;
let sosPersonalPositions = {};    // última posición conocida por UID

// ---------- Notificación TTS de nueva solicitud ----------
function iniciarNotificacionSOS() {
    const qSOS = query(collection(db, "rescates"), where("status", "==", "pending"));
    onSnapshot(qSOS, (snap) => {
        const currentCount = snap.size;
        if (lastSOSCount > 0 && currentCount > lastSOSCount) {
            playSound('alert');
            speakTTS('¡Nueva solicitud de rescate entrante!');
            showToast("🚨 ¡Nueva solicitud de auxilio!", false);
        }
        lastSOSCount = currentCount;
    });
}

// ---------- Enviar WhatsApp personalizado al cliente ----------
async function enviarWhatsAppPersonalizado(telefonoCliente, nombreCliente, nombreMecanico, servicioSeleccionado) {
    if (!telefonoCliente) return;
    const telefonoClean = telefonoCliente.replace('+52', '');
    const mensaje = `Hola ${nombreCliente}, soy ${nombreMecanico}, tu mecánico asignado. Estaré llegando lo antes posible a tu ubicación para resolver tu caso: ${servicioSeleccionado}. Puedes seguir mi llegada desde la app o estar atento a este canal de contacto para cualquier duda.`;
    const url = `https://api.whatsapp.com/send?phone=+52${telefonoClean}&text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

// ---------- Cargar listado lateral de SOS ----------
async function cargarListadoSOS() {
    const listaDiv = document.getElementById('admin-sos-list-lateral');
    if (!listaDiv) {
        console.warn('No se encontró el contenedor admin-sos-list-lateral');
        return;
    }
    listaDiv.innerHTML = '<p class="text-xs text-gray-400 text-center">Cargando...</p>';

    let q = query(collection(db, "rescates"));
    if (sosFechaInicio && sosFechaFin) {
        const startDate = new Date(sosFechaInicio);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(sosFechaFin);
        endDate.setHours(23,59,59,999);
        q = query(q, where("timestamp", ">=", startDate.getTime()), where("timestamp", "<=", endDate.getTime()));
    }
    const snap = await getDocs(q);
    const rescates = [];
    snap.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        rescates.push(data);
    });

    // Filtrar según filtro individual o por estatus
let filtered = rescates;
if (window.sosFiltroUnicoId) {
    // Si hay un filtro individual, mostrar solo ese servicio
    filtered = rescates.filter(r => r.id === window.sosFiltroUnicoId);
} else {
    // Sino, aplicar filtro por estatus
    if (window.currentSOSFilter === 'pending') {
        filtered = rescates.filter(r => r.status === 'pending');
    } else if (window.currentSOSFilter === 'accepted') {
        filtered = rescates.filter(r => r.status === 'accepted' || r.status === 'repairing');
    } else if (window.currentSOSFilter === 'completed') {
        filtered = rescates.filter(r => r.status === 'completed');
    }
}
    
    listaDiv.innerHTML = '';
    if (filtered.length === 0) {
        listaDiv.innerHTML = '<p class="text-xs text-gray-400 text-center">No hay solicitudes con los filtros seleccionados.</p>';
        return;
    }

    filtered.forEach(r => {
        const estadoTexto = r.status === 'completed' ? '✅ Completado' : 
                           (r.status === 'accepted' ? '🚚 En camino' : 
                           (r.status === 'repairing' ? '🔧 Reparando' : '🆕 Pendiente'));
        const colorClase = r.status === 'completed' ? 'text-green-400' :
                          (r.status === 'accepted' ? 'text-blue-400' : 'text-yellow-400');
        const telefonoCliente = r.phone || '';
        const telefonoClean = telefonoCliente.replace('+52', '');
        const botonesContacto = telefonoClean ? `
            <div class="flex space-x-2 mt-2">
                <button onclick="event.stopPropagation(); window.open('tel:+52${telefonoClean}', '_self')" class="bg-green-600 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase">📞 Llamar</button>
                <button onclick="event.stopPropagation(); window.open('https://wa.me/+52${telefonoClean}', '_blank')" class="bg-green-600 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase">💬 WhatsApp</button>
            </div>
        ` : '';

        const navBtn = `<button onclick="event.stopPropagation(); window.open('https://www.google.com/maps/dir/?api=1&destination=${r.lat || TALLER_LAT},${r.lng || TALLER_LNG}', '_blank')" class="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-[0.6rem] font-bold uppercase">NAVEGAR 🏍️</button>`;
        const detailBtn = `<button onclick="event.stopPropagation(); window.openDetalleServicio('${r.id}')" class="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-[0.6rem] font-bold uppercase">VER DETALLES</button>`;

       listaDiv.innerHTML += `
    <div class="sos-card-compact" onclick="window.centrarMapaEnSOS('${r.id}')">
                <div class="flex justify-between items-center">
                    <span class="text-[0.8rem] font-bold">${escapeHtml(r.phone) || ''}</span>
                    <span class="text-[0.6rem] px-1.5 py-0.5 rounded font-bold uppercase ${colorClase}">${estadoTexto}</span>
                </div>
                <p class="text-[0.7rem] text-gray-400 truncate">${escapeHtml(r.falla || '')}</p>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-naranja text-xs font-bold">$${r.costoRescateEstimado?.toFixed(2) || 0}</span>
                    <span class="text-[9px] text-gray-500">${new Date(r.timestamp).toLocaleDateString()}</span>
                </div>
                <div class="flex gap-1 mt-1 flex-wrap">
                    ${navBtn}
                    ${detailBtn}
                </div>
                ${botonesContacto}
            </div>
        `;
    });
}
window.cargarListadoSOS = cargarListadoSOS;
window.renderSOSMapa = renderSOSMapa;
window.mostrarOpcionesContacto = mostrarOpcionesContacto;

// aqui inicia renderSOSMapa (pulso naranja y zoom con personal)
async function renderSOSMapa() {
    const mapEl = document.getElementById('admin-sos-global-map');
    if (!mapEl) return;

    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://carto.com/">CARTO</a>';

    if (!adminSOSGlobalMapInst) {
        adminSOSGlobalMapInst = L.map(mapEl, {
            zoomControl: true,
            scrollWheelZoom: true,
            attributionControl: false
        }).setView([TALLER_LAT, TALLER_LNG], 11);
        L.tileLayer(layerUrl, { attribution }).addTo(adminSOSGlobalMapInst);
        L.marker([TALLER_LAT, TALLER_LNG], {
            icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] }),
            interactive: false
        }).addTo(adminSOSGlobalMapInst);
    } else {
        adminSOSGlobalMapInst.eachLayer(layer => {
            if (layer instanceof L.TileLayer) adminSOSGlobalMapInst.removeLayer(layer);
        });
        L.tileLayer(layerUrl, { attribution }).addTo(adminSOSGlobalMapInst);
    }

    Object.values(adminSOSMarkers).forEach(m => {
    if (adminSOSGlobalMapInst && m && m.remove) m.remove();
});
adminSOSMarkers = {};

    if (window._adminSOSTrackingListeners) {
        Object.values(window._adminSOSTrackingListeners).forEach(unsub => unsub());
        window._adminSOSTrackingListeners = {};
    }
    if (window._adminSOSRouteLines) {
        Object.values(window._adminSOSRouteLines).forEach(line => {
            if (line && line.remove) line.remove();
        });
        window._adminSOSRouteLines = {};
    }

    let q = query(collection(db, "rescates"));
    if (sosFechaInicio && sosFechaFin) {
        const startDate = new Date(sosFechaInicio);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(sosFechaFin);
        endDate.setHours(23,59,59,999);
        q = query(q, where("timestamp", ">=", startDate.getTime()), where("timestamp", "<=", endDate.getTime()));
    }
    const snap = await getDocs(q);
    const rescates = [];
    snap.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        rescates.push(data);
    });

    // Después de tener el array `rescates`
let filtered = rescates;
let allBounds = [];   // ← agrega esta línea
if (window.sosFiltroUnicoId) {
    filtered = rescates.filter(r => r.id === window.sosFiltroUnicoId);
} else {
    // Aplicar filtro por estatus (igual que en cargarListadoSOS)
    if (window.currentSOSFilter === 'pending') {
        filtered = rescates.filter(r => r.status === 'pending');
    } else if (window.currentSOSFilter === 'accepted') {
        filtered = rescates.filter(r => r.status === 'accepted' || r.status === 'repairing');
    } else if (window.currentSOSFilter === 'completed') {
        filtered = rescates.filter(r => r.status === 'completed');
    }
}

// Luego iteras sobre `filtered` en lugar de `rescates`
for (const r of filtered) {
        if (!r.lat || !r.lng) continue;
        allBounds.push([r.lat, r.lng]);

        const isCompleted = r.status === 'completed';
        const markerColor = isCompleted ? '#22c55e' : '#FF6B00';
        const iconHtml = isCompleted ? '🏍️✅' : '🏍️';
        const marker = L.marker([r.lat, r.lng], {
            icon: L.divIcon({
                className: 'gps-pulse-marker',
                html: `<div class="pulse-inner" style="background:${markerColor}; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; border:2px solid white; box-shadow:0 0 0 rgba(0,0,0,0.3);">${iconHtml}</div>`,
                iconSize: [32,32],
                iconAnchor: [16,16]
            })
        }).addTo(adminSOSGlobalMapInst);
        adminSOSMarkers[r.id] = marker;

        if (r.status === 'accepted' && r.mech_uid) {
            const mechUserSnap = await getDoc(doc(db, "users", r.mech_uid));
            const mechData = mechUserSnap.exists() ? mechUserSnap.data() : { name: 'Mecánico', phone: '' };
            const calificacion = await obtenerPromedioCalificacion(r.mech_uid);
            const stars = calificacion ? '★'.repeat(Math.round(calificacion.promedio)) + '☆'.repeat(5 - Math.round(calificacion.promedio)) : '☆☆☆☆☆';
            const ratingText = calificacion ? `${calificacion.promedio} ⭐ (${calificacion.total} reseñas)` : 'Sin reseñas';
            const telefono = mechData.phone || '';
            const telefonoClean = telefono.replace('+52', '');
            const nombre = mechData.name || 'Mecánico';

            const popupContent = `
                <div style="font-size:12px; font-family:sans-serif; min-width:220px; background:${isLight ? '#ffffff' : '#1A1A1A'}; color:${isLight ? '#111111' : '#ffffff'}; border-radius:16px; padding:10px; border:1px solid #FF6B00;">
                    <b>${escapeHtml(nombre)}</b><br>
                    <span style="color:#FFD700; font-size:14px;">${stars}</span> <span style="font-size:10px;">${ratingText}</span><br>
                    ${telefono ? `📞 ${escapeHtml(telefono)}<br>` : ''}
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                        ${telefonoClean ? `<button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">📞 Llamar</button>` : ''}
                        ${telefonoClean ? `<button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">💬 WhatsApp</button>` : ''}
                        <button onclick="window.openStaffDetail('${r.mech_uid}')" style="background:#3b82f6; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">Ver perfil</button>
                    </div>
                </div>
            `;

            const trackingRef = dbRef(rtdb, `mecanicos_activos/${r.mech_uid}`);
            const listener = onValue(trackingRef, (posSnap) => {
                if (posSnap.exists() && adminSOSGlobalMapInst) {
                    const pos = posSnap.val();
                    if (pos.lat && pos.lng) {
                        let mechMarker = adminSOSMarkers[`mech_${r.id}`];
                        if (!mechMarker) {
                            mechMarker = L.marker([pos.lat, pos.lng], {
                                icon: L.divIcon({
                                    className: 'mech-pulse-marker',
                                    html: '<div class="pulse-inner" style="background:#22c55e; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; border:2px solid white;"><i class="fas fa-motorcycle" style="color:white; font-size:16px;"></i></div>',
                                    iconSize: [32,32],
                                    iconAnchor: [16,32]
                                })
                            }).addTo(adminSOSGlobalMapInst).bindPopup(popupContent);
                            adminSOSMarkers[`mech_${r.id}`] = mechMarker;
                        } else {
                            mechMarker.setLatLng([pos.lat, pos.lng]);
                            mechMarker.setPopupContent(popupContent);
                        }
                        allBounds.push([pos.lat, pos.lng]);

                        let routeControl = window._adminSOSRouteLines ? window._adminSOSRouteLines[r.id] : null;
                        if (routeControl) {
                            routeControl.setWaypoints([
                                L.latLng(pos.lat, pos.lng),
                                L.latLng(r.lat, r.lng)
                            ]);
                        } else {
                            routeControl = L.Routing.control({
                                waypoints: [
                                    L.latLng(pos.lat, pos.lng),
                                    L.latLng(r.lat, r.lng)
                                ],
                                routeWhileDragging: false,
                                language: 'es',
                                showAlternatives: false,
                                show: false,
                                collapsible: false,
                                lineOptions: { styles: [{ color: '#22c55e', weight: 5, opacity: 0.8 }] },
                                router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
                                createMarker: () => null
                            }).addTo(adminSOSGlobalMapInst);
                            if (!window._adminSOSRouteLines) window._adminSOSRouteLines = {};
                            window._adminSOSRouteLines[r.id] = routeControl;
                        }
                    }
                }
            });
            if (!window._adminSOSTrackingListeners) window._adminSOSTrackingListeners = {};
            window._adminSOSTrackingListeners[r.id] = listener;
        }
    }

    if (allBounds.length > 0) {
        const bounds = L.latLngBounds(allBounds);
        adminSOSGlobalMapInst.fitBounds(bounds, { padding: [50, 50] });
    } else {
        adminSOSGlobalMapInst.setView([TALLER_LAT, TALLER_LNG], 11);
    }
    // ✅ Aquí va el setTimeout
setTimeout(() => {
    if (adminSOSGlobalMapInst) adminSOSGlobalMapInst.invalidateSize();
}, 200);
    window.fixMaps?.();
}

// aqui finaliza renderSOSMapa

// aqui inicia iniciarSeguimientoPersonalSOS mejorado
function iniciarSeguimientoPersonalSOS() {
    if (sosPersonalUnsubscribe) {
        sosPersonalUnsubscribe();
        sosPersonalUnsubscribe = null;
    }

    sosPersonalUnsubscribe = onValue(dbRef(rtdb, 'mecanicos_activos'), async (snap) => {
        if (!adminSOSGlobalMapInst) return;

        const userMap = new Map();
        const promises = [];
        snap.forEach(child => {
            const uid = child.key;
            promises.push(getDoc(doc(db, "users", uid)).then(docSnap => {
                if (docSnap.exists()) userMap.set(uid, docSnap.data());
            }));
        });
        await Promise.all(promises);

        const currentUids = new Set();
        snap.forEach(child => currentUids.add(child.key));
        Object.keys(sosPersonalMarkers).forEach(uid => {
            if (!currentUids.has(uid)) {
                adminSOSGlobalMapInst.removeLayer(sosPersonalMarkers[uid]);
                delete sosPersonalMarkers[uid];
            }
        });

        const tasks = [];
        snap.forEach(child => {
            tasks.push((async () => {
                const pos = child.val();
                const uid = child.key;
                const userData = userMap.get(uid);
                const nombre = userData?.name || 'Personal';
                const telefono = userData?.phone || '';
                const telefonoClean = telefono.replace('+52', '');
                const calificacion = await obtenerPromedioCalificacion(uid);
                const stars = calificacion ? '★'.repeat(Math.round(calificacion.promedio)) + '☆'.repeat(5 - Math.round(calificacion.promedio)) : '☆☆☆☆☆';
                const ratingText = calificacion ? `${calificacion.promedio} ⭐ (${calificacion.total} reseñas)` : 'Sin reseñas';

                if (pos && pos.lat && pos.lng) {
// Dentro de iniciarSeguimientoPersonal(), en la creación del popupContent
const esModoClaro = document.body.classList.contains('light-mode');
const bgColor = esModoClaro ? '#ffffff' : '#1A1A1A';
const textColor = esModoClaro ? '#111111' : '#ffffff';
const borderColor = esModoClaro ? '#FF6B00' : '#FF6B00'; // el naranja igual

const popupContent = `
    <div style="font-size:12px; font-family:sans-serif; min-width:220px; background:${bgColor}; color:${textColor}; border-radius:16px; padding:10px; border:1px solid ${borderColor};">
        <b>${escapeHtml(nombre)}</b><br>
        <span style="color:#FFD700; font-size:14px;">${stars}</span> <span style="font-size:10px;">${ratingText}</span><br>
        ${telefono ? `📞 ${escapeHtml(telefono)}<br>` : ''}
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${telefonoClean ? `<button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">📞 Llamar</button>` : ''}
            ${telefonoClean ? `<button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">💬 WhatsApp</button>` : ''}
            <button onclick="window.openStaffDetail('${uid}')" style="background:#3b82f6; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">Ver perfil</button>
        </div>
    </div>
`;
                    let marker = sosPersonalMarkers[uid];
                    if (marker) {
                        marker.setLatLng([pos.lat, pos.lng]);
                        marker.setPopupContent(popupContent);
                    } else {
                        marker = L.marker([pos.lat, pos.lng], {
                            icon: L.divIcon({
                                className: 'sos-personal-marker',
                                html: `<div style="background:#3b82f6; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:14px; color:white;">🏍️</div>`,
                                iconSize: [28,28],
                                iconAnchor: [14,14]
                            })
                        }).addTo(adminSOSGlobalMapInst);
                        marker.bindPopup(popupContent);
                        sosPersonalMarkers[uid] = marker;
                    }
                } else {
                    if (sosPersonalMarkers[uid]) {
                        adminSOSGlobalMapInst.removeLayer(sosPersonalMarkers[uid]);
                        delete sosPersonalMarkers[uid];
                    }
                }
            })());
        });
        await Promise.all(tasks);
    });
}
// aqui finaliza iniciarSeguimientoPersonalSOS
// ---------- Funciones de filtro (respetando el nombre usado en HTML) ----------
window.filtrarSOSPorEstatus = (estatus) => {
    window.currentSOSFilter = estatus; // 'todos', 'pending', 'accepted', 'completed'
    window.sosFiltroUnicoId = null;   // Resetear filtro individual
    // Actualizar la UI de los botones
    document.querySelectorAll('.filter-btn-sos-estatus').forEach(btn => {
        btn.classList.remove('bg-white/20', 'border-white/30');
        btn.classList.add('bg-white/5', 'border-white/10');
        if (btn.getAttribute('data-sos-estatus') === estatus) {
            btn.classList.remove('bg-white/5', 'border-white/10');
            btn.classList.add('bg-white/20', 'border-white/30');
        }
    });
    // Refrescar listado y mapa
    cargarListadoSOS();
    renderSOSMapa();
};

// Mantener compatibilidad con la función antigua (si se llama)
window.filterSOS = (status) => {
    window.filtrarSOSPorEstatus(status);
};

// ---------- Función principal de renderizado ----------
window.renderSOSGlobalMap = async () => {
    console.log('🔄 renderSOSGlobalMap ejecutado');
    if (!auth.currentUser) return;
    // Forzar filtro a 'pending' si es la primera vez o si no hay filtro activo
    if (!window.currentSOSFilter || window.currentSOSFilter === 'todos') {
        window.currentSOSFilter = 'pending';
        // Marcar visualmente el botón de pendientes
        document.querySelectorAll('.filter-btn-sos-estatus').forEach(btn => {
            btn.classList.remove('bg-white/20', 'border-white/30');
            btn.classList.add('bg-white/5', 'border-white/10');
            if (btn.getAttribute('data-sos-estatus') === 'pending') {
                btn.classList.remove('bg-white/5', 'border-white/10');
                btn.classList.add('bg-white/20', 'border-white/30');
            }
        });
    }
    await cargarListadoSOS();
    await renderSOSMapa();
    iniciarSeguimientoPersonalSOS();
};

// ---------- Filtro por fecha ----------
window.cargarSOSConFiltroFecha = async () => {
    const inicio = document.getElementById('sos-fecha-inicio')?.value;
    const fin = document.getElementById('sos-fecha-fin')?.value;
    sosFechaInicio = inicio;
    sosFechaFin = fin;
    await cargarListadoSOS();
    await renderSOSMapa();
};

// ---------- Generar reporte PDF/CSV ----------
window.generarReporteSOS = async () => {
    const tipo = await new Promise((resolve) => {
        const modalId = 'modal-reporte-sos-opciones';
        let modalEl = document.getElementById(modalId);
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = modalId;
            modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
            modalEl.innerHTML = `
                <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-naranja/30 text-center">
                    <h2 class="text-xl font-black text-white mb-4">Generar Reporte de SOS</h2>
                    <div class="space-y-3">
                        <button id="reporte-sos-pdf" class="w-full bg-red-600 text-white py-3 rounded-xl font-black uppercase">PDF</button>
                        <button id="reporte-sos-csv" class="w-full bg-green-600 text-white py-3 rounded-xl font-black uppercase">CSV</button>
                        <button id="reporte-sos-ambos" class="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase">Ambos</button>
                        <button onclick="toggleModal('${modalId}', false)" class="w-full bg-gray-600 text-white py-3 rounded-xl font-black uppercase">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
            document.getElementById('reporte-sos-pdf').onclick = () => { toggleModal(modalId, false); resolve('pdf'); };
            document.getElementById('reporte-sos-csv').onclick = () => { toggleModal(modalId, false); resolve('csv'); };
            document.getElementById('reporte-sos-ambos').onclick = () => { toggleModal(modalId, false); resolve('ambos'); };
        }
        toggleModal(modalId, true);
    });
    if (!tipo) return;

    let q = query(collection(db, "rescates"));
    if (sosFechaInicio && sosFechaFin) {
        const startDate = new Date(sosFechaInicio);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(sosFechaFin);
        endDate.setHours(23,59,59,999);
        q = query(q, where("timestamp", ">=", startDate.getTime()), where("timestamp", "<=", endDate.getTime()));
    }
    const snap = await getDocs(q);
    const rescates = [];
    snap.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        rescates.push(data);
    });
    if (rescates.length === 0) {
        showToast("No hay datos en el rango de fechas seleccionado", true);
        return;
    }

    if (tipo === 'pdf' || tipo === 'ambos') {
        const { jsPDF } = window.jspdf;
        const pdfDoc = new jsPDF();
        const logoImg = new Image();
        logoImg.src = 'logo_oscuro.png';
        await new Promise(resolve => { logoImg.onload = resolve; if (logoImg.complete) resolve(); });
        const addFooter = window._setupProfessionalPDF(pdfDoc, 'REPORTE DE SOLICITUDES SOS', logoImg);
        pdfDoc.setFontSize(16);
        pdfDoc.text(`Reporte de SOS (${sosFechaInicio || 'inicio'} - ${sosFechaFin || 'fin'})`, 14, 30);
        const bodyRows = rescates.map(r => [
            new Date(r.timestamp).toLocaleDateString(),
            r.clientName || r.phone || 'Anónimo',
            r.falla?.substring(0, 40) || '',
            r.status,
            `$${r.costoRescateEstimado?.toFixed(2) || 0}`
        ]);
        pdfDoc.autoTable({
            startY: 40,
            head: [['Fecha', 'Cliente', 'Falla', 'Estado', 'Costo']],
            body: bodyRows,
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [255,107,0] }
        });
        addFooter(pdfDoc);
        pdfDoc.save(`Reporte_SOS_${new Date().toISOString().slice(0,19)}.pdf`);
    }
    if (tipo === 'csv' || tipo === 'ambos') {
        const rows = [['Fecha', 'Cliente', 'Falla', 'Estado', 'Costo']];
        rescates.forEach(r => {
            rows.push([
                new Date(r.timestamp).toLocaleDateString(),
                r.clientName || r.phone || '',
                r.falla || '',
                r.status,
                r.costoRescateEstimado?.toFixed(2) || 0
            ]);
        });
        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csvContent));
        link.setAttribute('download', `SOS_${new Date().toISOString().slice(0,19)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// ---------- Funciones de aceptar, cancelar, cambiar estado (mantenidas igual) ----------
window.acceptSOS = (id) => {
    window.currentSOSId = id;
    loadMecanicosActivosParaAsignar(id);
    toggleModal('modal-asignar-mecanico', true);
};

window.cancelSOS = async (id) => {
    window.confirmModal("¿Cancelar este servicio SOS? El cliente podrá solicitar un nuevo auxilio.", async () => {
        const docRef = doc(db, "rescates", id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;
        const data = snap.data();
        
        // Actualizar estado a 'cancelled'
        await updateDoc(docRef, { 
            status: 'cancelled',
            tallerStatus: 'cancelado',
            canceladoEn: Date.now()
        });
        
        // Eliminar la alerta en tiempo real para que el cliente pueda solicitar otro rescate
        if (data.uid) {
            await remove(dbRef(rtdb, 'sos_alerts/' + data.uid));
            // Notificar al cliente (opcional, sin TTS para no saturar)
            await push(dbRef(rtdb, 'sos_alerts/' + data.uid + '/notifs'), {
                msg: '❌ Tu solicitud no se ha podido aceptar. Puedes generar una nueva solicitud si lo deseas.'
            });
        }
        
        // Refrescar listado y mapa en el panel de admin
        window.cargarListadoSOS();
        window.renderSOSMapa();
        window.adminListenServices(); // para actualizar el kanban de taller
        
        showToast("Servicio cancelado");
        toggleModal('modal-detalle-servicio', false);
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
        case 'cancelled': updates.status = 'cancelled'; updates.tallerStatus = 'cancelado'; notifMsg = 'El taller ha cancelado el servicio.'; finalizar = true; break;
    }
    await updateDoc(docRef, updates);
    
    // Si es cancelado, eliminar alerta RTDB
    if (newStatus === 'cancelled') {
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().uid) {
            await remove(dbRef(rtdb, 'sos_alerts/' + snap.data().uid));
        }
    }

    if (finalizar && window.activeMechanicSOSId === id) {
        // ... (código existente para consolidar tracking)
    }

    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().uid) {
        rtdbSet(dbRef(rtdb, 'sos_alerts/' + snap.data().uid), { ...snap.data(), ...updates });
        if (notifMsg) push(dbRef(rtdb, 'sos_alerts/' + snap.data().uid + '/notifs'), { msg: notifMsg });
    }
    showToast('Estado actualizado');
    window.renderSOSGlobalMap();
};

// ========== POS MECÁNICO MEJORADO ==========
let currentMechanicSOSId = null;
let mechanicRescueCost = 0;
let mechanicTicket = []; // { type, id, name, price, cost, garantia? }

// Abrir POS mecánico para un servicio específico
window.openMechanicPOS = async (sosId) => {
    currentMechanicSOSId = sosId;
    mechanicTicket = [];
    
    // Obtener costo del rescate
    const sosSnap = await getDoc(doc(db, "rescates", sosId));
    if (sosSnap.exists()) {
        mechanicRescueCost = sosSnap.data().costoRescateEstimado || 0;
    } else {
        mechanicRescueCost = 0;
    }
    
    // Renderizar productos y ticket
    renderMechanicProducts();
    renderMechanicTicket();
    updateMechanicTotal();
    
    toggleModal('modal-mechanic-pos', true);
};

// Renderizar productos del almacén (con imagen, nombre, precio, stock)
function renderMechanicProducts() {
    const container = document.getElementById('mech-products-grid');
    if (!container) return;
    
    const searchTerm = (document.getElementById('mech-product-search')?.value || '').toLowerCase();
    const filtered = adminInventoryList.filter(p => p.stock > 0 && (p.name.toLowerCase().includes(searchTerm) || (p.id && p.id.toLowerCase().includes(searchTerm))));
    
    container.innerHTML = '';
    filtered.forEach(p => {
        const price = p.priceTaller || p.pricePublic || 0;
        container.innerHTML += `
            <div onclick="addToMechanicTicket({ type: 'producto', id: '${p.id}', name: '${escapeHtml(p.name)}', price: ${price}, cost: ${p.cost || 0}, stock: ${p.stock} })" 
                 class="bg-white/5 p-3 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-white/10">
                <div class="w-full h-20 bg-black/30 rounded-lg flex items-center justify-center mb-2 overflow-hidden">
                    ${p.imgUrl ? `<img src="${p.imgUrl}" class="max-h-full max-w-full object-contain">` : '<i class="fas fa-box text-3xl text-gray-500"></i>'}
                </div>
                <p class="text-sm font-bold text-white truncate">${escapeHtml(p.name)}</p>
                <p class="text-naranja font-black text-lg">$${price.toFixed(2)}</p>
                <p class="text-[10px] text-green-400">Stock: ${p.stock}</p>
            </div>
        `;
    });
    if (filtered.length === 0) container.innerHTML = '<p class="text-gray-400 text-center col-span-full">No hay productos con stock</p>';
}

// Agregar ítem al ticket
window.addToMechanicTicket = (item) => {
    // Validar stock si es producto
    if (item.type === 'producto') {
        const product = adminInventoryList.find(p => p.id === item.id);
        if (!product || product.stock <= 0) {
            window.showToast("Sin stock disponible", true);
            return;
        }
    }
    mechanicTicket.push({
        type: item.type,
        id: item.id,
        name: item.name,
        price: item.price,
        cost: item.cost || 0,
        garantia: item.garantia || null
    });
    renderMechanicTicket();
    updateMechanicTotal();
};

// Eliminar ítem del ticket
window.removeFromMechanicTicket = (index) => {
    mechanicTicket.splice(index, 1);
    renderMechanicTicket();
    updateMechanicTotal();
};

// Renderizar ticket (lista de ítems)
function renderMechanicTicket() {
    const container = document.getElementById('mech-ticket-items');
    if (!container) return;
    if (mechanicTicket.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center text-xs">Sin productos o cargos</p>';
        return;
    }
    container.innerHTML = '';
    mechanicTicket.forEach((item, idx) => {
        container.innerHTML += `
            <div class="flex justify-between items-center bg-black/30 p-2 rounded-xl">
                <div class="flex-1">
                    <p class="text-sm font-bold text-white">${escapeHtml(item.name)}</p>
                    <p class="text-[10px] text-gray-400">${item.type === 'producto' ? 'Producto' : 'Cargo manual'}</p>
                </div>
                <div class="flex items-center space-x-3">
                    <span class="text-naranja font-black">$${item.price.toFixed(2)}</span>
                    <button onclick="removeFromMechanicTicket(${idx})" class="text-red-400 hover:text-red-300"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;
    });
}

// Agregar cargo manual
window.addManualChargeToMechanicPOS = () => {
    // Crear modal dinámico interno
    const modalId = 'modal-manual-charge-mechanic';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[400] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-yellow-500/30 shadow-2xl">
                <h3 class="text-xl font-black text-white mb-4 text-center">Cargo Manual</h3>
                <input type="text" id="manual-charge-concept" placeholder="Concepto (ej. Mano de obra)" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl mb-3 text-white">
                <input type="number" id="manual-charge-amount" placeholder="Monto ($)" class="w-full bg-white/5 border border-white/10 p-3 rounded-xl mb-4 text-white">
                <div class="flex space-x-3">
                    <button id="confirm-manual-charge" class="flex-1 bg-green-600 text-white py-2 rounded-xl font-black uppercase">Agregar</button>
                    <button id="cancel-manual-charge" class="flex-1 bg-gray-600 text-white py-2 rounded-xl font-black uppercase">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        
        document.getElementById('confirm-manual-charge').onclick = () => {
            const concepto = document.getElementById('manual-charge-concept').value.trim();
            const monto = parseFloat(document.getElementById('manual-charge-amount').value);
            if (!concepto || isNaN(monto) || monto <= 0) {
                window.showToast("Concepto y monto válido requeridos", true);
                return;
            }
            window.addToMechanicTicket({
                type: 'manual',
                id: null,
                name: concepto,
                price: monto,
                cost: 0
            });
            window.toggleModal(modalId, false);
            // Limpiar campos
            document.getElementById('manual-charge-concept').value = '';
            document.getElementById('manual-charge-amount').value = '';
        };
        document.getElementById('cancel-manual-charge').onclick = () => {
            window.toggleModal(modalId, false);
        };
    }
    window.toggleModal(modalId, true);
};
// Finalizar cobro (guardar en cobros_pendientes, descontar stock y finalizar servicio para el cliente)
window.finalizeMechanicCharge = async () => {
    if (!currentMechanicSOSId) return window.showToast("No hay servicio activo", true);

    const total = mechanicRescueCost + mechanicTicket.reduce((s, i) => s + i.price, 0);

    // 1. Descontar stock de productos
    for (let item of mechanicTicket) {
        if (item.type === 'producto' && item.id) {
            const prodRef = doc(db, "inventario", item.id);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
                const newStock = (prodSnap.data().stock || 0) - 1;
                await updateDoc(prodRef, { stock: Math.max(0, newStock) });
            }
        }
    }

    // 2. Obtener datos del servicio
    const sosSnap = await getDoc(doc(db, "rescates", currentMechanicSOSId));
    if (!sosSnap.exists()) return window.showToast("Servicio no encontrado", true);
    const sosData = sosSnap.data();
    const clienteName = sosData.clientName || sosData.phone || "Cliente";
    const pendingId = generateShortId();

    // 3. Registrar la venta (si total > 0)
    if (total > 0) {
        await addDoc(collection(db, "cobros_pendientes"), {
            pendingId: pendingId,
            sosId: currentMechanicSOSId,
            cliente: clienteName,
            mech_uid: auth.currentUser.uid,
            mech_name: window.currentUserDoc?.name || 'Mecánico',
            concepto: `Servicio ${sosData.shortId || currentMechanicSOSId}`,
            monto: total,
            ticket: mechanicTicket,
            rescueCost: mechanicRescueCost,
            estado: 'pendiente',
            timestamp: Date.now(),
            metodoPago: 'Pendiente'
        });

        const ventaRef = await addDoc(collection(db, "ventas"), {
            shortId: pendingId,
            desc: mechanicTicket.map(i => i.name).join(", "),
            total: total,
            costo: mechanicTicket.reduce((s, i) => s + (i.cost || 0), 0),
            metodoPago: 'Pendiente',
            ticket: mechanicTicket,
            sosId: currentMechanicSOSId,
            rescueCost: mechanicRescueCost,
            fecha: new Date().toISOString(),
            estado: 'pendiente'
        });

        await set(dbRef(rtdb, 'notificaciones_caja/cobro_' + Date.now()), {
            msg: `Nuevo cobro pendiente de ${clienteName} por $${total.toFixed(2)}`,
            type: 'cobro_mecanico',
            pendingId: pendingId,
            mech_name: window.currentUserDoc?.name
        });

        window.showToast(`Cobro registrado por $${total.toFixed(2)}. Espera confirmación del administrador.`);
    } else {
        await updateDoc(doc(db, "rescates", currentMechanicSOSId), {
            tallerStatus: 'pagado',
            status: 'completed',
            pagadoEn: Date.now()
        });
        window.showToast("Servicio finalizado sin costo adicional.");
    }

    // 4. Finalizar servicio para el cliente
    await finalizarServicioParaCliente(currentMechanicSOSId);

    // 5. Limpiar
    toggleModal('modal-mechanic-pos', false);
    currentMechanicSOSId = null;
    mechanicTicket = [];
    mechanicRescueCost = 0;
};
// Función auxiliar para que el cliente vea el servicio finalizado (encuesta)
async function finalizarServicioParaCliente(sosId) {
    // 1. Actualizar el servicio a completado y pagado
    await updateDoc(doc(db, "rescates", sosId), { 
        status: 'completed',
        tallerStatus: 'pagado' 
    });

    // 2. Obtener datos para notificar al cliente
    const sosSnap = await getDoc(doc(db, "rescates", sosId));
    if (sosSnap.exists() && sosSnap.data().uid) {
        const uid = sosSnap.data().uid;
        const data = sosSnap.data();
        
        // ✅ ACTUALIZAR el nodo sos_alerts en lugar de eliminar
        const sosAlertsRef = dbRef(rtdb, 'sos_alerts/' + uid);
        await set(sosAlertsRef, { 
            ...data, 
            status: 'completed',
            tallerStatus: 'pagado'
        });
        
        // Enviar notificación al cliente
        await push(dbRef(rtdb, 'sos_alerts/' + uid + '/notifs'), {
            msg: '✅ Tu servicio ha sido finalizado y pagado. ¡Califícanos!'
        });
    }
}

window.mechApplyPromo = async function() {
    const code = document.getElementById('mech-promo-code')?.value.trim().toUpperCase();
    if (!code) return window.showToast("Ingresa un código promocional", true);
    
    const snap = await getDocs(query(collection(db, "promociones"), where("codigo", "==", code), where("active", "==", true), limit(1)));
    if (!snap.empty) {
        const promo = snap.docs[0].data();
        let discount = 0;
        if (promo.tipoRecompensa === 'desc_fijo') {
            discount = parseFloat(promo.valorRecompensa);
        } else if (promo.tipoRecompensa === 'desc_porc') {
            const total = mechanicRescueCost + mechanicTicket.reduce((s, i) => s + i.price, 0);
            discount = total * (parseFloat(promo.valorRecompensa) / 100);
        }
        window.mechanicPromoDiscount = discount;
        window.mechanicPromoCode = code;
        updateMechanicTotal();
        window.showToast(`Código ${code} aplicado. Descuento: $${discount.toFixed(2)}`);
    } else {
        window.showToast("Código inválido", true);
    }
};

// Modifica updateMechanicTotal para incluir el descuento (reemplázala)
function updateMechanicTotal() {
    const itemsTotal = mechanicTicket.reduce((sum, i) => sum + i.price, 0);
    let total = mechanicRescueCost + itemsTotal;
    const discount = window.mechanicPromoDiscount || 0;
    total = Math.max(0, total - discount);
    document.getElementById('mech-rescue-cost').innerText = `$${mechanicRescueCost.toFixed(2)}`;
    document.getElementById('mech-items-subtotal').innerText = `$${itemsTotal.toFixed(2)}`;
    document.getElementById('mech-total').innerText = `$${total.toFixed(2)}`;
}

// ---------- Asignar mecánico y enviar WhatsApp ----------
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
    const sosSnap = await getDoc(doc(db, "rescates", sosId));
    if (!sosSnap.exists()) return showToast("SOS no encontrado", true);
    const sosData = sosSnap.data();

    await updateDoc(doc(db, "rescates", sosId), { 
        status: 'accepted', 
        mech_uid: mechUid, 
        mech_name: mech.name,
        acceptedAt: Date.now()
    });
    window.activeMechanicSOSId = sosId;

    const chatRef = await addDoc(collection(db, "chats"), {
        participantes: [sosData.uid, mechUid],
        nombres: { [sosData.uid]: sosData.clientName || "Cliente", [mechUid]: mech.name },
        titulo: `Servicio ${sosData.shortId}`,
        estado: 'activo',
        creado: Date.now()
    });
    window._sosChatId = chatRef.id;
    await updateDoc(doc(db, "rescates", sosId), { chatId: chatRef.id });

    if (sosData.uid) {
        await set(dbRef(rtdb, 'sos_alerts/' + sosData.uid), { 
            ...sosData, 
            status: 'accepted', 
            mech_uid: mechUid, 
            mech_name: mech.name,
            chatId: chatRef.id
        });
        await push(dbRef(rtdb, 'sos_alerts/' + sosData.uid + '/notifs'), { 
            msg: '✅ ¡Tu solicitud fue aceptada! El mecánico está en camino.' 
        });
        speakTTS('Tu solicitud fue aceptada. El mecánico está en camino.');
    }

    toggleModal('modal-asignar-mecanico', false);
    showToast(`✅ Mecánico ${mech.name} asignado correctamente.`);
    window.renderSOSGlobalMap?.();
    window.cargarListadoSOS?.();
};

window.tomarCasoDirecto = async () => {
    if (!auth.currentUser || !window.currentSOSId) {
        window.showToast("No hay un servicio seleccionado", true);
        return;
    }
    const mech = window.currentUserDoc;
    if (!mech || (mech.role !== 'mecanico' && mech.role !== 'admin')) {
        window.showToast("Solo mecánicos o administradores pueden tomar casos", true);
        return;
    }
    const sosId = window.currentSOSId;
    const sosSnap = await getDoc(doc(db, "rescates", sosId));
    if (!sosSnap.exists()) {
        window.showToast("Servicio no encontrado", true);
        return;
    }
    const sosData = sosSnap.data();
    
    // No permitir si ya tiene mecánico asignado
    if (sosData.mech_uid) {
        window.showToast("Este servicio ya tiene un mecánico asignado", true);
        return;
    }
    
    let servicioSeleccionado = sosData.falla || "servicio de auxilio";
    const match = servicioSeleccionado.match(/\[(.*?)\]/);
    if (match) servicioSeleccionado = match[1];
    
    // Actualizar el rescate
    await updateDoc(doc(db, "rescates", sosId), { 
        status: 'accepted', 
        mech_uid: auth.currentUser.uid, 
        mech_name: mech.name,
        acceptedAt: Date.now()
    });
    window.activeMechanicSOSId = sosId;
    
    // Notificar al cliente via RTDB
    if (sosData.uid) {
        await set(dbRef(rtdb, 'sos_alerts/' + sosData.uid), { ...sosData, status: 'accepted', mech_uid: auth.currentUser.uid });
        await push(dbRef(rtdb, 'sos_alerts/' + sosData.uid + '/notifs'), { msg: 'Mecánico asignado, en camino.' });
        window.speakTTS("Mecánico asignado, en camino.");
        if (sosData.phone) {
            // Llamar a la función de enviar WhatsApp (si existe)
            if (typeof enviarWhatsAppPersonalizado === 'function') {
                await enviarWhatsAppPersonalizado(
                    sosData.phone,
                    sosData.clientName || "cliente",
                    mech.name,
                    servicioSeleccionado
                );
            }
        }
    }
    window.showToast("Caso tomado por ti");
    window.toggleModal('modal-asignar-mecanico', false);
    // Refrescar listado y mapa en admin
    if (typeof window.cargarListadoSOS === 'function') window.cargarListadoSOS();
    if (typeof window.renderSOSMapa === 'function') window.renderSOSMapa();
    // También refrescar el detalle si está abierto
    if (currentDetalleServicioId === sosId) {
        window.openDetalleServicio(sosId);
    }
};

// ---------- Iniciar notificaciones TTS ----------
setTimeout(() => {
    iniciarNotificacionSOS();
}, 2000);

// Redimensionar mapa al cambiar de pestaña
window.addEventListener('visibilitychange', () => {
    if (!document.hidden && adminSOSGlobalMapInst) {
        setTimeout(() => adminSOSGlobalMapInst.invalidateSize(), 200);
        renderSOSMapa();
    }
});
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
    logoImg.src = 'logo_oscuro.png';
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
            document.getElementById('pay-efectivo').onclick = () => { toggleModal(modalId, false); resolve('Efectivo'); };
            document.getElementById('pay-tarjeta').onclick = () => { toggleModal(modalId, false); resolve('Tarjeta/Transferencia'); };
        }
        toggleModal(modalId, true);
    });
    if (!metodo) return;

    try {
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
                if (item.type === 'almacen' && item.id) {
                    const prodRef = doc(db, "inventario", item.id);
                    const prodSnap = await getDoc(prodRef);
                    if (prodSnap.exists()) {
                        const newStock = (prodSnap.data().stock || 0) - 1;
                        await updateDoc(prodRef, { stock: Math.max(0, newStock) });
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
        window.cargarCobrosMecanicosPanel();

        // Notificar al mecánico (CORREGIDO: usar set)
        if (cobro.mech_uid) {
            await set(dbRef(rtdb, 'notificaciones/' + cobro.mech_uid), {
                msg: `💰 Tu cobro por $${cobro.monto.toFixed(2)} ha sido pagado por caja.`
            });
        }
    } catch (e) {
        console.error(e);
        showToast("Error al procesar el pago: " + e.message, true);
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
                <input id="sch-${i}-o" type="time" value="${s.o}" class="bg-asfalto border border-white/10 p-2 rounded-lg text-white text-sm w-32 focus:border-naranja">
                <input id="sch-${i}-c" type="time" value="${s.c}" class="bg-asfalto border border-white/10 p-2 rounded-lg text-white text-sm w-32 focus:border-naranja">
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
    window.adminRefreshConfigUI(); // actualiza la UI
    window.adminSaveConfig();      // guarda en Firestore automáticamente
    // Limpiar inputs
    const kmInput = document.getElementById('new-km-limit');
    const priceInput = document.getElementById('new-km-price');
    if (kmInput) kmInput.value = '';
    if (priceInput) priceInput.value = '';
};

window.removeKmRange = (index) => {
    globalSettings.rescueKmRanges.splice(index, 1);
    window.adminRefreshConfigUI();
    window.adminSaveConfig();
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
    const containerPublic = document.getElementById('video-banner-container');
    const containerClient = document.getElementById('video-banner-container-client');
    if (!containerPublic && !containerClient) return;
    
    const now = new Date();
    const dayIndex = now.getDay();
    const todayVideo = globalSettings.videoSchedule?.[dayIndex];
    
    if (todayVideo && todayVideo.trim() !== '') {
        const videoHtml = `
            <div style="pointer-events: none; user-select: none; width: 100%; margin: 0 auto;">
                <video 
                    src="${todayVideo}" 
                    autoplay 
                    muted 
                    loop 
                    playsinline 
                    controlsList="nodownload nofullscreen"
                    class="w-full object-cover rounded-xl"
                    style="height: 180px; width: 100%;"
                    oncontextmenu="return false">
                </video>
            </div>
        `;
        if (containerPublic) {
            containerPublic.innerHTML = videoHtml;
            containerPublic.classList.remove('hidden');
            containerPublic.style.display = 'block';
        }
        if (containerClient) {
            containerClient.innerHTML = videoHtml;
            containerClient.classList.remove('hidden');
            containerClient.style.display = 'block';
        }
    } else {
        if (containerPublic) {
            containerPublic.classList.add('hidden');
            containerPublic.style.display = 'none';
        }
        if (containerClient) {
            containerClient.classList.add('hidden');
            containerClient.style.display = 'none';
        }
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
    logoImg.src = 'logo_oscuro.png';

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
// === ENTREGAS - VERSIÓN COMPLETA (con rutas reales y routing machine) ===
// ======================================================
// Variables globales
let entregasMarkers = {};
let repartidoresMarkers = {};
let entregasPedidosUnsubscribe = null;
let entregasRepartidoresUnsubscribe = null;
let currentEntregaFilter = 'todos';
let currentFechaInicio = null;
let currentFechaFin = null;

// ---------- Cargar listado lateral ----------
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
        return;
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
                    <span class="font-bold text-sm">${escapeHtml(p.cliente) || 'Cliente'}</span>
                    <span class="text-[10px] ${colorClase} font-black">${estadoTexto}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">${escapeHtml(p.items.map(i=>i.name).join(', '))}</p>
                <p class="text-xs font-bold text-naranja">$${p.total?.toFixed(2)}</p>
                <p class="text-[9px] text-gray-500">${new Date(p.timestamp).toLocaleDateString()}</p>
                ${botonesContacto}
            </div>
        `;
    });
};

// ---------- Renderizar mapa con pedidos y rutas reales (Leaflet Routing Machine) ----------
window.renderEntregasMapa = async () => {
    const mapEl = document.getElementById('entregas-map-container');
    if (!mapEl) return;

    const isLight = document.body.classList.contains('light-mode');
    const layerUrl = isLight ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    if (!entregasMapInst) {
        entregasMapInst = L.map(mapEl, { 
            zoomControl: true, 
            scrollWheelZoom: false,
            attributionControl: false      // ocultar atribución de Leaflet
        }).setView([TALLER_LAT, TALLER_LNG], 11);
        L.tileLayer(layerUrl, { attribution: '&copy; <a href="https://carto.com/">CARTO</a>' }).addTo(entregasMapInst);
        L.marker([TALLER_LAT, TALLER_LNG], {
            icon: L.divIcon({ className: 'obr-pin-marker', html: '<div class="obr-pin-icon"><i class="fas fa-store-alt text-white"></i></div>', iconSize: [36,36], iconAnchor: [18,36] }),
            interactive: false
        }).addTo(entregasMapInst);
    } else {
        entregasMapInst.eachLayer(layer => {
            if (layer instanceof L.TileLayer) entregasMapInst.removeLayer(layer);
        });
        L.tileLayer(layerUrl, { attribution: '&copy; <a href="https://carto.com/">CARTO</a>' }).addTo(entregasMapInst);
    }

    // Limpiar marcadores de pedidos antiguos y controles de ruta
    Object.values(entregasMarkers).forEach(m => {
        if (entregasMapInst) entregasMapInst.removeLayer(m);
    });
    entregasMarkers = {};

    // Limpiar rutas anteriores
    if (window._entregasRouteControls) {
        Object.values(window._entregasRouteControls).forEach(ctrl => {
            if (ctrl && ctrl.remove) ctrl.remove();
        });
        window._entregasRouteControls = {};
    }
    if (window._entregasTrackingListeners) {
        Object.values(window._entregasTrackingListeners).forEach(unsub => unsub());
        window._entregasTrackingListeners = {};
    }

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

    const allBounds = [];
    allBounds.push([TALLER_LAT, TALLER_LNG]);

    filtered.forEach(p => {
        if (!p.lat || !p.lng) return;
        allBounds.push([p.lat, p.lng]);

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
        const botones = telefonoClean ? `
            <div style="display:flex; gap:6px; margin-top:6px;">
                <button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:12px; padding:4px 8px;">📞 Llamar</button>
                <button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:12px; padding:4px 8px;">💬 WhatsApp</button>
            </div>
        ` : '';
        marker.bindPopup(`
            <div style="font-size:12px; min-width:150px;">
                <b>${escapeHtml(p.cliente)}</b><br>
                ${p.items.map(i=>i.name).join(', ')}<br>
                <b>$${p.total?.toFixed(2)}</b><br>
                Estado: ${p.estado_entrega || 'pendiente'}<br>
                ${botones}
                <button onclick="window.seleccionarEntregaDesdeMarker('${p.id}')" style="background:#FF6B00; color:white; border:none; border-radius:8px; padding:4px 8px; margin-top:4px;">Ver detalles</button>
            </div>
        `);
        entregasMarkers[p.id] = marker;

        // Si tiene repartidor asignado y el pedido está en camino o aceptado, crear ruta real
        if (p.repartidor_uid && (p.estado_entrega === 'en_camino' || p.status === 'aceptado')) {
            const trackingRef = dbRef(rtdb, `mecanicos_activos/${p.repartidor_uid}`);
            const listener = onValue(trackingRef, (posSnap) => {
                if (posSnap.exists() && entregasMapInst) {
                    const pos = posSnap.val();
                    if (pos.lat && pos.lng) {
                        // Marcador del repartidor (si no existe ya)
                        let repartidorMarker = entregasMarkers[`repartidor_${p.id}`];
                        if (!repartidorMarker) {
                            repartidorMarker = L.marker([pos.lat, pos.lng], {
                                icon: L.divIcon({
                                    className: 'repartidor-marker',
                                    html: '<div style="background:#3b82f6; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:14px; color:white;">🏍️</div>',
                                    iconSize: [28,28],
                                    iconAnchor: [14,14]
                                })
                            }).addTo(entregasMapInst);
                            entregasMarkers[`repartidor_${p.id}`] = repartidorMarker;
                        } else {
                            repartidorMarker.setLatLng([pos.lat, pos.lng]);
                        }

                        // Ruta real (Leaflet Routing Machine)
                        let routeControl = window._entregasRouteControls ? window._entregasRouteControls[p.id] : null;
                        if (routeControl) {
                            routeControl.setWaypoints([
                                L.latLng(pos.lat, pos.lng),
                                L.latLng(p.lat, p.lng)
                            ]);
                        } else {
routeControl = L.Routing.control({
    waypoints: [L.latLng(pos.lat, pos.lng), L.latLng(p.lat, p.lng)],
    routeWhileDragging: false,
    language: 'es',
    showAlternatives: false,
    show: false,
    collapsible: false,
    lineOptions: { styles: [{ color: '#22c55e', weight: 5, opacity: 0.8 }] },
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
    createMarker: () => null
}).addTo(entregasMapInst);
                            if (!window._entregasRouteControls) window._entregasRouteControls = {};
                            window._entregasRouteControls[p.id] = routeControl;
                        }
                    }
                }
            });
            if (!window._entregasTrackingListeners) window._entregasTrackingListeners = {};
            window._entregasTrackingListeners[p.id] = listener;
        }
    });

    // Ajustar vista a todos los puntos
    if (allBounds.length > 0) {
        const bounds = L.latLngBounds(allBounds);
        entregasMapInst.fitBounds(bounds, { padding: [50, 50] });
    } else {
        entregasMapInst.setView([TALLER_LAT, TALLER_LNG], 11);
    }
    window.fixMaps?.();
};

// ---------- Seguimiento en tiempo real de personal (repartidores/mecánicos/admins) con calificación y botón perfil ----------
function iniciarSeguimientoPersonal() {
    if (entregasRepartidoresUnsubscribe) {
        entregasRepartidoresUnsubscribe();
        entregasRepartidoresUnsubscribe = null;
    }

    entregasRepartidoresUnsubscribe = onValue(dbRef(rtdb, 'mecanicos_activos'), async (snap) => {
        if (!entregasMapInst) return;

        // Obtener datos de usuarios
        const userMap = new Map();
        const promises = [];
        snap.forEach(child => {
            const uid = child.key;
            promises.push(getDoc(doc(db, "users", uid)).then(docSnap => {
                if (docSnap.exists()) userMap.set(uid, docSnap.data());
            }));
        });
        await Promise.all(promises);

        // Eliminar marcadores de usuarios que ya no están activos
        const currentUids = new Set();
        snap.forEach(child => currentUids.add(child.key));
        Object.keys(repartidoresMarkers).forEach(uid => {
            if (!currentUids.has(uid)) {
                entregasMapInst.removeLayer(repartidoresMarkers[uid]);
                delete repartidoresMarkers[uid];
            }
        });

        // Procesar cada posición
        const tasks = [];
        snap.forEach(child => {
            tasks.push((async () => {
                const pos = child.val();
                const uid = child.key;
                const userData = userMap.get(uid);
                const nombre = userData?.name || 'Personal';
                const telefono = userData?.phone || '';
                const telefonoClean = telefono.replace('+52', '');
                const calificacion = await obtenerPromedioCalificacion(uid);
                const stars = calificacion ? '★'.repeat(Math.round(calificacion.promedio)) + '☆'.repeat(5 - Math.round(calificacion.promedio)) : '☆☆☆☆☆';
                const ratingText = calificacion ? `${calificacion.promedio} ⭐ (${calificacion.total} reseñas)` : 'Sin reseñas';

                if (pos && pos.lat && pos.lng) {
                    const esModoClaro = document.body.classList.contains('light-mode');
                    const bgColor = esModoClaro ? '#ffffff' : '#1A1A1A';
                    const textColor = esModoClaro ? '#111111' : '#ffffff';
                    const borderColor = esModoClaro ? '#FF6B00' : '#FF6B00';
                    const popupContent = `
                        <div style="font-size:12px; font-family:sans-serif; min-width:220px; background:${bgColor}; color:${textColor}; border-radius:16px; padding:10px; border:1px solid ${borderColor};">
                            <b>${escapeHtml(nombre)}</b><br>
                            <span style="color:#FFD700; font-size:14px;">${stars}</span> <span style="font-size:10px;">${ratingText}</span><br>
                            ${telefono ? `📞 ${escapeHtml(telefono)}<br>` : ''}
                            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                                ${telefonoClean ? `<button onclick="window.open('tel:+52${telefonoClean}', '_self')" style="background:#22c55e; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">📞 Llamar</button>` : ''}
                                ${telefonoClean ? `<button onclick="window.open('https://wa.me/+52${telefonoClean}', '_blank')" style="background:#25D366; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">💬 WhatsApp</button>` : ''}
                                <button onclick="window.openStaffDetail('${uid}')" style="background:#3b82f6; color:white; border:none; border-radius:20px; padding:5px 10px; font-size:10px; font-weight:bold; cursor:pointer;">Ver perfil</button>
                            </div>
                        </div>
                    `;
                    let marker = repartidoresMarkers[uid];
                    if (marker) {
                        marker.setLatLng([pos.lat, pos.lng]);
                        marker.setPopupContent(popupContent);
                    } else {
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
                    if (repartidoresMarkers[uid]) {
                        entregasMapInst.removeLayer(repartidoresMarkers[uid]);
                        delete repartidoresMarkers[uid];
                    }
                }
            })());
        });
        await Promise.all(tasks);
    });
}

// ---------- Filtros de fecha y estatus ----------
window.cargarEntregasConFiltroFecha = async () => {
    const inicio = document.getElementById('entregas-fecha-inicio')?.value;
    const fin = document.getElementById('entregas-fecha-fin')?.value;
    currentFechaInicio = inicio;
    currentFechaFin = fin;
    await window.cargarListadoEntregas();
    await window.renderEntregasMapa();
};

window.filtrarEntregasPorEstatus = (estatus) => {
    currentEntregaFilter = estatus;
    document.querySelectorAll('.filter-btn-estatus').forEach(btn => {
        btn.classList.remove('bg-white/20', 'border-white/30');
        btn.classList.add('bg-white/5', 'border-white/10');
        if (btn.getAttribute('data-estatus') === estatus) {
            btn.classList.remove('bg-white/5', 'border-white/10');
            btn.classList.add('bg-white/20', 'border-white/30');
        }
    });
    window.cargarListadoEntregas();
    window.renderEntregasMapa();
};

// ---------- Selección de entrega ----------
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
        rtdbSet(dbRef(rtdb, 'notificaciones_caja/pedido_' + Date.now()), { msg: 'Cobro de entrega pendiente', type: 'cobro_entrega', pedidoId: window.entregaSeleccionadaId, monto: total });
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

// ---------- Reportes PDF/CSV ----------
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

    if (tipo === 'pdf' || tipo === 'ambos') {
        const { jsPDF } = window.jspdf;
        const pdfDoc = new jsPDF();
        const logoImg = new Image();
        logoImg.src = 'logo_oscuro.png';
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
    if (tipo === 'csv' || tipo === 'ambos') {
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
};

// ---------- Función principal de carga ----------
window.loadEntregas = () => {
    console.log('🔄 loadEntregas ejecutado');
    if (!auth.currentUser) return;
    // Limpieza completa antes de iniciar
    if (entregasRepartidoresUnsubscribe) {
        entregasRepartidoresUnsubscribe();
        entregasRepartidoresUnsubscribe = null;
    }
    if (entregasPedidosUnsubscribe) {
        entregasPedidosUnsubscribe();
        entregasPedidosUnsubscribe = null;
    }
    if (entregasMapInst) {
        entregasMapInst.remove();
        entregasMapInst = null;
    }
    entregasMarkers = {};
    repartidoresMarkers = {};

    // Inicializar
    window.cargarListadoEntregas();
    window.renderEntregasMapa();
    iniciarSeguimientoPersonal();

    // Suscribirse a cambios en pedidos
    entregasPedidosUnsubscribe = onSnapshot(collection(db, "pedidos_online"), () => {
        window.cargarListadoEntregas();
        window.renderEntregasMapa();
    });
};

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
    logoImg.src = 'logo_oscuro.png';
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
// 🎨 MOTOR VISUAL GLOBAL Y CONFIGURACIÓN DE LIENZO PRESET (CORREGIDO)
// =========================================================================
window._setupProfessionalPDF = (doc, title, logoImg = null) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // ⚠️ ELIMINAMOS LA LIMPIEZA DE FONDO Y EL REDIBUJADO DEL ENCABEZADO
    // para no interferir con el contenido que ya se ha dibujado.
    
    // Solo retornamos el callback que añade el footer.
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
        // Columna izquierda (label)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        doc.text(row.label, x + 5, currentY);
        
        // Columna izquierda (value)
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(String(row.value || 'N/A'), x + 5 + (row.valueOffset || 18), currentY);
        
        // Columna derecha (label)
        if (row.rightLabel) {
            const labelX = x + (width / 2) + 5;
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            doc.text(row.rightLabel, labelX, currentY);
            
            // Columna derecha (value) - con ajuste automático de ancho
            const valueX = labelX + 5 + (row.rightOffset || 18);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            
            // Si el valor es largo, acortarlo visualmente o ajustar el espaciado
            let displayValue = String(row.rightValue || 'N/A');
            if (displayValue.length > 15) {
                displayValue = displayValue.substring(0, 14) + '…';
            }
            doc.text(displayValue, valueX, currentY);
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
    if (chatUnsubscribe) chatUnsubscribe();
    activeChatUid = chatId;

    getDoc(doc(db, "chats", chatId)).then(snap => {
        if (snap.exists()) {
            const data = snap.data();
            const titleEl = document.getElementById('chat-title');
            if (titleEl) titleEl.innerText = data.titulo || 'Chat';
        }
    });

    toggleModal('modal-chat-list', false);
    toggleModal('modal-chat', true);

    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';

    chatUnsubscribe = onSnapshot(collection(db, "chats", chatId, "mensajes"), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                if (msg.uid !== auth.currentUser.uid) {
                    playSound('notif');
                    const shortId = chatId.slice(-6);
                    speakTTS(`Tienes un nuevo mensaje del servicio OBR-${shortId}`);
                }
            }
        });

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

// ========== CHAT CON SOPORTE (ABRIR CHAT CON EL TALLER) ==========
window.openChatWithTaller = async function() {
    window.showToast("Contactando con el taller...", false);
    
    try {
        const uid = auth.currentUser.uid;
        if (!uid) {
            window.showToast("Inicia sesión para usar el chat.", true);
            return;
        }

        // 1. Buscar un chat existente entre el usuario y el taller (admin o taller)
        const q = query(
            collection(db, "chats"), 
            where("participantes", "array-contains", uid)
        );
        const snap = await getDocs(q);
        let chatId = null;

        for (const doc of snap.docs) {
            const data = doc.data();
            // Verificar si el chat tiene un participante admin o taller
            const otrosParticipantes = data.participantes.filter(id => id !== uid);
            for (const otroId of otrosParticipantes) {
                const userDoc = await getDoc(doc(db, "users", otroId));
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    if (role === 'admin' || role === 'taller' || role === 'socio') {
                        chatId = doc.id;
                        break;
                    }
                }
            }
            if (chatId) break;
        }

        // 2. Si no existe un chat con el taller, crear uno nuevo
        if (!chatId) {
            // Buscar un administrador o taller disponible
            const adminSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["admin", "taller", "socio"]), limit(1)));
            if (adminSnap.empty) {
                window.showToast("No hay personal disponible para atender tu solicitud.", true);
                return;
            }
            const adminUid = adminSnap.docs[0].id;
            const adminData = adminSnap.docs[0].data();

            const nuevoChat = {
                participantes: [uid, adminUid],
                nombres: {
                    [uid]: window.currentUserDoc?.name || 'Cliente',
                    [adminUid]: adminData.name || 'Administrador'
                },
                titulo: 'Soporte OBR',
                estado: 'pendiente',
                creado: Date.now()
            };
            const docRef = await addDoc(collection(db, "chats"), nuevoChat);
            chatId = docRef.id;
        }

        // 3. Abrir el chat
        window.openChat(chatId);

    } catch (error) {
        console.error('Error al abrir chat con taller:', error);
        window.showToast("No se pudo conectar con el soporte. Intenta de nuevo.", true);
    }
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

// Nota: las variables chatUnsubscribe y activeChatUid ya deben estar declaradas globalmente


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
const phoneField = document.getElementById('phone-input');
if (phoneField) {
    phoneField.addEventListener('focus', () => {
        const loginStep = document.getElementById('auth-step-login');
        const registerStep = document.getElementById('auth-step-register');
        if ((loginStep && !loginStep.classList.contains('hidden')) || 
            (registerStep && !registerStep.classList.contains('hidden'))) {
            cancelFlow();
        }
    });
}
// ========== BOTÓN FLOTANTE DORADO DE INVITACIÓN (SOLO CLIENTES Y VIP) ==========
(function() {
    let boton = null;
    let modalCreado = false;

    function crearModalInvitacion() {
        if (modalCreado) return;
        const modalId = 'modal-whatsapp-invite';
        let modalEl = document.getElementById(modalId);
        if (modalEl) return;
        
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-green-500/30 shadow-2xl text-center">
                <i class="fab fa-whatsapp text-5xl text-green-500 mb-4"></i>
                <h2 class="text-xl font-black text-white mb-2">Comparte OBR</h2>
                <p class="text-xs text-gray-300 mb-4">Invita a tus amigos a que se unan a nuestra comunidad de auxilio mecánico.</p>
                <div class="bg-white/10 p-2 rounded-lg mb-4">
                    <p class="text-[10px] text-gray-400 break-all" id="invite-link-display">https://exploracionesobr.github.io/RESCATE-OBR</p>
                </div>
                <div class="flex flex-col space-y-2">
                    <button id="whatsapp-invite-btn" class="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase text-sm flex items-center justify-center"><i class="fab fa-whatsapp mr-2"></i> Enviar por WhatsApp</button>
                    <button id="whatsapp-skip-btn" class="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase text-sm">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        
        const inviteBtn = document.getElementById('whatsapp-invite-btn');
        const skipBtn = document.getElementById('whatsapp-skip-btn');
        if (inviteBtn) {
            inviteBtn.onclick = () => {
                const linkSpan = document.getElementById('invite-link-display');
                const enlace = linkSpan ? linkSpan.innerText : 'https://exploracionesobr.github.io/RESCATE-OBR';
                const mensaje = encodeURIComponent(`🚀 ¡Descarga OBR Moto Rescate! Auxilio mecánico rápido y confiable. Únete aquí: ${enlace}`);
                window.open(`https://wa.me/?text=${mensaje}`, '_blank');
                window.toggleModal(modalId, false);
            };
        }
        if (skipBtn) {
            skipBtn.onclick = () => {
                window.toggleModal(modalId, false);
            };
        }
        modalCreado = true;
    }

    window.mostrarInvitacionWhatsApp = async () => {
    if (!auth.currentUser) {
        window.showToast("Inicia sesión para invitar amigos", true);
        return;
    }
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const codigo = userSnap.data()?.codigoReferido || '';
    const enlace = `https://exploracionesobr.github.io/RESCATE-OBR/?ref=${codigo}`;
    
    let modalEl = document.getElementById('modal-whatsapp-invite');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'modal-whatsapp-invite';
        modalEl.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 hidden backdrop-blur-sm';
        modalEl.innerHTML = `
            <div class="bg-asfalto w-full max-w-sm rounded-[2rem] p-6 border border-green-500/30 shadow-2xl text-center">
                <i class="fab fa-whatsapp text-5xl text-green-500 mb-4"></i>
                <h2 class="text-xl font-black text-white mb-2">Invita a tus amigos</h2>
                <p class="text-xs text-gray-300 mb-4">Comparte este enlace y gana descuentos cuando se unan.</p>
                <div class="bg-white/10 p-2 rounded-lg mb-4">
                    <p class="text-[10px] text-gray-400 break-all" id="invite-link-display">${enlace}</p>
                </div>
                <div class="flex flex-col space-y-2">
                    <button id="whatsapp-invite-btn" class="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-black uppercase text-sm flex items-center justify-center"><i class="fab fa-whatsapp mr-2"></i> Enviar por WhatsApp</button>
                    <button id="whatsapp-skip-btn" class="bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-black uppercase text-sm">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        
        document.getElementById('whatsapp-invite-btn').onclick = () => {
            const link = document.getElementById('invite-link-display').innerText;
            const mensaje = encodeURIComponent(`🚀 ¡Descarga OBR Moto Rescate! Usa mi enlace: ${link}`);
            window.open(`https://wa.me/?text=${mensaje}`, '_blank');
            window.toggleModal('modal-whatsapp-invite', false);
        };
        document.getElementById('whatsapp-skip-btn').onclick = () => {
            window.toggleModal('modal-whatsapp-invite', false);
        };
    } else {
        const linkSpan = document.getElementById('invite-link-display');
        if (linkSpan) linkSpan.innerText = enlace;
    }
    window.toggleModal('modal-whatsapp-invite', true);
};

    function crearBoton() {
        if (boton) return;
        const nuevoBoton = document.createElement('button');
        nuevoBoton.id = 'float-invite-btn';
        nuevoBoton.className = 'fixed z-50 w-14 h-14 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform animate-pulse-soft';
        nuevoBoton.innerHTML = '<i class="fab fa-whatsapp text-2xl text-white"></i>';
        nuevoBoton.title = 'Invitar amigos por WhatsApp';
        nuevoBoton.onclick = window.mostrarInvitacionWhatsApp;
        nuevoBoton.style.display = 'none';
        document.body.appendChild(nuevoBoton);
        boton = nuevoBoton;
        ajustarPosicion();
    }

    function mostrarBoton() {
        if (boton) boton.style.display = 'flex';
    }

    function ocultarBoton() {
        if (boton) boton.style.display = 'none';
    }

    function ajustarPosicion() {
        if (!boton) return;
        const chatBtn = document.getElementById('btn-chat-ai-float');
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            boton.style.bottom = '140px';
            boton.style.right = '16px';
        } else {
            boton.style.bottom = '160px';
            boton.style.right = '24px';
        }
        if (chatBtn && chatBtn.style.display !== 'none') {
            const chatRect = chatBtn.getBoundingClientRect();
            const btnRect = boton.getBoundingClientRect();
            if (chatRect.left < btnRect.right && !isMobile) {
                boton.style.right = (window.innerWidth - chatRect.left + 15) + 'px';
            }
        }
    }

    function usuarioPuedeInvitar(userData) {
        return userData && (userData.role === 'cliente' || userData.role === 'membresia');
    }

    let authUnsub = null;
    function initWatcher() {
        if (authUnsub) authUnsub();
        authUnsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                let vistaRestaurada = false;
                const userSnap = await getDoc(doc(db, "users", user.uid));
                const userData = userSnap.data();
                if (usuarioPuedeInvitar(userData)) {
                    if (!boton) crearBoton();
                    mostrarBoton();
                    setTimeout(ajustarPosicion, 200);
                } else {
                    ocultarBoton();
                }
            } else {
                ocultarBoton();
            }
        });
    }

    // Interceptar showView
    const originalShowView = window.showView;
    if (originalShowView) {
        window.showView = async function(...args) {
            originalShowView.apply(this, args);
            if (auth.currentUser) {
                const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
                const userData = userSnap.data();
                if (usuarioPuedeInvitar(userData)) {
                    if (!boton) crearBoton();
                    mostrarBoton();
                    setTimeout(ajustarPosicion, 300);
                } else {
                    ocultarBoton();
                }
            } else {
                ocultarBoton();
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initWatcher();
            window.addEventListener('resize', ajustarPosicion);
            const observer = new MutationObserver(() => ajustarPosicion());
            const chatBtn = document.getElementById('btn-chat-ai-float');
            if (chatBtn) observer.observe(chatBtn, { attributes: true, attributeFilter: ['style'] });
        });
    } else {
        initWatcher();
        window.addEventListener('resize', ajustarPosicion);
    }
})();
// ========== SISTEMA DE REFERIDOS (COMPACTO Y FUNCIONAL) ==========

// 1. Cargar configuración desde Firestore y llenar el formulario
async function cargarConfigReferidos() {
    const docSnap = await getDoc(doc(db, "config_referidos", "general"));
    if (docSnap.exists()) {
        const config = docSnap.data();
        document.getElementById('ref-activo').value = config.activo ? 'true' : 'false';
        document.getElementById('ref-modalidad').value = config.modalidad || 'recomienda_y_gana';
        document.getElementById('ref-tipo-descuento').value = config.tipoDescuento || 'porcentaje';
        document.getElementById('ref-valor-descuento').value = config.valorDescuento || 10;
        document.getElementById('ref-notif-servicio').checked = config.notificaciones?.servicioCompletado || false;
        document.getElementById('ref-notif-recompensa').checked = config.notificaciones?.recompensaGenerada || false;
    } else {
        // valores por defecto
        document.getElementById('ref-activo').value = 'true';
        document.getElementById('ref-modalidad').value = 'recomienda_y_gana';
        document.getElementById('ref-tipo-descuento').value = 'porcentaje';
        document.getElementById('ref-valor-descuento').value = 10;
        document.getElementById('ref-notif-servicio').checked = true;
        document.getElementById('ref-notif-recompensa').checked = true;
    }
}

// 2. Guardar configuración
async function guardarConfigReferidos() {
    const config = {
        activo: document.getElementById('ref-activo').value === 'true',
        modalidad: document.getElementById('ref-modalidad').value,
        tipoDescuento: document.getElementById('ref-tipo-descuento').value,
        valorDescuento: parseFloat(document.getElementById('ref-valor-descuento').value) || 0,
        notificaciones: {
            servicioCompletado: document.getElementById('ref-notif-servicio').checked,
            recompensaGenerada: document.getElementById('ref-notif-recompensa').checked
        },
        actualizado: Date.now()
    };
    await setDoc(doc(db, "config_referidos", "general"), config, { merge: true });
    window.showToast("✅ Configuración de referidos guardada");
}

async function cargarListaReferidos() {
    const container = document.getElementById('admin-referidos-list');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-gray-400">Cargando...</p>';

    if (window._referidosUnsubscribe) {
        window._referidosUnsubscribe();
    }

    const q = query(collection(db, "referidos"), orderBy("fechaRegistro", "desc"));
    window._referidosUnsubscribe = onSnapshot(q, async (snap) => {
        if (snap.empty) {
            container.innerHTML = '<p class="text-xs text-gray-400">No hay referidos registrados.</p>';
            return;
        }
        const usersCache = new Map();
        let html = '';
        for (const docRef of snap.docs) {
            const ref = docRef.data();
            let referenteName = '...', referidoName = '...';
            if (!usersCache.has(ref.referenteId)) {
                const userSnap = await getDoc(doc(db, "users", ref.referenteId));
                usersCache.set(ref.referenteId, userSnap.exists() ? userSnap.data().name : 'Desconocido');
            }
            referenteName = usersCache.get(ref.referenteId);
            if (!usersCache.has(ref.referidoId)) {
                const userSnap = await getDoc(doc(db, "users", ref.referidoId));
                usersCache.set(ref.referidoId, userSnap.exists() ? userSnap.data().name : 'Desconocido');
            }
            referidoName = usersCache.get(ref.referidoId);

            let estadoTexto = '';
            let estadoColor = '';
            switch (ref.estado) {
                case 'recompensa_generada':
                    estadoTexto = '✅ Recompensa obtenida';
                    estadoColor = 'text-green-400';
                    break;
                case 'condicion_cumplida':
                    estadoTexto = '🎯 Condición cumplida';
                    estadoColor = 'text-yellow-400';
                    break;
                default:
                    estadoTexto = '⏳ En progreso';
                    estadoColor = 'text-gray-400';
            }

            html += `
                <div class="bg-white/5 p-3 rounded-xl flex justify-between items-center text-xs cursor-pointer hover:bg-white/10 transition-colors" onclick="window.openUserDetail('${ref.referidoId}')">
                    <div class="flex-1">
                        <p><span class="font-bold">${escapeHtml(referenteName)}</span> → <span class="font-bold">${escapeHtml(referidoName)}</span></p>
                        <p class="text-gray-400">${new Date(ref.fechaRegistro).toLocaleDateString()}</p>
                        <p class="text-gray-400">Servicios: ${ref.serviciosCompletados || 0}</p>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="${estadoColor} uppercase">${estadoTexto}</span>
                        ${ref.estado === 'recompensa_generada' ? `<button onclick="event.stopPropagation(); window.eliminarReferido('${docRef.id}')" class="text-red-400 hover:text-red-300"><i class="fas fa-trash-alt"></i></button>` : ''}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    });
}
window.eliminarReferido = async (referidoId) => {
    if (confirm("¿Eliminar este referido? Esta acción no se puede deshacer.")) {
        await deleteDoc(doc(db, "referidos", referidoId));
        window.cargarListaReferidos();
        window.showToast("Referido eliminado");
    }
};
// 4. Generar códigos de referido para usuarios existentes que no tengan
async function generarCodigosParaUsuariosExistentes() {
    if (!auth.currentUser || window.currentUserDoc?.role !== 'admin') {
        window.showToast("Solo administradores pueden ejecutar esta acción", true);
        return;
    }
    const confirmar = confirm("⚠️ Esta acción asignará un código de referido a TODOS los usuarios que no tengan uno. ¿Deseas continuar?");
    if (!confirmar) return;
    window.showToast("Migrando códigos... puede tardar unos segundos", false);
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let count = 0;
        for (const docSnap of usersSnap.docs) {
            const user = docSnap.data();
            if (!user.codigoReferido) {
                const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
                await updateDoc(docSnap.ref, { codigoReferido: codigo });
                count++;
            }
        }
        window.showToast(`✅ Migración completada. Se generaron ${count} códigos.`);
        cargarListaReferidos();
    } catch (error) {
        console.error(error);
        window.showToast("Error durante la migración. Revisa la consola.", true);
    }
}

// 5. Otorgar recompensa (crear documento en colección "recompensas")
async function otorgarRecompensa(uidReferente, uidReferido, tipo, valor) {
    const expiracion = Date.now() + 90 * 24 * 60 * 60 * 1000; // 90 días
    const recompensa = {
        tipo: tipo,        // 'porcentaje' o 'monto_fijo'
        valor: valor,
        origen: 'referido',
        generada: Date.now(),
        expira: expiracion,
        utilizada: false
    };
    // Para el referente
    await addDoc(collection(db, "recompensas"), { ...recompensa, uid: uidReferente });
    // Para el referido (si aplica, solo en modalidad 'ganamos_juntos')
    if (uidReferido) {
        await addDoc(collection(db, "recompensas"), { ...recompensa, uid: uidReferido });
    }
}

// 6. Actualizar servicios completados de un referido (llamar al completar un servicio)
async function actualizarServiciosReferido(referidoId) {
    // Buscar relación de referido pendiente o en progreso
    const q = query(collection(db, "referidos"), where("referidoId", "==", referidoId), where("estado", "in", ["pendiente", "condicion_cumplida"]));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const refDoc = snap.docs[0];
    const data = refDoc.data();
    const config = await getDoc(doc(db, "config_referidos", "general"));
    const configData = config.exists() ? config.data() : null;
    if (!configData || !configData.activo) return;

    // Incrementar contador de servicios
    const serviciosCompletados = (data.serviciosCompletados || 0) + 1;
    await updateDoc(refDoc.ref, { serviciosCompletados, ultimoServicio: Date.now() });

    // Si es el primer servicio, otorgar recompensa
    if (serviciosCompletados === 1) {
        const modalidad = configData.modalidad;
        const tipo = configData.tipoDescuento;
        const valor = configData.valorDescuento;

        if (modalidad === 'recomienda_y_gana') {
            // Solo referente
            await otorgarRecompensa(data.referenteId, null, tipo, valor);
        } else if (modalidad === 'ganamos_juntos') {
            // Ambos
            await otorgarRecompensa(data.referenteId, data.referidoId, tipo, valor);
        }

        // Marcar como recompensa generada
        await updateDoc(refDoc.ref, { estado: 'recompensa_generada', recompensaGenerada: true, fechaRecompensa: Date.now() });

        // Notificaciones (si están activas)
        if (configData.notificaciones?.recompensaGenerada) {
            await setDoc(doc(db, "notificaciones", data.referenteId), { msg: `🎉 ¡Tu referido ha completado su primer servicio! Recibiste un descuento.`, timestamp: Date.now(), leida: false });
            if (modalidad === 'ganamos_juntos') {
                await setDoc(doc(db, "notificaciones", data.referidoId), { msg: `🎉 ¡Completaste tu primer servicio! Recibiste un descuento de bienvenida.`, timestamp: Date.now(), leida: false });
            }
        }
    } else {
        // Si ya había recompensa, solo actualizar estado a "condicion_cumplida" si no lo estaba
        if (data.estado === 'pendiente') {
            await updateDoc(refDoc.ref, { estado: 'condicion_cumplida' });
        }
    }
}

// 7. Inicializar eventos y carga de datos en la vista de promos
function initReferidosAdmin() {
    // Cargar configuración y lista al abrir la vista
    cargarConfigReferidos();
    cargarListaReferidos();   // ← LÍNEA AÑADIDA (esto faltaba)

    // Vincular eventos solo una vez
    const guardarBtn = document.getElementById('btn-guardar-config-referidos');
    const migrarBtn = document.getElementById('btn-migrar-codigos');
    if (guardarBtn && !guardarBtn._listenerAdded) {
        guardarBtn.addEventListener('click', guardarConfigReferidos);
        guardarBtn._listenerAdded = true;
    }
    if (migrarBtn && !migrarBtn._listenerAdded) {
        migrarBtn.addEventListener('click', generarCodigosParaUsuariosExistentes);
        migrarBtn._listenerAdded = true;
    }
}

// 8. Integración con el cambio de vista de administrador
if (typeof window.switchAdminView === 'function') {
    const originalSwitchAdminView = window.switchAdminView;
    window.switchAdminView = function(viewId) {
        originalSwitchAdminView.call(this, viewId);
        if (viewId === 'a-view-promos') {
            setTimeout(initReferidosAdmin, 200);
        }
    };
} else {
    // Fallback: observar cambios en la clase hidden del elemento
    const promosView = document.getElementById('a-view-promos');
    if (promosView) {
        const observer = new MutationObserver(() => {
            if (!promosView.classList.contains('hidden')) initReferidosAdmin();
        });
        observer.observe(promosView, { attributes: true });
    }
}

// 9. Exponer funciones globalmente por si se necesitan desde otros lugares
window.cargarConfigReferidos = cargarConfigReferidos;
window.guardarConfigReferidos = guardarConfigReferidos;
window.cargarListaReferidos = cargarListaReferidos;
window.generarCodigosParaUsuariosExistentes = generarCodigosParaUsuariosExistentes;
window.actualizarServiciosReferido = actualizarServiciosReferido;
window.initReferidosAdmin = initReferidosAdmin;

window.centrarMapaEnSOS = (sosId) => {
    // Si ya estábamos filtrando por este mismo ID, lo reseteamos
    if (window.sosFiltroUnicoId === sosId) {
        window.sosFiltroUnicoId = null;
    } else {
        // Sino, asignamos el nuevo ID
        window.sosFiltroUnicoId = sosId;
    }
    
    // Refrescamos el listado y el mapa con el nuevo filtro
    window.cargarListadoSOS();
    window.renderSOSMapa();
    
    // (Opcional) Centrar el mapa en el marcador del servicio seleccionado
    if (window.sosFiltroUnicoId) {
        // Esperar un momento a que los marcadores se hayan recreado
        setTimeout(() => {
            const marker = adminSOSMarkers[sosId];
            if (marker && adminSOSGlobalMapInst) {
                const latlng = marker.getLatLng();
                adminSOSGlobalMapInst.setView(latlng, 15);
            }
        }, 300);
    }
};if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/RESCATE-OBR/sw.js').then(reg => {
        console.log('SW registrado:', reg.scope);
      }).catch(err => {
        console.warn('Error al registrar SW:', err);
      });
    });
  }

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/RESCATE-OBR/sw.js').then(reg => {
      console.log('SW registrado:', reg.scope);

      // Si hay una nueva versión esperando, usar el modal de la app
      const notificarActualizacion = (worker) => {
        if (typeof window.confirmModal === 'function') {
          window.confirmModal(
            '📢 Nueva versión disponible. ¿Quieres actualizar ahora para ver las mejoras?',
            () => {
              worker.postMessage('skipWaiting');
              setTimeout(() => window.location.reload(), 500);
            },
            () => { /* El usuario cancela, la actualización se aplicará en la próxima recarga */ }
          );
        } else {
          // Fallback si el modal aún no está disponible
          if (confirm('Nueva versión disponible. ¿Actualizar?')) {
            worker.postMessage('skipWaiting');
            window.location.reload();
          }
        }
      };

      // Si ya hay un worker esperando al registrar
      if (reg.waiting) {
        notificarActualizacion(reg.waiting);
      }

      // Cuando se detecta una nueva versión
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notificarActualizacion(newWorker);
            }
          });
        }
      });
    }).catch(err => console.warn('Error al registrar SW:', err));

    // Recargar automáticamente cuando el SW tome el control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
window.ingresarATaller = async () => {
    if (!currentDetalleServicioId) return;
    await updateDoc(doc(db, "rescates", currentDetalleServicioId), { 
        tallerStatus: 'recibida',
        status: 'completed'
    });
    showToast("Servicio enviado a taller. El cliente será notificado.");
    toggleModal('modal-detalle-servicio', false);
    window.cargarListadoSOS();
    window.renderSOSMapa();
    window.adminListenServices();
};

document.addEventListener('change', function(e) {
    if (e.target.id === 'reten-tipo-ubicacion') {
        const exacta = document.getElementById('reten-ubicacion-exacta-container');
        const aproximada = document.getElementById('reten-ubicacion-aproximada-container');
        if (e.target.value === 'exacta') {
            exacta.classList.remove('hidden');
            aproximada.classList.add('hidden');
        } else {
            exacta.classList.add('hidden');
            aproximada.classList.remove('hidden');
        }
    }
});

window.procesarCrearReten = async function() {
    // Validar que se haya seleccionado una ubicación
    if (seleccionLat === null || seleccionLng === null) {
        window.showToast("Selecciona una ubicación en el mapa primero.", true);
        return;
    }
    
    const descripcionUbicacion = document.getElementById('reten-descripcion-ubicacion').value.trim();
    const fileInput = document.getElementById('reten-evidencia');
    let imageUrl = null;
    
    // Subir imagen si existe
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const compressed = await window.compressImage(file);
        imageUrl = await uploadWithTimeout(compressed, `retenes/${auth.currentUser.uid}/${Date.now()}.jpg`);
    }
    
    // Guardar en Firestore
    await addDoc(collection(db, "retenes"), {
        uid: auth.currentUser.uid,
        lat: seleccionLat,
        lng: seleccionLng,
        descripcionUbicacion: descripcionUbicacion || null,
        timestamp: Date.now(),
        imageUrl: imageUrl,
        negativeVotes: [],
        status: 'active'
    });
    
    // Limpiar variables y cerrar modal
    seleccionLat = null;
    seleccionLng = null;
    if (mapaSeleccion) {
        mapaSeleccion.remove();
        mapaSeleccion = null;
        marcadorSeleccion = null;
    }
    
    toggleModal('modal-crear-reten', false);
    window.showToast("✅ Retén reportado correctamente.");
    window.renderRetenMap(false);
};



// ---------- ADMIN: LISTA DE RETENES ----------
window.cargarListaRetenesAdmin = async () => {
    const container = document.getElementById('admin-retenes-list');
    if (!container) return;
    const snap = await getDocs(collection(db, "retenes"));
    container.innerHTML = '';
    snap.forEach(doc => {
        const data = doc.data();
        container.innerHTML += `
            <div class="bg-white/5 p-3 rounded-xl border border-yellow-500/30 hover:bg-white/10 cursor-pointer" 
                 onclick="window.focusRetenAdmin('${doc.id}', ${data.lat}, ${data.lng})">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm text-yellow-400">🚨 ${new Date(data.timestamp).toLocaleString()}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded bg-gray-600/50 text-gray-300">${data.negativeVotes?.length || 0} votos NO</span>
                </div>
                <p class="text-xs text-gray-400 truncate">Lat: ${data.lat.toFixed(4)}, Lng: ${data.lng.toFixed(4)}</p>
            </div>`;
    });
};

window.focusRetenAdmin = (id, lat, lng) => {
    if (retenesMapInstance) {
        retenesMapInstance.setView([lat, lng], 16);
        if (retenesMarkers[id]) {
            retenesMarkers[id].openPopup();
        }
    }
};

window.eliminarReten = async (retenId) => {
    if (confirm("¿Eliminar este retén permanentemente?")) {
        const snap = await getDoc(doc(db, "retenes", retenId));
        if (snap.exists() && snap.data().imageUrl) {
            try {
                const imageRef = sRef(storage, snap.data().imageUrl);
                await deleteObject(imageRef);
            } catch (e) { console.warn("No se pudo eliminar la imagen:", e); }
        }
        await deleteDoc(doc(db, "retenes", retenId));
        showToast("Retén eliminado");
        renderRetenMap(true);
    }
};

window.editarReten = (retenId) => {
    window.promptModal("Editar retén (ID):", retenId, (newId) => {
        showToast("Edición no implementada aún");
    });
};

function crearListenerSeguro(query, callback) {
    let unsubscribe = null;
    let reconnectTimer = null;

    function conectar() {
        if (unsubscribe) unsubscribe();
        unsubscribe = onSnapshot(query, 
            (snap) => {
                if (reconnectTimer) clearTimeout(reconnectTimer);
                callback(snap);
            },
            (error) => {
                console.warn('Firestore error, reconectando en 5s:', error);
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(conectar, 5000);
            }
        );
    }
    conectar();
    return () => { if (unsubscribe) unsubscribe(); if (reconnectTimer) clearTimeout(reconnectTimer); };
}
