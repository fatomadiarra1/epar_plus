/* =====================================================================
   ÉPARGNE PLUS — Data layer Supabase
   Projet : fatomadiarra | Région : eu-central-1
   ===================================================================== */

const SUPABASE_URL = "https://acwklgzqqmnuqbhjnhij.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjd2tsZ3pxcW1udXFiaGpuaGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNjMzMzEsImV4cCI6MjEwMTczOTMzMX0.HM1bne7mZalgXwNOoRee7ZRnmI8fbib4UWCakk1k8OY";

const THEME_KEY           = "epp_theme";
const SESSION_KEY         = "epp_session_v2";
const RL_KEY              = "epp_rl";
const FCFA_PER_DAY        = 1000;
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

const daysFromAmount = (amount) => Math.floor((Number(amount) || 0) / FCFA_PER_DAY);

/* -----------------------------------------------------------------------
   Politique de mot de passe
   ----------------------------------------------------------------------- */
const PWD_POLICY = {
  minLength: 8,
  test(pwd) {
    if (!pwd || pwd.length < this.minLength) return "Minimum 8 caractères requis.";
    if (!/[A-Z]/.test(pwd))                  return "Au moins une lettre majuscule requise.";
    if (!/[0-9]/.test(pwd))                  return "Au moins un chiffre requis.";
    if (!/[^A-Za-z0-9]/.test(pwd))           return "Au moins un caractère spécial requis (! @ # $ …).";
    return null;
  },
};

/* -----------------------------------------------------------------------
   Sanitisation des entrées
   ----------------------------------------------------------------------- */
function sanitize(val, maxLen = 200) {
  return String(val ?? "").trim().slice(0, maxLen);
}
function sanitizeLogin(val) {
  return sanitize(val, 50).replace(/[^a-zA-Z0-9_\-]/g, "");
}

/* -----------------------------------------------------------------------
   Crypto PBKDF2 (Web Crypto API)
   ----------------------------------------------------------------------- */
const Crypto = {
  randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); },
  toHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join(""); },
  fromHex(hex) { const a = new Uint8Array(hex.length/2); for (let i=0;i<a.length;i++) a[i]=parseInt(hex.slice(i*2,i*2+2),16); return a; },

  async hashPassword(password) {
    const salt = this.randomBytes(16);
    const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:200_000, hash:"SHA-256" }, key, 256);
    return this.toHex(salt) + ":" + this.toHex(bits);
  },

  async verifyPassword(password, stored) {
    try {
      const [saltHex, hashHex] = stored.split(":");
      const salt = this.fromHex(saltHex);
      const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:200_000, hash:"SHA-256" }, key, 256);
      const a = new Uint8Array(bits), b = this.fromHex(hashHex);
      if (a.length !== b.length) return false;
      let diff = 0; for (let i=0;i<a.length;i++) diff |= a[i]^b[i];
      return diff === 0;
    } catch { return false; }
  },

  newSessionToken() { return this.toHex(this.randomBytes(32)); },
};

/* -----------------------------------------------------------------------
   Rate-limiter (côté client, localStorage)
   ----------------------------------------------------------------------- */
const RateLimit = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 15 * 60 * 1000,
  _load() { try { return JSON.parse(localStorage.getItem(RL_KEY)) || {}; } catch { return {}; } },
  _save(d) { localStorage.setItem(RL_KEY, JSON.stringify(d)); },
  check(login) {
    const d=this._load(), key="l_"+login.toLowerCase(), rec=d[key]||{count:0,first:0}, now=Date.now();
    if (now-rec.first > this.WINDOW_MS) { rec.count=0; rec.first=now; }
    if (rec.count >= this.MAX_ATTEMPTS) return `Trop de tentatives. Réessayez dans ${Math.ceil((this.WINDOW_MS-(now-rec.first))/60000)} min.`;
    return null;
  },
  record(login) {
    const d=this._load(), key="l_"+login.toLowerCase(), now=Date.now();
    const rec=d[key]||{count:0,first:now};
    if (now-rec.first > this.WINDOW_MS) { rec.count=0; rec.first=now; }
    rec.count++; d[key]=rec; this._save(d);
  },
  reset(login) { const d=this._load(); delete d["l_"+login.toLowerCase()]; this._save(d); },
};

/* -----------------------------------------------------------------------
   Client Supabase léger (REST + fetch, sans SDK)
   ----------------------------------------------------------------------- */
