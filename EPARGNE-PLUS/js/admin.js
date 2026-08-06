/* =====================================================================
   ÉPARGNE PLUS — Admin dashboard controller
   ===================================================================== */
(function () {
  const session = Auth.require("admin");
  if (!session) return;

  /* ----- Shell setup ----- */
  document.getElementById("themeSlot").appendChild(buildThemeToggle());
  initSidebar();

  const admin = DB.admin();
  document.getElementById("sideName").textContent = `${admin.firstName} ${admin.lastName}`;
  document.getElementById("sideAvatar").textContent = initials(admin.firstName, admin.lastName);

  document.getElementById("logoutBtn").addEventListener("click", (e) => {
    e.preventDefault();
    modal({ title: "Déconnexion", body: "Voulez-vous vraiment vous déconnecter ?", confirmText: "Se déconnecter", danger: true, onConfirm: () => { Auth.logout(); location.href = "index.html"; } });
  });

  /* Move route sections into the content view */
  const view = document.getElementById("view");
  document.querySelectorAll("body > .route").forEach(r => view.appendChild(r));

  const PAGE_META = {
    dashboard: ["Tableau de bord", "Vue d'ensemble de l'épargne"],
    members: ["Gestion des Membres", "Ajouter, modifier et suivre les membres"],
    deposits: ["Gestion des Dépôts", "Enregistrer les versements quotidiens"],
    history: ["Historique", "Tous les versements enregistrés"],
    reports: ["Rapports", "Synthèses journalières, mensuelles, annuelles"],
    stats: ["Statistiques", "Analyse graphique de l'activité"],
    settings: ["Paramètres", "Profil, sécurité et configuration"],
  };

  /* ----- Router ----- */
  function go(route) {
    if (!PAGE_META[route]) route = "dashboard";
    document.querySelectorAll(".route").forEach(s => s.hidden = (s.id !== "route-" + route));
    document.querySelectorAll("#nav a[data-route]").forEach(a => a.classList.toggle("active", a.dataset.route === route));
    const [t, s] = PAGE_META[route];
    document.getElementById("pageTitle").childNodes[0].nodeValue = t;
    document.getElementById("pageSub").textContent = s;
    window.scrollTo({ top: 0, behavior: "smooth" });
    RENDER[route] && RENDER[route]();
  }
  window.addEventListener("hashchange", () => go(location.hash.replace("#", "")));

  /* Global search -> jump to members filtered */
  document.getElementById("globalSearch").addEventListener("input", debounce((e) => {
    const v = e.target.value.trim();
    if (v) { location.hash = "members"; const ms = document.getElementById("memberSearch"); ms.value = v; ms.dispatchEvent(new Event("input")); }
  }, 300));

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function renderDashboard() {
    const s = globalStats();
    const grid = document.getElementById("statGrid");
    const cards = [
      { ico: "b1", icon: "👥", label: "Membres", value: s.members, money: false },
      { ico: "b2", icon: "💰", label: "Montant total épargné", value: s.totalSaved, money: true },
      { ico: "b3", icon: "📥", label: "Nombre total de dépôts", value: s.deposits, money: false },
      { ico: "b4", icon: "📅", label: "Versements du jour", value: s.todayAmount, money: true, sub: `${s.todayCount} dépôt(s)` },
      { ico: "b5", icon: "🗓️", label: "Total jours payés", value: s.totalDays, money: false, suffix: " j" },
      { ico: "b6", icon: "🕒", label: "Dernier dépôt", custom: s.last ? `${fmtMoney(s.last.amount)}` : "—", subCustom: s.last ? relativeDate(s.last.ts) : "Aucun" },
    ];
    grid.innerHTML = cards.map(c => `
      <div class="stat-card glass">
        <span class="glow"></span>
        <div class="ico ${c.ico}">${c.icon}</div>
        <div class="label">${c.label}</div>
        ${c.custom !== undefined
          ? `<div class="value">${c.custom}</div><div class="trend text-muted">${c.subCustom}</div>`
          : `<div class="value" data-count="${c.value}" data-money="${c.money ? 1 : 0}" data-suffix="${c.suffix || ""}">0</div>${c.sub ? `<div class="trend text-success">${c.sub}</div>` : ""}`}
      </div>`).join("");
    initCounters(grid);

    Charts.evolution("chartEvolution", 30);

    /* top savers */
    const top = DB.members().map(m => ({ m, t: memberTotals(m.id) })).sort((a, b) => b.t.total - a.t.total).slice(0, 5);
    document.getElementById("topSavers").innerHTML = top.map((x, i) => `
      <div class="flex" style="align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
        <b style="width:20px;color:var(--text-muted)">${i + 1}</b>
        ${avatarHTML(x.m)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${escapeHtml(x.m.firstName)} ${escapeHtml(x.m.lastName)}</div>
          <small class="text-muted">${x.t.days} jours</small>
        </div>
        <b class="text-blue">${fmtMoney(x.t.total)}</b>
      </div>`).join("") || `<div class="empty">Aucun membre</div>`;

    /* recent deposits */
    const recent = DB.deposits().slice(0, 6);
    document.getElementById("recentDeposits").innerHTML = `
      <thead><tr><th>Membre</th><th>Montant</th><th>Jours</th><th>Quand</th></tr></thead>
      <tbody>${recent.map(d => { const m = DB.member(d.memberId); return `
        <tr><td class="avatar-cell">${avatarHTML(m)} <span>${m ? escapeHtml(m.firstName + " " + m.lastName) : "—"}</span></td>
        <td><b>${fmtMoney(d.amount)}</b></td><td><span class="badge badge-blue">${d.days} j</span></td>
        <td class="text-muted">${relativeDate(d.ts)}</td></tr>`; }).join("")}</tbody>`;

    /* activity log */
    document.getElementById("activityLog").innerHTML = DB.logs().slice(0, 7).map(l => `
      <div class="flex" style="gap:12px;padding:10px 0;border-bottom:1px solid var(--line)">
        <span class="badge badge-gold">${escapeHtml(l.who)}</span>
        <div style="flex:1"><div style="font-size:.9rem">${escapeHtml(l.action)}</div><small class="text-muted">${relativeDate(l.ts)}</small></div>
      </div>`).join("") || `<div class="empty">Aucune activité</div>`;
  }

  /* ============================================================
     MEMBERS
     ============================================================ */
  let membersState = { page: 1, perPage: 6, search: "" };
  const memberForm = document.getElementById("memberForm");

  function fillMemberForm(m) {
    document.getElementById("memberId").value = m ? m.id : "";
    document.getElementById("f_lastName").value = m ? m.lastName : "";
    document.getElementById("f_firstName").value = m ? m.firstName : "";
    document.getElementById("f_gender").value = m ? m.gender : "F";
    document.getElementById("f_phone").value = m ? m.phone : "";
    document.getElementById("f_address").value = m ? m.address : "";
    document.getElementById("f_login").value = m ? m.login : "";
    document.getElementById("f_password").value = m ? m.password : "";
    document.getElementById("memberFormTitle").textContent = m ? "Modifier le membre" : "Ajouter un membre";
    document.getElementById("memberSubmit").innerHTML = m ? "💾 Enregistrer" : "＋ Ajouter";
  }

  memberForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      lastName: document.getElementById("f_lastName").value.trim(),
      firstName: document.getElementById("f_firstName").value.trim(),
      gender: document.getElementById("f_gender").value,
      phone: document.getElementById("f_phone").value.trim(),
      address: document.getElementById("f_address").value.trim(),
      login: document.getElementById("f_login").value.trim(),
      password: document.getElementById("f_password").value.trim(),
    };
    if (!data.lastName || !data.firstName || !data.login || !data.password) { toast("Champs obligatoires manquants", "warn"); return; }
    const id = document.getElementById("memberId").value;
    const dupe = DB.members().find(m => m.login === data.login && m.id !== id);
    if (dupe) { toast("Ce login est déjà utilisé", "error"); return; }
    if (id) { DB.updateMember(id, data); toast("Membre modifié", "success"); }
    else { DB.addMember(data); toast("Membre ajouté", "success"); }
    fillMemberForm(null); renderMembers();
  });
  document.getElementById("memberReset").addEventListener("click", () => fillMemberForm(null));
  document.getElementById("memberSearch").addEventListener("input", debounce((e) => { membersState.search = e.target.value.toLowerCase().trim(); membersState.page = 1; renderMembers(); }, 180));

  function renderMembers() {
    let list = DB.members();
    if (membersState.search) {
      const q = membersState.search;
      list = list.filter(m => `${m.firstName} ${m.lastName} ${m.phone} ${m.login}`.toLowerCase().includes(q));
    }
    const total = list.length, pages = Math.max(1, Math.ceil(total / membersState.perPage));
    if (membersState.page > pages) membersState.page = pages;
    const start = (membersState.page - 1) * membersState.perPage;
    const pageItems = list.slice(start, start + membersState.perPage);

    document.getElementById("membersTable").innerHTML = `
      <thead><tr><th>Membre</th><th>Téléphone</th><th>Inscription</th><th>Épargne</th><th>Actions</th></tr></thead>
      <tbody>${pageItems.map(m => { const t = memberTotals(m.id); return `
        <tr>
          <td class="avatar-cell">${avatarHTML(m)}<div><div style="font-weight:600">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</div><small class="text-muted">${escapeHtml(m.login)} · ${m.gender === "F" ? "♀" : "♂"}</small></div></td>
          <td>${escapeHtml(m.phone || "—")}</td>
          <td class="text-muted">${fmtDate(m.createdAt)}</td>
          <td><b class="text-blue">${fmtMoney(t.total)}</b><br><small class="text-muted">${t.days} j</small></td>
          <td><div class="row-actions">
            <button class="icon-btn" title="Modifier" data-edit="${m.id}">✏️</button>
            <button class="icon-btn" title="Supprimer" data-del="${m.id}">🗑️</button>
          </div></td>
        </tr>`; }).join("") || `<tr><td colspan="5"><div class="empty"><div class="big">🔍</div>Aucun membre trouvé</div></td></tr>`}</tbody>`;

    renderPagination("membersPagination", membersState.page, pages, total, (p) => { membersState.page = p; renderMembers(); });

    document.querySelectorAll("#membersTable [data-edit]").forEach(b => b.addEventListener("click", () => { fillMemberForm(DB.member(b.dataset.edit)); window.scrollTo({ top: 0, behavior: "smooth" }); }));
    document.querySelectorAll("#membersTable [data-del]").forEach(b => b.addEventListener("click", () => {
      const m = DB.member(b.dataset.del);
      modal({ title: "Supprimer le membre", body: `Supprimer <b>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</b> et tous ses dépôts ? Cette action est irréversible.`, confirmText: "Supprimer", danger: true, onConfirm: () => { DB.deleteMember(m.id); toast("Membre supprimé", "success"); renderMembers(); } });
    }));
  }

  /* ============================================================
     DEPOSITS
     ============================================================ */
  let depositsState = { page: 1, perPage: 8 };
  function populateMemberSelect(sel, includeAll) {
    const members = DB.members();
    sel.innerHTML = (includeAll ? `<option value="all">Tous les membres</option>` : `<option value="" disabled selected>— Choisir un membre —</option>`)
      + members.map(m => `<option value="${m.id}">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)} (${escapeHtml(m.login)})</option>`).join("");
  }
  const dAmount = document.getElementById("d_amount");
  const dDays = document.getElementById("d_days");
  function updateCalc() {
    const days = Math.floor((Number(dAmount.value) || 0) / 1000);
    dDays.innerHTML = `${fmtNumber(days)} <small>jour(s)</small>`;
    const now = Date.now();
    document.getElementById("d_date").textContent = fmtDate(now);
    document.getElementById("d_time").textContent = fmtTime(now);
  }
  dAmount.addEventListener("input", updateCalc);

  document.getElementById("depositForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const memberId = document.getElementById("d_member").value;
    const amount = Number(dAmount.value);
    if (!memberId) { toast("Sélectionnez un membre", "warn"); return; }
    if (!amount || amount <= 0) { toast("Montant invalide", "warn"); return; }
    if (amount % 1000 !== 0) toast("Note : seuls les multiples de 1000 comptent comme jours entiers", "warn");
    DB.addDeposit(memberId, amount);
    toast(`Dépôt de ${fmtMoney(amount)} validé`, "success");
    dAmount.value = ""; updateCalc();
    renderDeposits();
  });

  function renderDeposits() {
    populateMemberSelect(document.getElementById("d_member"), false);
    updateCalc();
    const list = DB.deposits();
    const total = list.length, pages = Math.max(1, Math.ceil(total / depositsState.perPage));
    if (depositsState.page > pages) depositsState.page = pages;
    const start = (depositsState.page - 1) * depositsState.perPage;
    const items = list.slice(start, start + depositsState.perPage);
    document.getElementById("depositsTable").innerHTML = `
      <thead><tr><th>Date</th><th>Heure</th><th>Membre</th><th>Montant</th><th>Jours</th></tr></thead>
      <tbody>${items.map(d => { const m = DB.member(d.memberId); return `
        <tr><td>${fmtDate(d.ts)}</td><td class="text-muted">${fmtTime(d.ts)}</td>
        <td>${m ? escapeHtml(m.firstName + " " + m.lastName) : "—"}</td>
        <td><b>${fmtMoney(d.amount)}</b></td><td><span class="badge badge-blue">${d.days} j</span></td></tr>`; }).join("") || `<tr><td colspan="5"><div class="empty">Aucun dépôt</div></td></tr>`}</tbody>`;
    renderPagination("depositsPagination", depositsState.page, pages, total, (p) => { depositsState.page = p; renderDeposits(); });
  }

  /* ============================================================
     HISTORY
     ============================================================ */
  let histState = { page: 1, perPage: 12, search: "", period: "all", member: "all", sortKey: "ts", sortDir: -1 };
  function historyFiltered() {
    let list = DB.deposits();
    const now = Date.now(), day = 86400000;
    if (histState.period === "today") list = list.filter(d => isSameDay(d.ts));
    else if (histState.period === "week") list = list.filter(d => d.ts >= now - 7 * day);
    else if (histState.period === "month") list = list.filter(d => d.ts >= now - 30 * day);
    if (histState.member !== "all") list = list.filter(d => d.memberId === histState.member);
    if (histState.search) {
      const q = histState.search;
      list = list.filter(d => { const m = DB.member(d.memberId); return `${m ? m.firstName + " " + m.lastName : ""} ${d.amount} ${d.days}`.toLowerCase().includes(q); });
    }
    const k = histState.sortKey;
    list.sort((a, b) => {
      let av, bv;
      if (k === "name") { av = (DB.member(a.memberId)?.firstName || ""); bv = (DB.member(b.memberId)?.firstName || ""); return av.localeCompare(bv) * histState.sortDir; }
      av = a[k]; bv = b[k]; return (av - bv) * histState.sortDir;
    });
    return list;
  }
  function historyRows(list) {
    return list.map(d => { const m = DB.member(d.memberId); return [fmtDate(d.ts), fmtTime(d.ts), m ? `${m.firstName} ${m.lastName}` : "—", fmtMoney(d.amount), `${d.days}`]; });
  }
  function renderHistory() {
    populateMemberSelect(document.getElementById("histMember"), true);
    document.getElementById("histMember").value = histState.member;
    const list = historyFiltered();
    const total = list.length, pages = Math.max(1, Math.ceil(total / histState.perPage));
    if (histState.page > pages) histState.page = pages;
    const start = (histState.page - 1) * histState.perPage;
    const items = list.slice(start, start + histState.perPage);
    const arrow = (k) => histState.sortKey === k ? (histState.sortDir === 1 ? " ▲" : " ▼") : "";
    document.getElementById("historyTable").innerHTML = `
      <thead><tr>
        <th class="sortable" data-sort="ts">Date${arrow("ts")}</th>
        <th>Heure</th>
        <th class="sortable" data-sort="name">Nom${arrow("name")}</th>
        <th class="sortable" data-sort="amount">Montant${arrow("amount")}</th>
        <th class="sortable" data-sort="days">Jours${arrow("days")}</th>
      </tr></thead>
      <tbody>${items.map(d => { const m = DB.member(d.memberId); return `
        <tr><td>${fmtDate(d.ts)}</td><td class="text-muted">${fmtTime(d.ts)}</td>
        <td class="avatar-cell">${avatarHTML(m)} <span>${m ? escapeHtml(m.firstName + " " + m.lastName) : "—"}</span></td>
        <td><b>${fmtMoney(d.amount)}</b></td><td><span class="badge badge-blue">${d.days} j</span></td></tr>`; }).join("") || `<tr><td colspan="5"><div class="empty"><div class="big">📋</div>Aucun résultat</div></td></tr>`}</tbody>`;
    renderPagination("historyPagination", histState.page, pages, total, (p) => { histState.page = p; renderHistory(); });
    document.querySelectorAll("#historyTable th.sortable").forEach(th => th.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (histState.sortKey === k) histState.sortDir *= -1; else { histState.sortKey = k; histState.sortDir = -1; }
      renderHistory();
    }));
  }
  document.getElementById("histSearch").addEventListener("input", debounce((e) => { histState.search = e.target.value.toLowerCase().trim(); histState.page = 1; renderHistory(); }, 180));
  document.getElementById("histPeriod").addEventListener("change", (e) => { histState.period = e.target.value; histState.page = 1; renderHistory(); });
  document.getElementById("histMember").addEventListener("change", (e) => { histState.member = e.target.value; histState.page = 1; renderHistory(); });
  document.getElementById("histExportPdf").addEventListener("click", () => exportPDF("Historique des versements", ["Date", "Heure", "Nom", "Montant", "Jours"], historyRows(historyFiltered())));
  document.getElementById("histExportXls").addEventListener("click", () => exportExcel("historique_epargne", ["Date", "Heure", "Nom", "Montant", "Jours"], historyRows(historyFiltered())));

  /* ============================================================
     REPORTS
     ============================================================ */
  function reportRange(type) {
    const now = new Date(); const start = new Date(now);
    if (type === "daily") start.setHours(0, 0, 0, 0);
    else if (type === "weekly") start.setDate(now.getDate() - 6), start.setHours(0, 0, 0, 0);
    else if (type === "monthly") start.setDate(now.getDate() - 29), start.setHours(0, 0, 0, 0);
    else if (type === "annual") start.setFullYear(now.getFullYear() - 1), start.setHours(0, 0, 0, 0);
    return DB.deposits().filter(d => d.ts >= start.getTime());
  }
  function renderReports() {
    /* summary cards (period totals) */
    const make = (type) => { const l = reportRange(type); return { count: l.length, total: l.reduce((s, d) => s + d.amount, 0), days: l.reduce((s, d) => s + d.days, 0) }; };
    const defs = [
      { t: "Journalier", ico: "b1", icon: "📅", k: "daily" },
      { t: "Hebdomadaire", ico: "b2", icon: "🗓️", k: "weekly" },
      { t: "Mensuel", ico: "b3", icon: "📆", k: "monthly" },
      { t: "Annuel", ico: "b4", icon: "📈", k: "annual" },
    ];
    document.getElementById("reportCards").innerHTML = defs.map(d => { const r = make(d.k); return `
      <div class="stat-card glass"><span class="glow"></span><div class="ico ${d.ico}">${d.icon}</div>
      <div class="label">Rapport ${d.t}</div>
      <div class="value" data-count="${r.total}" data-money="1">0</div>
      <div class="trend text-muted">${r.count} dépôt(s) · ${r.days} jours</div></div>`; }).join("");
    initCounters(document.getElementById("reportCards"));
    buildReportTable();
  }
  function buildReportTable() {
    const type = document.getElementById("reportType").value;
    const list = reportRange(type).sort((a, b) => b.ts - a.ts);
    const total = list.reduce((s, d) => s + d.amount, 0), days = list.reduce((s, d) => s + d.days, 0);
    const labels = { daily: "Journalier (aujourd'hui)", weekly: "Hebdomadaire (7 j)", monthly: "Mensuel (30 j)", annual: "Annuel (12 mois)" };
    document.getElementById("reportSummary").innerHTML = `
      <div class="info-list">
        <div class="info-item"><small>Période</small><b>${labels[type]}</b></div>
        <div class="info-item"><small>Nombre de dépôts</small><b>${list.length}</b></div>
        <div class="info-item"><small>Total épargné</small><b class="text-blue">${fmtMoney(total)}</b></div>
        <div class="info-item"><small>Total jours</small><b>${days} j</b></div>
      </div>`;
    document.getElementById("reportTable").innerHTML = `
      <thead><tr><th>Date</th><th>Heure</th><th>Membre</th><th>Montant</th><th>Jours</th></tr></thead>
      <tbody>${list.map(d => { const m = DB.member(d.memberId); return `<tr><td>${fmtDate(d.ts)}</td><td class="text-muted">${fmtTime(d.ts)}</td><td>${m ? escapeHtml(m.firstName + " " + m.lastName) : "—"}</td><td><b>${fmtMoney(d.amount)}</b></td><td>${d.days} j</td></tr>`; }).join("") || `<tr><td colspan="5"><div class="empty">Aucun dépôt sur cette période</div></td></tr>`}</tbody>`;
  }
  document.getElementById("reportType").addEventListener("change", buildReportTable);
  function reportExportRows() { const type = document.getElementById("reportType").value; return reportRange(type).sort((a, b) => b.ts - a.ts).map(d => { const m = DB.member(d.memberId); return [fmtDate(d.ts), fmtTime(d.ts), m ? `${m.firstName} ${m.lastName}` : "—", fmtMoney(d.amount), `${d.days}`]; }); }
  document.getElementById("reportPdf").addEventListener("click", () => exportPDF("Rapport " + document.getElementById("reportType").value, ["Date", "Heure", "Membre", "Montant", "Jours"], reportExportRows()));
  document.getElementById("reportXls").addEventListener("click", () => exportExcel("rapport_" + document.getElementById("reportType").value, ["Date", "Heure", "Membre", "Montant", "Jours"], reportExportRows()));

  /* ============================================================
     STATS
     ============================================================ */
  function renderStats() {
    Charts.trend("chartTrend", 14);
    Charts.byUser("chartByUser");
    Charts.amounts("chartAmounts");
    Charts.monthly("chartMonthly");
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function renderSettings() {
    const a = DB.admin();
    document.getElementById("adminAvatar").textContent = initials(a.firstName, a.lastName);
    document.getElementById("adminName").textContent = `${a.firstName} ${a.lastName}`;
    document.getElementById("adminLoginLbl").textContent = "@" + a.login;
    document.getElementById("a_firstName").value = a.firstName;
    document.getElementById("a_lastName").value = a.lastName;
    document.getElementById("a_phone").value = a.phone || "";
    document.getElementById("a_address").value = a.address || "";
    document.getElementById("ruleLbl").textContent = `${fmtNumber(DB.settings().fcfaPerDay)} FCFA = 1 jour d'épargne`;
  }
  document.getElementById("adminForm").addEventListener("submit", (e) => {
    e.preventDefault();
    DB.updateAdmin({ firstName: document.getElementById("a_firstName").value.trim(), lastName: document.getElementById("a_lastName").value.trim(), phone: document.getElementById("a_phone").value.trim(), address: document.getElementById("a_address").value.trim() });
    const a = DB.admin();
    document.getElementById("sideName").textContent = `${a.firstName} ${a.lastName}`;
    document.getElementById("sideAvatar").textContent = initials(a.firstName, a.lastName);
    toast("Profil mis à jour", "success"); renderSettings();
  });
  document.getElementById("pwdForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p1 = document.getElementById("a_pwd").value, p2 = document.getElementById("a_pwd2").value;
    if (!p1 || p1.length < 4) { toast("Mot de passe trop court (min. 4)", "warn"); return; }
    if (p1 !== p2) { toast("Les mots de passe ne correspondent pas", "error"); return; }
    DB.updateAdmin({ password: p1 }); DB.log("admin", "Mot de passe administrateur modifié");
    document.getElementById("a_pwd").value = ""; document.getElementById("a_pwd2").value = "";
    toast("Mot de passe changé", "success");
  });
  document.getElementById("resetDataBtn").addEventListener("click", () => {
    modal({ title: "Charger les données de démonstration", body: "Les membres et dépôts seront remplacés par le jeu de démonstration. Votre compte administrateur sera conservé. Continuer ?", confirmText: "Charger la démo", danger: true, onConfirm: () => { DB.reset(); toast("Données de démonstration chargées", "success"); go("dashboard"); } });
  });

  /* ----- Pagination helper ----- */
  function renderPagination(elId, page, pages, total, onGo) {
    const el = document.getElementById(elId);
    let btns = "";
    for (let p = 1; p <= pages; p++) {
      if (pages > 7 && (p > 2 && p < pages - 1) && Math.abs(p - page) > 1) { if (p === 3 || p === pages - 2) btns += `<button disabled>…</button>`; continue; }
      btns += `<button class="${p === page ? "active" : ""}" data-p="${p}">${p}</button>`;
    }
    el.innerHTML = `<small class="text-muted">${total} élément(s)</small>
      <div class="pager">
        <button data-p="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button>
        ${btns}
        <button data-p="${page + 1}" ${page >= pages ? "disabled" : ""}>›</button>
      </div>`;
    el.querySelectorAll(".pager button[data-p]").forEach(b => b.addEventListener("click", () => { const p = Number(b.dataset.p); if (p >= 1 && p <= pages) onGo(p); }));
  }

  /* Re-render charts on theme change */
  const themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", () => setTimeout(() => {
    const active = location.hash.replace("#", "") || "dashboard";
    if (active === "dashboard") { Charts.evolution("chartEvolution", 30); }
    if (active === "stats") renderStats();
  }, 60));

  const RENDER = { dashboard: renderDashboard, members: renderMembers, deposits: renderDeposits, history: renderHistory, reports: renderReports, stats: renderStats, settings: renderSettings };

  /* Init */
  go(location.hash.replace("#", "") || "dashboard");
})();
