// BLE scan logic for 0xaabb scale broadcasts. No DOM, so it can be tested in Node.
(function (root) {
  var RESTART_MS = 8000;

  function hex(u8) {
    return Array.prototype.map.call(u8, function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }

  // Yields { type, data } for each advertising data structure in a scan record.
  function parseAD(u8) {
    var out = [], i = 0;
    while (i < u8.length) {
      var len = u8[i];
      if (!len || i + 1 + len > u8.length) break;
      out.push({ type: u8[i + 1], data: u8.subarray(i + 2, i + 1 + len) });
      i += 1 + len;
    }
    return out;
  }

  // Decodes a 0xaabb broadcast frame, or returns null for anything else.
  function decodeScale(u8) {
    var ads = parseAD(u8);
    for (var i = 0; i < ads.length; i++) {
      if (ads[i].type !== 0xff || ads[i].data.length < 2) continue;
      var d = ads[i].data;
      if (d[0] !== 0xff || d[1] !== 0xff) continue;
      var p = d.subarray(2);
      if (p.length < 19 || p[0] !== 0xaa || p[1] !== 0xbb) continue;
      return {
        mac: hex(p.subarray(2, 8)),
        seq: p[8],
        status: p[15],
        counter: p[16],
        final: (p[15] & 1) === 1,
        unit: ({ 1: "kg", 2: "lb" })[(p[15] >> 1) & 7] || "?",
        kg: (p[17] | (p[18] << 8)) / 100,
        id: p.length >= 24 ? (p[22] | (p[23] << 8)) : -1
      };
    }
    return null;
  }

  function findManager(nav, log) {
    var b2g = nav.b2g, found = null;
    log("navigator.b2g: " + typeof b2g);
    [["b2g.bluetooth", b2g, "bluetooth"],
     ["b2g.mozBluetooth", b2g, "mozBluetooth"],
     ["mozBluetooth", nav, "mozBluetooth"]].forEach(function (c) {
      var v;
      try { v = c[1] ? c[1][c[2]] : undefined; }
      catch (e) { log(c[0] + " threw " + e); return; }
      log(c[0] + ": " + (v ? "present" : String(v)));
      if (v && !found) found = v;
    });
    return found;
  }

  function waitAdapter(mgr, timeoutMs) {
    return new Promise(function (resolve) {
      if (mgr.defaultAdapter) { resolve(mgr.defaultAdapter); return; }
      var timer = setTimeout(function () { mgr.onattributechanged = null; resolve(null); }, timeoutMs);
      mgr.onattributechanged = function () {
        if (mgr.defaultAdapter) {
          clearTimeout(timer);
          mgr.onattributechanged = null;
          resolve(mgr.defaultAdapter);
        }
      };
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function ensureEnabled(adapter, log, timeoutMs) {
    log("adapter state: " + adapter.state);
    if (adapter.state === "enabled") return Promise.resolve(true);
    if (typeof adapter.enable !== "function") {
      log("adapter.enable missing");
      return Promise.resolve(false);
    }
    var call;
    try { call = Promise.resolve(adapter.enable()); }
    catch (e) { log("enable threw " + e); return Promise.resolve(false); }
    return call.catch(function (e) { log("enable rejected " + (e && e.name || e)); }).then(function () {
      var end = Date.now() + timeoutMs;
      return (function poll() {
        if (adapter.state === "enabled") return true;
        if (Date.now() > end) { log("still " + adapter.state); return false; }
        return sleep(300).then(poll);
      })();
    });
  }

  function Probe(nav, cb) {
    this.nav = nav;
    this.cb = cb;
    this.running = false;
    this.events = 0;
    this.noRecord = 0;
    this.scaleFrames = 0;
    this.addrs = {};
    this.latest = null;
    this.logged = {};
    this.handle = null;
    this.adapter = null;
    this.restartTimer = null;
  }

  Probe.prototype.log = function (m) { this.cb.log(m); };
  Probe.prototype.status = function (m) { this.cb.status(m); };
  Probe.prototype.update = function () {
    this.cb.counts({
      events: this.events,
      devices: Object.keys(this.addrs).length,
      noRecord: this.noRecord,
      scaleFrames: this.scaleFrames
    }, this.latest);
  };

  Probe.prototype.onFound = function (ev) {
    this.events++;
    var addr = ev.device && ev.device.address || "unknown";
    this.addrs[addr] = true;
    var rec = null;
    try { rec = ev.scanRecord; } catch (e) { this.log("scanRecord threw " + e); }
    if (!rec) { this.noRecord++; this.update(); return; }
    var u8 = new Uint8Array(rec);
    var f = decodeScale(u8);
    if (f) {
      this.scaleFrames++;
      this.latest = f;
      if (this.cb.frame) this.cb.frame(f);
      var key = f.status + ":" + f.counter + ":" + f.kg;
      if (!this.logged[key]) {
        this.logged[key] = true;
        this.log("SCALE " + addr + " " + f.kg.toFixed(2) + "kg st=" + f.status.toString(16) +
          " n=" + f.counter.toString(16) + " final=" + f.final + " " + hex(u8));
      }
    }
    this.update();
  };

  Probe.prototype.startScan = function () {
    var self = this;
    this.pending = this.adapter.startLeScan([]).then(function (h) {
      if (!self.running) return self.adapter.stopLeScan(h);
      self.handle = h;
      h.ondevicefound = function (ev) { self.onFound(ev); };
      if (self.status) self.status("Step on the scale");
      self.restartTimer = setTimeout(function () { self.rotate(); }, RESTART_MS);
    });
    return this.pending;
  };

  // Restarting the scan makes repeat advertisements from known devices show up again.
  Probe.prototype.rotate = function () {
    var self = this;
    if (!this.running) return;
    this.pending = this.stopScan().then(function () {
      if (self.running) return self.startScan();
    }).catch(function (e) {
      self.log("restart failed: " + (e && e.name || e));
      self.status("SCAN RESTART FAILED");
      self.running = false;
      self.cb.stopped();
    });
  };

  Probe.prototype.stopScan = function () {
    clearTimeout(this.restartTimer);
    var h = this.handle;
    this.handle = null;
    if (!h) return Promise.resolve();
    h.ondevicefound = null;
    return Promise.resolve(this.adapter.stopLeScan(h));
  };

  Probe.prototype.start = function () {
    var self = this, mgr;
    if (this.running) return Promise.resolve();
    this.running = true;
    this.status("finding Bluetooth");
    function fail(msg) {
      self.status(msg);
      self.running = false;
      self.cb.stopped();
    }
    try { mgr = findManager(this.nav, function (m) { self.log(m); }); }
    catch (e) { this.log("lookup threw " + e); }
    if (!mgr) { fail("NO BLUETOOTH API"); return Promise.resolve(); }
    return waitAdapter(mgr, 8000).then(function (a) {
      if (!a) { fail("NO ADAPTER"); return; }
      self.adapter = a;
      self.log("startLeScan: " + typeof a.startLeScan);
      return ensureEnabled(a, function (m) { self.log(m); }, 15000).then(function (ok) {
        if (!ok) { fail("BT OFF: enable in Settings"); return; }
        return self.startScan();
      });
    }).catch(function (e) {
      self.log("scan failed: " + (e && (e.name + " " + e.message) || e));
      fail("SCAN FAILED");
    });
  };

  Probe.prototype.stop = function () {
    var self = this;
    this.running = false;
    clearTimeout(this.restartTimer);
    // A start or restart may be in flight; let it settle so no scan is left running.
    return Promise.resolve(this.pending).catch(function () {}).then(function () {
      return self.stopScan();
    }).catch(function (e) {
      self.log("stop failed: " + (e && e.name || e));
    }).then(function () {
      self.status("stopped");
      self.cb.stopped();
    });
  };

  var api = { Probe: Probe, decodeScale: decodeScale, parseAD: parseAD, hex: hex };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScaleScan = api;
})(this);
