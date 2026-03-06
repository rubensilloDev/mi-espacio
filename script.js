/* ═══════════════════════════════════════════════════════
   SCRIPT.JS — Mi Espacio v2
   Secciones:
   1.  Firebase
   2.  Estado global
   3.  Autenticación
   4.  Firestore (datos en tiempo real)
   5.  Notificaciones
   6.  Navegación
   7.  Render: Home
   8.  Render: Ideas
   9.  Render: Tareas
   10. Render: Calendario
   11. Sidebar (carpetas)
   12. Modal de Idea
   13. Modal de Tarea
   14. Modal de Carpeta
   15. Eliminar
   16. Utilidades
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
let currentUser     = null;
let ideaFolders     = [];
let taskFolders     = [];
let ideas           = [];
let tasks           = [];

// Vista actual y contexto
let currentView     = "home";   // home | ideas-home | idea-folder | tasks-home | task-folder | tasks-calendar
let activeSection   = null;     // "ideas" | "tasks"
let activeFolderId  = null;

// Estado de modales
let editingIdea      = null;
let editingTask      = null;
let editingFolder    = null;
let folderType       = null;    // "idea" | "task"
let confirmCallback  = null;

// Estado de inputs de tarea en modal
let currentTags      = [];
let currentSubtasks  = [];
let currentIdeaColor = "#7c3aed";
let currentTaskColor = "#7c3aed";
let currentFolderColor = "#7c3aed";

// Calendario
const todayDate = new Date();
let calYear  = todayDate.getFullYear();
let calMonth = todayDate.getMonth();

// Colores disponibles
const COLORS = ["#7c3aed","#3b82f6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#f97316"];

// Nombres para calendario
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WDAYS  = ["D","L","M","X","J","V","S"];

// Estado de tareas
const STATUS_STYLES = {
  pending:     { bg: "#64748b18", color: "#64748b", label: "Pendiente" },
  "in-progress":{ bg: "#f59e0b18", color: "#f59e0b", label: "En curso" },
  done:        { bg: "#10b98118", color: "#10b981", label: "Hecha" },
};

// Genera id único
const uid = () => Math.random().toString(36).slice(2,10);

// Formatea fecha
const fmtDate = d => d ? new Date(d).toLocaleDateString("es-ES", {day:"2-digit", month:"short"}) : "";
const fmtDateTime = d => d ? new Date(d).toLocaleDateString("es-ES", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}) : "";


/* ════════════════════════════════════
   3. AUTENTICACIÓN
════════════════════════════════════ */
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "flex";
    setupUserUI(user);
    listenData();
    requestNotifPermission();
    checkMobile();
  } else {
    currentUser = null;
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("main-app").style.display = "none";
  }
});

document.getElementById("btn-google").onclick = async () => {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch(e) {
    const el = document.getElementById("login-error");
    el.style.display = "block";
    el.textContent = "Error al iniciar sesión. Inténtalo de nuevo.";
  }
};

document.getElementById("btn-logout").onclick = () => auth.signOut();

function setupUserUI(user) {
  document.getElementById("user-name").textContent  = user.displayName?.split(" ")[0] || "Usuario";
  document.getElementById("user-email").textContent = user.email;
  if (user.photoURL) {
    document.getElementById("user-avatar").src = user.photoURL;
    document.getElementById("user-avatar").style.display = "block";
    document.getElementById("user-avatar-ph").style.display = "none";
  }
}


/* ════════════════════════════════════
   4. FIRESTORE — Datos en tiempo real
════════════════════════════════════ */
function listenData() {
  const uid2 = currentUser.uid;

  // Carpetas de ideas
  db.collection("users").doc(uid2).collection("idea-folders")
    .orderBy("created_at").onSnapshot(snap => {
      ideaFolders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSidebar();
      if (currentView === "idea-folder") renderContent();
    });

  // Ideas
  db.collection("users").doc(uid2).collection("ideas")
    .orderBy("updated_at", "desc").onSnapshot(snap => {
      ideas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderContent();
    });

  // Carpetas de tareas
  db.collection("users").doc(uid2).collection("task-folders")
    .orderBy("created_at").onSnapshot(snap => {
      taskFolders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSidebar();
      if (currentView === "task-folder") renderContent();
    });

  // Tareas
  db.collection("users").doc(uid2).collection("tasks")
    .orderBy("updated_at", "desc").onSnapshot(snap => {
      tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      scheduleAllNotifications(); // programar notificaciones al recibir datos
      renderContent();
    });
}


