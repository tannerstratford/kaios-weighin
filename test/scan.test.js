const assert = require("assert");
const { Probe } = require("../src/scan.js");

function setup(delay) {
  const active = new Set();
  const adapter = {
    state: "enabled",
    startLeScan() { return new Promise(r => setTimeout(() => { const h = {}; active.add(h); r(h); }, delay)); },
    stopLeScan(h) { return new Promise(r => setTimeout(() => { active.delete(h); r(); }, delay)); }
  };
  const nav = { b2g: { bluetooth: { defaultAdapter: adapter } } };
  const p = new Probe(nav, { log() {}, status() {}, counts() {}, stopped() {} });
  return { p, active };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const a = setup(20);
  const starting = a.p.start();
  await wait(5);
  await a.p.stop();
  await starting;
  await wait(50);
  assert.strictEqual(a.active.size, 0, "stop during start leaves no scan running");

  const b = setup(5);
  await b.p.start();
  assert.strictEqual(b.active.size, 1);
  await b.p.stop();
  assert.strictEqual(b.active.size, 0, "stop ends a running scan");
  console.log("scan tests passed");
})().catch(e => { console.error(e); process.exit(1); });
