const STORAGE_KEY = "hbs-participation-log";

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function parseDate(str) {
  return new Date(str + "T00:00:00");
}

function fmtISO(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function shortDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- SVG chart helpers -----------------------------------------------

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function makeSvg(width, height) {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height,
    class: "viz-svg",
  });
  return svg;
}

// Stacked column chart for the current week (2 series: Cold-call / Voluntary)
function renderWeekChart(container, days) {
  const width = 640, height = 220;
  const marginBottom = 26, marginTop = 22, marginLeft = 10, marginRight = 10;
  const plotH = height - marginTop - marginBottom;
  const maxTotal = Math.max(1, ...days.map(d => d.coldCall + d.voluntary));
  const barSlot = (width - marginLeft - marginRight) / days.length;
  const barWidth = Math.min(24, barSlot * 0.5);
  const baselineY = height - marginBottom;

  const svg = makeSvg(width, height);

  svg.appendChild(svgEl("line", {
    x1: marginLeft, x2: width - marginRight, y1: baselineY, y2: baselineY,
    class: "axis-line",
  }));

  days.forEach((d, i) => {
    const cx = marginLeft + barSlot * i + barSlot / 2;
    const x = cx - barWidth / 2;
    const total = d.coldCall + d.voluntary;
    const ccH = total ? (d.coldCall / maxTotal) * plotH : 0;
    const volH = total ? (d.voluntary / maxTotal) * plotH : 0;
    const gap = total > 0 && d.coldCall > 0 && d.voluntary > 0 ? 2 : 0;

    if (d.coldCall > 0) {
      const y = baselineY - ccH;
      svg.appendChild(roundedBar(x, y, barWidth, ccH, "series-1", d.voluntary === 0));
    }
    if (d.voluntary > 0) {
      const y = baselineY - ccH - volH - gap;
      svg.appendChild(roundedBar(x, y, barWidth, volH, "series-2", true));
    }

    if (total > 0) {
      const topY = baselineY - ccH - volH - gap - 6;
      svg.appendChild(textEl(cx, topY, String(total), "value-label", "middle"));
    }

    svg.appendChild(textEl(cx, height - 8, d.label, "axis-label", "middle"));
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

// Rounded bar: rounds the top (data-end); square at baseline. If `roundBottomToo`
// is false, only the top gets the radius (used when a segment sits under another).
function roundedBar(x, y, w, h, colorClass, roundTop) {
  const r = roundTop ? Math.min(4, h, w / 2) : 0;
  let d;
  if (r > 0) {
    d = `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  } else {
    d = `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
  }
  return svgEl("path", { d, class: `bar-fill ${colorClass}` });
}

function textEl(x, y, str, className, anchor) {
  const t = svgEl("text", { x, y, class: className, "text-anchor": anchor || "start" });
  t.textContent = str;
  return t;
}

// Vertical bar chart, single series, value on cap, category labels below.
function renderTrendChart(container, weeks) {
  const width = 640;
  const height = 200;
  const marginBottom = 24, marginTop = 22, marginLeft = 10, marginRight = 10;
  const plotH = height - marginTop - marginBottom;
  const maxVal = Math.max(1, ...weeks.map(w => w.total));
  const n = Math.max(weeks.length, 1);
  const barSlot = (width - marginLeft - marginRight) / n;
  const barWidth = Math.min(24, barSlot * 0.5);
  const baselineY = height - marginBottom;
  const rotateLabels = weeks.length > 8;

  const svg = makeSvg(width, height);
  svg.appendChild(svgEl("line", {
    x1: marginLeft, x2: width - marginRight, y1: baselineY, y2: baselineY,
    class: "axis-line",
  }));

  weeks.forEach((w, i) => {
    const cx = marginLeft + barSlot * i + barSlot / 2;
    const x = cx - barWidth / 2;
    const h = (w.total / maxVal) * plotH;
    const y = baselineY - h;
    svg.appendChild(roundedBar(x, y, barWidth, Math.max(h, 0), "series-1", true));
    svg.appendChild(textEl(cx, y - 6, String(w.total), "value-label", "middle"));

    const label = svgEl("text", {
      x: cx, y: height - 8, class: "axis-label", "text-anchor": rotateLabels ? "end" : "middle",
    });
    label.textContent = w.label;
    if (rotateLabels) label.setAttribute("transform", `rotate(-35 ${cx} ${height - 8})`);
    svg.appendChild(label);
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

// Horizontal bar chart, single hue, sorted desc, value at the tip.
// Built as HTML rows (not SVG text) so long labels wrap instead of clipping.
function renderHBarChart(container, rows, colorClass) {
  if (rows.length === 0) {
    container.innerHTML = '<p class="hbar-empty">No data yet</p>';
    return;
  }
  const maxVal = Math.max(1, ...rows.map(r => r.value));
  container.innerHTML = rows.map(r => {
    const pct = Math.max((r.value / maxVal) * 100, 3);
    return `
      <div class="hbar-row">
        <div class="hbar-label">${escapeHtml(r.label)}</div>
        <div class="hbar-track"><div class="hbar-fill ${colorClass}" style="width:${pct}%"></div></div>
        <div class="hbar-value">${r.value}</div>
      </div>`;
  }).join("");
}

function statTile(value, label) {
  return `<div class="stat"><div class="num">${value}</div><div class="label">${escapeHtml(label)}</div></div>`;
}

// --- Main render --------------------------------------------------------

function render() {
  const entries = loadEntries();
  const emptyEl = document.getElementById("empty-dashboard");
  const contentEl = document.getElementById("dashboard-content");

  if (entries.length === 0) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  contentEl.hidden = false;

  // --- This week ---
  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekDates = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const weekDateStrs = weekDates.map(fmtISO);

  document.getElementById("week-range").textContent =
    `${shortDate(weekDates[0])} – ${shortDate(weekDates[6])}`;

  const days = weekDates.map((d, i) => {
    const ds = weekDateStrs[i];
    const dayEntries = entries.filter(e => e.date === ds);
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      coldCall: dayEntries.filter(e => e.type === "Cold-call").length,
      voluntary: dayEntries.filter(e => e.type === "Voluntary").length,
    };
  });

  const weekEntries = entries.filter(e => weekDateStrs.includes(e.date));
  const weekColdCall = weekEntries.filter(e => e.type === "Cold-call").length;
  const weekVoluntary = weekEntries.filter(e => e.type === "Voluntary").length;

  document.getElementById("week-stats").innerHTML =
    statTile(weekEntries.length, "Entries this week") +
    statTile(weekColdCall, "Cold-calls") +
    statTile(weekVoluntary, "Voluntary");

  document.getElementById("week-legend").innerHTML = `
    <span class="legend-item"><span class="swatch series-1"></span>Cold-call</span>
    <span class="legend-item"><span class="swatch series-2"></span>Voluntary</span>
  `;

  renderWeekChart(document.getElementById("week-chart"), days);

  // --- Overall ---
  const allDates = entries.map(e => e.date).sort();
  document.getElementById("overall-range").textContent =
    allDates.length ? `Since ${shortDate(parseDate(allDates[0]))}` : "";

  const classSet = new Set(entries.map(e => e.className));
  const coldCallTotal = entries.filter(e => e.type === "Cold-call").length;
  const voluntaryTotal = entries.filter(e => e.type === "Voluntary").length;

  document.getElementById("overall-stats").innerHTML =
    statTile(entries.length, "Total entries") +
    statTile(classSet.size, "Classes tracked") +
    statTile(coldCallTotal, "Cold-calls") +
    statTile(voluntaryTotal, "Voluntary");

  // Weekly trend across all history
  const weekMap = new Map();
  entries.forEach(e => {
    const wk = fmtISO(startOfWeek(parseDate(e.date)));
    weekMap.set(wk, (weekMap.get(wk) || 0) + 1);
  });
  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([wk, total]) => ({ label: shortDate(parseDate(wk)), total }));

  renderTrendChart(document.getElementById("trend-chart"), weeks);

  // By class
  const classCounts = new Map();
  entries.forEach(e => classCounts.set(e.className, (classCounts.get(e.className) || 0) + 1));
  const classRows = [...classCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  renderHBarChart(document.getElementById("class-chart"), classRows, "series-1");

  // Voluntary subtype breakdown
  const subtypeOrder = ["Superficial", "Quality comment", "Calculation walkthrough"];
  const subtypeRows = subtypeOrder.map(label => ({
    label,
    value: entries.filter(e => e.type === "Voluntary" && e.subtype === label).length,
  }));

  renderHBarChart(document.getElementById("subtype-chart"), subtypeRows, "series-2");
}

render();
window.addEventListener("storage", render);
