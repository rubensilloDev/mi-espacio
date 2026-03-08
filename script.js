/* ═══════════════════════════════════════════════════════
   SCRIPT.JS — Mi Espacio v3
   Secciones:
   1.  Firebase
   2.  Estado global
   3.  Autenticación (Google + Invitado)
   4.  Datos (Firestore si logueado, memoria si invitado)
   5.  Navegación
   6.  Render: Home
   7.  Render: Ideas
   8.  Sidebar (carpetas)
   9.  Modal de Idea
   10. Modal de Carpeta
   11. Backup (export / import)
   12. Eliminar
   13. Utilidades
═══════════════════════════════════════════════════════ */


/* ════════════════════════════════════
   1. FIREBASE
════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "AIzaSyBExWvzvv8IA17ZtMQei9cZ3SH4Xnb5_h8",
  authDomain:        "app-ideas-4d77b.firebaseapp.com",
  projectId:         "app-ideas-4d77b",
  storageBucket:     "app-ideas-4d77b.firebasestorage.app",
  messagingSenderId: "631636683224",
  appId:             "1:631636683224:web:9c021ae78629e701c5eaad"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();


/* ════════════════════════════════════
   2. ESTADO GLOBAL
════════════════════════════════════ */
let currentUser    = null;
let isGuest        = false;

let ideaFolders    = [];
let ideas          = [];

let currentView    = "home";
let activeFolderId = null;
// Historial de navegación para el botón "atrás"
let navHistory     = [];

let editingIdea      = null;
let editingFolder    = null;
let confirmCallback  = null;

let currentIdeaColor   = "#7c3aed";
let currentFolderColor = "#7c3aed";

const COLORS = ["#7c3aed","#3b82f6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#f97316"];

const uid     = () => Math.random().toString(36).slice(2,10);
const fmtDate = d => d ? new Date(d).toLocaleDateString("es-ES", {day:"2-digit", month:"short"}) : "";


/* ════════════════════════════════════
   3. AUTENTICACIÓN
════════════════════════════════════ */
auth.onAuthStateChanged(user => {
  if (user && !isGuest) {
    currentUser = user;
    enterApp(false);
    listenData();
  } else if (!isGuest) {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("main-app").style.display     = "none";
  }
});

document.getElementById("btn-google").onclick = async () => {
  try {
    isGuest = false;
    await auth.signInWithPopup(googleProvider);
  } catch(e) {
    const el = document.getElementById("login-error");
    el.style.display = "block";
    el.textContent   = "Error al iniciar sesión. Inténtalo de nuevo.";
  }
};

document.getElementById("btn-guest").onclick = () => {
  isGuest     = true;
  currentUser = { uid: "guest", displayName: "Invitado", email: "", photoURL: null };
  ideaFolders = []; ideas = [];
  enterApp(true);
  renderContent();
  renderSidebar();
};

document.getElementById("btn-logout").onclick = () => {
  if (isGuest) {
    isGuest = false; currentUser = null;
    ideaFolders = []; ideas = [];
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("main-app").style.display     = "none";
  } else {
    auth.signOut();
  }
};

function enterApp(guest) {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("main-app").style.display     = "flex";
  setupUserUI(currentUser, guest);
  checkMobile();
  setView("home");
}

function setupUserUI(user, guest) {
  document.getElementById("user-name").textContent  = guest ? "Invitado" : (user.displayName?.split(" ")[0] || "Usuario");
  document.getElementById("user-email").textContent = guest ? "Sin cuenta • datos temporales" : user.email;

  if (!guest && user.photoURL) {
    document.getElementById("user-avatar").src          = user.photoURL;
    document.getElementById("user-avatar").style.display    = "block";
    document.getElementById("user-avatar-ph").style.display = "none";
  }

  const nav      = document.getElementById("sidebar-nav");
  const existing = document.getElementById("guest-badge-el");
  if (existing) existing.remove();
  if (guest) {
    const badge = document.createElement("div");
    badge.id        = "guest-badge-el";
    badge.className = "guest-badge";
    badge.innerHTML = "⚠️ Modo invitado — datos temporales";
    nav.prepend(badge);
  }
}


