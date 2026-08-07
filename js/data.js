/* =====================================================================
   ÉPARGNE PLUS — Data layer sécurisé
   ---------------------------------------------------------------------
   CORRECTIONS DE SÉCURITÉ :
   [1] Hashage des mots de passe via PBKDF2 (Web Crypto API) — plus de
       stockage en clair dans localStorage
   [2] Rate-limiting login : blocage après 5 tentatives / 15 min
   [3] Token de session cryptographiquement aléatoire (pas juste un objet
       JSON trivial) — expiration après 8 h
   [4] Politique de mot de passe : min. 8 car., 1 majuscule, 1 chiffre,
       1 caractère spécial
   [5] seedData() sans identifiants réels — données neutres uniquement
   [6] Validation et sanitisation des entrées avant écriture en DB
   [7] Suppression de l'exposition publique de l'épargne totale sur la
       page de login (heroAmount n'affiche plus de vraies données)
   ===================================================================== */

const DB_KEY      = "epp_db_v2";   // v2 : schéma avec hash
const SESSION_KEY = "epp_session_v2";
const THEME_KEY   = "epp_theme";
const RL_KEY      = "epp_rl";      // rate-limit

/* ----------  Règle métier  ---------- */
const FCFA_PER_DAY  = 1000;
const daysFromAmount = (amount) => Math.floor((Number(amount) || 0) / FCFA_PER_DAY);

/* ----------  Politique de mot de passe  ---------- */
const PWD_POLICY = {
  minLength: 8,
  test(pwd) {
    if (!pwd || pwd.length < this.minLength) return "Minimum 8 caractères requis.";
    if (!/[A-Z]/.test(pwd))                  return "Au moins une lettre majuscule requise.";
    if (!/[0-9]/.test(pwd))                  return "Au moins un chiffre requis.";
    if (!/[^A-Za-z0-9]/.test(pwd))           return "Au moins un caractère spécial requis (! @ # $ …).";
    return null; // OK
  },
};

/* ----------  Crypto helpers (PBKDF2 via Web Crypto)  ---------- */
const Crypto = {
  /* Retourne un Uint8Array aléatoire de n octets */
  randomBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  },

  /* Bytes → hex string */
  toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  /* hex string → Uint8Array */
  fromHex(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return arr;
  },

  /* Hash PBKDF2-SHA256 : retourne "salt:hash" (hex) */
  async hashPassword(password) {
    const salt = this.randomBytes(16);
    const keyMaterial = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
      keyMaterial, 256
    );
    return this.toHex(salt) + ":" + this.toHex(derived);
  },

  /* Vérifie password contre "salt:hash" stocké */
  async verifyPassword(password, stored) {
    try {
      const [saltHex, hashHex] = stored.split(":");
      const salt = this.fromHex(saltHex);
      const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
      );
      const derived = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
        keyMaterial, 256
      );
      /* Comparaison en temps constant */
      const a = new Uint8Array(derived), b = this.fromHex(hashHex);
      if (a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    } catch {
      return false;
    }
  },

  /* Token de session : 32 octets aléatoires en hex */
  newSessionToken() {
    return this.toHex(this.randomBytes(32));
  },
};

/* ----------  Rate-limiter login  ---------- */
const RateLimit = {
  MAX_ATTEMPTS : 5,
  WINDOW_MS    : 15 * 60 * 1000, // 15 min

  _load() {
    try { return JSON.parse(localStorage.getItem(RL_KEY)) || {}; } catch { return {}; }
  },
  _save(d) { localStorage.setItem(RL_KEY, JSON.stringify(d)); },

  check(login) {
    const d   = this._load();
    const key = "l_" + login.toLowerCase();
    const rec = d[key] || { count: 0, first: 0 };
    const now = Date.now();
    if (now - rec.first > this.WINDOW_MS) { rec.count = 0; rec.first = now; }
    if (rec.count >= this.MAX_ATTEMPTS) {
      const wait = Math.ceil((this.WINDOW_MS - (now - rec.first)) / 60000);
      return `Trop de tentatives. Réessayez dans ${wait} min.`;
    }
    return null;
  },

  record(login) {
    const d   = this._load();
    const key = "l_" + login.toLowerCase();
    const rec = d[key] || { count: 0, first: Date.now() };
    const now = Date.now();
    if (now - rec.first > this.WINDOW_MS) { rec.count = 0; rec.first = now; }
    rec.count++;
    d[key] = rec;
    this._save(d);
  },

  reset(login) {
    const d   = this._load();
    const key = "l_" + login.toLowerCase();
    delete d[key];
    this._save(d);
  },
};

