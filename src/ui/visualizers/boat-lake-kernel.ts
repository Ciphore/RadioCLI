// @ts-nocheck
// Scene kernel extracted from https://boat.dev/ on 2026-10-28.
// Upstream procedural artwork; isolated from React, workers, canvas, fonts and telemetry.
// See docs/boat-lake.md for provenance and the local extraction.

// output/boat-lake/scene-0.js
var e = ["#FEFEFE", "#F8F9FC", "#F1F3F9", "#E9EBF6", "#E0E3F2", "#D1D6EC", "#C2C9E6", "#AAB4DD", "#929FD3", "#7F8ECC", "#6B7CC4", "#5A6DBE", "#495EB7", "#384FB0", "#263FA9", "#223895", "#1E3180", "#1A2A6C", "#162358", "#131D46", "#0F1634"], r = e.map((t2) => (-16777216 | parseInt(t2.slice(5, 7), 16) << 16 | parseInt(t2.slice(3, 5), 16) << 8 | parseInt(t2.slice(1, 3), 16)) >>> 0);
var m97596_z = class {
  w;
  h;
  ch;
  fg;
  bg;
  constructor(t2, e2, r22 = -1) {
    this.w = t2, this.h = e2, this.ch = Array.from({ length: e2 }, () => Array(t2).fill(" ")), this.fg = Array.from({ length: e2 }, () => Array(t2).fill(-1)), this.bg = Array.from({ length: e2 }, () => Array(t2).fill(r22));
  }
  in(t2, e2) {
    return t2 >= 0 && e2 >= 0 && t2 < this.w && e2 < this.h;
  }
  set(t2, e2, r22, n2, l3) {
    this.in(t2, e2) && (this.ch[e2][t2] = r22, this.fg[e2][t2] = n2, l3 !== void 0 && (this.bg[e2][t2] = l3));
  }
  paint(t2, e2, r22) {
    this.in(t2, e2) && (this.bg[e2][t2] = r22);
  }
  get(t2, e2) {
    return this.in(t2, e2) ? this.ch[e2][t2] : "";
  }
  put(t2, e2, r22, n2, l3) {
    [...r22].forEach((r3, a3) => {
      r3 !== " " ? this.set(t2 + a3, e2, r3, n2, l3) : l3 !== void 0 && this.paint(t2 + a3, e2, l3);
    });
  }
  blit(t2, e2, r22) {
    for (let n2 = 0; n2 < t2.h; n2++) for (let l3 = 0; l3 < t2.w; l3++) t2.ch[n2][l3] === " " && t2.bg[n2][l3] < 0 || this.set(e2 + l3, r22 + n2, t2.ch[n2][l3], t2.fg[n2][l3], t2.bg[n2][l3] >= 0 ? t2.bg[n2][l3] : void 0);
  }
};