/* ════════════════════════════════════
   4. DATOS
════════════════════════════════════ */
function listenData() {
  const uid2 = currentUser.uid;

  db.collection("users").doc(uid2).collection("idea-folders")
    .orderBy("created_at").onSnapshot(snap => {
      ideaFolders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSidebar();
      if (currentView === "idea-folder") renderContent();
    });

  db.collection("users").doc(uid2).collection("ideas")
    .orderBy("updated_at", "desc").onSnapshot(snap => {
      ideas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderContent();
    });
}

async function saveIdeaData(id, data) {
  if (isGuest) {
    const idx = ideas.findIndex(i => i.id === id);
    if (idx >= 0) ideas[idx] = { ...data, id };
    else ideas.unshift({ ...data, id });
    renderSidebar(); renderContent();
  } else {
    await db.collection("users").doc(currentUser.uid).collection("ideas").doc(id).set({ ...data, id });
  }
}

async function saveFolderData(id, data) {
  if (isGuest) {
    const idx = ideaFolders.findIndex(f => f.id === id);
    if (idx >= 0) ideaFolders[idx] = { ...data, id };
    else ideaFolders.push({ ...data, id });
    renderSidebar(); renderContent();
  } else {
    await db.collection("users").doc(currentUser.uid).collection("idea-folders").doc(id).set({ ...data, id });
  }
}


/* ════════════════════════════════════
   5. NAVEGACIÓN
════════════════════════════════════ */
function setView(view, folderId) {
  // Guardar en historial solo si cambiamos de vista
  if (view !== currentView || folderId !== activeFolderId) {
    navHistory.push({ view: currentView, folderId: activeFolderId });
  }

  currentView    = view;
  activeFolderId = folderId || null;

  // Resaltar slink activo
  document.querySelectorAll(".slink").forEach(b => b.classList.remove("active"));
  if (view === "home")        document.querySelector('.slink[data-view="home"]')?.classList.add("active");
  if (view === "ideas-home")  document.querySelector('.slink[data-view="ideas-home"]')?.classList.add("active");
  if (view === "idea-folder") document.querySelector(`.idea-folder-btn[data-fid="${folderId}"]`)?.classList.add("active");

  // Botón atrás
  const backBtn = document.getElementById("btn-back");
  backBtn.style.display = (view !== "home") ? "flex" : "none";

  // Título header
  const titleEl = document.getElementById("header-title");
  const titles  = { "home": "Inicio", "ideas-home": "Ideas" };
  if (titles[view]) {
    titleEl.innerHTML = `<span>${titles[view]}</span>`;
  } else if (view === "idea-folder") {
    const f = ideaFolders.find(x => x.id === folderId);
    titleEl.innerHTML = `<span style="display:flex;align-items:center;gap:8px">
      <span style="width:9px;height:9px;border-radius:50%;background:${f?.color||"#ccc"};display:inline-block"></span>
      ${f?.title||""}
    </span>`;
  } else if (view === "backup") {
    titleEl.innerHTML = `<span>Backup</span>`;
  }

  document.getElementById("fab").style.display = (view === "backup") ? "none" : "flex";
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("show");
  renderContent();
}

