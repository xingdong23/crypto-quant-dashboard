/* global Chart */
(function () {
  "use strict";

  const REFRESH_MS = 60000;
  const STALE_MS = 20 * 60 * 1000;
  const DATA_URL = "./data.json";

  let chartPaper = null;
  let chartAccel = null;
  let currentPosTrack = "equal";
  let lastData = null;

  const $ = (sel, root) => (root || document).querySelector(sel);

  function fmtNum(n, d) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString("zh-CN", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  function fmtPct(n, d) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return sign + Number(n).toFixed(d === undefined ? 2 : d) + "%";
  }

  function pnlClass(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "flat";
    if (n > 0.0001) return "pos";
    if (n < -0.0001) return "neg";
    return "flat";
  }

  function parseUtc(iso) {
    if (!iso) return null;
    const s = String(iso).trim();
    const d = new Date(s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtZones(iso) {
    const d = parseUtc(iso);
    if (!d) return "—";
    const opts = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    const sh = new Intl.DateTimeFormat("zh-CN", { ...opts, timeZone: "Asia/Shanghai" }).format(d);
    const la = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "America/Los_Angeles" }).format(d);
    return {
      utc: d.toISOString().replace(".000Z", "Z"),
      shanghai: sh + " (上海)",
      la: la + " (洛杉矶)",
      short: d.toISOString().slice(0, 19).replace("T", " ") + "Z",
    };
  }

  function setKpi(el, k) {
    if (!el || !k) return;
    const eq = $("[data-eq]", el);
    const pnl = $("[data-pnl]", el);
    const day = $("[data-day]", el);
    const risk = $("[data-risk]", el);
    if (eq) eq.textContent = fmtNum(k.equity, 2) + " U";
    if (pnl) {
      pnl.textContent = "累计 " + fmtPct(k.pnl_pct);
      pnl.className = pnlClass(k.pnl_pct);
    }
    if (day) {
      day.textContent = "今日 " + fmtPct(k.day_pnl_pct);
      day.className = pnlClass(k.day_pnl_pct);
    }
    if (risk) risk.textContent = "风控：" + (k.risk || "—");
  }

  function chartOpts(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#8b9bb4", boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items[0] && items[0].raw;
              const t = raw && raw.t;
              const z = fmtZones(t);
              return typeof z === "string" ? z : z.short + "\n" + z.shanghai;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#8b9bb4",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
            callback: function (val, idx) {
              const lbl = this.getLabelForValue(val);
              return lbl ? String(lbl).slice(5, 16).replace("T", " ") : "";
            },
          },
          grid: { color: "rgba(36,48,68,.6)" },
        },
        y: {
          title: { display: !!yTitle, text: yTitle || "", color: "#8b9bb4" },
          ticks: { color: "#8b9bb4" },
          grid: { color: "rgba(36,48,68,.6)" },
        },
      },
    };
  }

  function seriesPoints(arr) {
    return (arr || []).map((p) => ({ x: p.t, y: p.equity, t: p.t }));
  }

  function upsertCharts(data) {
    if (typeof Chart === "undefined") return;
    const eq = seriesPoints(data.equity && data.equity.equal);
    const hy = seriesPoints(data.equity && data.equity.hybrid);
    const ac = seriesPoints(data.equity && data.equity.accel);

    const labelsPaper = Array.from(
      new Set([...(data.equity.equal || []), ...(data.equity.hybrid || [])].map((p) => p.t))
    ).sort();

    const mapY = (rows) => {
      const m = {};
      (rows || []).forEach((p) => {
        m[p.t] = p.equity;
      });
      return labelsPaper.map((t) => (m[t] !== undefined ? m[t] : null));
    };

    const paperCfg = {
      type: "line",
      data: {
        labels: labelsPaper,
        datasets: [
          {
            label: "Equal",
            data: mapY(data.equity.equal),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,.12)",
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: true,
          },
          {
            label: "Hybrid",
            data: mapY(data.equity.hybrid),
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167,139,250,.1)",
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: true,
          },
        ],
      },
      options: chartOpts("USDT"),
    };

    const labelsAccel = (data.equity.accel || []).map((p) => p.t);
    const accelCfg = {
      type: "line",
      data: {
        labels: labelsAccel,
        datasets: [
          {
            label: "Accel",
            data: (data.equity.accel || []).map((p) => p.equity),
            borderColor: "#22d3ee",
            backgroundColor: "rgba(34,211,238,.12)",
            tension: 0.2,
            pointRadius: 2,
            borderWidth: 2,
            fill: true,
          },
        ],
      },
      options: chartOpts("USDT"),
    };

    // attach t for tooltip
    paperCfg.options.plugins.tooltip.callbacks.title = (items) => {
      const t = items[0] && items[0].label;
      const z = fmtZones(t);
      return typeof z === "string" ? z : z.short + " · " + z.shanghai;
    };
    accelCfg.options.plugins.tooltip.callbacks.title = paperCfg.options.plugins.tooltip.callbacks.title;

    if (chartPaper) {
      chartPaper.data = paperCfg.data;
      chartPaper.update("none");
    } else {
      chartPaper = new Chart($("#chart-paper"), paperCfg);
    }
    if (chartAccel) {
      chartAccel.data = accelCfg.data;
      chartAccel.update("none");
    } else {
      chartAccel = new Chart($("#chart-accel"), accelCfg);
    }
  }

  function renderPositions(data, track) {
    const tbody = $("#pos-table tbody");
    const rows = (data.positions && data.positions[track]) || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">暂无持仓</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const noteParts = [];
        if (r.hold_until_utc) noteParts.push("到期 " + String(r.hold_until_utc).replace("T", " ").replace("Z", "Z"));
        if (r.stop_pct != null) noteParts.push("止损 " + (Number(r.stop_pct) * 100).toFixed(1) + "%");
        if (r.mark_px != null) noteParts.push("估市价 " + fmtNum(r.mark_px, 6));
        if (r.score != null) noteParts.push("score " + Number(r.score).toFixed(4));
        const cost = r.entry_px != null ? r.entry_px : r.avg_cost;
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(r.symbol) +
          "</td>" +
          "<td>" +
          fmtNum(r.qty, r.symbol === "CASH" ? 2 : 6) +
          "</td>" +
          "<td>" +
          fmtNum(cost, 6) +
          "</td>" +
          "<td>" +
          fmtNum(r.cost_notional, 2) +
          "</td>" +
          "<td>" +
          (r.weight_pct_cost != null ? Number(r.weight_pct_cost).toFixed(1) + "%" : "—") +
          "</td>" +
          "<td class=\"" +
          pnlClass(r.pnl_pct) +
          "\">" +
          fmtPct(r.pnl_pct) +
          "</td>" +
          "<td>" +
          escapeHtml(noteParts.join(" · ") || "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sideLabel(side) {
    const s = String(side || "").toLowerCase();
    if (s === "buy") return '<span class="side-buy">买入</span>';
    if (s === "sell") return '<span class="side-sell">卖出</span>';
    return escapeHtml(side || "—");
  }

  function renderEvents(data) {
    const tbody = $("#evt-table tbody");
    const rows = data.events || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">暂无成交/信号</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .slice(0, 200)
      .map((e) => {
        const z = fmtZones(e.t);
        const tshow = typeof z === "string" ? z : z.short;
        const track = e.track || e.source || "";
        return (
          "<tr>" +
          "<td title=\"" +
          escapeHtml(typeof z === "string" ? "" : z.shanghai + " / " + z.la) +
          "\">" +
          escapeHtml(tshow) +
          "</td>" +
          "<td><span class=\"pill " +
          escapeHtml(track) +
          "\">" +
          escapeHtml(track) +
          "</span></td>" +
          "<td>" +
          escapeHtml(e.symbol) +
          "</td>" +
          "<td>" +
          sideLabel(e.side) +
          "</td>" +
          "<td>" +
          fmtNum(e.price, 6) +
          "</td>" +
          "<td>" +
          fmtNum(e.notional, 2) +
          "</td>" +
          "<td>" +
          escapeHtml(e.reason || "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function updateFreshness(data) {
    const gen = data.generated_at;
    const src = data.last_source_update_utc || gen;
    const zg = fmtZones(gen);
    const zs = fmtZones(src);
    const badgeGen = $("#badge-gen");
    const badgeSrc = $("#badge-src");
    const badgeFresh = $("#badge-fresh");

    badgeGen.textContent =
      "生成： " +
      (typeof zg === "string" ? zg : zg.shanghai + " / " + zg.la);
    badgeSrc.textContent =
      "源更新： " +
      (typeof zs === "string" ? zs : zs.shanghai + " / " + zs.la);

    const anchor = parseUtc(src) || parseUtc(gen);
    const age = anchor ? Date.now() - anchor.getTime() : Infinity;
    badgeFresh.classList.remove("ok", "warn", "err");
    if (!anchor) {
      badgeFresh.textContent = "状态：无时间戳";
      badgeFresh.classList.add("err");
    } else if (age > STALE_MS) {
      const mins = Math.round(age / 60000);
      badgeFresh.textContent = "状态：数据陈旧（" + mins + " 分钟前）";
      badgeFresh.classList.add("warn");
    } else {
      badgeFresh.textContent = "状态：新鲜";
      badgeFresh.classList.add("ok");
    }
  }

  function renderRisk(data) {
    const k = data.kpi || {};
    const parts = [
      ["Equal", k.equal && k.equal.risk],
      ["Hybrid", k.hybrid && k.hybrid.risk],
      ["Accel", k.accel && k.accel.risk],
    ];
    const allOk = parts.every((p) => !p[1] || p[1] === "正常");
    const el = $("#kpi-risk");
    $("[data-summary]", el).textContent = allOk ? "全部正常" : "注意风控";
    $("[data-summary]", el).className =
      "value " + (allOk ? "pos" : "neg");
    $("[data-detail]", el).innerHTML = parts
      .map((p) => "<span>" + p[0] + "：" + escapeHtml(p[1] || "—") + "</span>")
      .join("");
  }

  function renderAll(data) {
    lastData = data;
    setKpi($("#kpi-equal"), data.kpi && data.kpi.equal);
    setKpi($("#kpi-hybrid"), data.kpi && data.kpi.hybrid);
    setKpi($("#kpi-accel"), data.kpi && data.kpi.accel);
    renderRisk(data);
    updateFreshness(data);
    upsertCharts(data);
    renderPositions(data, currentPosTrack);
    renderEvents(data);
    $("#report-paper").textContent = (data.reports && data.reports.paper) || "（无）";
    $("#report-accel").textContent = (data.reports && data.reports.accel) || "（无）";
  }

  async function load() {
    try {
      const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      renderAll(data);
    } catch (e) {
      const badgeFresh = $("#badge-fresh");
      badgeFresh.textContent = "状态：加载失败 " + e.message;
      badgeFresh.classList.remove("ok", "warn");
      badgeFresh.classList.add("err");
    }
  }

  function bindTabs() {
    $("#pos-tabs").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".tab");
      if (!btn) return;
      currentPosTrack = btn.getAttribute("data-track");
      $("#pos-tabs").querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      if (lastData) renderPositions(lastData, currentPosTrack);
    });
  }

  function boot() {
    bindTabs();
    load();
    setInterval(load, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
