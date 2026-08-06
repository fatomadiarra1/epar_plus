/* =====================================================================
   ÉPARGNE PLUS — User (member) space controller
   ===================================================================== */
(function () {
  const session = Auth.require("user");
  if (!session) return;

  const me = DB.member(session.id);
  if (!me) { Auth.logout(); location.href = "index.html"; return; }

  document.getElementById("themeSlot").appendChild(buildThemeToggle());
  initSidebar();
  document.getElementById("sideName").textContent = `${me.firstName} ${me.lastName}`;
  document.getElementById("sideAvatar").textContent = initials(me.firstName, me.lastName);
  document.getElementById("pageSub").textContent = `Bonjour ${me.firstName} 👋`;

  document.getElementById("logoutBtn").addEventListener("click", (e) => {
    e.preventDefault();
    modal({ title: "Déconnexion", body: "Voulez-vous vraiment vous déconnecter ?", confirmText: "Se déconnecter", danger: true, onConfirm: () => { Auth.logout(); location.href = "index.html"; } });
  });

  const view = document.getElementById("view");
  document.querySelectorAll("body > .route").forEach(r => view.appendChild(r));

  const PAGE_META = {
    dashboard: ["Tableau de bord", `Bonjour ${me.firstName} 👋`],
    savings: ["Mon Épargne", "Détail de votre épargne"],
    deposits: ["Mes Dépôts", "Tout l'historique de vos versements"],
    statement: ["Mon Relevé", "Relevé d'épargne détaillé"],
    profile: ["Mon Profil", "Vos informations personnelles"],
  };

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

  /* ---------- DASHBOARD ---------- */
  function renderDashboard() {
    const t = memberTotals(me.id);
    const cards = [
      { ico: "b2", icon: "💰", label: "Total épargné", value: t.total, money: true },
      { ico: "b5", icon: "🗓️", label: "Nombre total de jours", value: t.days, money: false, suffix: " j" },
      { ico: "b3", icon: "📥", label: "Nombre de versements", value: t.count, money: false },
      { ico: "b6", icon: "🕒", label: "Dernier dépôt", custom: t.last ? fmtMoney(t.last.amount) : "—", subCustom: t.last ? relativeDate(t.last.ts) : "Aucun" },
    ];
    document.getElementById("statGrid").innerHTML = cards.map(c => `
      <div class="stat-card glass"><span class="glow"></span><div class="ico ${c.ico}">${c.icon}</div>
      <div class="label">${c.label}</div>
      ${c.custom !== undefined
        ? `<div class="value">${c.custom}</div><div class="trend text-muted">${c.subCustom}</div>`
        : `<div class="value" data-count="${c.value}" data-money="${c.money ? 1 : 0}" data-suffix="${c.suffix || ""}">0</div>`}
      </div>`).join("");
    initCounters(document.getElementById("statGrid"));

    Charts.memberEvolution("chartMine", me.id, 30);

    const goal = 90, pct = Math.min(100, Math.round((t.days / goal) * 100));
    document.getElementById("progressBox").innerHTML = `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:2.4rem;font-weight:800" class="text-blue">${t.days}<small style="font-size:1rem;color:var(--text-muted)"> / ${goal} j</small></div>
        <small class="text-muted">Objectif d'épargne</small>
      </div>
      <div class="flex" style="justify-content:space-between;margin:14px 0 8px"><small class="text-muted">Progression</small><small class="text-blue">${pct}%</small></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="info-item mt-16"><small>Épargne moyenne / dépôt</small><b>${fmtMoney(t.count ? t.total / t.count : 0)}</b></div>`;

    const recent = t.deposits.slice(0, 6);
    document.getElementById("recentMine").innerHTML = `
      <thead><tr><th>Date</th><th>Heure</th><th>Montant</th><th>Jours</th></tr></thead>
      <tbody>${recent.map(d => `<tr><td>${fmtDate(d.ts)}</td><td class="text-muted">${fmtTime(d.ts)}</td><td><b>${fmtMoney(d.amount)}</b></td><td><span class="badge badge-gold">${d.days} j</span></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Aucun versement</div></td></tr>`}</tbody>`;
  }

  /* ---------- SAVINGS ---------- */
  function renderSavings() {
    const t = memberTotals(me.id);
    document.getElementById("savAvatar").textContent = initials(me.firstName, me.lastName);
    document.getElementById("savName").textContent = `${me.firstName} ${me.lastName}`;
    document.getElementById("savLogin").textContent = "@" + me.login;
    document.getElementById("savPhone").textContent = me.phone || "—";
    document.getElementById("savSince").textContent = fmtDate(me.createdAt);
    document.getElementById("savAddress").textContent = me.address || "—";

    document.getElementById("savStats").innerHTML = `
      <div class="stat-card glass"><div class="ico b2">💰</div><div class="label">Total épargné</div><div class="value">${fmtMoney(t.total)}</div></div>
      <div class="stat-card glass"><div class="ico b5">🗓️</div><div class="label">Jours payés</div><div class="value">${t.days} <small>j</small></div></div>`;

    const goal = 90, pct = Math.min(100, Math.round((t.days / goal) * 100));
    document.getElementById("savGoalPct").textContent = pct + "%";
    setTimeout(() => document.getElementById("savGoalBar").style.width = pct + "%", 60);
    Charts.memberEvolution("chartSav", me.id, 30);
  }

  /* ---------- DEPOSITS ---------- */
  let myState = { page: 1, perPage: 10 };
  function myRows() { return memberTotals(me.id).deposits.map(d => [fmtDate(d.ts), fmtTime(d.ts), fmtMoney(d.amount), `${d.days}`]); }
  function renderDeposits() {
    const list = memberTotals(me.id).deposits;
    const total = list.length, pages = Math.max(1, Math.ceil(total / myState.perPage));
    if (myState.page > pages) myState.page = pages;
    const start = (myState.page - 1) * myState.perPage;
    const items = list.slice(start, start + myState.perPage);
    document.getElementById("myDeposits").innerHTML = `
      <thead><tr><th>Date</th><th>Heure</th><th>Montant</th><th>Nombre de jours</th></tr></thead>
      <tbody>${items.map(d => `<tr><td>${fmtDate(d.ts)}</td><td class="text-muted">${fmtTime(d.ts)}</td><td><b>${fmtMoney(d.amount)}</b></td><td><span class="badge badge-gold">${d.days} j</span></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty"><div class="big">📋</div>Aucun versement</div></td></tr>`}</tbody>`;
    renderPagination("myPagination", myState.page, pages, total, (p) => { myState.page = p; renderDeposits(); });
  }
  document.getElementById("myExportPdf").addEventListener("click", () => exportPDF(`Mes dépôts - ${me.firstName} ${me.lastName}`, ["Date", "Heure", "Montant", "Jours"], myRows()));
  document.getElementById("myExportXls").addEventListener("click", () => exportExcel(`mes_depots_${me.login}`, ["Date", "Heure", "Montant", "Jours"], myRows()));

  /* ---------- STATEMENT ---------- */
  function renderStatement() {
    const t = memberTotals(me.id);
    document.getElementById("stateHeader").innerHTML = `
      <div class="profile-head" style="margin-bottom:16px">
        <span class="avatar avatar-lg">${initials(me.firstName, me.lastName)}</span>
        <div class="meta"><h3>${escapeHtml(me.firstName)} ${escapeHtml(me.lastName)}</h3><span class="text-muted">@${escapeHtml(me.login)} · ${escapeHtml(me.phone || "")}</span></div>
      </div>
      <div class="info-list">
        <div class="info-item"><small>Membre depuis</small><b>${fmtDate(me.createdAt)}</b></div>
        <div class="info-item"><small>Total épargné</small><b class="text-blue">${fmtMoney(t.total)}</b></div>
        <div class="info-item"><small>Nombre de jours</small><b>${t.days} j</b></div>
        <div class="info-item"><small>Nombre de versements</small><b>${t.count}</b></div>
      </div>`;
    document.getElementById("stateTable").innerHTML = `
      <thead><tr><th>#</th><th>Date</th><th>Heure</th><th>Montant</th><th>Jours</th><th>Cumul</th></tr></thead>
      <tbody>${(() => { let cum = 0; const asc = t.deposits.slice().sort((a, b) => a.ts - b.ts); return asc.map((d, i) => { cum += d.amount; return `<tr><td>${i + 1}</td><td>${fmtDate(d.ts)}</td><td class="text-muted">${fmtTime(d.ts)}</td><td><b>${fmtMoney(d.amount)}</b></td><td>${d.days} j</td><td class="text-blue">${fmtMoney(cum)}</td></tr>`; }).reverse().join(""); })() || `<tr><td colspan="6"><div class="empty">Aucun versement</div></td></tr>`}</tbody>`;
  }
  document.getElementById("statePdf").addEventListener("click", () => {
    const t = memberTotals(me.id);
    let cum = 0; const rows = t.deposits.slice().sort((a, b) => a.ts - b.ts).map((d, i) => { cum += d.amount; return [i + 1, fmtDate(d.ts), fmtTime(d.ts), fmtMoney(d.amount), `${d.days}`, fmtMoney(cum)]; });
    exportPDF(`Releve epargne - ${me.firstName} ${me.lastName}`, ["#", "Date", "Heure", "Montant", "Jours", "Cumul"], rows);
  });

  /* ---------- PROFILE ---------- */
  function renderProfile() {
    document.getElementById("profAvatar").textContent = initials(me.firstName, me.lastName);
    document.getElementById("profName").textContent = `${me.firstName} ${me.lastName}`;
    document.getElementById("profLogin").textContent = "@" + me.login;
    document.getElementById("p_firstName").value = me.firstName;
    document.getElementById("p_lastName").value = me.lastName;
    document.getElementById("p_phone").value = me.phone || "";
    document.getElementById("p_address").value = me.address || "";
  }
  document.getElementById("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = { firstName: document.getElementById("p_firstName").value.trim(), lastName: document.getElementById("p_lastName").value.trim(), phone: document.getElementById("p_phone").value.trim(), address: document.getElementById("p_address").value.trim() };
    if (!data.firstName || !data.lastName) { toast("Nom et prénom requis", "warn"); return; }
    DB.updateMember(me.id, data);
    Object.assign(me, data);
    document.getElementById("sideName").textContent = `${me.firstName} ${me.lastName}`;
    document.getElementById("sideAvatar").textContent = initials(me.firstName, me.lastName);
    toast("Profil mis à jour", "success"); renderProfile();
  });
  document.getElementById("profPwdForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const old = document.getElementById("p_old").value, n1 = document.getElementById("p_new").value, n2 = document.getElementById("p_new2").value;
    if (old !== me.password) { toast("Mot de passe actuel incorrect", "error"); return; }
    if (!n1 || n1.length < 4) { toast("Nouveau mot de passe trop court", "warn"); return; }
    if (n1 !== n2) { toast("Les mots de passe ne correspondent pas", "error"); return; }
    DB.updateMember(me.id, { password: n1 }); me.password = n1;
    document.getElementById("p_old").value = document.getElementById("p_new").value = document.getElementById("p_new2").value = "";
    toast("Mot de passe changé", "success");
  });

  /* ---------- Pagination helper ---------- */
  function renderPagination(elId, page, pages, total, onGo) {
    const el = document.getElementById(elId);
    let btns = "";
    for (let p = 1; p <= pages; p++) btns += `<button class="${p === page ? "active" : ""}" data-p="${p}">${p}</button>`;
    el.innerHTML = `<small class="text-muted">${total} versement(s)</small>
      <div class="pager"><button data-p="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button>${btns}<button data-p="${page + 1}" ${page >= pages ? "disabled" : ""}>›</button></div>`;
    el.querySelectorAll(".pager button[data-p]").forEach(b => b.addEventListener("click", () => { const p = Number(b.dataset.p); if (p >= 1 && p <= pages) onGo(p); }));
  }

  /* Re-render charts on theme toggle */
  const themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", () => setTimeout(() => {
    const active = location.hash.replace("#", "") || "dashboard";
    if (active === "dashboard") Charts.memberEvolution("chartMine", me.id, 30);
    if (active === "savings") Charts.memberEvolution("chartSav", me.id, 30);
  }, 60));

  const RENDER = { dashboard: renderDashboard, savings: renderSavings, deposits: renderDeposits, statement: renderStatement, profile: renderProfile };
  go(location.hash.replace("#", "") || "dashboard");
})();