// Botón atrás: usa historial
document.getElementById("btn-back").onclick = () => {
  if (navHistory.length > 0) {
    const prev = navHistory.pop();
    // Restaurar sin añadir al historial
    currentView    = prev.view;
    activeFolderId = prev.folderId || null;

    document.querySelectorAll(".slink").forEach(b => b.classList.remove("active"));
    if (currentView === "home")        document.querySelector('.slink[data-view="home"]')?.classList.add("active");
    if (currentView === "ideas-home")  document.querySelector('.slink[data-view="ideas-home"]')?.classList.add("active");
    if (currentView === "idea-folder") document.querySelector(`.idea-folder-btn[data-fid="${activeFolderId}"]`)?.classList.add("active");

    const backBtn = document.getElementById("btn-back");
    backBtn.style.display = (currentView !== "home") ? "flex" : "none";

    const titleEl = document.getElementById("header-title");
    const titles  = { "home": "Inicio", "ideas-home": "Ideas" };
    if (titles[currentView]) {
      titleEl.innerHTML = `<span>${titles[currentView]}</span>`;
    } else if (currentView === "idea-folder") {
      const f = ideaFolders.find(x => x.id === activeFolderId);
      titleEl.innerHTML = `<span style="display:flex;align-items:center;gap:8px">
        <span style="width:9px;height:9px;border-radius:50%;background:${f?.color||"#ccc"};display:inline-block"></span>
        ${f?.title||""}
      </span>`;
    } else if (currentView === "backup") {
      titleEl.innerHTML = `<span>Backup</span>`;
    }

    document.getElementById("fab").style.display = (currentView === "backup") ? "none" : "flex";
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("backdrop").classList.remove("show");
    renderContent();
  } else {
    setView("home");
  }
};

document.getElementById("btn-menu").onclick = () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("backdrop").classList.toggle("show");
};

document.getElementById("backdrop").onclick = () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("show");
};

document.querySelector('.slink[data-view="home"]').onclick       = () => setView("home");
document.querySelector('.slink[data-view="ideas-home"]').onclick = () => setView("ideas-home");

// Botón backup en sidebar
document.getElementById("btn-backup-nav")?.addEventListener("click", () => setView("backup"));

document.getElementById("fab").onclick = () => {
  if (currentView === "ideas-home" || currentView === "idea-folder") openIdeaModal(null);
  else openIdeaModal(null);
};

function checkMobile() {
  document.getElementById("btn-menu").style.display = window.innerWidth <= 720 ? "flex" : "none";
}
window.addEventListener("resize", checkMobile);


/* ════════════════════════════════════
   6. RENDER: HOME
════════════════════════════════════ */
function renderContent() {
  const el = document.getElementById("content");
  switch (currentView) {
    case "home":        el.innerHTML = renderHome();       break;
    case "ideas-home":  el.innerHTML = renderIdeasHome();  break;
    case "idea-folder": el.innerHTML = renderIdeaFolder(); break;
    case "backup":      el.innerHTML = renderBackup();     break;
    default:            el.innerHTML = renderHome();
  }
  attachEvents();
}

function renderHome() {
  const totalIdeas   = ideas.length;
  const totalFolders = ideaFolders.length;

  const guestBanner = isGuest ? `
    <div style="margin:0 24px 16px;padding:12px 16px;background:#f59e0b18;border:1px solid #f59e0b33;border-radius:12px;font-size:12px;color:#92400e;line-height:1.5">
      ⚠️ <strong>Modo invitado:</strong> tus datos solo existen mientras esta pestaña esté abierta. Al cerrarla se perderán.
      Inicia sesión con Google para guardarlos permanentemente.
    </div>` : "";

  // Últimas 3 ideas
  const recent = [...ideas].slice(0, 3);

  let recentHtml = "";
  if (recent.length > 0) {
    recentHtml = `<div class="content-section-title">🕒 Ideas recientes</div>
      <div class="ideas-grid" style="padding:0 24px 16px">`;
    recent.forEach(i => recentHtml += ideaCard(i));
    recentHtml += `</div>`;
  }

  return `
    <div class="home-hero">
      <h2>👋 Hola, ${currentUser?.displayName?.split(" ")[0] || ""}!</h2>
      <p>Captura y organiza todas tus ideas en un solo lugar</p>
    </div>
    ${guestBanner}
    <div class="home-cards">
      <div class="home-card ideas-card" id="go-ideas">
        <span class="home-card-icon">💡</span>
        <h3>Mis Ideas</h3>
        <p>Carpetas y notas organizadas</p>
        <span class="count-badge">${totalIdeas} ${totalIdeas === 1 ? "idea" : "ideas"}</span>
      </div>
      <div class="home-card" id="go-backup" style="cursor:pointer;border-color:#e2e8f0">
        <span class="home-card-icon">💾</span>
        <h3>Backup</h3>
        <p>Exporta o importa tus ideas</p>
        <span class="count-badge" style="background:#3b82f618;color:#3b82f6">${totalFolders} carpetas</span>
      </div>
    </div>
    ${recentHtml}`;
}