/* ----------  Sanitisation des entrées  ---------- */
function sanitize(val, maxLen = 200) {
  return String(val ?? "").trim().slice(0, maxLen);
}
function sanitizeLogin(val) {
  // Identifiants : lettres, chiffres, tiret, underscore uniquement
  return sanitize(val, 50).replace(/[^a-zA-Z0-9_\-]/g, "");
}

/* ----------  First-launch detection  ---------- */
function isFirstLaunch() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return true;
  try { const db = JSON.parse(raw); return !db.admin; }
  catch { return true; }
}

function emptyDB() {
  return {
    members  : [],
    deposits : [],
    admin    : null,
    logs     : [],
    settings : { fcfaPerDay: FCFA_PER_DAY, appName: "ÉPARGNE PLUS" },
  };
}

/* Initialisation (premier lancement) — reçoit déjà le hash */
function initializeDB(adminData) {
  const db  = emptyDB();
  db.admin  = {
    id        : "admin",
    login     : adminData.login,
    pwdHash   : adminData.pwdHash,   // hash PBKDF2, jamais le mot de passe
    firstName : adminData.firstName,
    lastName  : adminData.lastName,
    role      : "admin",
    phone     : adminData.phone    || "",
    address   : adminData.address  || "",
    photo     : "",
  };
  db.logs.push({
    id     : "l" + Date.now().toString(36),
    ts     : Date.now(),
    who    : adminData.login,
    action : "Initialisation du système — compte administrateur créé",
  });
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  return db;
}

/* ----------  Seed data — sans identifiants réels  ---------- */
function seedData() {
  const now = Date.now();
  const day = 86_400_000;

  // Membres avec des identifiants anonymes (pas de vrais mots de passe)
  const members = [
    { id:"m1", firstName:"Awa",      lastName:"Traoré",   gender:"F", phone:"+223 70 00 00 01", address:"Bamako",  login:"awa_traore",    pwdHash:"DEMO", photo:"", createdAt: now - 42*day },
    { id:"m2", firstName:"Moussa",   lastName:"Diallo",   gender:"M", phone:"+223 70 00 00 02", address:"Bamako",  login:"moussa_diallo", pwdHash:"DEMO", photo:"", createdAt: now - 38*day },
    { id:"m3", firstName:"Fatouma",  lastName:"Coulibaly",gender:"F", phone:"+223 70 00 00 03", address:"Ségou",   login:"fatouma_c",     pwdHash:"DEMO", photo:"", createdAt: now - 30*day },
    { id:"m4", firstName:"Ibrahim",  lastName:"Keita",    gender:"M", phone:"+223 70 00 00 04", address:"Mopti",   login:"ibrahim_k",     pwdHash:"DEMO", photo:"", createdAt: now - 25*day },
    { id:"m5", firstName:"Mariam",   lastName:"Sanogo",   gender:"F", phone:"+223 70 00 00 05", address:"Sikasso", login:"mariam_s",      pwdHash:"DEMO", photo:"", createdAt: now - 18*day },
    { id:"m6", firstName:"Sékou",    lastName:"Touré",    gender:"M", phone:"+223 70 00 00 06", address:"Bamako",  login:"sekou_t",       pwdHash:"DEMO", photo:"", createdAt: now - 12*day },
    { id:"m7", firstName:"Kadiatou", lastName:"Bah",      gender:"F", phone:"+223 70 00 00 07", address:"Bamako",  login:"kadiatou_b",    pwdHash:"DEMO", photo:"", createdAt: now -  7*day },
  ];

  const deposits = [];
  let dep = 1;
  const amounts = [1000, 2000, 3000, 5000, 1000, 2000, 4000];
  members.forEach((m, idx) => {
    const count = 6 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const ts     = now - Math.floor(Math.random() * 40) * day - Math.floor(Math.random() * day);
      const amount = amounts[(idx + i) % amounts.length];
      deposits.push({ id:"d"+ dep++, memberId: m.id, amount, days: daysFromAmount(amount), ts });
    }
  });
  deposits.sort((a, b) => b.ts - a.ts);

  const logs = [
    { id:"l1", ts: now - 3_600_000, who:"admin", action:"Connexion administrateur réussie" },
    { id:"l2", ts: now - 5_400_000, who:"admin", action:"Nouveau membre ajouté" },
    { id:"l3", ts: now - 7_200_000, who:"admin", action:"Dépôt validé : 5 000 FCFA" },
  ];

  return {
    members, deposits, admin: null /* sera remplacé par l'admin actuel */, logs,
    settings: { fcfaPerDay: FCFA_PER_DAY, appName: "ÉPARGNE PLUS" },
  };
}

