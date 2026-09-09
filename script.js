/* =========================================================
   SMART EXPENSE TRACKER
   Vanilla JS. No build step, no dependencies, no server.
   All data lives in localStorage on this device.
   ========================================================= */

(function () {
  "use strict";

  /* ================= CONSTANTS ================= */

  var STORAGE_KEY = "smart-expense-tracker/v1";
  var PAGE_SIZE = 10;

  var CURRENCIES = {
    INR: { sym: "₹", loc: "en-IN" },
    USD: { sym: "$", loc: "en-US" },
    EUR: { sym: "€", loc: "de-DE" },
    GBP: { sym: "£", loc: "en-GB" },
    JPY: { sym: "¥", loc: "ja-JP" },
    AUD: { sym: "A$", loc: "en-AU" },
    CAD: { sym: "C$", loc: "en-CA" },
    SGD: { sym: "S$", loc: "en-SG" },
    ZAR: { sym: "R", loc: "en-ZA" },
    BRL: { sym: "R$", loc: "pt-BR" }
  };

  var ICONS = [
    "fa-utensils", "fa-bus", "fa-bag-shopping", "fa-book", "fa-bolt",
    "fa-heart-pulse", "fa-film", "fa-house", "fa-car", "fa-plane",
    "fa-mug-hot", "fa-dumbbell", "fa-gift", "fa-shirt", "fa-paw",
    "fa-graduation-cap", "fa-wifi", "fa-phone", "fa-briefcase",
    "fa-laptop-code", "fa-chart-line", "fa-piggy-bank", "fa-hand-holding-dollar",
    "fa-basket-shopping", "fa-ellipsis"
  ];

  var DEFAULT_CATEGORIES = [
    { id: "food", name: "Food", color: "#df911e", icon: "fa-utensils", kind: "expense" },
    { id: "travel", name: "Travel", color: "#2476c8", icon: "fa-bus", kind: "expense" },
    { id: "shopping", name: "Shopping", color: "#d24c93", icon: "fa-bag-shopping", kind: "expense" },
    { id: "education", name: "Education", color: "#48a66e", icon: "fa-book", kind: "expense" },
    { id: "bills", name: "Bills", color: "#7955c5", icon: "fa-bolt", kind: "expense" },
    { id: "health", name: "Health", color: "#e05c5c", icon: "fa-heart-pulse", kind: "expense" },
    { id: "entertainment", name: "Entertainment", color: "#38a3a5", icon: "fa-film", kind: "expense" },
    { id: "others", name: "Others", color: "#687684", icon: "fa-ellipsis", kind: "expense" },
    { id: "salary", name: "Salary", color: "#159a63", icon: "fa-briefcase", kind: "income" },
    { id: "freelance", name: "Freelance", color: "#2876d8", icon: "fa-laptop-code", kind: "income" },
    { id: "investment", name: "Investment", color: "#7955c5", icon: "fa-chart-line", kind: "income" },
    { id: "otherincome", name: "Other Income", color: "#687684", icon: "fa-hand-holding-dollar", kind: "income" }
  ];

  var DEFAULT_SETTINGS = {
    name: "Friend",
    currency: "INR",
    theme: "system",
    range: 6,
    defaultLimit: 15000,
    limits: {}
  };

  var ROUTES = ["dashboard", "add", "transactions", "reports", "categories", "settings"];
  var TITLES = {
    dashboard: "Dashboard",
    add: "Add Expense",
    transactions: "Transactions",
    reports: "Reports",
    categories: "Categories",
    settings: "Settings"
  };

  /* ================= STATE ================= */

  var state = {
    transactions: [],
    categories: [],
    settings: Object.assign({}, DEFAULT_SETTINGS, { limits: {} }),
    ui: {
      route: "dashboard",
      filters: { q: "", type: "all", category: "all", month: "all", sort: "date-desc" },
      page: 1,
      reportMonth: null,
      formType: { quick: "expense", full: "expense" }
    }
  };

  var storageWorks = true;
  var uidCounter = 0;

  /* ================= TINY HELPERS ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function uid() {
    uidCounter += 1;
    return "t" + Date.now().toString(36) + uidCounter.toString(36);
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function round2(n) { return Math.round(n * 100) / 100; }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function isoOf(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function parseISO(s) {
    var parts = String(s).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function validISO(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    var d = parseISO(s);
    return !isNaN(d.getTime()) && isoOf(d) === s;
  }

  function todayISO() { return isoOf(new Date()); }
  function currentMonth() { return todayISO().slice(0, 7); }
  function monthOf(isoDate) { return String(isoDate).slice(0, 7); }

  function addMonths(ym, delta) {
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7)) - 1 + delta;
    var d = new Date(y, m, 1);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }

  function daysInMonth(ym) {
    return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  }

  function locale() {
    var c = CURRENCIES[state.settings.currency] || CURRENCIES.INR;
    return c.loc;
  }

  function symbol() {
    var c = CURRENCIES[state.settings.currency] || CURRENCIES.INR;
    return c.sym;
  }

  function money(n) {
    var value = Number(n) || 0;
    var whole = Math.abs(value % 1) < 0.005;
    try {
      return new Intl.NumberFormat(locale(), {
        style: "currency",
        currency: state.settings.currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2
      }).format(value);
    } catch (e) {
      return symbol() + value.toFixed(whole ? 0 : 2);
    }
  }

  function compact(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return trimZero((n / 1e9).toFixed(1)) + "B";
    if (a >= 1e6) return trimZero((n / 1e6).toFixed(1)) + "M";
    if (a >= 1e3) return trimZero((n / 1e3).toFixed(a >= 1e4 ? 0 : 1)) + "K";
    return String(Math.round(n));
  }

  function trimZero(s) { return s.replace(/\.0$/, ""); }

  function monthLabel(ym, long) {
    var d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
    try {
      return d.toLocaleDateString(locale(), { month: long ? "long" : "short", year: "numeric" });
    } catch (e) {
      return ym;
    }
  }

  function dateLabel(isoDate) {
    try {
      return parseISO(isoDate).toLocaleDateString(locale(), {
        month: "short", day: "numeric", year: "numeric"
      });
    } catch (e) {
      return isoDate;
    }
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return (part / whole) * 100;
  }

  function niceMax(value) {
    if (!value || value <= 0) return 100;
    var exp = Math.floor(Math.log10(value));
    var base = Math.pow(10, exp);
    var n = value / base;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * base;
  }

  /* ================= PERSISTENCE ================= */

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageWorks = false;
    }

    if (!raw) {
      state.categories = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
      state.transactions = sampleData();
      save();
      return;
    }

    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      data = null;
    }

    if (!data || typeof data !== "object") {
      state.categories = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
      state.transactions = [];
      return;
    }

    state.categories = sanitizeCategories(data.categories);
    state.transactions = sanitizeTransactions(data.transactions);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    state.settings.limits = (data.settings && data.settings.limits) || {};
    if (!CURRENCIES[state.settings.currency]) state.settings.currency = "INR";
  }

  function save() {
    if (!storageWorks) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        transactions: state.transactions,
        categories: state.categories,
        settings: state.settings
      }));
    } catch (e) {
      storageWorks = false;
      toast("Couldn't save — storage is unavailable in this browser.", "err");
    }
  }

  function sanitizeCategories(list) {
    var out = [];
    var seen = {};
    if (Array.isArray(list)) {
      list.forEach(function (c) {
        if (!c || typeof c.name !== "string" || !c.name.trim()) return;
        var id = String(c.id || slug(c.name));
        if (!id || seen[id]) return;
        seen[id] = true;
        out.push({
          id: id,
          name: c.name.trim().slice(0, 24),
          color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#687684",
          icon: ICONS.indexOf(c.icon) >= 0 ? c.icon : "fa-ellipsis",
          kind: c.kind === "income" ? "income" : "expense"
        });
      });
    }
    if (!out.length) return DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
    // Guarantee at least one category of each kind so the form is always usable.
    if (!out.some(function (c) { return c.kind === "expense"; })) out.push(Object.assign({}, DEFAULT_CATEGORIES[7]));
    if (!out.some(function (c) { return c.kind === "income"; })) out.push(Object.assign({}, DEFAULT_CATEGORIES[11]));
    return out;
  }

  function sanitizeTransactions(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (t) {
      if (!t || typeof t !== "object") return;
      var amount = Number(t.amount);
      if (!isFinite(amount) || amount <= 0) return;
      if (!validISO(t.date)) return;
      var name = String(t.name || "").trim().slice(0, 60);
      if (!name) return;
      out.push({
        id: String(t.id || uid()),
        date: t.date,
        name: name,
        category: String(t.category || "others"),
        type: t.type === "income" ? "income" : "expense",
        amount: round2(amount),
        note: String(t.note || "").slice(0, 80)
      });
    });
    return out;
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "cat" + uid();
  }

  /* ================= SAMPLE DATA ================= */

  function sampleData() {
    var out = [];
    var seed = 20250419;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    function mk(date, name, category, type, amount, note) {
      out.push({
        id: uid(), date: date, name: name, category: category,
        type: type, amount: amount, note: note || ""
      });
    }

    var specs = [
      { cat: "food", names: ["Zomato", "Swiggy", "Groceries", "Coffee", "Dinner out"], min: 120, max: 1300 },
      { cat: "travel", names: ["Bus Ticket", "Metro Card", "Cab ride", "Fuel"], min: 60, max: 900 },
      { cat: "shopping", names: ["T-shirt", "Headphones", "Running shoes", "Gift"], min: 300, max: 3200 },
      { cat: "bills", names: ["Electricity Bill", "Internet", "Mobile Recharge", "Water Bill"], min: 300, max: 1900 },
      { cat: "education", names: ["Book Purchase", "Online Course", "Stationery"], min: 200, max: 2600 },
      { cat: "entertainment", names: ["Movie Night", "Music subscription", "Concert"], min: 150, max: 1600 },
      { cat: "health", names: ["Pharmacy", "Doctor Visit", "Gym membership"], min: 200, max: 2100 }
    ];

    var now = new Date();
    for (var back = 5; back >= 0; back--) {
      var d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      var y = d.getFullYear();
      var m = d.getMonth();
      var dim = new Date(y, m + 1, 0).getDate();
      var lastDay = back === 0 ? Math.min(dim, now.getDate()) : dim;

      mk(isoOf(new Date(y, m, 1)), "Monthly Salary", "salary", "income",
        32000 + Math.round((rnd() * 4000) / 500) * 500);

      if (rnd() > 0.4 && lastDay > 14) {
        mk(isoOf(new Date(y, m, 14 + Math.floor(rnd() * Math.max(1, lastDay - 14)))),
          "Freelance Work", "freelance", "income",
          3000 + Math.round((rnd() * 5000) / 500) * 500);
      }

      var count = 9 + Math.floor(rnd() * 7);
      for (var i = 0; i < count; i++) {
        var s = pick(specs);
        var day = 1 + Math.floor(rnd() * lastDay);
        mk(isoOf(new Date(y, m, day)), pick(s.names), s.cat, "expense",
          Math.round((s.min + rnd() * (s.max - s.min)) / 10) * 10);
      }
    }

    return out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  /* ================= SELECTORS ================= */

  function catById(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) return state.categories[i];
    }
    return { id: id, name: "Uncategorised", color: "#687684", icon: "fa-ellipsis", kind: "expense" };
  }

  function catsOfKind(kind) {
    return state.categories.filter(function (c) { return c.kind === kind; });
  }

  function totals(list) {
    var income = 0, expense = 0;
    list.forEach(function (t) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    });
    return { income: income, expense: expense, net: income - expense };
  }

  function inMonth(ym) {
    return state.transactions.filter(function (t) { return monthOf(t.date) === ym; });
  }

  function monthKeys(count) {
    var keys = [];
    var cur = currentMonth();
    for (var i = count - 1; i >= 0; i--) keys.push(addMonths(cur, -i));
    return keys;
  }

  function allMonths() {
    var set = {};
    state.transactions.forEach(function (t) { set[monthOf(t.date)] = true; });
    set[currentMonth()] = true;
    return Object.keys(set).sort().reverse();
  }

  function categoryTotals(list, kind) {
    var map = {};
    list.forEach(function (t) {
      if (t.type !== kind) return;
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.keys(map)
      .map(function (id) {
        var c = catById(id);
        return { id: id, name: c.name, color: c.color, icon: c.icon, total: map[id] };
      })
      .sort(function (a, b) { return b.total - a.total; });
  }

  function limitFor(ym) {
    var v = state.settings.limits[ym];
    if (v === undefined || v === null || v === "") return Number(state.settings.defaultLimit) || 0;
    return Number(v) || 0;
  }

  /* ================= FILTERING ================= */

  function filtered() {
    var f = state.ui.filters;
    var q = f.q.trim().toLowerCase();

    var list = state.transactions.filter(function (t) {
      if (f.type !== "all" && t.type !== f.type) return false;
      if (f.category !== "all" && t.category !== f.category) return false;
      if (f.month !== "all" && monthOf(t.date) !== f.month) return false;
      if (q) {
        var hay = (t.name + " " + catById(t.category).name + " " + t.note).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var sorters = {
      "date-desc": function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; },
      "date-asc": function (a, b) { return a.date > b.date ? 1 : a.date < b.date ? -1 : 0; },
      "amount-desc": function (a, b) { return b.amount - a.amount; },
      "amount-asc": function (a, b) { return a.amount - b.amount; },
      "name-asc": function (a, b) { return a.name.localeCompare(b.name); }
    };

    return list.sort(sorters[f.sort] || sorters["date-desc"]);
  }

  /* ================= TOASTS ================= */

  function toast(message, tone, actionLabel, onAction) {
    var host = $("#toastHost");
    var el = document.createElement("div");
    el.className = "toast" + (tone ? " " + tone : "");

    var span = document.createElement("span");
    span.textContent = message;
    el.appendChild(span);

    var timer;
    function dismiss() {
      window.clearTimeout(timer);
      el.classList.add("leaving");
      window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }

    if (actionLabel && onAction) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = actionLabel;
      btn.addEventListener("click", function () { onAction(); dismiss(); });
      el.appendChild(btn);
    }

    host.appendChild(el);
    timer = window.setTimeout(dismiss, actionLabel ? 7000 : 3200);
  }

  /* ================= MODAL ================= */

  var lastFocused = null;

  function openModal(title, bodyHTML, onReady) {
    lastFocused = document.activeElement;
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHTML;
    $("#modalHost").hidden = false;
    if (onReady) onReady($("#modalBody"));
    var focusable = $("input, select, textarea, button", $("#modalBody"));
    if (focusable) focusable.focus();
  }

  function closeModal() {
    $("#modalHost").hidden = true;
    $("#modalBody").innerHTML = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  function confirmModal(title, message, confirmLabel, danger, onConfirm) {
    openModal(title,
      '<p>' + message + '</p>' +
      '<div class="btn-row" style="justify-content:flex-end;margin-bottom:0">' +
      '<button class="btn ghost" type="button" data-close>Cancel</button>' +
      '<button class="btn ' + (danger ? "danger" : "") + '" type="button" id="confirmYes">' +
      esc(confirmLabel) + '</button></div>',
      function (body) {
        $("#confirmYes", body).addEventListener("click", function () {
          closeModal();
          onConfirm();
        });
      });
  }

  /* ================= FORM COMPONENT ================= */

  function formHTML(prefix, opts) {
    opts = opts || {};
    var tx = opts.tx;
    var type = tx ? tx.type : state.ui.formType[prefix] || "expense";
    var withNote = opts.withNote !== false;

    return '' +
      '<form class="tx-form" data-prefix="' + prefix + '" ' +
      (tx ? 'data-id="' + esc(tx.id) + '" ' : "") + 'novalidate>' +
        '<div class="segmented" role="group" aria-label="Transaction type">' +
          '<button type="button" data-type="expense" aria-pressed="' + (type === "expense") + '">' +
            '<i class="fa-solid fa-arrow-trend-down"></i>Expense</button>' +
          '<button type="button" data-type="income" aria-pressed="' + (type === "income") + '">' +
            '<i class="fa-solid fa-arrow-trend-up"></i>Income</button>' +
        '</div>' +
        '<input type="hidden" name="type" value="' + type + '">' +

        '<label for="' + prefix + '-name">Description</label>' +
        '<input id="' + prefix + '-name" name="name" type="text" autocomplete="off" maxlength="60" ' +
          'placeholder="e.g. Groceries, Bus ticket" value="' + esc(tx ? tx.name : "") + '">' +
        '<p class="field-error" data-error="name" hidden></p>' +

        '<div class="form-row">' +
          '<div>' +
            '<label for="' + prefix + '-amount">Amount</label>' +
            '<div class="amount-input"><span data-symbol>' + esc(symbol()) + '</span>' +
            '<input id="' + prefix + '-amount" name="amount" type="number" min="0" step="0.01" ' +
              'inputmode="decimal" placeholder="0" value="' + (tx ? tx.amount : "") + '"></div>' +
            '<p class="field-error" data-error="amount" hidden></p>' +
          '</div>' +
          '<div>' +
            '<label for="' + prefix + '-category">Category</label>' +
            '<select id="' + prefix + '-category" name="category">' +
              categoryOptions(type, tx ? tx.category : null) +
            '</select>' +
          '</div>' +
        '</div>' +

        '<label for="' + prefix + '-date">Date</label>' +
        '<input id="' + prefix + '-date" name="date" type="date" value="' +
          esc(tx ? tx.date : todayISO()) + '" max="2999-12-31">' +
        '<p class="field-error" data-error="date" hidden></p>' +

        (withNote
          ? '<label for="' + prefix + '-note">Note <span style="color:var(--faint)">(optional)</span></label>' +
            '<input id="' + prefix + '-note" name="note" type="text" maxlength="80" ' +
            'placeholder="Anything worth remembering" value="' + esc(tx ? tx.note : "") + '">'
          : "") +

        '<button class="btn full" type="submit"><i class="fa-solid fa-' +
          (tx ? "check" : "plus") + '"></i>' + (tx ? "Save changes" : "Add transaction") + '</button>' +
      '</form>';
  }

  function categoryOptions(kind, selected) {
    return catsOfKind(kind).map(function (c) {
      return '<option value="' + esc(c.id) + '"' +
        (c.id === selected ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
  }

  function showError(form, field, message) {
    var box = $('[data-error="' + field + '"]', form);
    var input = form.elements[field];
    if (box) {
      box.textContent = message || "";
      box.hidden = !message;
    }
    if (input && input.classList) input.classList.toggle("invalid", !!message);
  }

  function submitTx(form) {
    var name = String(form.elements.name.value || "").trim();
    var amount = Number(form.elements.amount.value);
    var date = form.elements.date.value;
    var type = form.elements.type.value === "income" ? "income" : "expense";
    var category = form.elements.category.value;
    var note = form.elements.note ? String(form.elements.note.value || "").trim() : "";

    var ok = true;
    showError(form, "name", "");
    showError(form, "amount", "");
    showError(form, "date", "");

    if (!name) { showError(form, "name", "Give it a description."); ok = false; }
    if (!isFinite(amount) || amount <= 0) {
      showError(form, "amount", "Enter an amount greater than zero.");
      ok = false;
    } else if (amount > 1e12) {
      showError(form, "amount", "That amount is too large.");
      ok = false;
    }
    if (!validISO(date)) { showError(form, "date", "Pick a valid date."); ok = false; }

    if (!ok) {
      var firstBad = $(".invalid", form);
      if (firstBad) firstBad.focus();
      return;
    }

    var editingId = form.getAttribute("data-id");

    if (editingId) {
      state.transactions.forEach(function (t) {
        if (t.id !== editingId) return;
        t.name = name.slice(0, 60);
        t.amount = round2(amount);
        t.date = date;
        t.type = type;
        t.category = category;
        t.note = note.slice(0, 80);
      });
      save();
      closeModal();
      toast("Transaction updated.", "ok");
      render();
      return;
    }

    state.transactions.push({
      id: uid(),
      date: date,
      name: name.slice(0, 60),
      category: category,
      type: type,
      amount: round2(amount),
      note: note.slice(0, 80)
    });
    save();

    var prefix = form.getAttribute("data-prefix");
    form.reset();
    form.elements.date.value = todayISO();
    form.elements.type.value = state.ui.formType[prefix] || "expense";
    toast((type === "income" ? "Income" : "Expense") + " of " + money(amount) + " added.", "ok");
    render();

    var nameField = form.elements.name;
    if (nameField) nameField.focus();
  }

  function deleteTx(id) {
    var index = -1;
    for (var i = 0; i < state.transactions.length; i++) {
      if (state.transactions[i].id === id) { index = i; break; }
    }
    if (index === -1) return;

    var removed = state.transactions[index];
    state.transactions.splice(index, 1);
    save();
    render();

    toast('Deleted "' + removed.name + '".', null, "Undo", function () {
      state.transactions.splice(Math.min(index, state.transactions.length), 0, removed);
      save();
      render();
      toast("Restored.", "ok");
    });
  }

  function editTx(id) {
    var tx = null;
    state.transactions.forEach(function (t) { if (t.id === id) tx = t; });
    if (!tx) return;
    openModal("Edit transaction", formHTML("edit", { tx: tx }));
  }

  /* ================= RENDER: CHROME ================= */

  function render() {
    renderChrome();

    ROUTES.forEach(function (r) {
      var view = $('[data-view="' + r + '"]');
      if (view) view.hidden = r !== state.ui.route;
    });

    if (state.ui.route === "dashboard") renderDashboard();
    else if (state.ui.route === "add") renderAdd();
    else if (state.ui.route === "transactions") renderTransactions();
    else if (state.ui.route === "reports") renderReports();
    else if (state.ui.route === "categories") renderCategories();
    else if (state.ui.route === "settings") renderSettings();
  }

  function renderChrome() {
    var name = state.settings.name || "Friend";
    $("#pageTitle").textContent = TITLES[state.ui.route] || "Dashboard";
    $("#userLabel").textContent = name;
    $("#avatar").textContent = name.trim().charAt(0).toUpperCase() || "?";
    $("#dashName").textContent = name;
    $("#menuCount").textContent = String(state.transactions.length);

    try {
      $("#todayLabel").textContent = new Date().toLocaleDateString(locale(), {
        month: "short", day: "numeric", year: "numeric"
      });
    } catch (e) {
      $("#todayLabel").textContent = todayISO();
    }

    $$("#menu .menu-item").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === state.ui.route);
      if (a.getAttribute("data-route") === state.ui.route) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    var icon = $("#themeToggle i");
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    icon.className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }

  /* ================= RENDER: DASHBOARD ================= */

  function renderDashboard() {
    var ym = currentMonth();
    var thisMonth = inMonth(ym);
    var prevMonth = inMonth(addMonths(ym, -1));
    var t = totals(thisMonth);
    var p = totals(prevMonth);
    var all = totals(state.transactions);
    var savingsRate = t.income > 0 ? (t.net / t.income) * 100 : 0;

    $("#dashSub").textContent = thisMonth.length
      ? "You have " + thisMonth.length + " transaction" + (thisMonth.length === 1 ? "" : "s") +
        " recorded in " + monthLabel(ym, true) + "."
      : "Nothing logged for " + monthLabel(ym, true) + " yet — add your first entry below.";

    $("#summaryCards").innerHTML = [
      card("balance", "fa-wallet", "Total Balance", money(all.net),
        all.net >= 0 ? "Across all time" : "You're in the red overall", null),
      card("income", "fa-download", "Income This Month", money(t.income),
        null, delta(t.income, p.income, true)),
      card("expense", "fa-arrow-up", "Expenses This Month", money(t.expense),
        null, delta(t.expense, p.expense, false)),
      card("savings", "fa-piggy-bank", "Saved This Month", money(t.net),
        t.income > 0 ? Math.round(savingsRate) + "% of income kept" : "No income logged yet", null)
    ].join("");

    renderBarChart();
    renderDonut(thisMonth, ym);
    renderBudget(ym, t.expense);

    var recent = state.transactions.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    }).slice(0, 6);

    $("#recentTable").innerHTML = recent.length
      ? txTable(recent, false)
      : emptyState("fa-receipt", "No transactions yet",
        "Add one with the form on the right and it'll show up here.");

    if ($("#quickFormSlot").children.length === 0) {
      $("#quickFormSlot").innerHTML = formHTML("quick", { withNote: false });
    }
  }

  function card(kind, icon, label, value, footNote, deltaHTML) {
    return '<div class="card ' + kind + '">' +
      '<div class="card-icon"><i class="fa-solid ' + icon + '"></i></div>' +
      '<p>' + esc(label) + "</p>" +
      "<h2>" + esc(value) + "</h2>" +
      (deltaHTML || '<span class="growth">' + esc(footNote || "") + "</span>") +
      "</div>";
  }

  function delta(now, before, upIsGood) {
    if (!before) {
      return '<span class="growth">' +
        (now ? "No comparison for last month" : "Nothing logged yet") + "</span>";
    }
    var change = ((now - before) / before) * 100;
    var up = change >= 0;
    var good = up === upIsGood;
    return '<span class="growth ' + (Math.abs(change) < 0.5 ? "" : good ? "up" : "down") + '">' +
      '<i class="fa-solid fa-arrow-' + (up ? "up" : "down") + '"></i>' +
      Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0) + "% from last month</span>";
  }

  /* ================= CHART: BARS ================= */

  function renderBarChart() {
    var count = Number(state.settings.range) || 6;
    var keys = monthKeys(count);

    var rows = keys.map(function (ym) {
      return { ym: ym, data: totals(inMonth(ym)) };
    });

    var peak = 0;
    rows.forEach(function (r) {
      peak = Math.max(peak, r.data.income, r.data.expense);
    });

    var max = niceMax(peak);
    var ticks = [];
    for (var i = 4; i >= 0; i--) ticks.push(compact((max / 4) * i));

    var bars = rows.map(function (r) {
      var ih = max ? clamp((r.data.income / max) * 100, 0, 100) : 0;
      var eh = max ? clamp((r.data.expense / max) * 100, 0, 100) : 0;
      return '<div class="month">' +
        '<div class="bar-group">' +
          '<div class="bar income-bar" style="height:' + ih.toFixed(1) + '%" title="' +
            esc(monthLabel(r.ym) + " income: " + money(r.data.income)) + '"></div>' +
          '<div class="bar expense-bar" style="height:' + eh.toFixed(1) + '%" title="' +
            esc(monthLabel(r.ym) + " expenses: " + money(r.data.expense)) + '"></div>' +
        '</div>' +
        "<span>" + esc(monthLabel(r.ym).split(" ")[0]) + "</span>" +
        "</div>";
    }).join("");

    $("#barChart").innerHTML =
      '<div class="y-axis">' + ticks.map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div>" +
      '<div class="bars">' + bars + "</div>";
  }

  /* ================= CHART: DONUT ================= */

  function renderDonut(list, ym) {
    var cats = categoryTotals(list, "expense");
    var total = cats.reduce(function (s, c) { return s + c.total; }, 0);

    $("#donutSub").textContent = monthLabel(ym, true);

    if (!total) {
      $("#donutChart").innerHTML = emptyState("fa-chart-pie", "No expenses this month",
        "Once you log spending, the split shows up here.");
      return;
    }

    var R = 54;
    var C = 2 * Math.PI * R;
    var offset = 0;

    var segs = cats.map(function (c) {
      var share = c.total / total;
      var len = share * C;
      var seg = '<circle class="seg" cx="70" cy="70" r="' + R + '" ' +
        'stroke="' + esc(c.color) + '" ' +
        'stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" ' +
        'data-cat="' + esc(c.id) + '">' +
        "<title>" + esc(c.name + " — " + money(c.total) + " (" + Math.round(share * 100) + "%)") +
        "</title></circle>";
      offset += len;
      return seg;
    }).join("");

    var legend = cats.map(function (c) {
      return "<div data-cat=\"" + esc(c.id) + "\">" +
        '<span><i class="dot" style="background:' + esc(c.color) + '"></i>' + esc(c.name) + "</span>" +
        "<b>" + esc(money(c.total)) + "</b>" +
        "<small>" + Math.round(pct(c.total, total)) + "%</small>" +
        "</div>";
    }).join("");

    $("#donutChart").innerHTML =
      '<div class="donut-wrap" id="donutWrap">' +
        '<svg viewBox="0 0 140 140" role="img" aria-label="Expenses by category">' +
          '<circle cx="70" cy="70" r="' + R + '" stroke="var(--border)"></circle>' + segs +
        "</svg>" +
        '<div class="donut-center" id="donutCenter">' +
          "<strong>" + esc(money(total)) + "</strong><small>Total Expenses</small>" +
        "</div>" +
      "</div>" +
      '<div class="category-list">' + legend + "</div>";

    wireDonut(cats, total);
  }

  function wireDonut(cats, total) {
    var wrap = $("#donutWrap");
    var center = $("#donutCenter");
    if (!wrap || !center) return;

    var base = "<strong>" + esc(money(total)) + "</strong><small>Total Expenses</small>";

    function highlight(id) {
      if (!id) {
        wrap.classList.remove("dim");
        center.innerHTML = base;
        $$(".category-list > div").forEach(function (d) { d.style.opacity = ""; });
        return;
      }
      var match = null;
      cats.forEach(function (c) { if (c.id === id) match = c; });
      if (!match) return;
      wrap.classList.add("dim");
      center.innerHTML = "<strong>" + esc(money(match.total)) + "</strong><small>" +
        esc(match.name) + " · " + Math.round(pct(match.total, total)) + "%</small>";
      $$(".category-list > div").forEach(function (d) {
        d.style.opacity = d.getAttribute("data-cat") === id ? "1" : "0.4";
      });
    }

    $$("circle.seg", wrap).forEach(function (c) {
      c.addEventListener("mouseenter", function () { highlight(c.getAttribute("data-cat")); });
      c.addEventListener("mouseleave", function () { highlight(null); });
    });

    $$(".category-list > div").forEach(function (row) {
      row.addEventListener("mouseenter", function () { highlight(row.getAttribute("data-cat")); });
      row.addEventListener("mouseleave", function () { highlight(null); });
    });
  }

  /* ================= BUDGET ================= */

  function renderBudget(ym, spent) {
    var limit = limitFor(ym);
    var input = $("#budgetInput");

    $("#budgetSymbol").textContent = symbol();
    $("#limitSymbol").textContent = symbol();
    if (document.activeElement !== input) input.value = limit ? limit : "";

    $("#budgetSpent").textContent = money(spent);

    var left = limit - spent;
    var leftEl = $("#budgetLeft");
    leftEl.textContent = limit ? money(Math.abs(left)) + (left < 0 ? " over" : "") : "—";
    leftEl.classList.toggle("over", limit > 0 && left < 0);

    var used = limit > 0 ? clamp((spent / limit) * 100, 0, 100) : 0;
    var bar = $("#budgetBar");
    bar.style.width = used + "%";
    bar.classList.toggle("warn", limit > 0 && spent / limit >= 0.8 && spent <= limit);
    bar.classList.toggle("over", limit > 0 && spent > limit);
    $("#budgetTrack").setAttribute("aria-valuenow", Math.round(used));

    var warn = $("#budgetWarning");
    if (!limit) {
      warn.hidden = false;
      warn.className = "warning";
      warn.innerHTML = '<i class="fa-solid fa-circle-info"></i>' +
        "Set a limit above to track how much of the month you've used.";
    } else if (spent > limit) {
      warn.hidden = false;
      warn.className = "warning over";
      warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>You are ' +
        esc(money(spent - limit)) + " over your " + esc(monthLabel(ym, true)) + " budget.";
    } else if (spent / limit >= 0.8) {
      warn.hidden = false;
      warn.className = "warning";
      warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>' +
        "You've used " + Math.round((spent / limit) * 100) + "% of this month's budget.";
    } else {
      var days = daysInMonth(ym);
      var dayNow = ym === currentMonth() ? new Date().getDate() : days;
      var perDay = (limit - spent) / Math.max(1, days - dayNow + 1);
      warn.hidden = false;
      warn.className = "warning";
      warn.innerHTML = '<i class="fa-solid fa-circle-check"></i>On track — about ' +
        esc(money(perDay)) + " a day for the rest of the month.";
    }
  }

  /* ================= RENDER: ADD ================= */

  // Descriptions the user records repeatedly, most frequent first. Powers the
  // "Add again" chips — the last entry wins for category and amount.
  function frequentEntries(limit) {
    var map = {};
    state.transactions.forEach(function (t) {
      var key = t.type + "|" + t.name.toLowerCase();
      if (!map[key]) {
        map[key] = { name: t.name, type: t.type, category: t.category, amount: t.amount, count: 0, last: "" };
      }
      var e = map[key];
      e.count += 1;
      if (t.date >= e.last) {
        e.last = t.date;
        e.name = t.name;
        e.category = t.category;
        e.amount = t.amount;
      }
    });

    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .filter(function (e) { return e.count > 1; })
      .sort(function (a, b) { return b.count - a.count || (a.last < b.last ? 1 : -1); })
      .slice(0, limit);
  }

  var chipCache = [];

  function fillForm(form, entry) {
    if (!form) return;
    var seg = $$('.segmented button', form);
    seg.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-type") === entry.type));
    });
    form.elements.type.value = entry.type;
    form.elements.category.innerHTML = categoryOptions(entry.type, entry.category);
    form.elements.name.value = entry.name;
    form.elements.amount.value = entry.amount;
    form.elements.date.value = todayISO();
    var prefix = form.getAttribute("data-prefix");
    if (prefix === "quick" || prefix === "full") state.ui.formType[prefix] = entry.type;
    showError(form, "name", "");
    showError(form, "amount", "");
    form.elements.amount.focus();
    form.elements.amount.select();
  }

  function renderAdd() {
    if ($("#fullFormSlot").children.length === 0) {
      $("#fullFormSlot").innerHTML = formHTML("full", { withNote: true });
    }

    chipCache = frequentEntries(6);
    $("#quickChipsWrap").hidden = chipCache.length === 0;
    $("#quickChips").innerHTML = chipCache.map(function (e, i) {
      var c = catById(e.category);
      return '<button class="chip" type="button" data-chip="' + i + '" ' +
        'title="' + esc("Used " + e.count + " times · last " + money(e.amount)) + '">' +
        '<i class="fa-solid ' + esc(c.icon) + '" style="color:' + esc(c.color) + '"></i>' +
        esc(e.name) + "</button>";
    }).join("");

    var recent = state.transactions.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    }).slice(0, 5);

    $("#addRecent").innerHTML = recent.length
      ? txTable(recent, true)
      : emptyState("fa-inbox", "Nothing here yet", "Your latest entries will appear in this list.");
  }

  /* ================= RENDER: TRANSACTIONS ================= */

  function renderTransactions() {
    var f = state.ui.filters;

    var catSel = $("#fCategory");
    catSel.innerHTML = '<option value="all">All categories</option>' +
      state.categories.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === f.category ? " selected" : "") +
          ">" + esc(c.name) + "</option>";
      }).join("");
    // A category may have been deleted since the filter was set.
    catSel.value = f.category;
    if (catSel.value !== f.category) {
      f.category = "all";
      catSel.value = "all";
    }

    var monthSel = $("#fMonth");
    monthSel.innerHTML = '<option value="all">All months</option>' +
      allMonths().map(function (m) {
        return '<option value="' + m + '"' + (m === f.month ? " selected" : "") +
          ">" + esc(monthLabel(m)) + "</option>";
      }).join("");
    monthSel.value = f.month;

    $("#fType").value = f.type;
    $("#fSort").value = f.sort;
    if (document.activeElement !== $("#fSearch")) $("#fSearch").value = f.q;

    var list = filtered();
    var sums = totals(list);

    $("#filterSummary").innerHTML =
      "<span><b>" + list.length + "</b> transaction" + (list.length === 1 ? "" : "s") + "</span>" +
      '<span>Income <b class="amount-green">' + esc(money(sums.income)) + "</b></span>" +
      '<span>Expenses <b class="amount-red">' + esc(money(sums.expense)) + "</b></span>" +
      "<span>Net <b>" + esc(money(sums.net)) + "</b></span>";

    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.ui.page = clamp(state.ui.page, 1, pages);
    var start = (state.ui.page - 1) * PAGE_SIZE;
    var slice = list.slice(start, start + PAGE_SIZE);

    if (!list.length) {
      $("#txTable").innerHTML = state.transactions.length
        ? emptyState("fa-filter-circle-xmark", "Nothing matches those filters",
          "Try widening your search or resetting the filters.")
        : emptyState("fa-receipt", "No transactions yet",
          "Head to Add Expense to record your first one.");
      $("#txPager").innerHTML = "";
      return;
    }

    $("#txTable").innerHTML = txTable(slice, true);

    $("#txPager").innerHTML =
      '<button type="button" data-page="prev"' + (state.ui.page === 1 ? " disabled" : "") +
        '><i class="fa-solid fa-chevron-left"></i></button>' +
      "<span>Page " + state.ui.page + " of " + pages + " · showing " +
        (start + 1) + "–" + Math.min(start + PAGE_SIZE, list.length) + " of " + list.length + "</span>" +
      '<button type="button" data-page="next"' + (state.ui.page === pages ? " disabled" : "") +
        '><i class="fa-solid fa-chevron-right"></i></button>';
  }

  function txTable(list, withActions) {
    var rows = list.map(function (t) {
      var c = catById(t.category);
      var income = t.type === "income";
      return "<tr>" +
        "<td>" + esc(dateLabel(t.date)) + "</td>" +
        '<td><span class="transaction-name">' +
          '<i class="fa-solid ' + esc(c.icon) + '" style="background:' + esc(c.color) +
            '22;color:' + esc(c.color) + '"></i>' +
          '<span class="tx-label">' + esc(t.name) +
            (t.note ? '<span class="tx-note">' + esc(t.note) + "</span>" : "") +
          "</span></span></td>" +
        "<td>" + esc(c.name) + "</td>" +
        '<td><span class="' + (income ? "income-label" : "expense-label") + '">' +
          (income ? "Income" : "Expense") + "</span></td>" +
        '<td class="' + (income ? "amount-green" : "amount-red") + '">' +
          (income ? "+ " : "- ") + esc(money(t.amount)) + "</td>" +
        (withActions
          ? '<td><div class="row-actions">' +
            '<button class="mini-btn" type="button" data-edit="' + esc(t.id) +
              '" aria-label="Edit ' + esc(t.name) + '"><i class="fa-solid fa-pen"></i></button>' +
            '<button class="mini-btn del" type="button" data-del="' + esc(t.id) +
              '" aria-label="Delete ' + esc(t.name) + '"><i class="fa-solid fa-trash"></i></button>' +
            "</div></td>"
          : "") +
        "</tr>";
    }).join("");

    return '<div class="table-wrapper"><table><thead><tr>' +
      "<th>Date</th><th>Description</th><th>Category</th><th>Type</th>" +
      '<th style="text-align:right">Amount</th>' + (withActions ? "<th></th>" : "") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function emptyState(icon, title, sub) {
    return '<div class="empty"><i class="fa-solid ' + icon + '"></i>' +
      "<p>" + esc(title) + "</p><small>" + esc(sub) + "</small></div>";
  }

  /* ================= RENDER: REPORTS ================= */

  function renderReports() {
    var months = allMonths();
    if (!state.ui.reportMonth || months.indexOf(state.ui.reportMonth) === -1) {
      state.ui.reportMonth = months[0] || currentMonth();
    }
    var ym = state.ui.reportMonth;

    $("#reportMonth").innerHTML = months.map(function (m) {
      return '<option value="' + m + '"' + (m === ym ? " selected" : "") + ">" +
        esc(monthLabel(m, true)) + "</option>";
    }).join("");

    var list = inMonth(ym);
    var t = totals(list);
    var prev = totals(inMonth(addMonths(ym, -1)));
    var rate = t.income > 0 ? (t.net / t.income) * 100 : 0;
    var days = ym === currentMonth() ? new Date().getDate() : daysInMonth(ym);

    $("#reportStats").innerHTML = [
      card("income", "fa-download", "Income", money(t.income), null, delta(t.income, prev.income, true)),
      card("expense", "fa-arrow-up", "Expenses", money(t.expense), null, delta(t.expense, prev.expense, false)),
      card("balance", "fa-scale-balanced", "Net", money(t.net),
        t.net >= 0 ? "You came out ahead" : "You spent more than you earned", null),
      card("savings", "fa-piggy-bank", "Savings Rate",
        t.income > 0 ? Math.round(rate) + "%" : "—",
        "Avg spend " + money(t.expense / Math.max(1, days)) + "/day", null)
    ].join("");

    renderTrend();

    var cats = categoryTotals(list, "expense");
    var catTotal = cats.reduce(function (s, c) { return s + c.total; }, 0);

    $("#reportCats").innerHTML = cats.length
      ? '<div class="breakdown">' + cats.map(function (c) {
          var share = pct(c.total, catTotal);
          return '<div class="breakdown-row">' +
            '<div class="breakdown-top">' +
              '<span><i class="dot" style="background:' + esc(c.color) + '"></i>' + esc(c.name) + "</span>" +
              "<b>" + esc(money(c.total)) + " <small style=\"color:var(--faint)\">" +
                share.toFixed(share < 10 ? 1 : 0) + "%</small></b>" +
            "</div>" +
            '<div class="breakdown-bar"><div class="breakdown-fill" style="width:' +
              share.toFixed(1) + "%;background:" + esc(c.color) + '"></div></div>' +
          "</div>";
        }).join("") + "</div>"
      : emptyState("fa-chart-simple", "No expenses in " + monthLabel(ym, true), "Nothing to break down yet.");

    var top = list.filter(function (x) { return x.type === "expense"; })
      .sort(function (a, b) { return b.amount - a.amount; }).slice(0, 6);

    $("#topSpend").innerHTML = top.length
      ? '<div class="rank-list">' + top.map(function (t2, i) {
          var c = catById(t2.category);
          return '<div class="rank-row">' +
            '<div class="rank-no">' + (i + 1) + "</div>" +
            '<div class="rank-main"><strong>' + esc(t2.name) + "</strong>" +
              "<small>" + esc(c.name) + " · " + esc(dateLabel(t2.date)) + "</small></div>" +
            '<div class="amount-red">' + esc(money(t2.amount)) + "</div>" +
          "</div>";
        }).join("") + "</div>"
      : emptyState("fa-ranking-star", "Nothing logged", "Big-ticket spending will be listed here.");

    $("#insights").innerHTML = insights(ym, list, t, prev, cats, catTotal);
  }

  function insights(ym, list, t, prev, cats, catTotal) {
    var out = [];

    function add(tone, icon, html) {
      out.push('<div class="insight ' + tone + '"><i class="fa-solid ' + icon + '"></i><div>' + html + "</div></div>");
    }

    if (!list.length) {
      return emptyState("fa-lightbulb", "No data for " + monthLabel(ym, true),
        "Log some transactions and insights will appear.");
    }

    if (prev.expense > 0) {
      var change = ((t.expense - prev.expense) / prev.expense) * 100;
      if (Math.abs(change) < 3) {
        add("", "fa-equals", "Your spending was <b>about the same</b> as " +
          esc(monthLabel(addMonths(ym, -1), true)) + ".");
      } else if (change > 0) {
        add("warn", "fa-arrow-trend-up", "You spent <b>" + Math.round(change) +
          "% more</b> than " + esc(monthLabel(addMonths(ym, -1), true)) +
          " — " + esc(money(t.expense - prev.expense)) + " extra.");
      } else {
        add("good", "fa-arrow-trend-down", "You spent <b>" + Math.round(-change) +
          "% less</b> than " + esc(monthLabel(addMonths(ym, -1), true)) +
          " — " + esc(money(prev.expense - t.expense)) + " saved.");
      }
    }

    if (cats.length) {
      add("", "fa-tag", "<b>" + esc(cats[0].name) + "</b> was your biggest category at " +
        esc(money(cats[0].total)) + " (" + Math.round(pct(cats[0].total, catTotal)) + "% of spending).");
    }

    var limit = limitFor(ym);
    if (limit > 0) {
      if (t.expense > limit) {
        add("bad", "fa-triangle-exclamation", "You went <b>" + esc(money(t.expense - limit)) +
          " over</b> the " + esc(money(limit)) + " budget.");
      } else {
        add("good", "fa-shield-halved", "You stayed <b>" + esc(money(limit - t.expense)) +
          " under</b> the " + esc(money(limit)) + " budget.");
      }
    }

    if (t.income > 0) {
      var rate = (t.net / t.income) * 100;
      if (rate >= 20) {
        add("good", "fa-piggy-bank", "You kept <b>" + Math.round(rate) +
          "%</b> of what you earned. That's a healthy rate.");
      } else if (rate >= 0) {
        add("warn", "fa-piggy-bank", "You kept <b>" + Math.round(rate) +
          "%</b> of your income — worth nudging towards 20%.");
      } else {
        add("bad", "fa-fire", "You spent <b>" + esc(money(-t.net)) + " more</b> than you earned.");
      }
    }

    var expenses = list.filter(function (x) { return x.type === "expense"; });
    if (expenses.length) {
      var days = ym === currentMonth() ? new Date().getDate() : daysInMonth(ym);
      add("", "fa-calendar-day", "That's <b>" + expenses.length + " purchases</b>, averaging " +
        esc(money(t.expense / Math.max(1, days))) + " a day.");
    }

    return out.join("");
  }

  /* ================= CHART: TREND ================= */

  function renderTrend() {
    var keys = monthKeys(12);
    var data = keys.map(function (ym) {
      var t = totals(inMonth(ym));
      return { ym: ym, net: t.net };
    });

    var values = data.map(function (d) { return d.net; });
    var hi = Math.max.apply(null, values.concat([0]));
    var lo = Math.min.apply(null, values.concat([0]));
    if (hi === lo) { hi = hi + 100; lo = lo - 100; }

    var W = 620, H = 210, padL = 46, padR = 12, padT = 14, padB = 26;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;

    function x(i) { return padL + (innerW * i) / Math.max(1, data.length - 1); }
    function y(v) { return padT + innerH - ((v - lo) / (hi - lo)) * innerH; }

    var linePts = data.map(function (d, i) { return x(i).toFixed(1) + "," + y(d.net).toFixed(1); }).join(" ");
    var areaPts = x(0).toFixed(1) + "," + y(lo).toFixed(1) + " " + linePts + " " +
      x(data.length - 1).toFixed(1) + "," + y(lo).toFixed(1);

    var gridLines = "";
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (innerH * g) / 3;
      var gv = hi - ((hi - lo) * g) / 3;
      gridLines += '<line class="grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) +
        '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"></line>' +
        '<text x="' + (padL - 7) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' +
        esc(compact(gv)) + "</text>";
    }

    var zero = lo < 0 && hi > 0
      ? '<line class="zero-line" x1="' + padL + '" y1="' + y(0).toFixed(1) +
        '" x2="' + (W - padR) + '" y2="' + y(0).toFixed(1) + '"></line>'
      : "";

    var labels = data.map(function (d, i) {
      if (i % 2 !== 0 && i !== data.length - 1) return "";
      return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' +
        esc(monthLabel(d.ym).split(" ")[0]) + "</text>";
    }).join("");

    var points = data.map(function (d, i) {
      return '<circle class="pt" cx="' + x(i).toFixed(1) + '" cy="' + y(d.net).toFixed(1) +
        '" r="3"><title>' + esc(monthLabel(d.ym, true) + ": " + money(d.net)) + "</title></circle>";
    }).join("");

    $("#trendChart").innerHTML =
      '<svg class="trend" viewBox="0 0 ' + W + " " + H + '" role="img" ' +
      'aria-label="Net savings over the last 12 months">' +
      gridLines + zero +
      '<polygon class="area" points="' + areaPts + '"></polygon>' +
      '<polyline class="line" points="' + linePts + '" vector-effect="non-scaling-stroke"></polyline>' +
      points + labels + "</svg>";
  }

  /* ================= RENDER: CATEGORIES ================= */

  function renderCategories() {
    var iconSel = $("#catIcon");
    if (!iconSel.children.length) {
      iconSel.innerHTML = ICONS.map(function (i) {
        return '<option value="' + i + '">' + i.replace("fa-", "").replace(/-/g, " ") + "</option>";
      }).join("");
    }

    var usage = {};
    state.transactions.forEach(function (t) {
      if (!usage[t.category]) usage[t.category] = { count: 0, total: 0 };
      usage[t.category].count += 1;
      usage[t.category].total += t.amount;
    });

    $("#catGrid").innerHTML = state.categories.map(function (c) {
      var u = usage[c.id] || { count: 0, total: 0 };
      return '<div class="cat-card">' +
        '<div class="cat-actions">' +
          '<button class="mini-btn" type="button" data-cat-edit="' + esc(c.id) +
            '" aria-label="Edit ' + esc(c.name) + '"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="mini-btn del" type="button" data-cat-del="' + esc(c.id) +
            '" aria-label="Delete ' + esc(c.name) + '"><i class="fa-solid fa-trash"></i></button>' +
        "</div>" +
        '<div class="cat-card-top">' +
          '<div class="cat-icon" style="background:' + esc(c.color) + '22;color:' + esc(c.color) + '">' +
            '<i class="fa-solid ' + esc(c.icon) + '"></i></div>' +
          "<div><h4>" + esc(c.name) + '</h4><span class="kind">' +
            (c.kind === "income" ? "Income" : "Expense") + "</span></div>" +
        "</div>" +
        '<div class="cat-meta"><span>Transactions</span><b>' + u.count + "</b></div>" +
        '<div class="cat-meta"><span>Total</span><b>' + esc(money(u.total)) + "</b></div>" +
      "</div>";
    }).join("");
  }

  function addCategory(e) {
    e.preventDefault();
    var form = e.target;
    var name = String(form.elements.name.value || "").trim();
    var err = $("#catError");

    if (!name) {
      err.textContent = "Give the category a name.";
      err.hidden = false;
      return;
    }

    var exists = state.categories.some(function (c) {
      return c.name.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      err.textContent = "You already have a category called “" + name + "”.";
      err.hidden = false;
      return;
    }

    err.hidden = true;
    var id = slug(name);
    while (state.categories.some(function (c) { return c.id === id; })) id += "x";

    state.categories.push({
      id: id,
      name: name.slice(0, 24),
      color: form.elements.color.value,
      icon: form.elements.icon.value,
      kind: form.elements.kind.value === "income" ? "income" : "expense"
    });

    save();
    form.reset();
    form.elements.color.value = "#2876d8";
    toast("Category “" + name + "” added.", "ok");
    render();
    refreshOpenForms();
  }

  function editCategory(id) {
    var c = catById(id);
    openModal("Edit category",
      '<label for="ec-name">Name</label>' +
      '<input id="ec-name" type="text" maxlength="24" value="' + esc(c.name) + '">' +
      '<div class="form-row">' +
        '<div><label for="ec-icon">Icon</label><select id="ec-icon">' +
          ICONS.map(function (i) {
            return '<option value="' + i + '"' + (i === c.icon ? " selected" : "") + ">" +
              i.replace("fa-", "").replace(/-/g, " ") + "</option>";
          }).join("") +
        "</select></div>" +
        '<div><label for="ec-color">Colour</label>' +
        '<input id="ec-color" type="color" value="' + esc(c.color) + '"></div>' +
      "</div>" +
      '<button class="btn full" type="button" id="ec-save">' +
      '<i class="fa-solid fa-check"></i>Save changes</button>',
      function (body) {
        $("#ec-save", body).addEventListener("click", function () {
          var name = String($("#ec-name", body).value || "").trim();
          if (!name) return;
          state.categories.forEach(function (cat) {
            if (cat.id !== id) return;
            cat.name = name.slice(0, 24);
            cat.icon = $("#ec-icon", body).value;
            cat.color = $("#ec-color", body).value;
          });
          save();
          closeModal();
          toast("Category updated.", "ok");
          render();
          refreshOpenForms();
        });
      });
  }

  function deleteCategory(id) {
    var c = catById(id);
    var used = state.transactions.filter(function (t) { return t.category === id; });
    var siblings = catsOfKind(c.kind).filter(function (x) { return x.id !== id; });

    if (!siblings.length) {
      toast("You need at least one " + c.kind + " category.", "err");
      return;
    }

    if (!used.length) {
      confirmModal("Delete category",
        "Delete <b>" + esc(c.name) + "</b>? Nothing is using it.",
        "Delete", true, function () {
          state.categories = state.categories.filter(function (x) { return x.id !== id; });
          save();
          toast("Category deleted.", "ok");
          render();
          refreshOpenForms();
        });
      return;
    }

    openModal("Delete category",
      "<p><b>" + esc(c.name) + "</b> is used by " + used.length + " transaction" +
      (used.length === 1 ? "" : "s") + ". Move them to another category first.</p>" +
      '<label for="dc-target">Move transactions to</label>' +
      '<select id="dc-target">' + siblings.map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>";
      }).join("") + "</select>" +
      '<div class="btn-row" style="justify-content:flex-end;margin-bottom:0">' +
      '<button class="btn ghost" type="button" data-close>Cancel</button>' +
      '<button class="btn danger" type="button" id="dc-go">Move & delete</button></div>',
      function (body) {
        $("#dc-go", body).addEventListener("click", function () {
          var target = $("#dc-target", body).value;
          state.transactions.forEach(function (t) {
            if (t.category === id) t.category = target;
          });
          state.categories = state.categories.filter(function (x) { return x.id !== id; });
          save();
          closeModal();
          toast("Moved " + used.length + " transaction" + (used.length === 1 ? "" : "s") +
            " and deleted the category.", "ok");
          render();
          refreshOpenForms();
        });
      });
  }

  // Category or currency changes invalidate the option lists inside any rendered form.
  function refreshOpenForms() {
    ["quick", "full"].forEach(function (prefix) {
      var slot = $("#" + prefix + "FormSlot");
      if (!slot || !slot.children.length) return;
      var form = $(".tx-form", slot);
      if (!form) return;
      var keep = {
        name: form.elements.name.value,
        amount: form.elements.amount.value,
        date: form.elements.date.value
      };
      slot.innerHTML = formHTML(prefix, { withNote: prefix === "full" });
      var next = $(".tx-form", slot);
      next.elements.name.value = keep.name;
      next.elements.amount.value = keep.amount;
      next.elements.date.value = keep.date;
    });
  }

  /* ================= RENDER: SETTINGS ================= */

  function renderSettings() {
    $("#setName").value = state.settings.name;
    $("#setLimit").value = state.settings.defaultLimit;
    $("#limitSymbol").textContent = symbol();
    $("#setTheme").value = state.settings.theme;
    $("#setRange").value = String(state.settings.range);

    var sel = $("#setCurrency");
    if (!sel.children.length) {
      sel.innerHTML = Object.keys(CURRENCIES).map(function (code) {
        return '<option value="' + code + '">' + code + " (" + CURRENCIES[code].sym + ")</option>";
      }).join("");
    }
    sel.value = state.settings.currency;

    var bytes = 0;
    try {
      bytes = (window.localStorage.getItem(STORAGE_KEY) || "").length;
    } catch (e) { bytes = 0; }

    $("#storageNote").textContent = storageWorks
      ? state.transactions.length + " transactions and " + state.categories.length +
        " categories stored on this device (~" + Math.max(1, Math.round(bytes / 1024)) +
        " KB). Nothing is uploaded anywhere."
      : "Storage is blocked in this browser, so changes will be lost when you close the tab.";
  }

  /* ================= IMPORT / EXPORT ================= */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON() {
    download("expense-backup-" + todayISO() + ".json", JSON.stringify({
      version: 1,
      exported: todayISO(),
      transactions: state.transactions,
      categories: state.categories,
      settings: state.settings
    }, null, 2), "application/json");
    toast("Backup downloaded.", "ok");
  }

  function exportCSV() {
    var list = filtered();
    if (!list.length) {
      toast("Nothing to export with these filters.", "err");
      return;
    }
    var head = ["Date", "Description", "Category", "Type", "Amount", "Note"];
    var rows = list.map(function (t) {
      return [t.date, t.name, catById(t.category).name, t.type, t.amount, t.note].map(csvCell).join(",");
    });
    download("transactions-" + todayISO() + ".csv",
      head.join(",") + "\n" + rows.join("\n"), "text/csv;charset=utf-8");
    toast("Exported " + list.length + " transactions.", "ok");
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        toast("That file isn't valid JSON.", "err");
        return;
      }
      if (!data || !Array.isArray(data.transactions)) {
        toast("That backup doesn't contain any transactions.", "err");
        return;
      }
      var txs = sanitizeTransactions(data.transactions);
      confirmModal("Import backup",
        "This replaces your current data with <b>" + txs.length +
        " transactions</b> from the file. This can't be undone.",
        "Replace my data", true, function () {
          state.transactions = txs;
          state.categories = sanitizeCategories(data.categories);
          if (data.settings) {
            state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
            state.settings.limits = data.settings.limits || {};
            if (!CURRENCIES[state.settings.currency]) state.settings.currency = "INR";
          }
          save();
          applyTheme();
          toast("Imported " + txs.length + " transactions.", "ok");
          render();
          refreshOpenForms();
        });
    };
    reader.onerror = function () { toast("Couldn't read that file.", "err"); };
    reader.readAsText(file);
  }

  /* ================= THEME ================= */

  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function applyTheme() {
    var pref = state.settings.theme;
    var dark = pref === "dark" || (pref === "system" && mq && mq.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }

  if (mq) {
    var onScheme = function () {
      if (state.settings.theme === "system") { applyTheme(); renderChrome(); }
    };
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  /* ================= ROUTER ================= */

  function routeFromHash() {
    var raw = String(window.location.hash || "").replace(/^#\/?/, "").split("?")[0];
    return ROUTES.indexOf(raw) >= 0 ? raw : "dashboard";
  }

  function onRoute() {
    state.ui.route = routeFromHash();
    closeSidebar();
    render();
    window.scrollTo(0, 0);
  }

  /* ================= SIDEBAR (mobile) ================= */

  function openSidebar() {
    $("#sidebar").classList.add("open");
    $("#scrim").hidden = false;
    $("#menuToggle").setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#scrim").hidden = true;
    $("#menuToggle").setAttribute("aria-expanded", "false");
  }

  /* ================= EVENTS ================= */

  function wireEvents() {
    window.addEventListener("hashchange", onRoute);

    $("#menuToggle").addEventListener("click", function () {
      if ($("#sidebar").classList.contains("open")) closeSidebar();
      else openSidebar();
    });
    $("#scrim").addEventListener("click", closeSidebar);

    $("#themeToggle").addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      state.settings.theme = dark ? "light" : "dark";
      save();
      applyTheme();
      renderChrome();
      if (state.ui.route === "settings") $("#setTheme").value = state.settings.theme;
    });

    // ---- transaction forms (delegated: forms are re-rendered often)
    document.addEventListener("submit", function (e) {
      var form = e.target.closest ? e.target.closest(".tx-form") : null;
      if (form) { e.preventDefault(); submitTx(form); return; }
      if (e.target.id === "catForm") addCategory(e);
    });

    document.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target : null;
      if (!el) return;

      var seg = el.closest(".segmented button");
      if (seg) {
        var form = seg.closest(".tx-form");
        var type = seg.getAttribute("data-type");
        $$(".segmented button", form).forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === seg));
        });
        form.elements.type.value = type;
        form.elements.category.innerHTML = categoryOptions(type, null);
        var prefix = form.getAttribute("data-prefix");
        if (prefix === "quick" || prefix === "full") state.ui.formType[prefix] = type;
        return;
      }

      var chip = el.closest("[data-chip]");
      if (chip) {
        var entry = chipCache[Number(chip.getAttribute("data-chip"))];
        if (entry) fillForm($("#fullFormSlot .tx-form"), entry);
        return;
      }

      var edit = el.closest("[data-edit]");
      if (edit) { editTx(edit.getAttribute("data-edit")); return; }

      var del = el.closest("[data-del]");
      if (del) { deleteTx(del.getAttribute("data-del")); return; }

      var catEdit = el.closest("[data-cat-edit]");
      if (catEdit) { editCategory(catEdit.getAttribute("data-cat-edit")); return; }

      var catDel = el.closest("[data-cat-del]");
      if (catDel) { deleteCategory(catDel.getAttribute("data-cat-del")); return; }

      var pageBtn = el.closest("[data-page]");
      if (pageBtn) {
        state.ui.page += pageBtn.getAttribute("data-page") === "next" ? 1 : -1;
        renderTransactions();
        return;
      }

      if (el.closest("[data-close]")) { closeModal(); return; }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!$("#modalHost").hidden) closeModal();
        else closeSidebar();
      }
      // Simple focus trap for the modal.
      if (e.key === "Tab" && !$("#modalHost").hidden) {
        var nodes = $$('a[href], button, input, select, textarea', $("#modalHost"))
          .filter(function (n) { return !n.disabled && n.offsetParent !== null; });
        if (!nodes.length) return;
        var first = nodes[0];
        var last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // ---- budget
    $("#budgetInput").addEventListener("input", function () {
      var ym = currentMonth();
      var v = this.value.trim();
      if (v === "") delete state.settings.limits[ym];
      else state.settings.limits[ym] = Math.max(0, Number(v) || 0);
      save();
      renderBudget(ym, totals(inMonth(ym)).expense);
    });

    // ---- filters
    $("#fSearch").addEventListener("input", function () {
      state.ui.filters.q = this.value;
      state.ui.page = 1;
      renderTransactions();
    });

    ["fType", "fCategory", "fMonth", "fSort"].forEach(function (id) {
      $("#" + id).addEventListener("change", function () {
        var key = { fType: "type", fCategory: "category", fMonth: "month", fSort: "sort" }[id];
        state.ui.filters[key] = this.value;
        state.ui.page = 1;
        renderTransactions();
      });
    });

    $("#fReset").addEventListener("click", function () {
      state.ui.filters = { q: "", type: "all", category: "all", month: "all", sort: "date-desc" };
      state.ui.page = 1;
      $("#fSearch").value = "";
      renderTransactions();
    });

    $("#exportCsv").addEventListener("click", exportCSV);

    // ---- reports
    $("#reportMonth").addEventListener("change", function () {
      state.ui.reportMonth = this.value;
      renderReports();
    });

    // ---- settings
    $("#setName").addEventListener("input", function () {
      state.settings.name = this.value.slice(0, 30);
      save();
      renderChrome();
    });

    $("#setCurrency").addEventListener("change", function () {
      state.settings.currency = this.value;
      save();
      render();
      refreshOpenForms();
      toast("Currency set to " + this.value + ".", "ok");
    });

    $("#setTheme").addEventListener("change", function () {
      state.settings.theme = this.value;
      save();
      applyTheme();
      renderChrome();
    });

    $("#setRange").addEventListener("change", function () {
      state.settings.range = Number(this.value) || 6;
      save();
    });

    $("#setLimit").addEventListener("input", function () {
      state.settings.defaultLimit = Math.max(0, Number(this.value) || 0);
      save();
    });

    $("#exportJson").addEventListener("click", exportJSON);
    $("#importJson").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function () {
      if (this.files && this.files[0]) importJSON(this.files[0]);
      this.value = "";
    });

    $("#loadSample").addEventListener("click", function () {
      confirmModal("Load sample data",
        "This replaces everything you have with six months of realistic demo transactions.",
        "Load sample data", false, function () {
          state.categories = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
          state.transactions = sampleData();
          save();
          toast("Sample data loaded.", "ok");
          render();
          refreshOpenForms();
        });
    });

    $("#clearAll").addEventListener("click", function () {
      confirmModal("Delete everything",
        "This permanently removes all your transactions and custom categories from this device. " +
        "Export a backup first if you might want them back.",
        "Delete everything", true, function () {
          state.transactions = [];
          state.categories = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
          state.settings.limits = {};
          save();
          toast("All data deleted.", "ok");
          render();
          refreshOpenForms();
        });
    });
  }

  /* ================= INIT ================= */

  function init() {
    load();
    applyTheme();
    state.ui.route = routeFromHash();
    wireEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
