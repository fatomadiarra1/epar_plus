/* =====================================================================
   ÉPARGNE PLUS — Chart.js helpers (theme-aware, reusable)
   ===================================================================== */

const Charts = (function () {
  const registry = {}; /* canvasId -> Chart instance */

  function colors() {
    const dark = Theme.get() === "dark";
    return {
      text: dark ? "#94A3B8" : "#64748B",
      grid: dark ? "rgba(148,163,184,.12)" : "rgba(15,23,42,.07)",
      blue: "#2563EB", blueSoft: "rgba(37,99,235,.15)",
      gold: "#F59E0B", green: "#10B981", purple: "#8B5CF6",
      cyan: "#0EA5E9", pink: "#EC4899", red: "#EF4444",
      palette: ["#2563EB", "#F59E0B", "#10B981", "#8B5CF6", "#0EA5E9", "#EC4899", "#14B8A6", "#F43F5E"],
    };
  }

  function baseOptions(extra = {}) {
    const c = colors();
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text, usePointStyle: true, padding: 16, font: { family: "Inter", size: 12 } } },
        tooltip: {
          backgroundColor: "#0F172A", titleColor: "#fff", bodyColor: "#e2e8f0",
          padding: 12, cornerRadius: 10, displayColors: true, boxPadding: 4,
        },
      },
      scales: {
        x: { ticks: { color: c.text, font: { family: "Inter" } }, grid: { color: c.grid } },
        y: { ticks: { color: c.text, font: { family: "Inter" } }, grid: { color: c.grid }, beginAtZero: true },
      },
    }, extra);
  }

  function render(id, config) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (registry[id]) registry[id].destroy();
    registry[id] = new Chart(el, config);
    return registry[id];
  }

  function gradient(ctx, area, from, to) {
    if (!area) return from;
    const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, from); g.addColorStop(1, to);
    return g;
  }

  /* ---- Line: cumulative savings over N days ---- */
  function evolution(id, days = 30) {
    const c = colors();
    const deposits = DB.deposits();
    const labels = [], data = [];
    let cumulativeBase = 0;
    const dayMs = 86400000, today = new Date(); today.setHours(0, 0, 0, 0);
    /* base = everything before the window */
    const windowStart = today.getTime() - (days - 1) * dayMs;
    cumulativeBase = deposits.filter(d => d.ts < windowStart).reduce((s, d) => s + d.amount, 0);
    let running = cumulativeBase;
    for (let i = days - 1; i >= 0; i--) {
      const dStart = today.getTime() - i * dayMs;
      const dEnd = dStart + dayMs;
      const sum = deposits.filter(d => d.ts >= dStart && d.ts < dEnd).reduce((s, d) => s + d.amount, 0);
      running += sum;
      labels.push(new Date(dStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
      data.push(running);
    }
    return render(id, {
      type: "line",
      data: { labels, datasets: [{
        label: "Épargne cumulée (FCFA)", data,
        borderColor: c.blue, borderWidth: 3, tension: .4, pointRadius: 0, pointHoverRadius: 5,
        fill: true,
        backgroundColor: (ctx) => gradient(ctx.chart.ctx, ctx.chart.chartArea, "rgba(37,99,235,.35)", "rgba(37,99,235,0)"),
      }] },
      options: baseOptions({ plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  /* ---- Bar: daily deposit trend ---- */
  function trend(id, days = 14) {
    const c = colors();
    const deposits = DB.deposits();
    const labels = [], data = [];
    const dayMs = 86400000, today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const dStart = today.getTime() - i * dayMs, dEnd = dStart + dayMs;
      const sum = deposits.filter(d => d.ts >= dStart && d.ts < dEnd).reduce((s, d) => s + d.amount, 0);
      labels.push(new Date(dStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
      data.push(sum);
    }
    return render(id, {
      type: "bar",
      data: { labels, datasets: [{
        label: "Dépôts / jour (FCFA)", data,
        backgroundColor: (ctx) => gradient(ctx.chart.ctx, ctx.chart.chartArea, "#3B82F6", "#2563EB"),
        borderRadius: 8, maxBarThickness: 26,
      }] },
      options: baseOptions({ plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  /* ---- Horizontal bar: deposits total by user ---- */
  function byUser(id) {
    const c = colors();
    const members = DB.members().map(m => ({ name: `${m.firstName} ${m.lastName}`, total: memberTotals(m.id).total }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
    return render(id, {
      type: "bar",
      data: { labels: members.map(m => m.name), datasets: [{
        label: "Total épargné (FCFA)", data: members.map(m => m.total),
        backgroundColor: members.map((_, i) => c.palette[i % c.palette.length]),
        borderRadius: 8, maxBarThickness: 22,
      }] },
      options: baseOptions({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  /* ---- Doughnut: amount distribution ---- */
  function amounts(id) {
    const c = colors();
    const buckets = { "1000": 0, "2000": 0, "3000": 0, "5000+": 0 };
    DB.deposits().forEach(d => {
      if (d.amount <= 1000) buckets["1000"]++;
      else if (d.amount <= 2000) buckets["2000"]++;
      else if (d.amount <= 4000) buckets["3000"]++;
      else buckets["5000+"]++;
    });
    return render(id, {
      type: "doughnut",
      data: { labels: ["≤ 1000", "≤ 2000", "≤ 4000", "≥ 5000"], datasets: [{
        data: Object.values(buckets),
        backgroundColor: [c.blue, c.gold, c.green, c.purple], borderWidth: 0, hoverOffset: 8,
      }] },
      options: baseOptions({ cutout: "62%", scales: {}, plugins: { legend: { position: "bottom", labels: baseOptions().plugins.legend.labels }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  /* ---- Bar: monthly activity (count) ---- */
  function monthly(id) {
    const c = colors();
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), count: 0 });
    }
    DB.deposits().forEach(dep => {
      const d = new Date(dep.ts), key = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find(x => x.key === key); if (m) m.count++;
    });
    return render(id, {
      type: "bar",
      data: { labels: months.map(m => m.label), datasets: [{
        label: "Nombre de dépôts", data: months.map(m => m.count),
        backgroundColor: (ctx) => gradient(ctx.chart.ctx, ctx.chart.chartArea, "#FBBF24", "#F59E0B"),
        borderRadius: 8, maxBarThickness: 26,
      }] },
      options: baseOptions({ plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  /* ---- User: personal savings line ---- */
  function memberEvolution(id, memberId, days = 30) {
    const c = colors();
    const deposits = DB.depositsByMember(memberId);
    const labels = [], data = [];
    const dayMs = 86400000, today = new Date(); today.setHours(0, 0, 0, 0);
    const windowStart = today.getTime() - (days - 1) * dayMs;
    let running = deposits.filter(d => d.ts < windowStart).reduce((s, d) => s + d.amount, 0);
    for (let i = days - 1; i >= 0; i--) {
      const dStart = today.getTime() - i * dayMs, dEnd = dStart + dayMs;
      running += deposits.filter(d => d.ts >= dStart && d.ts < dEnd).reduce((s, d) => s + d.amount, 0);
      labels.push(new Date(dStart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
      data.push(running);
    }
    return render(id, {
      type: "line",
      data: { labels, datasets: [{
        label: "Mon épargne cumulée (FCFA)", data,
        borderColor: c.gold, borderWidth: 3, tension: .4, pointRadius: 0, pointHoverRadius: 5, fill: true,
        backgroundColor: (ctx) => gradient(ctx.chart.ctx, ctx.chart.chartArea, "rgba(245,158,11,.35)", "rgba(245,158,11,0)"),
      }] },
      options: baseOptions({ plugins: { legend: { display: false }, tooltip: baseOptions().plugins.tooltip } }),
    });
  }

  function destroyAll() { Object.keys(registry).forEach(k => { registry[k].destroy(); delete registry[k]; }); }

  return { evolution, trend, byUser, amounts, monthly, memberEvolution, destroyAll, render, registry };
})();