/* ════════════════════════════════════
   5. NOTIFICACIONES
════════════════════════════════════ */

// IDs de los setTimeout activos (para poder cancelarlos)
const notifTimers = {};

// Pedir permiso al usuario
async function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

// Programar notificaciones para todas las tareas con deadline
function scheduleAllNotifications() {
  // Cancelar todos los timers anteriores
  Object.values(notifTimers).forEach(t => clearTimeout(t));
  Object.keys(notifTimers).forEach(k => delete notifTimers[k]);

  tasks.forEach(task => {
    if (!task.deadline || !task.notify_minutes || task.status === "done") return;
    scheduleNotification(task);
  });
}

function scheduleNotification(task) {
  if (Notification.permission !== "granted") return;

  const deadlineMs  = new Date(task.deadline).getTime();
  const notifyMs    = deadlineMs - (task.notify_minutes * 60 * 1000);
  const msUntilNotif = notifyMs - Date.now();

  if (msUntilNotif <= 0) return; // ya pasó

  notifTimers[task.id] = setTimeout(() => {
    new Notification("⏰ Recordatorio — " + task.title, {
      body: `Tienes una tarea programada para ${fmtDateTime(task.deadline)}`,
      icon: "/favicon.ico"
    });
  }, msUntilNotif);
}


/* ════════════════════════════════════
   6. NAVEGACIÓN
════════════════════════════════════ */
function setView(view, folderId) {
  currentView    = view;
  activeFolderId = folderId || null;

  // Marcar slink activo
  document.querySelectorAll(".slink").forEach(b => b.classList.remove("active"));
  if (view === "home")           document.querySelector('.slink[data-view="home"]')?.classList.add("active");
  if (view === "tasks-calendar") document.querySelector('.slink[data-view="tasks-home"]')?.classList.add("active");
  if (view === "ideas-home")     document.querySelectorAll(".idea-folder-btn").forEach(b => b.classList.remove("active"));
  if (view === "idea-folder")    document.querySelector(`.idea-folder-btn[data-fid="${folderId}"]`)?.classList.add("active");
  if (view === "task-folder")    document.querySelector(`.task-folder-btn[data-fid="${folderId}"]`)?.classList.add("active");

  // Header
  const backBtn = document.getElementById("btn-back");
  const titleEl = document.getElementById("header-title");
  backBtn.style.display = (view !== "home") ? "flex" : "none";

  const titles = {
    "home": "Inicio",
    "ideas-home": "Ideas",
    "tasks-home": "Tareas",
    "tasks-calendar": "Calendario",
  };

  if (titles[view]) {
    titleEl.innerHTML = `<span>${titles[view]}</span>`;
  } else if (view === "idea-folder") {
    const f = ideaFolders.find(x => x.id === folderId);
    titleEl.innerHTML = `<span style="display:flex;align-items:center;gap:8px"><span style="width:9px;height:9px;border-radius:50%;background:${f?.color||"#ccc"};display:inline-block"></span>${f?.title||""}</span>`;
  } else if (view === "task-folder") {
    const f = taskFolders.find(x => x.id === folderId);
    titleEl.innerHTML = `<span style="display:flex;align-items:center;gap:8px"><span style="width:9px;height:9px;border-radius:50%;background:${f?.color||"#ccc"};display:inline-block"></span>${f?.title||""}</span>`;
  }

  // FAB: ocultar en calendario
  document.getElementById("fab").style.display = view === "tasks-calendar" ? "none" : "flex";

  // Cerrar sidebar en móvil
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("show");

  renderContent();
}

document.getElementById("btn-back").onclick = () => {
  if (currentView === "idea-folder" || currentView === "ideas-home") setView("ideas-home");
  else if (currentView === "task-folder") setView("tasks-home");
  else setView("home");
};

document.getElementById("btn-menu").onclick = () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("backdrop").classList.toggle("show");
};

document.getElementById("backdrop").onclick = () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("show");
};

document.querySelector('.slink[data-view="home"]').onclick = () => setView("home");
document.querySelector('.slink[data-view="tasks-home"]').onclick = () => setView("tasks-calendar");

document.getElementById("fab").onclick = () => {
  if (currentView === "ideas-home" || currentView === "idea-folder") openIdeaModal(null);
  else if (currentView === "tasks-home" || currentView === "task-folder") openTaskModal(null);
  else openIdeaModal(null); // por defecto desde home
};

