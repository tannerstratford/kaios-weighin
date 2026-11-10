const assert = require("assert");
const M = require("../src/metrics.js");
const { Store } = require("../src/store.js");
const { decodeScale } = require("../src/scan.js");

function rec(hex) {
  const p = Buffer.from(hex, "hex");
  return new Uint8Array([2, 1, 6, p.length + 3, 0xff, 0xff, 0xff, ...p]);
}
const FINAL = "aabbed673b196b7bbb31f16a4ea2032500622a4c05032c0d";
const NEXT = "aabbed673b196b7bd631f16a4ea2032500622a4c05034f0d";
const LIVE = "aabbed673b196b7b1123f16a4ea2030400622a4c0503050d";
const OTHER = "aabb112233445566d631f16a4ea2032500622a4c05034f0e";

const f = decodeScale(rec(FINAL));
assert.strictEqual(f.kg, 108.5); assert.strictEqual(f.final, true); assert.strictEqual(f.id, 0x0d2c);

function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; }
const storage = mem(), s = new Store(storage);
assert.strictEqual(s.addFrame(decodeScale(rec(LIVE)), 1), null);
assert.ok(s.addFrame(f, 1000));
assert.strictEqual(s.addFrame(f, 2000), null, "same measurement id is ignored");
assert.ok(s.addFrame(decodeScale(rec(NEXT)), 3000));
assert.strictEqual(s.addFrame(decodeScale(rec(OTHER)), 4000), null, "other scale is ignored");
assert.strictEqual(s.log.length, 2);
const again = new Store(storage);
assert.strictEqual(again.log.length, 2);
assert.strictEqual(again.addFrame(decodeScale(rec(NEXT)), 5000), null, "dedupe survives restart");
again.remove(again.log[0]); assert.strictEqual(again.log.length, 1);
again.forgetScale(); assert.ok(again.addFrame(decodeScale(rec(OTHER)), 6000));

const cm = M.cmFromFtIn(6, 2);
assert.ok(Math.abs(cm - 187.96) < 1e-6);
assert.deepStrictEqual(M.ftInFromCm(cm), { ft: 6, inch: 2 });
assert.strictEqual(M.bmi(108.5, cm).toFixed(1), "30.7");
assert.strictEqual(M.category(30.7), "Obese"); assert.strictEqual(M.category(24.9), "Normal"); assert.strictEqual(M.category(18.4), "Underweight");
const r = M.healthyRange(cm);
assert.strictEqual(Math.round(M.toDisplay(r.min, "lb")), 144); assert.strictEqual(Math.round(M.toDisplay(r.max, "lb")), 194);
assert.strictEqual(M.bmr(100, 180, 30, "male"), 1980); assert.strictEqual(M.bmr(100, 180, 30, "female"), 1814);
const now = 100 * 86400000, log = [{ t: now - 86400000, kg: 100 }, { t: now - 2 * 86400000, kg: 102 }, { t: now - 20 * 86400000, kg: 110 }];
assert.strictEqual(M.average(log, 7, now).kg, 101); assert.strictEqual(M.average(log, 30, now).n, 3); assert.strictEqual(M.average([], 7, now), null);
const bd = M.birthDate(1998, 3, 15);
assert.strictEqual(bd, "1998-03-15");
assert.strictEqual(M.birthDate(2001, 2, 30), null);
assert.strictEqual(M.ageOn(bd, new Date(2026, 2, 14).getTime()), 27);
assert.strictEqual(M.ageOn(bd, new Date(2026, 2, 15).getTime()), 28);
const st2 = new Store(mem());
assert.strictEqual(st2.hasData(), false);
st2.cfg.cm = 180; st2.cfg.birth = bd;
assert.strictEqual(st2.hasProfile(), true);
const st3 = new Store(mem());
assert.ok(st3.restore({ cfg: st2.cfg, log: [{ t: 1, kg: 90 }] }));
assert.strictEqual(st3.log.length, 1); assert.strictEqual(st3.hasProfile(), true);
assert.strictEqual(st3.restore({ cfg: null }), false);

const { FileBackup } = require("../src/filebackup.js");
function ds(failAdd) {
  const files = {}, later = fn => { const r = {}; setTimeout(() => fn(r), 0); return r; };
  const done = (r, v) => { r.result = v; r.onsuccess && r.onsuccess(); };
  const fail = (r, n) => { r.error = { name: n }; r.onerror && r.onerror(); };
  return { files, failAdd,
    get(n) { return later(r => n in files ? done(r, files[n]) : fail(r, "NotFoundError")); },
    delete(n) { return later(r => { delete files[n]; done(r, n); }); },
    addNamed(b, n) { return later(r => this.failAdd ? fail(r, "NoSpace") : (files[n] = b, done(r, n))); } };
}
(async () => {
  const d = ds(false), nav = { b2g: { getDeviceStorage: () => d } };
  const a = new FileBackup("weighin", nav);
  assert.strictEqual(await a.load(), null);
  assert.strictEqual(await a.save({ n: 1 }), true);
  await new Promise(r => setTimeout(r, 2));
  assert.strictEqual(await a.save({ n: 1 }), false, "unchanged data is not rewritten");
  assert.strictEqual(await a.save({ n: 2 }), true);
  assert.deepStrictEqual(Object.keys(d.files).sort(), ["weighin-backup-a.json", "weighin-backup-b.json"]);
  const fresh = new FileBackup("weighin", nav);
  assert.deepStrictEqual(await fresh.load(), { n: 2 });
  d.failAdd = true;
  await assert.rejects(fresh.save({ n: 3 }));
  d.failAdd = false;
  assert.deepStrictEqual(await new FileBackup("weighin", nav).load(), { n: 2 }, "failed write keeps last good copy");
  assert.strictEqual(await new FileBackup("other", nav).load(), null);
  console.log("all passed");
})().catch(e => { console.error(e); process.exit(1); });

// BMI bar
{
  const M2 = require("../src/metrics.js");
  assert.strictEqual(M2.barPosition(10), 0);
  assert.strictEqual(M2.barPosition(18.5), 0.25);
  assert.strictEqual(M2.barPosition(25), 0.5);
  assert.strictEqual(M2.barPosition(30), 0.75);
  assert.strictEqual(M2.barPosition(50), 1);
  assert.ok(Math.abs(M2.barPosition(35) - 0.875) < 1e-9);
  const w = M2.cutWeights(187.96);
  assert.ok(Math.abs(w[0] - 65.36) < 0.01 && Math.abs(w[2] - 105.99) < 0.01, String(w));
  assert.strictEqual(M2.category(29.9), "Overweight");
  console.log("bmi bar ok");
}
