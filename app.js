const STORAGE_KEY = "hbs-participation-log";

const form = document.getElementById("entry-form");
const dateInput = document.getElementById("date");
const classInput = document.getElementById("class-name");
const notesInput = document.getElementById("notes");
const subtypeField = document.getElementById("subtype-field");
const subtypeSelect = document.getElementById("subtype");
const classOptions = document.getElementById("class-options");
const filterClass = document.getElementById("filter-class");
const filterType = document.getElementById("filter-type");
const logBody = document.getElementById("log-body");
const emptyState = document.getElementById("empty-state");
const statsEl = document.getElementById("stats");
const exportBtn = document.getElementById("export-btn");

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function typeLabel(entry) {
  if (entry.type === "Voluntary" && entry.subtype) {
    return `Voluntary – ${entry.subtype}`;
  }
  return entry.type;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function render() {
  const entries = loadEntries();
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const classes = [...new Set(entries.map(e => e.className))].sort();
  const currentClassFilter = filterClass.value;
  filterClass.innerHTML = '<option value="">All classes</option>' +
    classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  filterClass.value = classes.includes(currentClassFilter) ? currentClassFilter : "";

  classOptions.innerHTML = classes.map(c => `<option value="${escapeHtml(c)}">`).join("");

  const activeClass = filterClass.value;
  const activeType = filterType.value;
  const filtered = sorted.filter(e =>
    (!activeClass || e.className === activeClass) &&
    (!activeType || e.type === activeType)
  );

  logBody.innerHTML = filtered.map(e => `
    <tr>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.className)}</td>
      <td><span class="badge ${e.type === "Cold-call" ? "coldcall" : "voluntary"}">${escapeHtml(typeLabel(e))}</span></td>
      <td>${escapeHtml(e.notes || "")}</td>
      <td><button class="btn small" data-delete="${e.id}">Delete</button></td>
    </tr>
  `).join("");

  emptyState.hidden = filtered.length > 0;

  renderStats(entries);
}

function renderStats(entries) {
  const total = entries.length;
  const coldCalls = entries.filter(e => e.type === "Cold-call").length;
  const voluntary = entries.filter(e => e.type === "Voluntary").length;
  const subtypeCounts = { "Superficial": 0, "Quality comment": 0, "Calculation walkthrough": 0 };
  entries.forEach(e => {
    if (e.type === "Voluntary" && subtypeCounts.hasOwnProperty(e.subtype)) {
      subtypeCounts[e.subtype]++;
    }
  });

  statsEl.innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="label">Total entries</div></div>
    <div class="stat"><div class="num">${coldCalls}</div><div class="label">Cold-calls</div></div>
    <div class="stat"><div class="num">${voluntary}</div><div class="label">Voluntary</div></div>
    <div class="stat"><div class="num">${subtypeCounts["Superficial"]}</div><div class="label">Superficial</div></div>
    <div class="stat"><div class="num">${subtypeCounts["Quality comment"]}</div><div class="label">Quality comment</div></div>
    <div class="stat"><div class="num">${subtypeCounts["Calculation walkthrough"]}</div><div class="label">Calc. walkthrough</div></div>
  `;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = form.querySelector('input[name="type"]:checked').value;
  const subtype = type === "Voluntary" ? subtypeSelect.value : "";

  if (type === "Voluntary" && !subtype) {
    subtypeSelect.focus();
    return;
  }

  const entries = loadEntries();
  entries.push({
    id: Date.now(),
    date: dateInput.value,
    className: classInput.value.trim(),
    type,
    subtype,
    notes: notesInput.value.trim(),
  });
  saveEntries(entries);

  const keepClass = classInput.value;
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  classInput.value = keepClass;
  subtypeField.hidden = true;
  render();
});

form.querySelectorAll('input[name="type"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const isVoluntary = form.querySelector('input[name="type"]:checked').value === "Voluntary";
    subtypeField.hidden = !isVoluntary;
    subtypeSelect.required = isVoluntary;
  });
});

logBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-delete]");
  if (!btn) return;
  const id = Number(btn.dataset.delete);
  const entries = loadEntries().filter(entry => entry.id !== id);
  saveEntries(entries);
  render();
});

filterClass.addEventListener("change", render);
filterType.addEventListener("change", render);

exportBtn.addEventListener("click", () => {
  const entries = loadEntries();
  const header = ["Date", "Class", "Type", "Subtype", "Notes"];
  const rows = entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => [e.date, e.className, e.type, e.subtype || "", e.notes || ""]);

  const csv = [header, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hbs-participation-log.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

dateInput.value = new Date().toISOString().slice(0, 10);
render();