// output/boat-lake/scene-2.js
var r2 = e.map((t2) => [parseInt(t2.slice(1, 3), 16), parseInt(t2.slice(3, 5), 16), parseInt(t2.slice(5, 7), 16)]), n = (t2) => (t2 /= 255) <= 0.04045 ? t2 / 12.92 : ((t2 + 0.055) / 1.055) ** 2.4, l = (t2) => 255 * (t2 <= 31308e-7 ? 12.92 * t2 : 1.055 * t2 ** (1 / 2.4) - 0.055), a = r2.map((t2) => t2.map(n)), o = [];
r2.forEach((t2, e2) => o.push([t2, " ", -1, e2]));
var h = [[0.25, "\u2591"], [0.5, "\u2592"], [0.75, "\u2593"]];
for (let t2 = 0; t2 < r2.length; t2++) for (let e2 = 0; e2 < r2.length; e2++) if (!(t2 === e2 || Math.abs(t2 - e2) > 1)) for (let [r22, n2] of h) {
  let h22 = a[t2].map((t3, n3) => l(t3 * (1 - r22) + a[e2][n3] * r22));
  o.push([h22, n2, e2, t2]);
}
var m = (t2) => r2[t2];
function b(t2, e2, r22) {
  let n2 = 374761393 * t2 + 668265263 * e2 + 2147483647 * r22 | 0;
  return (((n2 = Math.imul(n2 ^ n2 >>> 13, 1274126177)) ^ n2 >>> 16) >>> 0) / 4294967295;
}
function L(t2, e2, r22 = 0) {
  let n2 = Math.floor(t2), l22 = Math.floor(e2), a22 = t2 - n2, o22 = e2 - l22, h22 = a22 * a22 * (3 - 2 * a22), i2 = o22 * o22 * (3 - 2 * o22), f2 = b(n2, l22, r22), u2 = b(n2 + 1, l22, r22), M2 = b(n2, l22 + 1, r22);
  return f2 + (u2 - f2) * h22 + (M2 - f2) * i2 + (f2 - u2 - M2 + b(n2 + 1, l22 + 1, r22)) * h22 * i2;
}
var z = (t2, e2, r22 = 0) => 0.55 * L(t2, e2, r22) + 0.3 * L(2.1 * t2, 2.1 * e2, r22 + 1) + 0.15 * L(4.3 * t2, 4.3 * e2, r22 + 2);
var H = [[43, 338], [240, 0], [322, 240], [244, 338]], W = [[282, 338], [444, 126], [455, 132], [498, 338]], A = [[0, 361], [498, 361], [498, 412], [465, 412], [465, 462], [84, 462], [8, 412], [0, 404]];
function R(t2, e2, r22) {
  let n2 = !1;
  for (let l22 = 0, a22 = t2.length - 1; l22 < t2.length; a22 = l22++) {
    let [o22, h22] = t2[l22], [i2, f2] = t2[a22];
    h22 > r22 != f2 > r22 && e2 < (i2 - o22) * (r22 - h22) / (f2 - h22) + o22 && (n2 = !n2);
  }
  return n2;
}
function E(t2, e2, r22) {
  let n2 = t2.h / 462, l22 = (e2 - t2.x) / n2 + 249, a22 = (r22 - t2.y) / n2 + 462;
  return l22 < 0 || l22 > 498 || a22 < 0 || a22 > 462 ? 0 : R(A, l22, a22) ? 3 : R(H, l22, a22) ? 1 : 2 * !!R(W, l22, a22);
}
var F = [[0, 0, 0], m(0), m(5), m(3)];
function k(t2, e2, r22) {
  let n2 = 8 * t2, l22 = 16 * e2, a22 = r22 != null ? l22 - 16 * r22 : Math.round(0.42 * l22);
  return { W: n2, H: l22, hz: a22, mx: Math.round(n2 - Math.max(0.2 * n2, Math.min(340, 0.26 * n2))), my: Math.round(a22 * (a22 < 200 ? 0.6 : 0.36)) };
}
function v(t2) {
  let e2 = 2 * t2 - 3, r22 = Math.round(0.7 * e2), n2 = e2 + 3 + r22, l22 = n2 + 3, a22 = [];
  for (let t3 = 0; t3 < e2; t3++) {
    let o22 = Array(l22).fill("."), h22 = Math.max(0, Math.round((e2 - 1) * ((t3 + 1) / e2) ** 0.78));
    for (let t4 = e2 - h22; t4 <= e2; t4++) o22[t4] = "L";
    let i2 = t3 - (e2 - r22);
    if (i2 >= 0) for (let t4 = n2 - i2; t4 <= n2; t4++) o22[t4] = "R";
    a22.push(o22.join(""));
  }
  return a22.push("H".repeat(l22), ".." + "H".repeat(l22 - 4) + "..", ".".repeat(l22)), a22;
}
var I = ["", "\u2598", "\u259D", "\u2580", "\u2596", "\u258C", "\u259E", "\u259B", "\u2597", "\u259A", "\u2590", "\u259C", "\u2584", "\u2599", "\u259F", "\u2588"];
function C(t2, r22) {
  let n2 = Math.ceil(Math.max(...t2.map((t3) => t3.length)) / 2), l22 = Math.ceil(t2.length / 2), a22 = new m97596_z(n2, l22);
  for (let e2 = 0; e2 < l22; e2++) for (let l3 = 0; l3 < n2; l3++) {
    let n3 = [t2[2 * e2]?.[2 * l3], t2[2 * e2]?.[2 * l3 + 1], t2[2 * e2 + 1]?.[2 * l3], t2[2 * e2 + 1]?.[2 * l3 + 1]].map((t3) => t3 && t3 in r22 ? r22[t3] : -1), o22 = /* @__PURE__ */ new Map();
    if (n3.forEach((t3) => {
      t3 >= 0 && o22.set(t3, (o22.get(t3) ?? 0) + 1);
    }), !o22.size) continue;
    let [h22, i2] = [...o22.entries()].sort((t3, e3) => e3[1] - t3[1]).map((t3) => t3[0]), f2 = n3.reduce((t3, e3, r3) => t3 | (e3 === h22 || e3 >= 0 && e3 !== i2 ? 1 << r3 : 0), 0);
    a22.set(l3, e2, I[f2], h22, i2 ?? void 0);
  }
  return a22;
}
var D = { 2: ["...L....", "..LL.R..", ".HHHHHH.", "........"], 3: [".....L....", "....LL....", "...LLL.R..", "..LLLL.RR.", ".HHHHHHHHH", ".........."], 4: ["......L.....", ".....LL.....", "....LLL.R...", "...LLLL.RR..", "..LLLLL.RRR.", "HHHHHHHHHHHH", ".HHHHHHHHHH.", "............"] };
function P(t2, e2, r22, n2, l22 = 0) {
  let a22 = D[t2] ?? v(t2), o22 = a22.filter((t3) => /[LR]/.test(t3)).length, h22 = 0, i2 = a22.map((t3) => {
    if (!/[LR]/.test(t3)) return t3;
    let e3 = h22++ / Math.max(1, o22);
    return t3.replace(/L/g, "abc"[Math.min(2, Math.floor(3 * e3))]).replace(/R/g, "de"[Math.min(1, Math.floor(2 * e3))]);
  }), f2 = (t3) => Math.max(0, Math.min(20, t3 + l22));
  return C(i2, { a: f2(e2[0]), b: f2(e2[1]), c: f2(e2[2]), d: f2(r22[0]), e: f2(r22[1]), H: f2(n2) });
}
var m89369_U = function(t2, e2) {
  let r22 = v(t2), n2 = 2 * t2 - 3, l22 = r22.filter((t3) => /[LR]/.test(t3)).length;
  return C(r22.map((t3, e3) => t3.includes("H") || e3 >= l22 ? t3 : [...t3].map((t4, r3) => r3 === n2 ? "M" : e3 >= l22 - 2 && r3 >= n2 - Math.round(0.8 * l22) && r3 <= n2 ? "L" : ".").join("")), { M: e2[0], L: e2[1], R: Math.min(20, e2[1] + 2), H: e2[2] });
};
var m89369_V = function(t2) {
  let e2 = [], r22 = Math.ceil(t2.hz / 16), n2 = t2.H / 16;
  return [{ row: r22 + 4, h: 3, n: Math.max(2, Math.round(t2.W / 420)) }, { row: r22 + 9, h: 4, n: Math.max(1, Math.round(t2.W / 600)) }, { row: n2 - 1 - (t2.fade ?? 0), h: 5, n: Math.max(1, Math.round(t2.W / 1e3)) }].forEach((r3, n3) => {
    for (let l22 = 0; l22 < r3.n; l22++) {
      let a22 = t2.W * (0.2 + 0.62 * ((l22 + 0.5 + 0.37 * n3 + (L(l22, n3, 21) - 0.5) * 0.4) / r3.n % 1));
      Math.abs(a22 - t2.mx) < 16 * r3.h && n3 < 2 || e2.push({ x: 8 * Math.round(a22 / 8), y: (r3.row - (n3 < 2 ? Math.round(2 * L(l22, n3, 23)) : 0)) * 16, h: 16 * r3.h });
    }
  }), e2;
};