function checkMobile() {
  const isMobile = window.innerWidth <= 720;
  document.getElementById("btn-menu").style.display = isMobile ? "flex" : "none";
}
window.addEventListener("resize", checkMobile);


/* ════════════════════════════════════
   7. RENDER: HOME
════════════════════════════════════ */
function renderContent() {
  const el = document.getElementById("content");
  switch (currentView) {
    case "home":           el.innerHTML = renderHome();         break;
    case "ideas-home":     el.innerHTML = renderIdeasHome();    break;
    case "idea-folder":    el.innerHTML = renderIdeaFolder();   break;
    case "tasks-home":     el.innerHTML = renderTasksHome();    break;
    case "task-folder":    el.innerHTML = renderTaskFolder();   break;
    case "tasks-calendar": el.innerHTML = renderCalendar();     break;
  }
  attachEvents();
}

function renderHome() {
  const pendingTasks = tasks.filter(t => t.status !== "done").length;
  const totalIdeas   = ideas.length;

  // Tareas próximas (las 3 más cercanas con deadline)
  const upcoming = [...tasks]
    .filter(t => t.deadline && t.status !== "done")
    .sort((a,b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 3);

  let html = `
    <div class="home-hero">
      <h2>👋 Hola, ${currentUser?.displayName?.split(" ")[0] || ""}!</h2>
      <p>Organiza tus ideas y gestiona tus tareas en un solo lugar</p>
    </div>

    <div class="home-cards">
      <div class="home-card ideas-card" id="go-ideas">
        <span class="home-card-icon">💡</span>
        <h3>Mis Ideas</h3>
        <p>Captura y organiza tus ideas en carpetas</p>
        <span class="count-badge">${totalIdeas} ${totalIdeas === 1 ? "idea" : "ideas"}</span>
      </div>
      <div class="home-card tasks-card" id="go-tasks">
        <span class="home-card-icon">✅</span>
        <h3>Mis Tareas</h3>
        <p>Gestiona tus tareas con fechas y notificaciones</p>
        <span class="count-badge">${pendingTasks} pendientes</span>
      </div>
    </div>`;

  if (upcoming.length > 0) {
    html += `<div class="content-section-title">🔔 Próximas tareas</div>
             <div class="tasks-list" style="padding-top:0">`;
    upcoming.forEach(t => html += taskCard(t));
    html += `</div>`;
  }

  return html;
}


/* ════════════════════════════════════
   8. RENDER: IDEAS
════════════════════════════════════ */
function renderIdeasHome() {
  const myIdeas = ideas.filter(i => !i.folder_id);
  let html = "";

  if (ideaFolders.length > 0) {
    html += `<div class="content-section-title">📁 Carpetas</div>
             <div style="padding:0 18px 8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">`;
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
  const folder  = ideaFolders.find(f => f.id === activeFolderId);
  const myIdeas = ideas.filter(i => i.folder_id === activeFolderId);

  let html = "";
  if (folder?.description) {
    html += `<div style="margin:14px 18px;padding:11px 13px;background:white;border-radius:var(--radio);border:1.5px solid #e2e8f0;font-size:13px;color:#64748b">${folder.description}</div>`;
  }

  if (myIdeas.length === 0) {
    html += emptyState("💡", "Esta carpeta está vacía. Toca + para añadir.");
  } else {
    html += `<div class="ideas-grid">`;
    myIdeas.forEach(i => html += ideaCard(i));
    html += `</div>`;
  }
  return html;
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
   9. RENDER: TAREAS
════════════════════════════════════ */
function renderTasksHome() {
  const myTasks   = tasks.filter(t => !t.folder_id);
  const pending   = myTasks.filter(t => t.status !== "done");
  const done      = myTasks.filter(t => t.status === "done");

  let html = "";

  if (taskFolders.length > 0) {
    html += `<div class="content-section-title">📁 Carpetas</div>
             <div style="padding:0 18px 8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">`;
    taskFolders.forEach(f => {
      const count = tasks.filter(t => t.folder_id === f.id && t.status !== "done").length;
      html += `<div class="task-folder-card" data-fid="${f.id}" style="background:white;border-radius:14px;padding:16px;cursor:pointer;border:1.5px solid #e2e8f0;text-align:center;transition:all .18s;box-shadow:0 2px 8px rgba(0,0,0,.05)">
        <div style="font-size:28px;margin-bottom:6px">📁</div>
        <div style="width:8px;height:8px;border-radius:50%;background:${f.color};margin:0 auto 6px"></div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.title}</div>
        <div style="font-size:10px;color:#64748b;margin-top:3px">${count} pendientes</div>
      </div>`;
    });
    html += "</div>";
  }

  html += `<div class="content-section-title">⏳ Pendientes</div>`;
  if (pending.length === 0) {
    html += emptyState("✅", "Sin tareas pendientes. Toca + para añadir.");
  } else {
    html += `<div class="tasks-list">`;
    pending.forEach(t => html += taskCard(t));
    html += "</div>";
  }

  if (done.length > 0) {
    html += `<div class="content-section-title">✅ Completadas</div>
             <div class="tasks-list">`;
    done.forEach(t => html += taskCard(t));
    html += "</div>";
  }

  return html;
}

function renderTaskFolder() {
  const folder  = taskFolders.find(f => f.id === activeFolderId);
  const myTasks = tasks.filter(t => t.folder_id === activeFolderId);
  const pending = myTasks.filter(t => t.status !== "done");
  const done    = myTasks.filter(t => t.status === "done");

  let html = "";

  html += `<div class="content-section-title">⏳ Pendientes</div>`;
  if (pending.length === 0) {
    html += emptyState("✅", "Sin tareas pendientes en esta carpeta");
  } else {
    html += `<div class="tasks-list">`;
    pending.forEach(t => html += taskCard(t));
    html += "</div>";
  }

  if (done.length > 0) {
    html += `<div class="content-section-title">✅ Completadas</div>
             <div class="tasks-list">`;
    done.forEach(t => html += taskCard(t));
    html += "</div>";
  }

  return html;
}

function taskCard(task) {
  const st = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
  const isDone = task.status === "done";

  // Calcular estado de la fecha
  let deadlineHtml = "";
  if (task.deadline) {
    const dl   = new Date(task.deadline);
    const diff = dl - Date.now();
    const cls  = diff < 0 ? "overdue" : diff < 86400000 ? "soon" : "";
    const prefix = diff < 0 ? "⚠️ " : diff < 86400000 ? "⏰ " : "📅 ";
    deadlineHtml = `<span class="task-deadline ${cls}">${prefix}${fmtDateTime(task.deadline)}</span>`;
  }

  // Subtareas
  let subtasksHtml = "";
  if (task.subtasks?.length > 0) {
    const checked = task.subtasks.filter(s => s.checked).length;
    const pct     = Math.round(checked / task.subtasks.length * 100);
    subtasksHtml  = `
      <div class="task-subtasks-preview">
        ${task.subtasks.slice(0,2).map(s => `
          <div class="subtask-preview-row">
            <div style="width:12px;height:12px;border-radius:3px;border:1.5px solid ${s.checked?"#10b981":"#cbd5e1"};background:${s.checked?"#10b981":"transparent"};flex-shrink:0"></div>
            <span style="text-decoration:${s.checked?"line-through":""}">${s.content}</span>
          </div>`).join("")}
        ${task.subtasks.length > 2 ? `<span style="font-size:10px;color:#94a3b8">+${task.subtasks.length-2} más</span>` : ""}
      </div>
      <div class="subtask-progress-bar"><div class="subtask-progress-fill" style="width:${pct}%"></div></div>`;
  }

  // Etiquetas
  let tagsHtml = "";
  if (task.tags?.length > 0) {
    tagsHtml = `<div class="tags-row-display">${task.tags.map(t => `<span class="tag-chip">${t}</span>`).join("")}</div>`;
  }

  // Notificación badge
  let notifBadge = "";
  if (task.notify_minutes) {
    const mins = task.notify_minutes;
    const label = mins >= 1440 ? `${mins/1440}d` : mins >= 60 ? `${mins/60}h` : `${mins}m`;
    notifBadge = `<span style="font-size:10px;color:#64748b">🔔 ${label} antes</span>`;
  }

  return `
    <div class="task-card ${isDone?"done-card":""} item-open" data-id="${task.id}" data-type="task">
      <div class="task-card-bar" style="background:${task.color||"#7c3aed"}"></div>
      <div class="task-card-inner">
        <div class="task-card-top">
          <span class="task-title">${task.title}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="task-status-badge" style="background:${st.bg};color:${st.color}">${st.label}</span>
            <button class="card-del-btn" data-id="${task.id}" data-type="task">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        ${subtasksHtml}
        ${tagsHtml}
        <div class="task-footer">
          ${deadlineHtml}
          ${notifBadge}
        </div>
      </div>
    </div>`;
}


/* ════════════════════════════════════
   10. RENDER: CALENDARIO
════════════════════════════════════ */
function renderCalendar() {
  const dim = new Date(calYear, calMonth+1, 0).getDate();
  const fd  = new Date(calYear, calMonth, 1).getDay();

  const byDate = {};
  tasks.forEach(t => {
    if (!t.deadline) return;
    const d = new Date(t.deadline);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(t);
  });

  const isToday = d =>
    d === todayDate.getDate() && calMonth === todayDate.getMonth() && calYear === todayDate.getFullYear();

  let html = `<div class="calendar-wrap">
    <div class="cal-header">
      <button class="cal-nav-btn" id="cal-prev">&#8249;</button>
      <span>${MONTHS[calMonth]} ${calYear}</span>
      <button class="cal-nav-btn" id="cal-next">&#8250;</button>
    </div>
    <div class="cal-days-header">
      ${WDAYS.map(d => `<div class="cal-day-name">${d}</div>`).join("")}
    </div>
    <div class="cal-grid">`;

  for (let i = 0; i < fd; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= dim; d++) {
    const k  = `${calYear}-${calMonth}-${d}`;
    const dt = byDate[k] || [];
    const iso = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}T09:00`;

    html += `<div class="cal-cell ${isToday(d)?"today":""}" data-iso="${iso}">
      <div class="cal-cell-num">${d}</div>
      ${dt.slice(0,2).map(t => `<div class="cal-task-dot item-open" data-id="${t.id}" data-type="task" style="background:${t.color||"#7c3aed"}22;color:${t.color||"#7c3aed"}">${t.title}</div>`).join("")}
      ${dt.length > 2 ? `<div style="font-size:8px;color:#94a3b8">+${dt.length-2}</div>` : ""}
    </div>`;
  }

  html += `</div>`;

  // Lista de tareas programadas
  const scheduled = [...tasks].filter(t => t.deadline).sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
  html += `</div><div class="content-section-title">📋 Todas las programadas</div>`;
  if (scheduled.length === 0) {
    html += emptyState("📅", "Sin tareas con fecha asignada");
  } else {
    html += `<div class="tasks-list">`;
    scheduled.forEach(t => html += taskCard(t));
    html += `</div>`;
  }

  return html;
}


/* ════════════════════════════════════
   11. SIDEBAR — Carpetas
════════════════════════════════════ */
function renderSidebar() {
  renderFolderGroup("idea-folder-list", ideaFolders, "idea-folder-btn", "idea");
  renderFolderGroup("task-folder-list",  taskFolders,  "task-folder-btn",  "task");
}

function renderFolderGroup(containerId, folders, btnClass, type) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (folders.length === 0) {
    el.innerHTML = `<div style="padding:4px 14px 6px;color:#475569;font-size:11px">Sin carpetas</div>`;
    return;
  }

  el.innerHTML = folders.map(f => `
    <div style="position:relative">
      <button class="slink ${btnClass} ${activeFolderId===f.id&&currentView.includes(type)?"active":""}" data-fid="${f.id}" data-type="${type}">
        <div style="width:7px;height:7px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.title}</span>
        <span class="folder-menu-btn" data-fid="${f.id}" data-type="${type}" style="color:#475569;font-size:16px;padding:0 4px;cursor:pointer">⋯</span>
      </button>
      <div class="folder-dropdown" id="fdrop-${f.id}">
        <button class="folder-edit-btn" data-fid="${f.id}" data-type="${type}">✏️ Editar</button>
        <button class="folder-del-btn del-opt" data-fid="${f.id}" data-type="${type}">🗑 Eliminar</button>
      </div>
    </div>`).join("");

  // Navegar a carpeta
  el.querySelectorAll(`.${btnClass}`).forEach(b => {
    b.onclick = e => {
      if (e.target.closest(".folder-menu-btn")) return;
      const view = type === "idea" ? "idea-folder" : "task-folder";
      setView(view, b.dataset.fid);
    };
  });

  // Menú contextual
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
      const f = (b.dataset.type === "idea" ? ideaFolders : taskFolders).find(x => x.id === b.dataset.fid);
      openFolderModal(f, b.dataset.type);
    };
  });

  el.querySelectorAll(".folder-del-btn").forEach(b => {
    b.onclick = () => {
      closeDropdowns();
      const f = (b.dataset.type === "idea" ? ideaFolders : taskFolders).find(x => x.id === b.dataset.fid);
      showConfirm(`¿Eliminar carpeta "${f?.title}"?`, () => deleteFolder(b.dataset.fid, b.dataset.type));
    };
  });
}

function closeDropdowns() {
  document.querySelectorAll(".folder-dropdown").forEach(d => d.style.display = "none");
}
document.addEventListener("click", closeDropdowns);


/* ════════════════════════════════════
   12. MODAL: IDEA
════════════════════════════════════ */
function openIdeaModal(idea) {
  editingIdea = idea;
  document.getElementById("idea-modal-title").textContent = idea ? "Editar idea" : "Nueva idea";
  document.getElementById("idea-title-input").value = idea?.title || "";
  document.getElementById("idea-content").value     = idea?.content || "";

  // Select de carpeta
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
document.getElementById("idea-modal").onclick = e => { if (e.target === document.getElementById("idea-modal")) document.getElementById("idea-modal").style.display = "none"; };

document.getElementById("btn-save-idea").onclick = async () => {
  const title = document.getElementById("idea-title-input").value.trim();
  if (!title) return;
  const now   = new Date().toISOString();
  const data  = {
    title,
    content:   document.getElementById("idea-content").value,
    folder_id: document.getElementById("idea-folder-select").value || null,
    color:     currentIdeaColor,
    user_id:   currentUser.uid,
    updated_at: now,
    created_at: editingIdea?.created_at || now,
  };
  const id = editingIdea?.id || uid();
  await db.collection("users").doc(currentUser.uid).collection("ideas").doc(id).set({ ...data, id });
  document.getElementById("idea-modal").style.display = "none";
};


/* ════════════════════════════════════
   13. MODAL: TAREA
════════════════════════════════════ */
function openTaskModal(task) {
  editingTask     = task;
  currentTags     = task?.tags     ? [...task.tags]     : [];
  currentSubtasks = task?.subtasks ? [...task.subtasks] : [];
  currentTaskColor = task?.color || "#7c3aed";

  document.getElementById("task-modal-title").textContent = task ? "Editar tarea" : "Nueva tarea";
  document.getElementById("task-title-input").value       = task?.title || "";
  document.getElementById("task-status").value            = task?.status || "pending";
  document.getElementById("task-deadline").value          = task?.deadline ? task.deadline.slice(0,16) : "";
  document.getElementById("task-notify").value            = task?.notify_minutes || "";
  document.getElementById("task-notify-custom").value     = "";
  document.getElementById("custom-notify-row").style.display = "none";

  // Select carpeta
  const sel = document.getElementById("task-folder-select");
  sel.innerHTML = '<option value="">Sin carpeta</option>' +
    taskFolders.map(f => `<option value="${f.id}" ${task?.folder_id===f.id?"selected":""}>${f.title}</option>`).join("");
  if (currentView === "task-folder" && !task) sel.value = activeFolderId;

  renderColorPicker("task-color-picker", currentTaskColor, c => currentTaskColor = c);
  renderTags();
  renderSubtasks();

  document.getElementById("task-modal").style.display = "flex";
  setTimeout(() => document.getElementById("task-title-input").focus(), 100);
}

// Mostrar input personalizado cuando se elige "Personalizado"
document.getElementById("task-notify").onchange = function() {
  document.getElementById("custom-notify-row").style.display = this.value === "custom" ? "block" : "none";
};

document.getElementById("btn-close-task").onclick = () => document.getElementById("task-modal").style.display = "none";
document.getElementById("task-modal").onclick = e => { if (e.target === document.getElementById("task-modal")) document.getElementById("task-modal").style.display = "none"; };

// Guardar tarea
document.getElementById("btn-save-task").onclick = async () => {
  const title = document.getElementById("task-title-input").value.trim();
  if (!title) return;

  // Calcular minutos de notificación
  let notifyMins = null;
  const notifSel = document.getElementById("task-notify").value;
  if (notifSel === "custom") {
    notifyMins = parseInt(document.getElementById("task-notify-custom").value) || null;
  } else if (notifSel) {
    notifyMins = parseInt(notifSel);
  }

  const now  = new Date().toISOString();
  const data = {
    title,
    status:          document.getElementById("task-status").value,
    folder_id:       document.getElementById("task-folder-select").value || null,
    deadline:        document.getElementById("task-deadline").value || null,
    notify_minutes:  notifyMins,
    tags:            currentTags,
    subtasks:        currentSubtasks,
    color:           currentTaskColor,
    user_id:         currentUser.uid,
    updated_at:      now,
    created_at:      editingTask?.created_at || now,
  };
  const id = editingTask?.id || uid();
  await db.collection("users").doc(currentUser.uid).collection("tasks").doc(id).set({ ...data, id });
  document.getElementById("task-modal").style.display = "none";
};

// ── ETIQUETAS ──────────────────────────────────
function renderTags() {
  const el = document.getElementById("tags-container");
  el.innerHTML = currentTags.map(t => `
    <span class="tag-chip-editable">
      ${t}
      <button data-tag="${t}">×</button>
    </span>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => {
    currentTags = currentTags.filter(t => t !== b.dataset.tag);
    renderTags();
  });
}

document.getElementById("tag-input").onkeydown = e => {
  if (e.key === "Enter") {
    const val = e.target.value.trim();
    if (val && !currentTags.includes(val)) currentTags.push(val);
    e.target.value = "";
    renderTags();
    e.preventDefault();
  }
};

// ── SUBTAREAS ─────────────────────────────────
function renderSubtasks() {
  const el = document.getElementById("subtasks-container");
  el.innerHTML = currentSubtasks.map(s => `
    <div class="subtask-row">
      <div class="subtask-check ${s.checked?"checked":""}" data-sid="${s.id}">
        ${s.checked ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
      </div>
      <span class="subtask-text" style="text-decoration:${s.checked?"line-through":""};color:${s.checked?"#94a3b8":"#0f172a"}">${s.content}</span>
      <button class="subtask-del" data-sid="${s.id}">×</button>
    </div>`).join("");

  el.querySelectorAll(".subtask-check").forEach(b => b.onclick = () => {
    currentSubtasks = currentSubtasks.map(s => s.id===b.dataset.sid ? {...s, checked:!s.checked} : s);
    renderSubtasks();
  });
  el.querySelectorAll(".subtask-del").forEach(b => b.onclick = () => {
    currentSubtasks = currentSubtasks.filter(s => s.id !== b.dataset.sid);
    renderSubtasks();
  });
}

document.getElementById("subtask-input").onkeydown = e => { if (e.key==="Enter") addSubtask(); };
document.getElementById("btn-add-subtask").onclick  = addSubtask;

function addSubtask() {
  const inp = document.getElementById("subtask-input");
  if (!inp.value.trim()) return;
  currentSubtasks.push({ id: uid(), content: inp.value.trim(), checked: false });
  inp.value = "";
  renderSubtasks();
}


/* ════════════════════════════════════
   14. MODAL: CARPETA
════════════════════════════════════ */
document.getElementById("btn-new-idea-folder").onclick = () => openFolderModal(null, "idea");
document.getElementById("btn-new-task-folder").onclick = () => openFolderModal(null, "task");

function openFolderModal(folder, type) {
  editingFolder    = folder;
  folderType       = type;
  currentFolderColor = folder?.color || "#7c3aed";

  document.getElementById("folder-modal-title").textContent = folder ? "Editar carpeta" : `Nueva carpeta de ${type==="idea"?"ideas":"tareas"}`;
  document.getElementById("btn-save-folder").textContent    = folder ? "Guardar" : "Crear";
  document.getElementById("folder-name-input").value        = folder?.title || "";
  renderColorPicker("folder-color-picker", currentFolderColor, c => currentFolderColor = c);
  document.getElementById("folder-modal").style.display = "flex";
}

document.getElementById("btn-close-folder").onclick = () => document.getElementById("folder-modal").style.display = "none";
document.getElementById("folder-modal").onclick = e => { if (e.target === document.getElementById("folder-modal")) document.getElementById("folder-modal").style.display = "none"; };

document.getElementById("btn-save-folder").onclick = async () => {
  const title = document.getElementById("folder-name-input").value.trim();
  if (!title) return;
  const col  = folderType === "idea" ? "idea-folders" : "task-folders";
  const id   = editingFolder?.id || uid();
  const now  = new Date().toISOString();
  await db.collection("users").doc(currentUser.uid).collection(col).doc(id).set({
    id, title, color: currentFolderColor,
    user_id:    currentUser.uid,
    created_at: editingFolder?.created_at || now,
    updated_at: now,
  });
  document.getElementById("folder-modal").style.display = "none";
};


/* ════════════════════════════════════
   15. ELIMINAR
════════════════════════════════════ */
async function deleteIdea(id) {
  await db.collection("users").doc(currentUser.uid).collection("ideas").doc(id).delete();
}

async function deleteTask(id) {
  await db.collection("users").doc(currentUser.uid).collection("tasks").doc(id).delete();
  if (notifTimers[id]) { clearTimeout(notifTimers[id]); delete notifTimers[id]; }
}

async function deleteFolder(id, type) {
  const col = type === "idea" ? "idea-folders" : "task-folders";
  const itemCol = type === "idea" ? "ideas" : "tasks";
  await db.collection("users").doc(currentUser.uid).collection(col).doc(id).delete();
  // Quitar folder_id de los items de esa carpeta
  const batch = db.batch();
  const list  = type === "idea" ? ideas : tasks;
  list.filter(i => i.folder_id === id).forEach(i => {
    batch.update(db.collection("users").doc(currentUser.uid).collection(itemCol).doc(i.id), { folder_id: null });
  });
  await batch.commit();
  if (activeFolderId === id) setView(type === "idea" ? "ideas-home" : "tasks-home");
}


/* ════════════════════════════════════
   16. UTILIDADES
════════════════════════════════════ */

// Selector de colores
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

// Estado vacío
function emptyState(icon, text) {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><p>${text}</p></div>`;
}

// Modal de confirmación
function showConfirm(msg, cb) {
  document.getElementById("confirm-msg").textContent = msg;
  confirmCallback = cb;
  document.getElementById("confirm-modal").style.display = "flex";
}

document.getElementById("btn-confirm-ok").onclick = () => {
  if (confirmCallback) confirmCallback();
  document.getElementById("confirm-modal").style.display = "none";
};
document.getElementById("btn-confirm-cancel").onclick = () => document.getElementById("confirm-modal").style.display = "none";

// Eventos de tarjetas (click para abrir, X para eliminar)
function attachEvents() {
  // Abrir item
  document.querySelectorAll(".item-open").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".card-del-btn")) return;
      const { id, type } = el.dataset;
      if (type === "idea") { openIdeaModal(ideas.find(i => i.id === id)); }
      else                 { openTaskModal(tasks.find(t => t.id === id)); }
    });
  });

  // Eliminar
  document.querySelectorAll(".card-del-btn").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      const { id, type } = el.dataset;
      const name = type === "idea"
        ? ideas.find(i => i.id === id)?.title
        : tasks.find(t => t.id === id)?.title;
      showConfirm(`¿Eliminar "${name}"?`, () => type === "idea" ? deleteIdea(id) : deleteTask(id));
    });
  });

  // Navegar a carpetas de ideas desde el home
  document.querySelectorAll(".idea-folder-card").forEach(el => {
    el.addEventListener("click", () => setView("idea-folder", el.dataset.fid));
    el.addEventListener("mouseenter", () => el.style.borderColor = "#7c3aed");
    el.addEventListener("mouseleave", () => el.style.borderColor = "#e2e8f0");
  });

  // Navegar a carpetas de tareas desde el home
  document.querySelectorAll(".task-folder-card").forEach(el => {
    el.addEventListener("click", () => setView("task-folder", el.dataset.fid));
    el.addEventListener("mouseenter", () => el.style.borderColor = "#10b981");
    el.addEventListener("mouseleave", () => el.style.borderColor = "#e2e8f0");
  });

  // Botones del home
  document.getElementById("go-ideas")?.addEventListener("click", () => setView("ideas-home"));
  document.getElementById("go-tasks")?.addEventListener("click", () => setView("tasks-home"));

  // Calendario nav
  document.getElementById("cal-prev")?.addEventListener("click", () => {
    if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--;
    renderContent();
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
    renderContent();
  });

  // Click en día del calendario: nueva tarea
  document.querySelectorAll(".cal-cell:not(.empty)").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest(".item-open") && e.target.closest("[data-type='task']")) return;
      openTaskModal(null);
      setTimeout(() => { document.getElementById("task-deadline").value = el.dataset.iso; }, 50);
    });
  });
}