/* ════════════════════════════════════
   7. RENDER: IDEAS
════════════════════════════════════ */
function renderIdeasHome() {
  const myIdeas = ideas.filter(i => !i.folder_id);
  let html = "";

  if (ideaFolders.length > 0) {
    html += `<div class="content-section-title">📁 Carpetas</div>
             <div style="padding:0 24px 8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">`;
    ideaFolders.forEach(f => {
      const count = ideas.filter(i => i.folder_id === f.id).length;
      html += `<div class="idea-folder-card" data-fid="${f.id}" style="background:white;border-radius:14px;padding:16px;cursor:pointer;border:1.5px solid #e2e8f0;text-align:center;transition:all .18s;box-shadow:0 2px 8px rgba(0,0,0,.05)">
        <div style="font-size:28px;margin-bottom:6px">📁</div>
        <div style="width:8px;height:8px;border-radius:50%;background:${f.color};margin:0 auto 6px"></div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.title}</div>
        <div style="font-size:10px;color:#64748b;margin-top:3px">${count} ${count===1?"idea":"ideas"}</div>
      </div>`;
    });
    html += "</div>";
  }

  html += `<div class="content-section-title">📝 Sin carpeta</div>`;
  if (myIdeas.length === 0) {
    html += emptyState("💡", "Toca + para añadir tu primera idea");
  } else {
    html += `<div class="ideas-grid">`;
    myIdeas.forEach(i => html += ideaCard(i));
    html += `</div>`;
  }
  return html;
}

function renderIdeaFolder() {
  const myIdeas = ideas.filter(i => i.folder_id === activeFolderId);
  if (myIdeas.length === 0) return emptyState("💡", "Esta carpeta está vacía. Toca + para añadir.");
  return `<div class="ideas-grid">${myIdeas.map(ideaCard).join("")}</div>`;
}