const SB = {
  headers() {
    return {
      "Content-Type" : "application/json",
      "apikey"       : SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Prefer"       : "return=representation",
    };
  },
  async get(table, params="") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:this.headers() });
    if (!r.ok) throw new Error(`GET ${table} → ${r.status}`);
    return r.json();
  },
  async post(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:"POST", headers:this.headers(), body:JSON.stringify(body) });
    if (!r.ok) { const e=await r.json().catch(()=>{}); throw new Error(e?.message || `POST ${table} → ${r.status}`); }
    return r.json();
  },
  async patch(table, filter, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method:"PATCH", headers:this.headers(), body:JSON.stringify(body) });
    if (!r.ok) throw new Error(`PATCH ${table} → ${r.status}`);
    return r.json();
  },
  async delete(table, filter) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method:"DELETE", headers:this.headers() });
    if (!r.ok) throw new Error(`DELETE ${table} → ${r.status}`);
    return true;
  },
};

/* -----------------------------------------------------------------------
   Premier lancement
   ----------------------------------------------------------------------- */
async function isFirstLaunch() {
  try {
    const rows = await SB.get("admin", "select=id&limit=1");
    return !rows || rows.length === 0;
  } catch { return true; }
}

async function initializeDB(adminData) {
  await SB.post("admin", {
    id: "admin",
    login      : adminData.login,
    pwd_hash   : adminData.pwdHash,
    first_name : adminData.firstName,
    last_name  : adminData.lastName,
    phone      : adminData.phone   || "",
    address    : adminData.address || "",
    photo      : "",
    created_at : Date.now(),
  });
  await _log("admin", "Initialisation du système — compte administrateur créé");
}

/* -----------------------------------------------------------------------
   Log interne
   ----------------------------------------------------------------------- */
async function _log(who, action) {
  try {
    await SB.post("logs", {
      id    : "l" + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      ts    : Date.now(),
      who   : sanitize(who, 50),
      action: sanitize(action, 300),
    });
  } catch { /* non bloquant */ }
}

/* -----------------------------------------------------------------------
   fmtMoney (nécessaire avant utils.js)
   ----------------------------------------------------------------------- */
function fmtMoney(n) { return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n)||0)) + " FCFA"; }

/* -----------------------------------------------------------------------
   DB — couche d'accès données (toutes async)
   ----------------------------------------------------------------------- */
