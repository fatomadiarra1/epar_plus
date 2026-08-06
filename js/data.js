/* =====================================================================
   ÉPARGNE PLUS — Data layer (mock "database" on localStorage)
   ---------------------------------------------------------------------
   This module simulates the backend (PHP/Node + MySQL/Firebase) using the
   browser localStorage so the app is fully functional as a static demo.
   Swap the functions in this file for real API/fetch calls later.
   ===================================================================== */

const DB_KEY = "epp_db_v1";
const SESSION_KEY = "epp_session";
const THEME_KEY = "epp_theme";

/* Business rule: 1000 FCFA = 1 jour d'épargne */
const FCFA_PER_DAY = 1000;
const daysFromAmount = (amount) => Math.floor((Number(amount) || 0) / FCFA_PER_DAY);

/* ----------  First-launch detection  ---------- */
function isFirstLaunch() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return true;
  try { const db = JSON.parse(raw); return !db.admin; }
  catch (e) { return true; }
}

function emptyDB() {
  return { members: [], deposits: [], admin: null, logs: [], settings: { fcfaPerDay: FCFA_PER_DAY, appName: "ÉPARGNE PLUS" } };
}

/* Create the database with the admin account chosen at first launch */
function initializeDB(adminData) {
  const db = emptyDB();
  db.admin = {
    id: "admin",
    login: adminData.login,
    password: adminData.password,
    firstName: adminData.firstName,
    lastName: adminData.lastName,
    role: "admin",
    phone: adminData.phone || "",
    address: adminData.address || "",
    photo: "",
  };
  db.logs.push({ id: "l" + Date.now().toString(36), ts: Date.now(), who: adminData.login, action: "Initialisation du système — compte administrateur créé" });
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
}

/* ----------  Seed data (used only by "Reset to demo" in settings)  ---------- */
function seedData() {
  const now = Date.now();
  const day = 86400000;

  const members = [
    { id: "m1", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 42 * day },
    { id: "m2", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 38 * day },
    { id: "m3", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 30 * day },
    { id: "m4", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 25 * day },
    { id: "m5", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 18 * day },
    { id: "m6", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 12 * day },
    { id: "m7", firstName: "", lastName: "",   gender: "", phone: "", address: "",      login: "",    password: "",     photo: "", createdAt: now - 7 * day },
  ];

  const deposits = [];
  let dep = 1;
  const amounts = [1000, 2000, 3000, 5000, 1000, 2000, 4000];
  members.forEach((m, idx) => {
    const count = 6 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const ts = now - Math.floor(Math.random() * 40) * day - Math.floor(Math.random() * day);
      const amount = amounts[(idx + i) % amounts.length];
      deposits.push({ id: "d" + dep++, memberId: m.id, amount, days: daysFromAmount(amount), ts });
    }
  });
  [members[0], members[2], members[4]].forEach((m, i) => {
    deposits.push({ id: "d" + dep++, memberId: m.id, amount: (i + 1) * 1000, days: i + 1, ts: now - i * 3600000 });
  });
  deposits.sort((a, b) => b.ts - a.ts);

  const admin = { id: "admin", login: "fadiarra", password: "Kone2002", firstName: "EPARGNE", lastName: "MON DJIE", role: "admin", phone: "+223 94 58 69 44", address: "Siège ÉPARGNE PLUS, Bamako", photo: "" };

  const logs = [
    { id: "l1", ts: now - 3600000, who: "admin", action: "Connexion administrateur réussie" },
    { id: "l2", ts: now - 5400000, who: "admin", action: "Nouveau membre ajouté : Kadiatou Touré" },
    { id: "l3", ts: now - 7200000, who: "admin", action: "Dépôt validé : 5000 FCFA" },
  ];

  return { members, deposits, admin, logs, settings: { fcfaPerDay: FCFA_PER_DAY, appName: "ÉPARGNE PLUS" } };
}

/* ----------  DB access  ---------- */
function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return emptyDB();
  try { return JSON.parse(raw); }
  catch (e) { return emptyDB(); }
}
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

