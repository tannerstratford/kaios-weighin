(function () {
  var view = document.getElementById("view");
  var title = document.getElementById("title");
  var store = new WeighStore(window.localStorage);
  var M = Metrics;
  var screen = "home", sel = 0, form = null, confirmDel = false;
  var status = "Starting", diag = [], justRecorded = null;
  var backup = new FileBackup("weighin", navigator), backupState = "Not saved yet", backupTimer = null;

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function unit() { return store.cfg.unit; }
  function fmt(kg) { return M.toDisplay(kg, unit()).toFixed(1); }
  function fmtU(kg) { return fmt(kg) + " " + unit(); }
  function when(t) {
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function keys(l, c, r) {
    document.getElementById("kl").textContent = l;
    document.getElementById("kc").textContent = c;
    document.getElementById("kr").textContent = r;
  }
  function last(n) { return store.log[store.log.length - 1 - (n || 0)]; }
  function signed(kg) {
    var v = M.toDisplay(kg, unit());
    return (v >= 0 ? "+" : "") + v.toFixed(1);
  }

  function renderHome() {
    title.textContent = "WeighIn";
    var e = last(), h = "";
    if (e) {
      var b = M.bmi(e.kg, store.cfg.cm), p = last(1);
      h += '<div class="big">' + fmt(e.kg) + '<span class="unit"> ' + unit() + "</span></div>";
      h += '<div class="bmi">BMI ' + b.toFixed(1) + " &middot; " + M.category(b) + "</div>";
      h += '<div class="center dim">' + when(e.t) + (p ? " &middot; " + signed(e.kg - p.kg) + " " + unit() + " vs last" : "") + "</div>";
    } else {
      h += '<div class="big">--</div><div class="center dim">No weigh-ins yet</div>';
    }
    if (/^Failed/.test(backupState)) h += '<div class="center dim">Backup failed. See Settings</div>';
    if (justRecorded) h += '<div class="status">Saved ' + fmtU(justRecorded.kg) + "</div>";
    h += '<div class="status">' + esc(status) + "</div>";
    view.innerHTML = h;
    keys("History", "Stats", "Settings");
  }

  function renderStats() {
    title.textContent = "Stats";
    var c = store.cfg, e = last(), now = Date.now(), h = "";
    function row(a, b) { h += '<div class="row"><span>' + a + "</span><b>" + b + "</b></div>"; }
    var a7 = M.average(store.log, 7, now), a30 = M.average(store.log, 30, now), r = M.healthyRange(c.cm);
    h += bmiBar(e);
    row("7-day avg", a7 ? fmtU(a7.kg) : "--");
    row("30-day avg", a30 ? fmtU(a30.kg) : "--");
    row("Normal range", Math.round(M.toDisplay(r.min, unit())) + "-" + Math.round(M.toDisplay(r.max, unit())) + " " + unit());
    if (e) row("BMR est.", M.bmr(e.kg, c.cm, M.ageOn(c.birth, now), c.sex) + " kcal");
    if (c.goalKg) {
      row("Goal", fmtU(c.goalKg));
      if (e) row("To goal", signed(c.goalKg - e.kg) + " " + unit());
    }
    row("Weigh-ins", store.log.length);
    view.innerHTML = h;
    keys("", "", "Back");
  }

  // Four equal segments (Under, Normal, Over, Obese) with the category start
  // weights under the joins and a marker for the latest weigh-in.
  function bmiBar(e) {
    var cuts = M.cutWeights(store.cfg.cm), h = '<div class="bar">';
    for (var i = 0; i < 4; i++) h += '<span class="seg s' + i + '"></span>';
    if (e) h += '<i class="mark" style="left:' + (M.barPosition(M.bmi(e.kg, store.cfg.cm)) * 100).toFixed(1) + '%"></i>';
    h += '</div><div class="barcuts">';
    cuts.forEach(function (kg, i) {
      h += '<span style="left:' + (i + 1) * 25 + '%">' + Math.round(M.toDisplay(kg, unit())) + "</span>";
    });
    h += '</div><div class="barnames"><span>Under</span><span>Normal</span><span>Over</span><span>Obese</span></div>';
    if (e) {
      var b = M.bmi(e.kg, store.cfg.cm);
      h += '<div class="center dim">BMI ' + b.toFixed(1) + " &middot; " + M.category(b) + "</div>";
    }
    return h;
  }

  function renderHistory() {
    title.textContent = "History";
    var rows = store.log.slice().reverse();
    if (!rows.length) { view.innerHTML = '<div class="center dim">No weigh-ins yet</div>'; keys("", "", "Back"); return; }
    sel = Math.max(0, Math.min(sel, rows.length - 1));
    var perPage = 10, start = Math.max(0, Math.min(sel - 4, rows.length - perPage)), h = "";
    rows.slice(start, start + perPage).forEach(function (e, i) {
      var b = M.bmi(e.kg, store.cfg.cm);
      h += '<div class="row' + (start + i === sel ? " sel" : "") + '"><span>' + when(e.t) + '</span><span>' + fmt(e.kg) + ' <span class="dim">' + b.toFixed(1) + "</span></span></div>";
    });
    view.innerHTML = h;
    keys(confirmDel ? "Confirm?" : "Delete", "", "Back");
  }

  function renderDiag() {
    title.textContent = "Diagnostics";
    view.innerHTML = "<pre>" + esc(diag.slice(-24).join("\n") || "No messages") + "</pre>";
    keys("", "", "Back");
  }

  function openSettings() {
    var c = store.cfg, h = c.cm ? M.ftInFromCm(c.cm) : { ft: "", inch: "" };
    var b = c.birth ? c.birth.split("-") : ["", "", ""];
    form = {
      ft: h.ft, inch: h.inch, by: b[0], bm: b[1], bd: b[2], sex: c.sex, unit: c.unit,
      goal: c.goalKg ? fmt(c.goalKg) : ""
    };
    sel = 0; screen = "settings"; draw();
    focusField();
  }

  var FIELDS = [
    ["ft", "Height ft"], ["inch", "Height in"], ["by", "Birth year"], ["bm", "Birth month"], ["bd", "Birth day"], ["sex", "Sex"], ["unit", "Units"], ["goal", "Goal weight"],
    ["backup", "Backup"], ["forget", "Forget scale"], ["diag", "Diagnostics"]
  ];

  function renderSettings() {
    title.textContent = "Settings";
    var h = "";
    FIELDS.forEach(function (f, i) {
      var k = f[0], cls = "field" + (i === sel ? " sel" : "");
      if (k === "sex" || k === "unit") h += '<label class="' + cls + '"><span>' + f[1] + "</span><span>&lt; " + esc(form[k]) + " &gt;</span></label>";
      else if (k === "backup") h += '<label class="' + cls + '"><span>' + f[1] + "</span><span>" + esc(backupState) + "</span></label>";
      else if (k === "forget" || k === "diag") h += '<label class="' + cls + '"><span>' + f[1] + "</span><span>OK</span></label>";
      else h += '<label class="' + cls + '"><span>' + f[1] + '</span><input id="f-' + k + '" inputmode="decimal" value="' + esc(form[k]) + '"></label>';
    });
    view.innerHTML = h;
    var row = view.querySelectorAll(".field")[sel];
    if (row) row.scrollIntoView({ block: "nearest" });
    keys("Cancel", "", "Save");
  }

  function captureField() {
    FIELDS.forEach(function (f) {
      var el = document.getElementById("f-" + f[0]);
      if (el) form[f[0]] = el.value;
    });
  }
  function focusField() {
    var el = document.getElementById("f-" + FIELDS[sel][0]);
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    else if (document.activeElement) document.activeElement.blur();
  }

  function saveSettings() {
    captureField();
    var ft = parseInt(form.ft, 10), inch = parseFloat(form.inch || 0);
    var birth = M.birthDate(parseInt(form.by, 10), parseInt(form.bm, 10), parseInt(form.bd, 10));
    var age = birth ? M.ageOn(birth, Date.now()) : -1;
    if (!(ft >= 3 && ft <= 8) || !(inch >= 0 && inch < 12) || !(age >= 2 && age <= 120)) {
      title.textContent = "Check height and birth date";
      return;
    }
    var c = store.cfg, goal = parseFloat(form.goal);
    c.unit = form.unit; c.sex = form.sex; c.birth = birth; c.cm = M.cmFromFtIn(ft, inch);
    c.goalKg = goal > 0 ? M.fromDisplay(goal, form.unit) : 0;
    store.saveCfg();
    screen = "home"; draw(); startScan();
  }

  function draw() {
    if (screen === "home") renderHome();
    else if (screen === "stats") renderStats();
    else if (screen === "history") renderHistory();
    else if (screen === "settings") renderSettings();
    else renderDiag();
  }

  var scan = new ScaleScan.Probe(navigator, {
    log: function (m) { diag.push(m); if (diag.length > 80) diag.shift(); if (screen === "diag") draw(); },
    status: function (m) { if (exiting) return; status = m; if (screen === "home") draw(); },
    counts: function () {},
    frame: function (f) {
      var entry = store.addFrame(f, Date.now());
      if (entry) {
        justRecorded = entry;
        if (screen === "home" || screen === "history" || screen === "stats") draw();
      } else if (!f.final && f.kg > 5 && screen === "home") {
        status = "Reading " + fmtU(f.kg);
        draw();
      }
    },
    stopped: function () {}
  });

  var SCAN_LIMIT_MS = 180000, scanLimitTimer = null, exiting = false;

  function startScan() {
    if (!store.hasProfile() || scan.running || exiting) return;
    clearTimeout(scanLimitTimer);
    scanLimitTimer = setTimeout(pauseScan, SCAN_LIMIT_MS);
    scan.start();
  }

  function pauseScan() {
    if (!scan.running) return;
    scan.stop().then(function () {
      status = "Paused. Press 5 to scan";
      if (screen === "home") draw();
    });
  }

  // Closing while a Bluetooth scan is active crashes this phone's system process.
  function exitApp() {
    if (exiting) return;
    exiting = true;
    clearTimeout(scanLimitTimer);
    status = "Closing";
    draw();
    var close = function () { window.close(); };
    var failsafe = setTimeout(close, 3000);
    scan.stop().then(function () {
      clearTimeout(failsafe);
      setTimeout(close, 400);
    });
  }

  function cycle(key, opts, dir) {
    var i = opts.indexOf(form[key]);
    form[key] = opts[(i + dir + opts.length) % opts.length];
  }

  function onSettingsKey(e) {
    var k = FIELDS[sel][0];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      captureField();
      sel = (sel + (e.key === "ArrowDown" ? 1 : FIELDS.length - 1)) % FIELDS.length;
      draw(); focusField(); e.preventDefault();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && (k === "sex" || k === "unit")) {
      captureField();
      cycle(k, k === "sex" ? ["male", "female"] : ["lb", "kg"], e.key === "ArrowRight" ? 1 : -1);
      draw(); e.preventDefault();
    } else if (e.key === "Enter" && k === "forget") {
      store.forgetScale(); title.textContent = "Scale forgotten";
    } else if (e.key === "Enter" && k === "backup") {
      backup.lastText = null; saveBackup();
    } else if (e.key === "Enter" && k === "diag") {
      screen = "diag"; draw();
    } else if (e.key === "SoftRight" || e.key === "F2") {
      saveSettings(); e.preventDefault();
    } else if (e.key === "SoftLeft" || e.key === "F1") {
      if (store.hasProfile()) { screen = "home"; draw(); }
      e.preventDefault();
    }
  }

  window.addEventListener("keydown", function (e) {
    if (screen === "settings") { onSettingsKey(e); return; }
    var softL = e.key === "SoftLeft" || e.key === "F1", softR = e.key === "SoftRight" || e.key === "F2";
    if (screen === "home" && (e.key === "Backspace" || e.key === "EndCall")) {
      e.preventDefault();
      exitApp();
      return;
    }
    if (screen === "home" && e.key === "5") { startScan(); return; }
    if (screen === "home") {
      if (softL) { screen = "history"; sel = 0; confirmDel = false; draw(); }
      else if (softR) openSettings();
      else if (e.key === "Enter") { screen = "stats"; draw(); }
      return;
    }
    if (softR || e.key === "Backspace") {
      screen = "home"; draw(); e.preventDefault();
    } else if (screen === "history") {
      if (e.key === "ArrowDown") { sel++; confirmDel = false; draw(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); confirmDel = false; draw(); }
      else if (softL && store.log.length) {
        if (confirmDel) {
          store.remove(store.log.slice().reverse()[sel]);
          confirmDel = false;
        } else confirmDel = true;
        draw();
      }
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearTimeout(scanLimitTimer); if (scan.running) scan.stop(); }
    else startScan();
  });

  function logDiag(m) { diag.push(m); if (diag.length > 80) diag.shift(); }

  function showBackup() { if (screen === "home" || screen === "settings") draw(); }

  // Settings rows are redrawn without losing what is typed in their inputs.
  function redraw() { if (screen === "settings") { captureField(); draw(); focusField(); } else showBackup(); }

  function saveBackup() {
    if (!store.hasData()) { backupState = "Nothing to save"; redraw(); return; }
    var prev = backupState, done = false;
    backupState = "Saving";
    redraw();
    // A storage permission request that never answers would otherwise look like nothing happened.
    var slow = setTimeout(function () {
      if (done) return;
      backupState = "Waiting for storage";
      logDiag("backup still waiting after 8 s; check app storage permission");
      redraw();
    }, 8000);
    backup.save(store.snapshot()).then(function (wrote) {
      done = true; clearTimeout(slow);
      if (wrote) { backupState = "Saved " + when(Date.now()); logDiag("backup saved"); }
      else backupState = /^Saved/.test(prev) ? prev : "Up to date";
      redraw();
    }, function (e) {
      done = true; clearTimeout(slow);
      var why = e && (e.name || e.message) || String(e);
      backupState = "Failed: " + why;
      logDiag("backup failed: " + why);
      redraw();
    });
  }

  store.onChange = function () {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(saveBackup, 300);
  };

  function boot() {
    if (store.hasProfile()) { draw(); startScan(); } else openSettings();
    saveBackup();
  }

  if (store.hasData()) {
    boot();
  } else {
    backup.load().then(function (snap) {
      logDiag("backup check: " + (snap ? "restored" : "none found") + " " + (backup.problems || []).join(","));
      if (snap) store.restore(snap);
    }, function (e) {
      logDiag("backup read failed: " + (e && (e.name || e.message) || e));
    }).then(boot);
  }
})();