function ideaCard(idea) {
  return `
    <div class="idea-card item-open" data-id="${idea.id}" data-type="idea">
      <div class="idea-card-bar" style="background:${idea.color||"#7c3aed"}"></div>
      <div class="idea-card-inner">
        <h4>${idea.title}</h4>
        <p>${idea.content ? idea.content.slice(0,150) : "Sin contenido"}</p>
        <div class="idea-card-footer">
          <span class="idea-date">${fmtDate(idea.updated_at)}</span>
          <button class="card-del-btn" data-id="${idea.id}" data-type="idea">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}


/* ════════════════════════════════════
   8. SIDEBAR — Carpetas de ideas
════════════════════════════════════ */
function renderSidebar() {
  renderFolderGroup("idea-folder-list", ideaFolders);
}

function renderFolderGroup(containerId, folders) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (folders.length === 0) {
    el.innerHTML = `<div style="padding:4px 14px 6px;color:#475569;font-size:11px">Sin carpetas</div>`;
    return;
  }

  el.innerHTML = folders.map(f => `
    <div style="position:relative">
      <button class="slink idea-folder-btn ${activeFolderId===f.id&&currentView==="idea-folder"?"active":""}" data-fid="${f.id}">
        <div style="width:7px;height:7px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.title}</span>
        <span class="folder-menu-btn" data-fid="${f.id}" style="color:#475569;font-size:16px;padding:0 4px;cursor:pointer">⋯</span>
      </button>
      <div class="folder-dropdown" id="fdrop-${f.id}">
        <button class="folder-edit-btn" data-fid="${f.id}">✏️ Editar</button>
        <button class="folder-del-btn del-opt" data-fid="${f.id}">🗑 Eliminar</button>
      </div>
    </div>`).join("");

  el.querySelectorAll(".idea-folder-btn").forEach(b => {
    b.onclick = e => {
      if (e.target.closest(".folder-menu-btn")) return;
      setView("idea-folder", b.dataset.fid);
    };
  });

  el.querySelectorAll(".folder-menu-btn").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      document.querySelectorAll(".folder-dropdown").forEach(d => d.style.display = "none");
      document.getElementById("fdrop-" + b.dataset.fid).style.display = "block";
    };
  });

  el.querySelectorAll(".folder-edit-btn").forEach(b => {
    b.onclick = () => {
      closeDropdowns();
      openFolderModal(ideaFolders.find(x => x.id === b.dataset.fid));
    };
  });

  el.querySelectorAll(".folder-del-btn").forEach(b => {
    b.onclick = () => {
      closeDropdowns();
      const f = ideaFolders.find(x => x.id === b.dataset.fid);
      showConfirm(`¿Eliminar carpeta "${f?.title}"?`, () => deleteFolder(b.dataset.fid));
    };
  });
}

function closeDropdowns() {
  document.querySelectorAll(".folder-dropdown").forEach(d => d.style.display = "none");
}
document.addEventListener("click", closeDropdowns);


/* ════════════════════════════════════
   9. MODAL: IDEA
════════════════════════════════════ */
function openIdeaModal(idea) {
  editingIdea = idea;
  document.getElementById("idea-modal-title").textContent = idea ? "Editar idea" : "Nueva idea";
  document.getElementById("idea-title-input").value       = idea?.title   || "";
  document.getElementById("idea-content").value           = idea?.content || "";

  const sel = document.getElementById("idea-folder-select");
  sel.innerHTML = '<option value="">Sin carpeta</option>' +
    ideaFolders.map(f => `<option value="${f.id}" ${idea?.folder_id===f.id?"selected":""}>${f.title}</option>`).join("");
  if (currentView === "idea-folder" && !idea) sel.value = activeFolderId;

  currentIdeaColor = idea?.color || "#7c3aed";
  renderColorPicker("idea-color-picker", currentIdeaColor, c => currentIdeaColor = c);
  document.getElementById("idea-modal").style.display = "flex";
  setTimeout(() => document.getElementById("idea-title-input").focus(), 100);
}

document.getElementById("btn-close-idea").onclick = () => document.getElementById("idea-modal").style.display = "none";
document.getElementById("idea-modal").onclick = e => {
  if (e.target === document.getElementById("idea-modal")) document.getElementById("idea-modal").style.display = "none";
};

document.getElementById("btn-save-idea").onclick = async () => {
  const title = document.getElementById("idea-title-input").value.trim();
  if (!title) return;
  const now  = new Date().toISOString();
  const data = {
    title,
    content:    document.getElementById("idea-content").value,
    folder_id:  document.getElementById("idea-folder-select").value || null,
    color:      currentIdeaColor,
    user_id:    currentUser.uid,
    updated_at: now,
    created_at: editingIdea?.created_at || now,
  };
  const id = editingIdea?.id || uid();
  await saveIdeaData(id, data);
  document.getElementById("idea-modal").style.display = "none";
};


/* ════════════════════════════════════
   10. MODAL: CARPETA
════════════════════════════════════ */
document.getElementById("btn-new-idea-folder").onclick = () => openFolderModal(null);

function openFolderModal(folder) {
  editingFolder      = folder;
  currentFolderColor = folder?.color || "#7c3aed";
  document.getElementById("folder-modal-title").textContent = folder ? "Editar carpeta" : "Nueva carpeta";
  document.getElementById("btn-save-folder").textContent    = folder ? "Guardar"        : "Crear";
  document.getElementById("folder-name-input").value        = folder?.title || "";
  renderColorPicker("folder-color-picker", currentFolderColor, c => currentFolderColor = c);
  document.getElementById("folder-modal").style.display = "flex";
}

document.getElementById("btn-close-folder").onclick = () => document.getElementById("folder-modal").style.display = "none";
document.getElementById("folder-modal").onclick = e => {
  if (e.target === document.getElementById("folder-modal")) document.getElementById("folder-modal").style.display = "none";
};

document.getElementById("btn-save-folder").onclick = async () => {
  const title = document.getElementById("folder-name-input").value.trim();
  if (!title) return;
  const id  = editingFolder?.id || uid();
  const now = new Date().toISOString();
  await saveFolderData(id, {
    id, title, color: currentFolderColor,
    user_id:    currentUser.uid,
    created_at: editingFolder?.created_at || now,
    updated_at: now,
  });
  document.getElementById("folder-modal").style.display = "none";
};


/* ════════════════════════════════════
   11. BACKUP
════════════════════════════════════ */
function renderBackup() {
  return `
    <div style="padding:24px;max-width:560px;margin:0 auto">

      <div style="background:white;border-radius:16px;padding:24px;margin-bottom:16px;border:1.5px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.05)">
        <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px">💾 Exportar datos</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:16px">Descarga un archivo JSON con todas tus ideas y carpetas. Úsalo como copia de seguridad.</p>
        <button id="btn-export-backup" style="width:100%;padding:12px;background:#7c3aed;color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          ⬇️ Descargar backup
        </button>
      </div>

      <div style="background:white;border-radius:16px;padding:24px;margin-bottom:16px;border:1.5px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.05)">
        <h3 style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px">📂 Importar datos</h3>
        <p style="font-size:13px;color:#64748b;margin-bottom:4px">Selecciona un archivo de backup (.json). Los datos se añadirán a tu cuenta <strong>sin borrar</strong> lo existente.</p>
        <p style="font-size:11px;color:#94a3b8;margin-bottom:16px">Solo se aceptan archivos exportados desde Mi Espacio.</p>
        <label style="width:100%;padding:12px;background:#f1f5f9;color:#334155;border:1.5px dashed #cbd5e1;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          📁 Seleccionar archivo
          <input type="file" accept=".json" id="import-file-input" style="display:none">
        </label>
        <div id="import-status" style="margin-top:10px;font-size:13px;display:none"></div>
      </div>

      <div style="background:white;border-radius:16px;padding:24px;border:1.5px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.05)">
        <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:8px">📊 Estado actual</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:#f8fafc;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#7c3aed">${ideas.length}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">Ideas</div>
          </div>
          <div style="background:#f8fafc;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#3b82f6">${ideaFolders.length}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">Carpetas</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Exportar ─────────────────────────────────────────────
function exportBackup() {
  const backup = {
    version:    3,
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser?.email || "invitado",
    data: {
      folders: ideaFolders,
      ideas:   ideas,
    }
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `mi-espacio-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Importar ─────────────────────────────────────────────
async function importBackup(file) {
  const statusEl = document.getElementById("import-status");
  statusEl.style.display = "block";

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    if (!json.data || !Array.isArray(json.data.ideas) || !Array.isArray(json.data.folders)) {
      throw new Error("Formato de archivo no reconocido.");
    }

    const { folders, ideas: importedIdeas } = json.data;
    statusEl.style.color = "#7c3aed";
    statusEl.textContent = `⏳ Importando ${folders.length} carpetas y ${importedIdeas.length} ideas…`;

    if (isGuest) {
      // En modo invitado: añadir a memoria
      folders.forEach(f => {
        if (!ideaFolders.find(x => x.id === f.id)) ideaFolders.push(f);
      });
      importedIdeas.forEach(i => {
        if (!ideas.find(x => x.id === i.id)) ideas.unshift(i);
      });
      renderSidebar();
      renderContent();
      statusEl.style.color = "#10b981";
      statusEl.textContent = `✅ Importación completada: ${folders.length} carpetas y ${importedIdeas.length} ideas añadidas.`;
      return;
    }

    // En modo Firebase: escribir en lotes de 400
    const BATCH_SIZE = 400;
    const allOps     = [
      ...folders.map(f => ({ col: "idea-folders", id: f.id, data: f })),
      ...importedIdeas.map(i => ({ col: "ideas",        id: i.id, data: i })),
    ];

    for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
      const batch  = db.batch();
      const chunk  = allOps.slice(i, i + BATCH_SIZE);
      chunk.forEach(op => {
        const ref = db.collection("users").doc(currentUser.uid).collection(op.col).doc(op.id);
        batch.set(ref, { ...op.data, user_id: currentUser.uid }, { merge: true });
      });
      await batch.commit();
    }

    statusEl.style.color = "#10b981";
    statusEl.textContent = `✅ Importación completada: ${folders.length} carpetas y ${importedIdeas.length} ideas añadidas.`;

  } catch(e) {
    statusEl.style.color = "#ef4444";
    statusEl.textContent = `❌ Error: ${e.message}`;
  }
}


/* ════════════════════════════════════
   12. ELIMINAR
════════════════════════════════════ */
async function deleteIdea(id) {
  if (isGuest) {
    ideas = ideas.filter(i => i.id !== id);
    renderContent();
  } else {
    await db.collection("users").doc(currentUser.uid).collection("ideas").doc(id).delete();
  }
}

async function deleteFolder(id) {
  if (isGuest) {
    ideaFolders = ideaFolders.filter(f => f.id !== id);
    ideas = ideas.map(i => i.folder_id === id ? {...i, folder_id: null} : i);
    renderSidebar();
    if (activeFolderId === id) setView("ideas-home");
    else renderContent();
  } else {
    await db.collection("users").doc(currentUser.uid).collection("idea-folders").doc(id).delete();
    const batch = db.batch();
    ideas.filter(i => i.folder_id === id).forEach(i => {
      batch.update(
        db.collection("users").doc(currentUser.uid).collection("ideas").doc(i.id),
        { folder_id: null }
      );
    });
    await batch.commit();
    if (activeFolderId === id) setView("ideas-home");
  }
}


/* ════════════════════════════════════
   13. UTILIDADES
════════════════════════════════════ */
function renderColorPicker(containerId, selected, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = COLORS.map(c => `
    <div class="color-dot ${selected===c?"selected":""}" data-c="${c}" style="background:${c}">
      ${selected===c ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
    </div>`).join("");
  el.querySelectorAll(".color-dot").forEach(d => d.onclick = () => {
    onChange(d.dataset.c);
    renderColorPicker(containerId, d.dataset.c, onChange);
  });
}

function emptyState(icon, text) {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><p>${text}</p></div>`;
}

function showConfirm(msg, cb) {
  document.getElementById("confirm-msg").textContent = msg;
  confirmCallback = cb;
  document.getElementById("confirm-modal").style.display = "flex";
}

document.getElementById("btn-confirm-ok").onclick = () => {
  if (confirmCallback) confirmCallback();
  document.getElementById("confirm-modal").style.display = "none";
};
document.getElementById("btn-confirm-cancel").onclick = () => {
  document.getElementById("confirm-modal").style.display = "none";
};

function attachEvents() {
  // Abrir idea al clicar tarjeta
  document.querySelectorAll(".item-open").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".card-del-btn")) return;
      const { id, type } = el.dataset;
      if (type === "idea") openIdeaModal(ideas.find(i => i.id === id));
    });
  });

  // Eliminar idea
  document.querySelectorAll(".card-del-btn").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const { id } = el.dataset;
      const name   = ideas.find(i => i.id === id)?.title;
      showConfirm(`¿Eliminar "${name}"?`, () => deleteIdea(id));
    });
  });

  // Carpetas en la vista Ideas
  document.querySelectorAll(".idea-folder-card").forEach(el => {
    el.addEventListener("click",      () => setView("idea-folder", el.dataset.fid));
    el.addEventListener("mouseenter", () => el.style.borderColor = "#7c3aed");
    el.addEventListener("mouseleave", () => el.style.borderColor = "#e2e8f0");
  });

  // Tarjetas del Home
  document.getElementById("go-ideas")?.addEventListener("click",  () => setView("ideas-home"));
  document.getElementById("go-backup")?.addEventListener("click", () => setView("backup"));

  // Backup: botones dinámicos dentro del render
  document.getElementById("btn-export-backup")?.addEventListener("click", exportBackup);
  document.getElementById("import-file-input")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importBackup(file);
  });
}
