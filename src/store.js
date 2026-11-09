// Local persistence for the profile and weigh-in history.
(function (root) {
  var CFG = "wi.cfg", LOG = "wi.log", MIN_KG = 5;

  function Store(storage) {
    this.s = storage;
    this.cfg = this.read(CFG, { unit: "lb", sex: "male", cm: 0, age: 0, goalKg: 0, mac: "", lastId: null });
    this.log = this.read(LOG, []);
  }

  Store.prototype.read = function (key, fallback) {
    try {
      var v = this.s.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  };
  Store.prototype.saveCfg = function () { this.s.setItem(CFG, JSON.stringify(this.cfg)); };
  Store.prototype.saveLog = function () { this.s.setItem(LOG, JSON.stringify(this.log)); };
  Store.prototype.hasProfile = function () { return this.cfg.cm > 0 && this.cfg.age > 0; };

  // Records one final frame. Returns the new entry, or null when it is ignored.
  Store.prototype.addFrame = function (f, now) {
    if (!f.final || f.kg < MIN_KG) return null;
    if (this.cfg.mac && this.cfg.mac !== f.mac) return null;
    if (this.cfg.mac === f.mac && this.cfg.lastId === f.id) return null;
    this.cfg.mac = f.mac;
    this.cfg.lastId = f.id;
    var entry = { t: now, kg: f.kg };
    this.log.push(entry);
    this.saveCfg();
    this.saveLog();
    return entry;
  };

  Store.prototype.remove = function (entry) {
    var i = this.log.indexOf(entry);
    if (i >= 0) { this.log.splice(i, 1); this.saveLog(); }
  };

  Store.prototype.forgetScale = function () {
    this.cfg.mac = "";
    this.cfg.lastId = null;
    this.saveCfg();
  };

  if (typeof module !== "undefined" && module.exports) module.exports = { Store: Store };
  else root.WeighStore = Store;
})(this);
