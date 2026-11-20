// Weight-over-time chart on a <canvas>. Few weigh-ins: dots plus a smooth
// trend. Many: the trend line only.
(function (root) {
  var DAY = 86400000, MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOTS_MAX = 60;

  // Ranges: days back from now, or 0 for all time.
  var RANGES = [{ name: "30 days", days: 30 }, { name: "1 year", days: 365 }, { name: "2 years", days: 730 }, { name: "All time", days: 0 }];

  function niceStep(span) {
    var steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
    for (var i = 0; i < steps.length; i++) if (span / steps[i] <= 4) return steps[i];
    return 200;
  }

  function dateLabel(t, long) {
    var d = new Date(t);
    return long ? MON[d.getMonth()] + " '" + String(d.getFullYear()).slice(-2) : MON[d.getMonth()] + " " + d.getDate();
  }

  // opts: {log, range (index into RANGES), now, toDisp(kg) -> number, goalKg}
  // Returns {n, change} for the caption.
  function draw(canvas, opts) {
    var M = root.Metrics, ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    var r = RANGES[opts.range], now = opts.now, conv = opts.toDisp;
    var pts = opts.log.filter(function (e) { return !r.days || e.t >= now - r.days * DAY; })
      .slice().sort(function (a, b) { return a.t - b.t; });
    ctx.fillStyle = "#0f1115"; ctx.fillRect(0, 0, W, H);
    ctx.font = "11px sans-serif"; ctx.textBaseline = "middle";
    if (!pts.length) {
      ctx.fillStyle = "#9aa3ad"; ctx.textAlign = "center"; ctx.fillText("No weigh-ins in this range", W / 2, H / 2);
      return { n: 0 };
    }

    var t0 = r.days ? now - r.days * DAY : pts[0].t, t1 = r.days ? now : pts[pts.length - 1].t;
    if (t1 - t0 < DAY) { t0 -= DAY / 2; t1 += DAY / 2; }
    var tr = M.trend(pts, pts[0].t, pts[pts.length - 1].t, 60, M.trendWidth(pts));
    var showDots = pts.length <= DOTS_MAX || tr.length < 2;

    var lo = Infinity, hi = -Infinity;
    (showDots ? pts : tr).forEach(function (p) { var v = conv(p.kg); lo = Math.min(lo, v); hi = Math.max(hi, v); });
    tr.forEach(function (p) { var v = conv(p.kg); lo = Math.min(lo, v); hi = Math.max(hi, v); });
    if (hi - lo < 2) { var mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
    var step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

    var L = 30, R = W - 6, T = 6, B = H - 16;
    function X(t) { return L + (t - t0) / (t1 - t0) * (R - L); }
    function Y(v) { return B - (v - lo) / (hi - lo) * (B - T); }

    // Grid + y labels
    ctx.textAlign = "right"; ctx.lineWidth = 1;
    for (var v = lo; v <= hi + 1e-9; v += step) {
      var y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = "#252b35"; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.fillStyle = "#9aa3ad"; ctx.fillText(step < 1 ? v.toFixed(1) : String(Math.round(v)), L - 3, y);
    }
    // x labels: start, middle, end
    var long = t1 - t0 > 120 * DAY;
    ctx.textBaseline = "alphabetic";
    [[t0, "left"], [(t0 + t1) / 2, "center"], [t1, "right"]].forEach(function (a) {
      ctx.textAlign = a[1]; ctx.fillText(dateLabel(a[0], long), a[1] === "left" ? L : a[1] === "right" ? R : X(a[0]), H - 3);
    });

    ctx.save();
    ctx.beginPath(); ctx.rect(L, T - 2, R - L, B - T + 4); ctx.clip();
    if (opts.goalKg) {
      var gy = Y(conv(opts.goalKg));
      if (gy >= T && gy <= B) {
        ctx.strokeStyle = "#3aa864"; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(R, gy); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (showDots) {
      ctx.fillStyle = tr.length >= 2 ? "#9aa3ad" : "#4d8dff";
      pts.forEach(function (p) { ctx.beginPath(); ctx.arc(X(p.t), Y(conv(p.kg)), 2.2, 0, 2 * Math.PI); ctx.fill(); });
    }
    if (tr.length >= 2) {
      ctx.strokeStyle = "#4d8dff"; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      tr.forEach(function (p, i) { var x = X(p.t), y = Y(conv(p.kg)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.restore();

    // Change = trend end minus trend start (less noisy than first vs last reading).
    var change = tr.length >= 2 ? conv(tr[tr.length - 1].kg) - conv(tr[0].kg) : null;
    return { n: pts.length, change: change };
  }

  root.WeighChart = { RANGES: RANGES, draw: draw };
})(this);