// output/boat-lake/scene-1.js
var l2 = 2 * Math.PI, a2 = [[-1, { zen: 16.6, hor: 12.5, horFar: 14, band: 0.16, glow: 0, glowR: 0.3, cloud: 17, cloudLit: 14, star: 1, land: 17.5, landLit: 15.5, pine: 19, pineLit: 17, deep: 18.6, far: 16, fres: 0.55, crest: -2.4, trough: 1, road: 4, roadA: 0.8, sail: 6, hull: 17 }], [-0.2, { zen: 16.6, hor: 11, horFar: 14, band: 0.14, glow: 2, glowR: 0.4, cloud: 16.5, cloudLit: 13, star: 0.85, land: 17.5, landLit: 16, pine: 19, pineLit: 17.5, deep: 18.4, far: 15, fres: 0.6, crest: -2.4, trough: 1, road: 4.5, roadA: 0.8, sail: 6, hull: 17 }], [-0.06, { zen: 16.2, hor: 5, horFar: 12.5, band: 0.08, glow: 7, glowR: 0.45, cloud: 15, cloudLit: 6, star: 0.25, land: 18, landLit: 16.5, pine: 19, pineLit: 18, deep: 17.6, far: 11, fres: 0.75, crest: -2.6, trough: 1, road: 3, roadA: 0.6, sail: 5, hull: 16.5 }], [0.03, { zen: 15.4, hor: 1, horFar: 10.5, band: 0.06, glow: 9, glowR: 0.4, cloud: 14, cloudLit: 2, star: 0, land: 17.5, landLit: 13.5, pine: 18.8, pineLit: 15.5, deep: 16.6, far: 7, fres: 0.8, crest: -2.8, trough: 1.2, road: 0, roadA: 1, sail: 3, hull: 16 }], [0.16, { zen: 14.6, hor: 1.5, horFar: 8, band: 0.08, glow: 8, glowR: 0.35, cloud: 12, cloudLit: 3, star: 0, land: 15.5, landLit: 10.5, pine: 18, pineLit: 14, deep: 15.6, far: 6.5, fres: 0.75, crest: -2.8, trough: 1.2, road: 0, roadA: 1, sail: 2, hull: 15.5 }], [0.42, { zen: 13.9, hor: 4, horFar: 5.5, band: 0.12, glow: 5, glowR: 0.25, cloud: 9, cloudLit: 3, star: 0, land: 13.5, landLit: 9, pine: 16.5, pineLit: 12.5, deep: 14, far: 7, fres: 0.7, crest: -2.6, trough: 1.2, road: 1, roadA: 0.9, sail: 1, hull: 14.5 }], [1, { zen: 13.6, hor: 4.5, horFar: 5, band: 0.14, glow: 4, glowR: 0.2, cloud: 8, cloudLit: 3, star: 0, land: 13, landLit: 8.5, pine: 16, pineLit: 12, deep: 13.6, far: 7, fres: 0.7, crest: -2.6, trough: 1.2, road: 1.5, roadA: 0.9, sail: 1, hull: 14.5 }]], o2 = (t2) => t2 * t2 * (3 - 2 * t2), h2 = (t2, e2 = 0, r22 = 1) => t2 < e2 ? e2 : t2 > r22 ? r22 : t2, i = (t2, e2, r22) => o2(h2((r22 - t2) / (e2 - t2))), f = (t2, e2, r22) => t2 + (e2 - t2) * r22, u = /* @__PURE__ */ new WeakMap();
function M(t2, e2) {
  let n2 = u.get(t2);
  if (!n2) {
    n2 = new Float32Array(t2.W + 200);
    for (let e3 = 0; e3 < n2.length; e3++) n2[e3] = Math.max(t2.hz - 48, t2.hz + 4 - (z((e3 - 100) / 300, 0.5, 5) - 0.45) * 180);
    u.set(t2, n2);
  }
  let l22 = Math.round(e2) + 100;
  return n2[l22 < 0 ? 0 : l22 >= n2.length ? n2.length - 1 : l22];
}
var s = /* @__PURE__ */ new WeakMap();
function c(t2) {
  let e2 = s.get(t2);
  if (e2) return e2;
  if (e2 = [], !t2.full) return s.set(t2, e2), e2;
  let n2 = (n3, l22, a22, o22, h22, i2) => {
    let f2 = l22;
    for (let l3 = 0; l3 < n3; l3++) {
      // Receiver adaptation: keep pine tips inside short scenes instead of clipping a fixed 64px tree.
      let u2 = Math.max(Math.min(64, t2.hz * (0.54 + 0.3 * L(l3 + 0.5, 2, h22))), o22 * (0.62 + 0.38 * L(l3 + 0.5, 2, h22)) * (1 - l3 / n3 * 0.55));
      e2.push({ x: f2, top: t2.hz + 10 - u2, base: t2.hz + 12, w: i2 }), f2 += a22 * u2 * (0.18 + 0.22 * L(l3 + 0.5, 3, h22));
    }
  };
  return n2(Math.max(3, Math.round(t2.W / 360)), 10, 1, Math.min(0.36 * t2.hz, 130), 7, 9), n2(Math.max(4, Math.round(t2.W / 240)), t2.W - 12, -1, 0.66 * Math.min(t2.hz, 300), 8, 11), s.set(t2, e2), e2;
}
function d(t2, e2, r22, n2) {
  if (r22 < t2.top || r22 > t2.base) return 0;
  let l22 = r22 - t2.top, a22 = 0.72 + 0.28 * (l22 / (1.1 * t2.w) % 1), o22 = 0.24 * l22 * a22 + 0.6, h22 = e2 - t2.x;
  return Math.abs(h22) > o22 ? +(1 > Math.abs(h22) && r22 > t2.base - 6) : (n2 > t2.x ? h22 > 0.15 * o22 : h22 < -(0.15 * o22)) && Math.abs(h22) > o22 - 3.2 ? 2 : 1;
}
var p = /* @__PURE__ */ new WeakMap();
function w(t2, e2, n2, l22, a22 = !1) {
  let o22 = h2(1 - l22 / t2.hz), u2 = Math.exp(-(((n2 - e2.sx) / (0.42 * t2.W)) ** 2)), M2 = f(e2.horFar, e2.hor, u2), s2 = e2.zen - 1.4 * (1 - o22);
  s2 -= (s2 - M2) * Math.exp(-o22 / e2.band);
  let c2 = (n2 - e2.sx) / t2.W, d2 = (l22 - e2.sy) / t2.hz;
  if (s2 -= e2.glow * Math.exp(-(c2 * c2 * 2.2 + d2 * d2) / (e2.glowR * e2.glowR)) * (0.35 + 0.65 * i(0.5, 0, o22)), e2.moonEl > -0.1) {
    let r22 = (n2 - e2.mx) / t2.W, a3 = (l22 - e2.my) / t2.hz;
    s2 -= 2.6 * e2.night * Math.exp(-(r22 * r22 * 3 + a3 * a3) / 0.03);
  }
  if (t2.full || t2.W > 0) {
    let a3 = i(0.5 * t2.W, 0.62 * t2.W, n2);
    if (a3 > 0 && o22 > 0.12 && o22 < 0.7) {
      let h22 = i(0.6, 0.76, z((n2 - 4 * e2.t) / 230, l22 / 15, 3)) * i(0.12, 0.22, o22) * i(0.7, 0.5, o22) * a3;
      if (h22 > 0) {
        let r22 = Math.exp(-(((n2 - e2.lx) / t2.W) ** 2 * 6 + ((l22 - e2.ly) / t2.hz) ** 2 * 2));
        s2 = f(s2, f(e2.cloud, e2.cloudLit, r22), 0.85 * h22);
      }
    }
  }
  if (t2.full || (s2 = f(14, s2, i(80, 200, l22))), !a22) {
    if (e2.star > 0 && n2 % 8 < 4 && l22 % 16 < 8 && o22 > 0.3) {
      let a3 = Math.floor(n2 / 8), h22 = Math.floor(l22 / 16), i2 = L(1.37 * a3 + 0.5, 2.11 * h22 + 0.5, 91);
      (a3 + h22) % 3 == 0 && i2 > 0.86 && n2 > t2.copyW && L(a3 + 0.5, h22 + 0.5, 93) < e2.star * (o22 - 0.2) && Math.hypot((n2 - e2.mx) / t2.W * 2, (l22 - e2.my) / t2.hz) > 0.22 && (s2 = Math.min(s2, 4 + 6 * L(a3 + 0.5, h22 + 0.5, 95)));
    }
    if (t2.full && n2 < t2.copyW + 520) {
      let e3 = i(t2.copyW + 520, t2.copyW - 60, n2) * i(0.1, 0.22, o22);
      s2 < 13 && (s2 = f(s2, 13, e3));
    }
    e2.sunEl > -0.2 && (s2 = g(s2, n2, l22, e2.sx, e2.sy, 21, 0, 1.5, 0)), e2.moonEl > -0.2 && (s2 = g(s2, n2, l22, e2.mx, e2.my, 18, 1, 3, 1));
  }
  return h2(s2, 0, 20);
}
function g(t2, e2, r22, n2, l22, a22, o22, u2, M2) {
  let s2 = Math.hypot(e2 - n2, r22 - l22);
  if (s2 > a22 + 16) return t2;
  t2 = Math.min(t2, f(t2, u2 + 2.5, 0.85 * Math.exp(-(((s2 - a22) / 7) ** 2))));
  let c2 = h2((a22 - s2) / 8 + 0.5);
  if (c2 <= 0) return t2;
  let d2 = o22 + (u2 - o22) * i(0.5 * a22, a22, s2);
  return M2 && 7 > Math.hypot(e2 - n2 + 6, r22 - l22 + 2) && (d2 = 3.5), f(t2, Math.min(t2, d2), c2);
}
function y(t2, e2, n2, l22) {
  let a22 = (function(t3, e3, n3) {
    if (n3 >= t3.hz) return 0;
    let l3 = Math.round(e3 / 16), a3 = 16 * l3, o3 = t3.hz - M(t3, a3);
    if (o3 < 6 || t3.hz - M(t3, e3) < 6) return 0;
    let i3 = (10 + 12 * L(l3, 1, 11)) * h2((o3 - 3) / 18), f2 = Math.min(M(t3, e3), M(t3, a3) - i3 + 1.4 * Math.abs(e3 - a3));
    return n3 > f2 ? 1 + n3 - f2 : 0;
  })(t2, n2, l22);
  if (!a22) return -1;
  if (l22 > t2.hz - 5) return f(e2.land, e2.landLit, 0.5);
  let o22 = M(t2, n2 + 40) - M(t2, n2 - 40), i2 = h2((e2.lx > n2 ? o22 : -o22) / 30, -1, 1), u2 = f(e2.land, e2.landLit, 0.25 + 0.25 * i2);
  return a22 < 5 && (u2 = f(u2, e2.landLit, 0.7)), u2;
}
var b2 = (t2, e2, r22, n2) => Math.sin(1.6 / (h2((r22 - t2.hz) / (t2.H - t2.hz)) + 0.12) + e2 / t2.W * 2.1 + 1e3 * n2 / 4200 * l2);
function L2(t2, e2, r22, n2) {
  if (n2 < t2.hz) {
    for (let l22 of c(t2)) {
      let t3 = d(l22, r22, n2, e2.lx);
      if (t3) return t3 === 2 ? e2.pineLit : e2.pine;
    }
    return -1;
  }
  for (let [l22, a22] of (function(t3) {
    let e3 = p.get(t3);
    if (!e3) {
      let r3 = c(t3);
      e3 = [r3.filter((e4) => e4.x < t3.W / 2).map((t4) => t4.x), r3.filter((e4) => e4.x >= t3.W / 2).map((t4) => t4.x)].filter((t4) => t4.length).map((t4) => [Math.min(...t4), Math.max(...t4)]), p.set(t3, e3);
    }
    return e3;
  })(t2)) if (r22 > l22 - 26 + (n2 - t2.hz) * 1.4 && r22 < a22 + 26 - (n2 - t2.hz) * 1.4 && n2 < t2.hz + 16) return e2.pine + 0.5;
  return -1;
}
function z2(t2, e2, l22, a22, o22) {
  var u2;
  let M2, s2, p2, m2, x2;
  if (o22 < t2.hz) return -1;
  let g2 = c(t2), L22 = e2.t, z22 = h2((o22 - t2.hz) / (t2.H - t2.hz)), H22 = b2(t2, a22, o22, L22) * i(0.02, 0.3, z22), W22 = H22 * (1.5 + 6 * z22), A22 = 2 * t2.hz - o22 + H22 * (3 + 10 * z22), R22 = w(t2, e2, a22 + W22, A22, !0), E22 = y(t2, e2, a22 + W22, A22);
  for (let t3 of (E22 >= 0 && (R22 = E22), g2)) if (d(t3, a22 + W22, A22, e2.lx)) {
    R22 = f(e2.pine, R22, 0.3);
    break;
  }
  for (let t3 of l22) {
    if (t3.off || o22 < t3.y || o22 > t3.y + t3.h || Math.abs(a22 - t3.x) > 0.7 * t3.h) continue;
    let l3 = E(t3, a22 + W22, 2 * t3.y - o22);
    if (l3 && Math.sin(0.55 * o22 + 3 * L(a22 / 40, o22 / 8, 5)) > -0.2) {
      R22 = f(R22, l3 === 3 ? e2.hull : e2.sail + 2 * (l3 === 2), 0.5);
      break;
    }
  }
  let F22 = f(e2.far, e2.deep, Math.pow(z22, 0.7)), k22 = f(F22, R22, e2.fres * Math.pow(1 - z22, 1.3));
  k22 -= 0.4 * H22;
  let Q2 = (u2 = 0.78 - 0.03 * z22 - 0.05 * H22, M2 = Math.floor(o22 / 8), s2 = 16 + 60 * z22, m2 = (p2 = (t3) => L((a22 + L22 * (4 + 10 * z22) * (1 & t3 ? 1 : -0.6)) / s2, 0.05 * L22 + (7 & t3) * 3.1, 131 + 17 * t3))(M2), x2 = p2(M2 - 1), m2 > u2 && x2 <= u2 ? 1 : x2 > u2 && p2(M2 - 2) <= u2 ? -1 : 0), v22 = t2.full ? 1 : 0.6;
  if (Q2 > 0 ? k22 += e2.crest * (0.4 + 0.3 * z22) * v22 : Q2 < 0 && (k22 += 0.6 * e2.trough * v22), e2.lEl > -0.05) {
    let t3 = Math.max(0, e2.lEl), n2 = (7 + 70 * z22) * (0.7 + 0.9 * t3), l3 = Math.exp(-(((a22 - e2.lx) / n2) ** 2));
    if (l3 > 0.02) {
      let n3 = l3 * i(0, 0.35, z22 + 0.3 - 0.5 * t3) * e2.roadA * (e2.sunEl > -0.05 ? 1 : 0.85) * i(-0.05, 0.03, e2.lEl), h22 = Q2 > 0 ? 1 : 0.6 * (Q2 === 0 && L(a22 / 10, 1.3 * Math.floor(o22 / 8) + 0.3 * L22, 9) > 0.62);
      k22 = f(k22, e2.road, n3 * h22);
    }
  }
  return t2.fade && (k22 = f(k22, 0, i(t2.H - (t2.fade + 1) * 16, t2.H - 40, Math.min(t2.H - 40, o22 + (L(a22 / 160, 3.3, 17) - 0.5) * 22 + (L(a22 / 36, 7.1, 19) - 0.5) * 24)))), h2(k22, 0, 20);
}
function H2(t2, e2, r22 = 1) {
  let n2 = (t3) => Math.max(0, Math.min(20, Math.floor(t3 + e2))), l22 = t2.back * i(0.5, 0.15, r22) > 0.5 ? 15 : t2.sail;
  return [n2(l22), n2(l22 + 1.6), n2(l22 + 3.2), n2(l22 + 1), n2(l22 + 2.4), n2(t2.hull)];
}
var W2 = /* @__PURE__ */ new Map();
function A2(t2, e2) {
  let r22 = `${t2.h},${+!!t2.off},${e2.join(",")}`, l22 = W2.get(r22);
  return l22 || (l22 = t2.off ? m89369_U(t2.h / 16, [e2[1], e2[0], e2[5]]) : P(t2.h / 16, e2.slice(0, 3), e2.slice(3, 5), e2[5]), W2.size > 300 && W2.clear(), W2.set(r22, l22)), l22;
}
var R2 = e.map((t2) => {
  let e2 = [1, 3, 5].map((e3) => parseInt(t2.slice(e3, e3 + 2), 16) / 255).map((t3) => t3 <= 0.04045 ? t3 / 12.92 : ((t3 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * e2[0] + 0.7152 * e2[1] + 0.0722 * e2[2];
}), E2 = e.length, F2 = [];
for (let t2 = 0; t2 < E2; t2++) F2.push({ pos: t2, g: 0, f: -1, b: t2 }), t2 < E2 - 1 && [0.25, 0.5, 0.75].forEach((e2, r22) => F2.push({ pos: (function(t3) {
  for (let e3 = 0; e3 < E2 - 1; e3++) if (t3 >= R2[e3 + 1]) return e3 + (R2[e3] - t3) / (R2[e3] - R2[e3 + 1]);
  return E2 - 1;
})(R2[t2] * (1 - e2) + R2[t2 + 1] * e2), g: 16 + r22, f: t2 + 1, b: t2 }));
var k2 = (() => {
  let t2 = [1, 0, 3, 2], e2 = [2, 3, 0, 1], r22 = [];
  for (let n2 = 0; n2 < 4; n2++) for (let l22 = 0; l22 < 4; l22++) r22.push(l22 + n2 & 1 ? l22 === t2[n2] ? 0.17 : 0.33 : l22 === e2[n2] ? 0.67 : 0.83);
  return r22;
})(), Q = new Float64Array(4), v2 = new Int8Array(4);
var m59908_F = function(t2, e2, r22) {
  return r22.map((r3, n2) => {
    let l22 = A2(r3, H2(e2, (0.618 * n2 + 0.13) % 1, h2((r3.y - t2.hz) / (t2.H - t2.hz)))), a22 = r3.h >= 64 ? 4 : 2;
    return { g: l22, cx: Math.round(r3.x / 8 - l22.w / 2), cy: (r3.y - r3.h) / 16, dy: -b2(t2, r3.x, r3.y, e2.t) * a22, y: r3.y };
  }).sort((t3, e3) => t3.y - e3.y);
};
var m59908_z = function(t2, e2, r22) {
  let n2, u2, M2, s2 = l2 * (n2 = (e2 % 1 + 1) % 1) - 0.25 * Math.sin(2 * l2 * n2), { cx: c2, rx: d2, ry: p2 } = (u2 = Math.min(t2.copyW + 40, 0.6 * t2.W), M2 = t2.full ? u2 + (t2.W - u2) * 0.3 : 0.5 * t2.W, { cx: M2, rx: t2.full ? (t2.W - u2) * 0.24 : 0.36 * t2.W, ry: t2.full ? 0.72 * t2.hz : Math.max(16, t2.hz - 96 - 21 - 4) }), m2 = Math.sin(s2), x2 = c2 - d2 * Math.cos(s2), w2 = t2.hz - p2 * m2, g2 = c2 + d2 * Math.cos(s2), y2 = t2.hz + p2 * m2, b22 = (function(t3) {
    let e3 = 1;
    for (; e3 < a2.length - 1 && t3 > a2[e3][0]; ) e3++;
    let [r3, n3] = a2[e3 - 1], [l22, i2] = a2[e3], u3 = o2(h2((t3 - r3) / (l22 - r3))), M3 = {};
    for (let t4 in n3) M3[t4] = f(n3[t4], i2[t4], u3);
    return M3;
  })(m2), L22 = m2 > -0.05;
  return { ...b22, p: e2, t: r22, sx: x2, sy: w2, sunEl: m2, mx: g2, my: y2, moonEl: -m2, lx: L22 ? x2 : g2, ly: L22 ? w2 : y2, lEl: L22 ? m2 : -m2, night: i(-0.02, -0.25, m2), back: i(0.4, 0.12, m2) * i(-0.1, 0, m2) };
};
export {
  E as boatShape,
  m89369_V as fleet,
  y as land,
  k as layout,
  m59908_z as lighting,
  e as palette,
  L2 as pines,
  w as sky,
  z2 as water
};
