// Health calculations that use only weight and profile data.
(function (root) {
  var LB = 2.2046226218, DAY = 86400000;

  function bmi(kg, cm) { return kg / Math.pow(cm / 100, 2); }

  // Adult BMI categories used by the WHO and CDC.
  var CUTS = [18.5, 25, 30];
  var NAMES = ["Underweight", "Normal", "Overweight", "Obese"];

  function category(b) {
    for (var i = 0; i < CUTS.length; i++) if (b < CUTS[i]) return NAMES[i];
    return NAMES[3];
  }

  function healthyRange(cm) {
    var m2 = Math.pow(cm / 100, 2);
    return { min: 18.5 * m2, max: 24.9 * m2 };
  }

  // Weights where each category starts, for the given height.
  function cutWeights(cm) {
    var m2 = Math.pow(cm / 100, 2);
    return CUTS.map(function (c) { return c * m2; });
  }

  // Where a BMI falls on a bar of four equal-width segments, from 0 to 1.
  // Outer segments cover BMI 15-18.5 and 30-40; values beyond are pinned to the ends.
  function barPosition(b) {
    var edges = [15, 18.5, 25, 30, 40];
    if (b <= edges[0]) return 0;
    for (var i = 0; i < 4; i++) {
      if (b < edges[i + 1]) return (i + (b - edges[i]) / (edges[i + 1] - edges[i])) / 4;
    }
    return 1;
  }

  // Mifflin-St Jeor resting energy estimate, kcal/day.
  function bmr(kg, cm, age, sex) {
    return Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === "female" ? -161 : 5));
  }

  function average(log, days, now) {
    var from = now - days * DAY, sum = 0, n = 0;
    log.forEach(function (e) {
      if (e.t >= from && e.t <= now) { sum += e.kg; n++; }
    });
    return n ? { kg: sum / n, n: n } : null;
  }

  // Whole years old on the given date, for a birth date of "YYYY-MM-DD".
  function ageOn(birth, now) {
    var p = String(birth).split("-").map(Number), d = new Date(now);
    var age = d.getFullYear() - p[0];
    if (d.getMonth() + 1 < p[1] || (d.getMonth() + 1 === p[1] && d.getDate() < p[2])) age--;
    return age;
  }

  // Returns "YYYY-MM-DD" for a real calendar date, otherwise null.
  function birthDate(y, m, d) {
    var dt = new Date(y, m - 1, d);
    if (!(y >= 1900) || dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
  }

  function toDisplay(kg, unit) { return unit === "kg" ? kg : kg * LB; }
  function fromDisplay(v, unit) { return unit === "kg" ? v : v / LB; }
  function cmFromFtIn(ft, inch) { return (ft * 12 + inch) * 2.54; }
  function ftInFromCm(cm) {
    var total = Math.round(cm / 2.54);
    return { ft: Math.floor(total / 12), inch: total % 12 };
  }

  var api = {
    bmi: bmi, category: category, healthyRange: healthyRange, cutWeights: cutWeights, barPosition: barPosition, NAMES: NAMES,
    bmr: bmr, average: average,
    toDisplay: toDisplay, fromDisplay: fromDisplay, ageOn: ageOn, birthDate: birthDate, cmFromFtIn: cmFromFtIn, ftInFromCm: ftInFromCm
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Metrics = api;
})(this);
