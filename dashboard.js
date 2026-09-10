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

// Class (rows) x day-of-week (columns) heatmap grid for the current week.
// Built as an HTML table so labels never clip and it scrolls on narrow screens.
function renderWeekGrid(container, weekDates, classes, weekEntries) {
  if (classes.length === 0) {
    container.innerHTML = '<p class="hbar-empty">No data yet</p>';
    return;
  }

  const dayHeaders = weekDates.map(d => ({
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    dayNum: d.getDate(),
    iso: fmtISO(d),
  }));

  const rows = classes.map(cls => {
    const cells = dayHeaders.map(h =>
      weekEntries.filter(e => e.className === cls && e.date === h.iso).length
    );
    return { cls, cells, total: cells.reduce((a, b) => a + b, 0) };
  }).sort((a, b) => b.total - a.total || a.cls.localeCompare(b.cls));

  function heatClass(n) {
    if (n === 0) return "heat-0";
    if (n === 1) return "heat-1";
    if (n === 2) return "heat-2";
    return "heat-3";
  }

  container.innerHTML = `
    <table class="heatmap">
      <thead>
        <tr>
          <th>Class</th>
          ${dayHeaders.map(h => `<th>${h.weekday}<span class="day-num">${h.dayNum}</span></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="heatmap-rowlabel">${escapeHtml(r.cls)}</td>
            ${r.cells.map(n => `<td class="heat-cell ${heatClass(n)}">${n > 0 ? n : ""}</td>`).join("")}
          </tr>`).join("")}
      </tbody>
    </table>`;
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

function statTile(value, label) {
  return `<div class="stat"><div class="num">${value}</div><div class="label">${escapeHtml(label)}</div></div>`;
}

const SUBTYPES = ["Superficial", "Quality comment", "Calculation walkthrough"];

function renderClassBreakdown(container, entries, allClasses) {
  if (allClasses.length === 0) {
    container.innerHTML = '<p class="hbar-empty">No data yet</p>';
    return;
  }

  const rows = allClasses.map(cls => {
    const classEntries = entries.filter(e => e.className === cls);
    const coldCall = classEntries.filter(e => e.type === "Cold-call").length;
    const voluntary = classEntries.filter(e => e.type === "Voluntary").length;
    const subtypeCounts = SUBTYPES.map(s => classEntries.filter(e => e.subtype === s).length);
    return { cls, total: classEntries.length, coldCall, voluntary, subtypeCounts };
  }).sort((a, b) => b.total - a.total);

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Class</th>
          <th>Entries</th>
          <th>Cold-call</th>
          <th>Voluntary</th>
          <th>Superficial</th>
          <th>Quality comment</th>
          <th>Calc. walkthrough</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.cls)}</td>
            <td>${r.total}</td>
            <td>${r.coldCall}</td>
            <td>${r.voluntary}</td>
            <td>${r.subtypeCounts[0]}</td>
            <td>${r.subtypeCounts[1]}</td>
            <td>${r.subtypeCounts[2]}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// Speaking pace: for each class, look at the most recent 3 logged sessions
// (participation or not) and flag whether you spoke in at least one of them —
// the "once every 2-3 classes" target.
function computePace(entries, allClasses) {
  return allClasses.map(cls => {
    const classEntries = entries
      .filter(e => e.className === cls)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const recent = classEntries.slice(0, 3);
    if (recent.length === 0) return { cls, status: "none" };
    const spoke = recent.some(e => e.type !== "No participation");
    return { cls, status: spoke ? "good" : "due" };
  });
}

function renderPace(container, entries, allClasses) {
  const rows = computePace(entries, allClasses);
  if (rows.length === 0) {
    container.innerHTML = '<p class="hbar-empty">No data yet</p>';
    return;
  }
  container.innerHTML = rows.map(r => {
    const text = r.status === "good" ? "On pace"
      : r.status === "due" ? "Speak soon"
      : "No log yet";
    return `
      <span class="pace-pill pace-${r.status}">
        <span class="pace-dot"></span>${escapeHtml(r.cls)} — ${text}
      </span>`;
  }).join("");
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

  // `entries` includes "No participation" rows (attended, didn't speak) — those
  // power the speaking-pace check below but are excluded from every other stat
  // and chart, which only ever meant actual participation.
  const allClasses = [...new Set(entries.map(e => e.className))].sort();
  const participationEntries = entries.filter(e => e.type !== "No participation");

  // --- This week ---
  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekDates = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const weekDateStrs = weekDates.map(fmtISO);

  document.getElementById("week-range").textContent =
    `${shortDate(weekDates[0])} – ${shortDate(weekDates[6])}`;

  const weekEntries = participationEntries.filter(e => weekDateStrs.includes(e.date));
  const weekColdCall = weekEntries.filter(e => e.type === "Cold-call").length;
  const weekVoluntary = weekEntries.filter(e => e.type === "Voluntary").length;

  document.getElementById("week-stats").innerHTML =
    statTile(weekEntries.length, "Entries this week") +
    statTile(weekColdCall, "Cold-calls") +
    statTile(weekVoluntary, "Voluntary");

  document.getElementById("week-legend").innerHTML = `
    <span class="legend-item"><span class="heat-swatch heat-0"></span>0</span>
    <span class="legend-item"><span class="heat-swatch heat-1"></span>1</span>
    <span class="legend-item"><span class="heat-swatch heat-2"></span>2</span>
    <span class="legend-item"><span class="heat-swatch heat-3"></span>3+</span>
  `;

  renderWeekGrid(document.getElementById("week-grid"), weekDates, allClasses, weekEntries);
  renderPace(document.getElementById("pace-list"), entries, allClasses);

  // --- Overall ---
  const allDates = participationEntries.map(e => e.date).sort();
  document.getElementById("overall-range").textContent =
    allDates.length ? `Since ${shortDate(parseDate(allDates[0]))}` : "";

  const coldCallTotal = participationEntries.filter(e => e.type === "Cold-call").length;
  const voluntaryTotal = participationEntries.filter(e => e.type === "Voluntary").length;

  document.getElementById("overall-stats").innerHTML =
    statTile(participationEntries.length, "Total entries") +
    statTile(allClasses.length, "Classes tracked") +
    statTile(coldCallTotal, "Cold-calls") +
    statTile(voluntaryTotal, "Voluntary");

  // Weekly trend across all history
  const weekMap = new Map();
  participationEntries.forEach(e => {
    const wk = fmtISO(startOfWeek(parseDate(e.date)));
    weekMap.set(wk, (weekMap.get(wk) || 0) + 1);
  });
  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([wk, total]) => ({ label: shortDate(parseDate(wk)), total }));

  renderTrendChart(document.getElementById("trend-chart"), weeks);

  // Breakdown by class table
  renderClassBreakdown(document.getElementById("class-breakdown"), participationEntries, allClasses);
}

document.getElementById("view-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const view = btn.dataset.view;
  document.querySelectorAll(".tab-btn").forEach(b => {
    if (b === btn) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  document.getElementById("view-week").hidden = view !== "week";
  document.getElementById("view-overall").hidden = view !== "overall";
});

render();
window.addEventListener("storage", render);
