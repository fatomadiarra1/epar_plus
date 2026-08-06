/* =====================================================================
   ÉPARGNE PLUS — Shared utilities (format, theme, toast, modal, ...)
   ===================================================================== */

/* ----------  Formatting  ---------- */
function fmtMoney(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0)) + " FCFA";
}
function fmtNumber(n) { return new Intl.NumberFormat("fr-FR").format(Number(n) || 0); }
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDateTime(ts) { return `${fmtDate(ts)} ${fmtTime(ts)}`; }
function relativeDate(ts) {
  const diff = Date.now() - ts, day = 86400000;
  if (diff < 60000) return "à l'instant";
  if (diff < 3600000) return Math.floor(diff / 60000) + " min";
  if (diff < day) return Math.floor(diff / 3600000) + " h";
  if (diff < 2 * day) return "hier";
  return fmtDate(ts);
}
function initials(first, last) {
  return ((first || "").charAt(0) + (last || "").charAt(0)).toUpperCase() || "?";
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function debounce(fn, ms = 220) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* avatar element (image or initials) */
function avatarHTML(member, cls = "avatar") {
  if (member && member.photo) return `<img class="${cls}" src="${member.photo}" alt="">`;
  return `<span class="${cls}">${initials(member && member.firstName, member && member.lastName)}</span>`;
}

/* ----------  Theme  ---------- */
const Theme = {
  get() { return localStorage.getItem(THEME_KEY) || "light"; },
  apply(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem(THEME_KEY, t); document.querySelectorAll("[data-theme-icon]").forEach(el => el.textContent = t === "dark" ? "🌙" : "☀️"); },
  toggle() { Theme.apply(Theme.get() === "dark" ? "light" : "dark"); },
  init() { Theme.apply(Theme.get()); },
};
Theme.init();

function buildThemeToggle() {
  const t = document.createElement("button");
  t.className = "theme-toggle"; t.title = "Changer de thème"; t.setAttribute("aria-label", "Changer de thème");
  t.innerHTML = `<span class="knob" data-theme-icon>${Theme.get() === "dark" ? "🌙" : "☀️"}</span>`;
  t.addEventListener("click", Theme.toggle);
  return t;
}

/* ----------  Toast  ---------- */
function toast(msg, type = "info") {
  let host = document.getElementById("toasts");
  if (!host) { host = document.createElement("div"); host.id = "toasts"; document.body.appendChild(host); }
  const icons = { success: "✓", error: "✕", warn: "!", info: "ℹ" };
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<span class="t-icon">${icons[type] || icons.info}</span><span>${escapeHtml(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s, transform .3s"; el.style.opacity = "0"; el.style.transform = "translateX(40px)"; setTimeout(() => el.remove(), 300); }, 3200);
}

/* ----------  Modal  ---------- */
function modal({ title = "", body = "", confirmText = "Confirmer", cancelText = "Annuler", danger = false, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <div class="modal-body text-muted">${body}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? "btn-danger" : ""}" data-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.style.opacity = "0"; setTimeout(() => overlay.remove(), 200); };
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-cancel]").addEventListener("click", close);
  overlay.querySelector("[data-confirm]").addEventListener("click", () => { if (onConfirm) onConfirm(); close(); });
  return close;
}

/* ----------  Animated counters  ---------- */
function animateCounter(el, to, { money = false, duration = 1100, suffix = "" } = {}) {
  const start = 0, t0 = performance.now();
  const ease = x => 1 - Math.pow(1 - x, 3);
  function frame(t) {
    const p = Math.min(1, (t - t0) / duration);
    const val = Math.round(start + (to - start) * ease(p));
    el.textContent = (money ? fmtMoney(val) : fmtNumber(val)) + (suffix || "");
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* run counters when visible */
function initCounters(scope = document) {
  const els = scope.querySelectorAll("[data-count]");
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        animateCounter(el, Number(el.dataset.count), { money: el.dataset.money === "1", suffix: el.dataset.suffix || "" });
        io.unobserve(el);
      }
    });
  }, { threshold: 0.4 });
  els.forEach(el => io.observe(el));
}

/* ----------  Sidebar (mobile)  ---------- */
function initSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".menu-toggle");
  if (!sidebar || !toggle) return;
  let backdrop = document.querySelector(".sidebar-backdrop");
  if (!backdrop) { backdrop = document.createElement("div"); backdrop.className = "sidebar-backdrop"; document.body.appendChild(backdrop); }
  const open = () => { sidebar.classList.add("open"); backdrop.classList.add("show"); };
  const closeS = () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); };
  toggle.addEventListener("click", () => sidebar.classList.contains("open") ? closeS() : open());
  backdrop.addEventListener("click", closeS);
  sidebar.querySelectorAll(".nav a").forEach(a => a.addEventListener("click", () => { if (window.innerWidth <= 880) closeS(); }));
}

/* ----------  Export helpers (PDF / Excel)  ---------- */
function exportExcel(filename, headers, rows) {
  if (typeof XLSX === "undefined") { toast("Librairie Excel indisponible", "error"); return; }
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Données");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
  toast("Export Excel généré", "success");
}
function exportPDF(title, headers, rows) {
  if (typeof window.jspdf === "undefined") { toast("Librairie PDF indisponible", "error"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.setTextColor(37, 99, 235);
  doc.text("ÉPARGNE PLUS", 14, 16);
  doc.setFontSize(11); doc.setTextColor(80);
  doc.text(title, 14, 24);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text("Généré le " + fmtDateTime(Date.now()), 14, 30);
  doc.autoTable({
    head: [headers], body: rows, startY: 35,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    theme: "grid",
  });
  doc.save(title.replace(/\s+/g, "_").toLowerCase() + ".pdf");
  toast("Export PDF généré", "success");
}

/* ----------  Logo markup  ---------- */
function brandHTML(small) {
  return `<a class="brand" href="${Auth.session()?.role === "admin" ? "admin.html" : (Auth.session()?.role === "user" ? "user.html" : "index.html")}">
    <span class="logo-mark">€</span>
    <span class="logo-text">ÉPARGNE <b>PLUS</b><span class="sub">GESTION D'ÉPARGNE</span></span>
  </a>`;
}