const DB = {

  /* Admin */
  async admin() {
    const rows = await SB.get("admin", "select=*&limit=1");
    if (!rows || !rows[0]) return null;
    const a = rows[0];
    return { id:a.id, login:a.login, pwdHash:a.pwd_hash, firstName:a.first_name, lastName:a.last_name, phone:a.phone, address:a.address, photo:a.photo, role:"admin" };
  },
  async updateAdmin(data) {
    const p = {};
    if (data.firstName !== undefined) p.first_name = sanitize(data.firstName, 80);
    if (data.lastName  !== undefined) p.last_name  = sanitize(data.lastName, 80);
    if (data.phone     !== undefined) p.phone      = sanitize(data.phone, 30);
    if (data.address   !== undefined) p.address    = sanitize(data.address, 200);
    if (data.pwdHash   !== undefined) p.pwd_hash   = data.pwdHash;
    await SB.patch("admin", "id=eq.admin", p);
  },

  /* Members */
  async members() {
    const rows = await SB.get("members", "select=*&order=created_at.desc");
    return rows.map(m => ({ id:m.id, firstName:m.first_name, lastName:m.last_name, gender:m.gender, phone:m.phone, address:m.address, login:m.login, pwdHash:m.pwd_hash, photo:m.photo, createdAt:m.created_at }));
  },
  async member(id) {
    const rows = await SB.get("members", `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    if (!rows || !rows[0]) return null;
    const m = rows[0];
    return { id:m.id, firstName:m.first_name, lastName:m.last_name, gender:m.gender, phone:m.phone, address:m.address, login:m.login, pwdHash:m.pwd_hash, photo:m.photo, createdAt:m.created_at };
  },
  async addMember(data) {
    const id = "m" + Date.now().toString(36);
    await SB.post("members", {
      id,
      first_name : sanitize(data.firstName, 80),
      last_name  : sanitize(data.lastName, 80),
      gender     : data.gender === "M" ? "M" : "F",
      phone      : sanitize(data.phone, 30),
      address    : sanitize(data.address, 200),
      login      : sanitizeLogin(data.login),
      pwd_hash   : data.pwdHash,
      photo      : "",
      created_at : Date.now(),
    });
    await _log("admin", `Nouveau membre ajouté : ${data.firstName} ${data.lastName}`);
    return { id, ...data };
  },
  async updateMember(id, data) {
    const p = {};
    if (data.firstName !== undefined) p.first_name = sanitize(data.firstName, 80);
    if (data.lastName  !== undefined) p.last_name  = sanitize(data.lastName, 80);
    if (data.phone     !== undefined) p.phone      = sanitize(data.phone, 30);
    if (data.address   !== undefined) p.address    = sanitize(data.address, 200);
    if (data.pwdHash   !== undefined) p.pwd_hash   = data.pwdHash;
    await SB.patch("members", `id=eq.${encodeURIComponent(id)}`, p);
  },
  async deleteMember(id) {
    const m = await DB.member(id);
    await SB.delete("deposits", `member_id=eq.${encodeURIComponent(id)}`);
    await SB.delete("members",  `id=eq.${encodeURIComponent(id)}`);
    if (m) await _log("admin", `Membre supprimé : ${m.firstName} ${m.lastName}`);
  },

  /* Deposits */
  async deposits() {
    const rows = await SB.get("deposits", "select=*&order=ts.desc");
    return rows.map(d => ({ id:d.id, memberId:d.member_id, amount:d.amount, days:d.days, ts:d.ts }));
  },
  async depositsByMember(memberId) {
    const rows = await SB.get("deposits", `select=*&member_id=eq.${encodeURIComponent(memberId)}&order=ts.desc`);
    return rows.map(d => ({ id:d.id, memberId:d.member_id, amount:d.amount, days:d.days, ts:d.ts }));
  },
  async addDeposit(memberId, amount) {
    const amt = Math.max(0, Math.floor(Number(amount)||0));
    const d = { id:"d"+Date.now().toString(36), member_id:memberId, amount:amt, days:daysFromAmount(amt), ts:Date.now() };
    await SB.post("deposits", d);
    await _log("admin", `Dépôt validé : ${fmtMoney(amt)}`);
    return { id:d.id, memberId, amount:amt, days:d.days, ts:d.ts };
  },

  /* Logs */
  async logs() {
    const rows = await SB.get("logs", "select=*&order=ts.desc&limit=200");
    return rows;
  },
  async log(who, action) { await _log(who, action); },

  /* Settings */
  async settings() {
    const rows = await SB.get("settings", "select=*");
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    return { fcfaPerDay:Number(s.fcfa_per_day||1000), appName:s.app_name||"ÉPARGNE PLUS" };
  },

  /* Reset to demo */
  async reset() {
    const now = Date.now(), day = 86_400_000;
    const seeds = [
      { firstName:"Awa",      lastName:"Traoré",    gender:"F", phone:"+223 70 00 00 01", address:"Bamako",  login:"awa_traore"    },
      { firstName:"Moussa",   lastName:"Diallo",    gender:"M", phone:"+223 70 00 00 02", address:"Bamako",  login:"moussa_diallo" },
      { firstName:"Fatouma",  lastName:"Coulibaly", gender:"F", phone:"+223 70 00 00 03", address:"Ségou",   login:"fatouma_c"     },
      { firstName:"Ibrahim",  lastName:"Keita",     gender:"M", phone:"+223 70 00 00 04", address:"Mopti",   login:"ibrahim_k"     },
      { firstName:"Mariam",   lastName:"Sanogo",    gender:"F", phone:"+223 70 00 00 05", address:"Sikasso", login:"mariam_s"      },
      { firstName:"Sékou",    lastName:"Touré",     gender:"M", phone:"+223 70 00 00 06", address:"Bamako",  login:"sekou_t"       },
      { firstName:"Kadiatou", lastName:"Bah",       gender:"F", phone:"+223 70 00 00 07", address:"Bamako",  login:"kadiatou_b"    },
    ];
    const existing = await DB.members();
    for (const m of existing) await DB.deleteMember(m.id);
    const demoPwd = await Crypto.hashPassword("Demo@2026!");
    const amounts = [1000,2000,3000,5000,1000,2000,4000];
    for (let idx=0; idx<seeds.length; idx++) {
      const s=seeds[idx], id="m"+(idx+1);
      await SB.post("members", { id, first_name:s.firstName, last_name:s.lastName, gender:s.gender, phone:s.phone, address:s.address, login:s.login, pwd_hash:demoPwd, photo:"", created_at:now-(42-idx*6)*day });
      const count = 6+Math.floor(Math.random()*8);
      for (let i=0;i<count;i++) {
        const ts=now-Math.floor(Math.random()*40)*day-Math.floor(Math.random()*day);
        const amt=amounts[(idx+i)%amounts.length];
        await SB.post("deposits",{ id:"d"+(idx*100+i), member_id:id, amount:amt, days:daysFromAmount(amt), ts });
      }
    }
    await _log("admin","Données de démonstration chargées");
  },
};

/* -----------------------------------------------------------------------
   Stats helpers (async)
   ----------------------------------------------------------------------- */
async function memberTotals(memberId) {
  const ds    = await DB.depositsByMember(memberId);
  const total = ds.reduce((s,d)=>s+d.amount, 0);
  const days  = ds.reduce((s,d)=>s+d.days,   0);
  return { total, days, count:ds.length, last:ds[0]||null, deposits:ds };
}

async function globalStats() {
  const [members, deposits] = await Promise.all([DB.members(), DB.deposits()]);
  const totalSaved = deposits.reduce((s,d)=>s+d.amount, 0);
  const totalDays  = deposits.reduce((s,d)=>s+d.days,   0);
  const now = new Date();
  const todayDeps  = deposits.filter(d => { const a=new Date(d.ts); return a.getFullYear()===now.getFullYear()&&a.getMonth()===now.getMonth()&&a.getDate()===now.getDate(); });
  return { members:members.length, totalSaved, deposits:deposits.length, todayAmount:todayDeps.reduce((s,d)=>s+d.amount,0), todayCount:todayDeps.length, totalDays, last:deposits[0]||null };
}

function isSameDay(ts) {
  const a=new Date(ts), b=new Date();
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
}

/* -----------------------------------------------------------------------
   Auth sécurisée (async, PBKDF2 + Supabase)
   ----------------------------------------------------------------------- */
const Auth = {
  async login(login, password) {
    const block = RateLimit.check(login);
    if (block) return { error: block };
    try {
      // Admin
      const admRows = await SB.get("admin", `select=*&login=eq.${encodeURIComponent(login)}&limit=1`);
      if (admRows && admRows[0]) {
        const ok = await Crypto.verifyPassword(password, admRows[0].pwd_hash);
        if (ok) {
          RateLimit.reset(login);
          const a = admRows[0];
          const session = { token:Crypto.newSessionToken(), role:"admin", id:a.id, name:`${a.first_name} ${a.last_name}`, login:a.login, expires:Date.now()+SESSION_DURATION_MS };
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          await _log("admin","Connexion administrateur réussie");
          return session;
        }
      }
      // Membre
      const memRows = await SB.get("members", `select=*&login=eq.${encodeURIComponent(login)}&limit=1`);
      if (memRows && memRows[0]) {
        const ok = await Crypto.verifyPassword(password, memRows[0].pwd_hash);
        if (ok) {
          RateLimit.reset(login);
          const m = memRows[0];
          const session = { token:Crypto.newSessionToken(), role:"user", id:m.id, name:`${m.first_name} ${m.last_name}`, login:m.login, expires:Date.now()+SESSION_DURATION_MS };
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          await _log(m.login,`Connexion utilisateur : ${m.first_name} ${m.last_name}`);
          return session;
        }
      }
    } catch (err) {
      console.error("Auth.login:", err);
      return { error:"Erreur de connexion au serveur. Vérifiez votre connexion internet." };
    }
    RateLimit.record(login);
    return null;
  },

  session() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!s) return null;
      if (!s.expires || Date.now() > s.expires) { localStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch { return null; }
  },

  logout() {
    const s = Auth.session();
    if (s) _log(s.login,"Déconnexion");
    localStorage.removeItem(SESSION_KEY);
  },

  require(role) {
    const s = Auth.session();
    if (!s) { location.href="index.html"; return null; }
    if (role && s.role!==role) { location.href=s.role==="admin"?"admin.html":"user.html"; return null; }
    return s;
  },
};
