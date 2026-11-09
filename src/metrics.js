// Health calculations that use only weight and profile data.
(function (root) {
  var LB = 2.2046226218, DAY = 86400000;

  function bmi(kg, cm) { return kg / Math.pow(cm / 100, 2); }

  function category(b) {
    if (b < 18.5) return "Underweight";
    if (b < 25) return "Healthy";
    if (b < 30) return "Overweight";
    return "Obese";
  }

  function healthyRange(cm) {
    var m2 = Math.pow(cm / 100, 2);
    return { min: 18.5 * m2, max: 24.9 * m2 };
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

  function toDisplay(kg, unit) { return unit === "kg" ? kg : kg * LB; }
  function fromDisplay(v, unit) { return unit === "kg" ? v : v / LB; }
  function cmFromFtIn(ft, inch) { return (ft * 12 + inch) * 2.54; }
  function ftInFromCm(cm) {
    var total = Math.round(cm / 2.54);
    return { ft: Math.floor(total / 12), inch: total % 12 };
  }

  var api = {
    bmi: bmi, category: category, healthyRange: healthyRange, bmr: bmr, average: average,
    toDisplay: toDisplay, fromDisplay: fromDisplay, cmFromFtIn: cmFromFtIn, ftInFromCm: ftInFromCm
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Metrics = api;
})(this);