const DB = {
  get all() { return loadDB(); },

  /* members */
  members() { return loadDB().members.slice().sort((a, b) => b.createdAt - a.createdAt); },
  member(id) { return loadDB().members.find(m => m.id === id) || null; },
  addMember(data) {
    const db = loadDB();
    const id = "m" + (Date.now().toString(36));
    const m = { id, photo: "", createdAt: Date.now(), ...data };
    db.members.push(m);
    DB._log(db, "admin", `Nouveau membre ajouté : ${data.firstName} ${data.lastName}`);
    saveDB(db);
    return m;
  },
  updateMember(id, data) {
    const db = loadDB();
    const i = db.members.findIndex(m => m.id === id);
    if (i < 0) return null;
    db.members[i] = { ...db.members[i], ...data };
    DB._log(db, "admin", `Membre modifié : ${db.members[i].firstName} ${db.members[i].lastName}`);
    saveDB(db);
    return db.members[i];
  },
  deleteMember(id) {
    const db = loadDB();
    const m = db.members.find(x => x.id === id);
    db.members = db.members.filter(x => x.id !== id);
    db.deposits = db.deposits.filter(d => d.memberId !== id);
    if (m) DB._log(db, "admin", `Membre supprimé : ${m.firstName} ${m.lastName}`);
    saveDB(db);
  },

  /* deposits */
  deposits() { return loadDB().deposits.slice().sort((a, b) => b.ts - a.ts); },
  depositsByMember(id) { return DB.deposits().filter(d => d.memberId === id); },
  addDeposit(memberId, amount) {
    const db = loadDB();
    const d = { id: "d" + Date.now().toString(36), memberId, amount: Number(amount), days: daysFromAmount(amount), ts: Date.now() };
    db.deposits.push(d);
    const m = db.members.find(x => x.id === memberId);
    DB._log(db, "admin", `Dépôt validé : ${fmtMoney(amount)} pour ${m ? m.firstName + " " + m.lastName : memberId}`);
    saveDB(db);
    return d;
  },

  /* logs */
  logs() { return loadDB().logs.slice().sort((a, b) => b.ts - a.ts); },
  _log(db, who, action) { db.logs = db.logs || []; db.logs.push({ id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), who, action }); },
  log(who, action) { const db = loadDB(); DB._log(db, who, action); saveDB(db); },

  /* settings + admin */
  admin() { return loadDB().admin; },
  updateAdmin(data) { const db = loadDB(); db.admin = { ...db.admin, ...data }; saveDB(db); return db.admin; },
  settings() { return loadDB().settings; },

  reset() {
    const db = loadDB();
    const currentAdmin = db.admin;
    const seeded = seedData();
    if (currentAdmin) seeded.admin = currentAdmin;
    localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  },
};

/* ----------  Stats helpers  ---------- */
function isSameDay(ts, ref = Date.now()) {
  const a = new Date(ts), b = new Date(ref);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function memberTotals(memberId) {
  const ds = DB.depositsByMember(memberId);
  const total = ds.reduce((s, d) => s + d.amount, 0);
  const days = ds.reduce((s, d) => s + d.days, 0);
  return { total, days, count: ds.length, last: ds[0] || null, deposits: ds };
}
function globalStats() {
  const members = DB.members();
  const deposits = DB.deposits();
  const totalSaved = deposits.reduce((s, d) => s + d.amount, 0);
  const totalDays = deposits.reduce((s, d) => s + d.days, 0);
  const today = deposits.filter(d => isSameDay(d.ts));
  const todayAmount = today.reduce((s, d) => s + d.amount, 0);
  return {
    members: members.length,
    totalSaved,
    deposits: deposits.length,
    todayAmount,
    todayCount: today.length,
    totalDays,
    last: deposits[0] || null,
  };
}

/* ----------  Auth  ---------- */
const Auth = {
  login(login, password) {
    const db = loadDB();
    const a = db.admin;
    if (a && login === a.login && password === a.password) {
      const session = { role: "admin", id: a.id, name: `${a.firstName} ${a.lastName}`, login: a.login };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      DB.log("admin", "Connexion administrateur réussie");
      return session;
    }
    const m = db.members.find(x => x.login === login && x.password === password);
    if (m) {
      const session = { role: "user", id: m.id, name: `${m.firstName} ${m.lastName}`, login: m.login };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      DB.log(m.login, `Connexion utilisateur : ${m.firstName} ${m.lastName}`);
      return session;
    }
    return null;
  },
  session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } },
  logout() { const s = Auth.session(); if (s) DB.log(s.login, "Déconnexion"); localStorage.removeItem(SESSION_KEY); },
  require(role) {
    const s = Auth.session();
    if (!s) { location.href = "index.html"; return null; }
    if (role && s.role !== role) { location.href = s.role === "admin" ? "admin.html" : "user.html"; return null; }
    return s;
  },
};