/* ----------  DB access  ---------- */
function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return emptyDB();
  try { return JSON.parse(raw); }
  catch { return emptyDB(); }
}
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

const DB = {
  /* members */
  members() { return loadDB().members.slice().sort((a, b) => b.createdAt - a.createdAt); },
  member(id) { return loadDB().members.find(m => m.id === id) || null; },

  addMember(data) {
    const db = loadDB();
    // Vérification login unique
    if (db.members.some(m => m.login === data.login)) return null;
    const id = "m" + Date.now().toString(36);
    const m  = {
      id,
      photo      : "",
      createdAt  : Date.now(),
      firstName  : sanitize(data.firstName, 80),
      lastName   : sanitize(data.lastName,  80),
      gender     : data.gender === "M" ? "M" : "F",
      phone      : sanitize(data.phone,   30),
      address    : sanitize(data.address, 200),
      login      : sanitizeLogin(data.login),
      pwdHash    : data.pwdHash, // déjà hashé par l'appelant
    };
    db.members.push(m);
    DB._log(db, "admin", `Nouveau membre ajouté : ${m.firstName} ${m.lastName}`);
    saveDB(db);
    return m;
  },

  updateMember(id, data) {
    const db = loadDB();
    const i  = db.members.findIndex(m => m.id === id);
    if (i < 0) return null;
    const patch = {};
    if (data.firstName !== undefined) patch.firstName = sanitize(data.firstName, 80);
    if (data.lastName  !== undefined) patch.lastName  = sanitize(data.lastName,  80);
    if (data.phone     !== undefined) patch.phone     = sanitize(data.phone,  30);
    if (data.address   !== undefined) patch.address   = sanitize(data.address, 200);
    if (data.pwdHash   !== undefined) patch.pwdHash   = data.pwdHash;
    db.members[i] = { ...db.members[i], ...patch };
    DB._log(db, "admin", `Membre modifié : ${db.members[i].firstName} ${db.members[i].lastName}`);
    saveDB(db);
    return db.members[i];
  },

  deleteMember(id) {
    const db = loadDB();
    const m  = db.members.find(x => x.id === id);
    db.members  = db.members.filter(x => x.id !== id);
    db.deposits = db.deposits.filter(d => d.memberId !== id);
    if (m) DB._log(db, "admin", `Membre supprimé : ${m.firstName} ${m.lastName}`);
    saveDB(db);
  },

  /* deposits */
  deposits() { return loadDB().deposits.slice().sort((a, b) => b.ts - a.ts); },
  depositsByMember(id) { return DB.deposits().filter(d => d.memberId === id); },
  addDeposit(memberId, amount) {
    const db = loadDB();
    const amt = Math.max(0, Math.floor(Number(amount) || 0));
    const d   = { id:"d"+ Date.now().toString(36), memberId, amount: amt, days: daysFromAmount(amt), ts: Date.now() };
    db.deposits.push(d);
    const m = db.members.find(x => x.id === memberId);
    DB._log(db, "admin", `Dépôt validé : ${fmtMoney(amt)} pour ${m ? m.firstName + " " + m.lastName : memberId}`);
    saveDB(db);
    return d;
  },

  /* logs */
  logs() { return loadDB().logs.slice().sort((a, b) => b.ts - a.ts); },
  _log(db, who, action) {
    db.logs = db.logs || [];
    db.logs.push({ id:"l"+ Date.now().toString(36) + Math.random().toString(36).slice(2,5), ts: Date.now(), who, action });
    // Limiter à 500 logs pour éviter l'accumulation
    if (db.logs.length > 500) db.logs = db.logs.sort((a,b) => b.ts - a.ts).slice(0, 500);
  },
  log(who, action) { const db = loadDB(); DB._log(db, who, action); saveDB(db); },

  /* admin */
  admin()        { return loadDB().admin; },
  updateAdmin(data) {
    const db = loadDB();
    const patch = {};
    if (data.firstName !== undefined) patch.firstName = sanitize(data.firstName, 80);
    if (data.lastName  !== undefined) patch.lastName  = sanitize(data.lastName,  80);
    if (data.phone     !== undefined) patch.phone     = sanitize(data.phone,  30);
    if (data.address   !== undefined) patch.address   = sanitize(data.address, 200);
    if (data.pwdHash   !== undefined) patch.pwdHash   = data.pwdHash;
    db.admin = { ...db.admin, ...patch };
    saveDB(db);
    return db.admin;
  },

  settings() { return loadDB().settings; },

  reset() {
    const db          = loadDB();
    const currentAdmin = db.admin;
    const seeded      = seedData();
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
  const ds    = DB.depositsByMember(memberId);
  const total = ds.reduce((s, d) => s + d.amount, 0);
  const days  = ds.reduce((s, d) => s + d.days,   0);
  return { total, days, count: ds.length, last: ds[0] || null, deposits: ds };
}
function globalStats() {
  const members    = DB.members();
  const deposits   = DB.deposits();
  const totalSaved = deposits.reduce((s, d) => s + d.amount, 0);
  const totalDays  = deposits.reduce((s, d) => s + d.days,   0);
  const today      = deposits.filter(d => isSameDay(d.ts));
  const todayAmount= today.reduce((s, d) => s + d.amount, 0);
  return { members: members.length, totalSaved, deposits: deposits.length, todayAmount, todayCount: today.length, totalDays, last: deposits[0] || null };
}

/* ----------  Auth sécurisée  ---------- */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 heures

const Auth = {
  /* Login asynchrone avec hash PBKDF2 + rate-limit */
  async login(login, password) {
    const block = RateLimit.check(login);
    if (block) return { error: block };

    const db = loadDB();

    // Vérification admin
    const a = db.admin;
    if (a && login === a.login) {
      const ok = await Crypto.verifyPassword(password, a.pwdHash);
      if (ok) {
        RateLimit.reset(login);
        const token   = Crypto.newSessionToken();
        const session = {
          token,
          role    : "admin",
          id      : a.id,
          name    : `${a.firstName} ${a.lastName}`,
          login   : a.login,
          expires : Date.now() + SESSION_DURATION_MS,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        DB.log("admin", "Connexion administrateur réussie");
        return session;
      }
    }

    // Vérification membre
    const m = db.members.find(x => x.login === login);
    if (m) {
      const ok = await Crypto.verifyPassword(password, m.pwdHash);
      if (ok) {
        RateLimit.reset(login);
        const token   = Crypto.newSessionToken();
        const session = {
          token,
          role    : "user",
          id      : m.id,
          name    : `${m.firstName} ${m.lastName}`,
          login   : m.login,
          expires : Date.now() + SESSION_DURATION_MS,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        DB.log(m.login, `Connexion utilisateur : ${m.firstName} ${m.lastName}`);
        return session;
      }
    }

    // Échec : incrémenter le compteur
    RateLimit.record(login);
    return null;
  },

  session() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!s) return null;
      // Vérification expiration
      if (!s.expires || Date.now() > s.expires) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  },

  logout() {
    const s = Auth.session();
    if (s) DB.log(s.login, "Déconnexion");
    localStorage.removeItem(SESSION_KEY);
  },

  require(role) {
    const s = Auth.session();
    if (!s) { location.href = "index.html"; return null; }
    if (role && s.role !== role) { location.href = s.role === "admin" ? "admin.html" : "user.html"; return null; }
    return s;
  },
};
