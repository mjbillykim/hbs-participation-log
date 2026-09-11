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
      weekEntries.some(e => e.className === cls && e.date === h.iso)
    );
    return { cls, cells, total: cells.filter(Boolean).length };
  }).sort((a, b) => b.total - a.total || a.cls.localeCompare(b.cls));

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
            ${r.cells.map(spoke => `<td class="heat-cell ${spoke ? "heat-yes" : "heat-no"}">${spoke ? "✓" : ""}</td>`).join("")}
          </tr>`).join("")}
      </tbody>
    </table>`;
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
    <span class="legend-item"><span class="heat-swatch heat-no"></span>Didn't speak</span>
    <span class="legend-item"><span class="heat-swatch heat-yes"></span>Spoke</span>
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
