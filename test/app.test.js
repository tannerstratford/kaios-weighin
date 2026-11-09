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
assert.strictEqual(M.category(30.7), "Obese"); assert.strictEqual(M.category(24.9), "Healthy"); assert.strictEqual(M.category(18.4), "Underweight");
const r = M.healthyRange(cm);
assert.strictEqual(Math.round(M.toDisplay(r.min, "lb")), 144); assert.strictEqual(Math.round(M.toDisplay(r.max, "lb")), 194);
assert.strictEqual(M.bmr(100, 180, 30, "male"), 1980); assert.strictEqual(M.bmr(100, 180, 30, "female"), 1814);
const now = 100 * 86400000, log = [{ t: now - 86400000, kg: 100 }, { t: now - 2 * 86400000, kg: 102 }, { t: now - 20 * 86400000, kg: 110 }];
assert.strictEqual(M.average(log, 7, now).kg, 101); assert.strictEqual(M.average(log, 30, now).n, 3); assert.strictEqual(M.average([], 7, now), null);
console.log("all passed");
