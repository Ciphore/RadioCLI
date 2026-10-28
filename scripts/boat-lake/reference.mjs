// Original scene extracted from https://boat.dev/ on 2026-10-28.
// Preserved locally for visual comparison and performance measurements. See docs/boat-lake.md.

// output/boat-lake/scene-0.js
var e = ["#FEFEFE", "#F8F9FC", "#F1F3F9", "#E9EBF6", "#E0E3F2", "#D1D6EC", "#C2C9E6", "#AAB4DD", "#929FD3", "#7F8ECC", "#6B7CC4", "#5A6DBE", "#495EB7", "#384FB0", "#263FA9", "#223895", "#1E3180", "#1A2A6C", "#162358", "#131D46", "#0F1634"], r = e.map((t2) => (-16777216 | parseInt(t2.slice(5, 7), 16) << 16 | parseInt(t2.slice(3, 5), 16) << 8 | parseInt(t2.slice(1, 3), 16)) >>> 0), m97596_h = 12, m97596_D = 6, m97596_z = class {
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
var m97596_P = (t2 = window.devicePixelRatio || 1) => t2 > 2 ? t2 / Math.ceil(t2 / 2) : t2, m97596_q = function() {
  return { w: 6, h: 12 };
}, m97596_Q = function(t2, e2, r22, n2, l3, a3, o3 = 0, h3 = 1) {
  if (e2 = Math.max(0, e2), r22 = Math.max(0, r22), n2 = Math.min(t2.w, n2), l3 = Math.min(t2.h, l3), !(e2 >= n2) && !(r22 >= l3)) {
    e2 < t2.x0 && (t2.x0 = e2), r22 < t2.y0 && (t2.y0 = r22), n2 > t2.x1 && (t2.x1 = n2), l3 > t2.y1 && (t2.y1 = l3);
    for (let i3 = r22; i3 < l3; i3++) {
      let r3 = i3 * t2.w;
      if (!o3) {
        t2.u.fill(a3, r3 + e2, r3 + n2);
        continue;
      }
      let l22 = 1 & Math.floor(i3 / h3), f3 = [o3 === 16 ? !l22 : o3 !== 17 || !l22, o3 !== 16 && (o3 === 17 ? !!l22 : !l22)], u3 = 1 & Math.floor(e2 / h3);
      for (let l32 = e2, o22 = (Math.floor(e2 / h3) + 1) * h3; l32 < n2; l32 = o22, o22 += h3, u3 ^= 1) f3[u3] && t2.u.fill(a3, r3 + l32, r3 + Math.min(o22, n2));
    }
  }
}, m97596_K = function(t2, e2) {
  if (e2.x0 >= e2.x1 || e2.y0 >= e2.y1) return;
  let r22 = e2.y1 - e2.y0, n2 = new ImageData(new Uint8ClampedArray(e2.img.data.buffer, e2.y0 * e2.w * 4, r22 * e2.w * 4), e2.w, r22);
  t2.putImageData(n2, 0, e2.y0, e2.x0, 0, e2.x1 - e2.x0, r22), e2.x0 = e2.w, e2.y0 = e2.h, e2.x1 = 0, e2.y1 = 0;
}, m97596_m = function(t2, e2, r22, n2, l3, a3) {
  e2 = Math.max(0, e2), r22 = Math.max(0, r22), n2 = Math.min(t2.w, n2), l3 = Math.min(t2.h, l3);
  for (let o3 = r22; o3 < l3; o3++) {
    let r3 = o3 * t2.w, l22 = 1 & Math.floor(o3 / a3), h3 = 1 & Math.floor(e2 / a3);
    for (let o22 = e2, i3 = (Math.floor(e2 / a3) + 1) * a3; o22 < n2; o22 = i3, i3 += a3, h3 ^= 1) h3 === l22 && t2.u.fill(0, r3 + o22, r3 + Math.min(i3, n2));
  }
}, m97596_B = function(t2, e2) {
  let r22 = new ImageData(t2, e2);
  return { img: r22, u: new Uint32Array(r22.data.buffer), w: t2, h: e2, x0: t2, y0: e2, x1: 0, y1: 0 };
};

// output/boat-lake/scene-2.js
var r2 = e.map((t2) => [parseInt(t2.slice(1, 3), 16), parseInt(t2.slice(3, 5), 16), parseInt(t2.slice(5, 7), 16)]), n = (t2) => (t2 /= 255) <= 0.04045 ? t2 / 12.92 : ((t2 + 0.055) / 1.055) ** 2.4, l = (t2) => 255 * (t2 <= 31308e-7 ? 12.92 * t2 : 1.055 * t2 ** (1 / 2.4) - 0.055), a = r2.map((t2) => t2.map(n)), o = [];
r2.forEach((t2, e2) => o.push([t2, " ", -1, e2]));
var h = [[0.25, "\u2591"], [0.5, "\u2592"], [0.75, "\u2593"]];
for (let t2 = 0; t2 < r2.length; t2++) for (let e2 = 0; e2 < r2.length; e2++) if (!(t2 === e2 || Math.abs(t2 - e2) > 1)) for (let [r22, n2] of h) {
  let h22 = a[t2].map((t3, n3) => l(t3 * (1 - r22) + a[e2][n3] * r22));
  o.push([h22, n2, e2, t2]);
}
var i = (t2, e2) => (t2[0] - e2[0]) ** 2 + (t2[1] - e2[1]) ** 2 + (t2[2] - e2[2]) ** 2;
function f(t2) {
  let e2 = 0, n2 = 1 / 0;
  for (let l22 = 0; l22 < r2.length; l22++) {
    let a22 = i(t2, r2[l22]);
    a22 < n2 && (n2 = a22, e2 = l22);
  }
  return e2;
}
var u = /* @__PURE__ */ new Map(), M = [0, 0, 0], s = [0, 0, 0], c = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], d = ["", "\u2598", "\u259D", "\u2580", "\u2596", "\u258C", "\u259E", "\u259B", "\u2597", "\u259A", "\u2590", "\u259C", "\u2584", "\u2599", "\u259F"];
function p(t2, e2, n2, l22 = 0.8) {
  let a22, h22, m22, x22, w22, g22, y22 = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r22 = 0; r22 < 4; r22++) for (let l3 = 0; l3 < 2; l3++) {
    let a3 = t2(8 * e2 + 4 * (l3 + 0.5), 16 * n2 + 4 * (r22 + 0.5)), o22 = (r22 < 2 ? 0 : 2) + (l3 < 1 ? 0 : 1);
    y22[o22][0] += a3[0], y22[o22][1] += a3[1], y22[o22][2] += a3[2];
  }
  let b22 = (L(0.93 * e2 + 0.5, 1.71 * n2 + 0.5, 77) - 0.5) * 0 + (c[(3 & n2) * 4 + (3 & e2)] / 16 - 0.47) * 0;
  y22.forEach((t3) => {
    t3[0] = t3[0] / 2 + b22, t3[1] = t3[1] / 2 + b22, t3[2] = t3[2] / 2 + b22;
  });
  let z22 = (a22 = [0, 0, 0], y22.forEach((t3) => {
    a22[0] += t3[0], a22[1] += t3[1], a22[2] += t3[2];
  }), a22.map((t3) => t3 / y22.length)), [H22, W22, A22] = (h22 = Math.round(z22[0] / 2), m22 = Math.round(z22[1] / 2), w22 = h22 << 16 | m22 << 8 | (x22 = Math.round(z22[2] / 2)), (g22 = u.get(w22)) || (g22 = (function(t3) {
    let e3 = o[0], r22 = o[0], n3 = 1 / 0, l3 = 1 / 0;
    for (let a4 of o) {
      let o22 = i(t3, a4[0]);
      o22 < n3 ? (r22 = e3, l3 = n3, e3 = a4, n3 = o22) : o22 < l3 && (r22 = a4, l3 = o22);
    }
    let a3 = Math.sqrt(n3), h3 = Math.sqrt(l3);
    return [e3, r22, a3 + h3 > 0 ? a3 / (a3 + h3) : 0];
  })([2 * h22, 2 * m22, 2 * x22]), u.set(w22, g22)), g22), R22 = H22[3] <= 1 && W22[3] <= 1 && H22[2] <= 1 && W22[2] <= 1 ? o[1 >= f(z22) ? f(z22) : H22[3]] : (A22 > 0.34 ? e2 + n2 & 1 : A22 > 0.17 && (e2 + 2 * n2 & 3) == 0) ? W22 : H22, E22 = [R22[1], R22[2], R22[3]], F22 = y22.reduce((t3, e3) => t3 + i(e3, R22[0]), 0) * l22;
  for (let t3 = 1; t3 < 15; t3++) {
    let e3 = 0, n3 = 0, l3 = 0, a3 = 0, o22 = 0, h3 = 0, u22 = 0, c22 = 0;
    for (let r22 = 0; r22 < 4; r22++) {
      let i22 = y22[r22];
      t3 & 1 << r22 ? (e3 += i22[0], n3 += i22[1], l3 += i22[2], a3++) : (o22 += i22[0], h3 += i22[1], u22 += i22[2], c22++);
    }
    M[0] = e3 / a3, M[1] = n3 / a3, M[2] = l3 / a3, s[0] = o22 / c22, s[1] = h3 / c22, s[2] = u22 / c22;
    let p22 = f(M), m3 = f(s);
    if (p22 === m3) continue;
    let x3 = 0;
    for (let e4 = 0; e4 < 4; e4++) x3 += i(y22[e4], t3 & 1 << e4 ? r2[p22] : r2[m3]);
    x3 < F22 && (F22 = x3, E22 = [d[t3], p22, m3]);
  }
  return E22;
}
var m = (t2) => r2[t2], x = (t2, e2, r22) => [t2[0] + (e2[0] - t2[0]) * r22, t2[1] + (e2[1] - t2[1]) * r22, t2[2] + (e2[2] - t2[2]) * r22], w = (t2, e2 = 0, r22 = 1) => Math.max(e2, Math.min(r22, t2)), g = (t2, e2, r22) => {
  let n2 = w((r22 - t2) / (e2 - t2));
  return n2 * n2 * (3 - 2 * n2);
};
function y(t2, e2) {
  if (e2 <= t2[0][0]) return t2[0][1];
  for (let r22 = 1; r22 < t2.length; r22++) if (e2 <= t2[r22][0]) return x(t2[r22 - 1][1], t2[r22][1], (e2 - t2[r22 - 1][0]) / (t2[r22][0] - t2[r22 - 1][0]));
  return t2[t2.length - 1][1];
}
function b(t2, e2, r22) {
  let n2 = 374761393 * t2 + 668265263 * e2 + 2147483647 * r22 | 0;
  return (((n2 = Math.imul(n2 ^ n2 >>> 13, 1274126177)) ^ n2 >>> 16) >>> 0) / 4294967295;
}
function L(t2, e2, r22 = 0) {
  let n2 = Math.floor(t2), l22 = Math.floor(e2), a22 = t2 - n2, o22 = e2 - l22, h22 = a22 * a22 * (3 - 2 * a22), i22 = o22 * o22 * (3 - 2 * o22), f22 = b(n2, l22, r22), u22 = b(n2 + 1, l22, r22), M22 = b(n2, l22 + 1, r22);
  return f22 + (u22 - f22) * h22 + (M22 - f22) * i22 + (f22 - u22 - M22 + b(n2 + 1, l22 + 1, r22)) * h22 * i22;
}
var z = (t2, e2, r22 = 0) => 0.55 * L(t2, e2, r22) + 0.3 * L(2.1 * t2, 2.1 * e2, r22 + 1) + 0.15 * L(4.3 * t2, 4.3 * e2, r22 + 2);
var m87928_x = function(t2, r22, n2, l22 = new m97596_z(r22, n2), a22, o22 = 0, h22 = r22) {
  for (let e2 of a22 ?? Array.from({ length: n2 }, (t3, e3) => e3)) for (let n3 = Math.max(0, o22); n3 < Math.min(r22, h22); n3++) {
    let [r3, a3, o3] = p(t2, n3, e2);
    l22.ch[e2][n3] = r3, l22.fg[e2][n3] = a3, l22.bg[e2][n3] = o3;
  }
  return l22;
};
var H = [[43, 338], [240, 0], [322, 240], [244, 338]], W = [[282, 338], [444, 126], [455, 132], [498, 338]], A = [[0, 361], [498, 361], [498, 412], [465, 412], [465, 462], [84, 462], [8, 412], [0, 404]];
function R(t2, e2, r22) {
  let n2 = !1;
  for (let l22 = 0, a22 = t2.length - 1; l22 < t2.length; a22 = l22++) {
    let [o22, h22] = t2[l22], [i22, f22] = t2[a22];
    h22 > r22 != f22 > r22 && e2 < (i22 - o22) * (r22 - h22) / (f22 - h22) + o22 && (n2 = !n2);
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
var Q = /* @__PURE__ */ new Map();
function v(t2) {
  let e2 = 2 * t2 - 3, r22 = Math.round(0.7 * e2), n2 = e2 + 3 + r22, l22 = n2 + 3, a22 = [];
  for (let t3 = 0; t3 < e2; t3++) {
    let o22 = Array(l22).fill("."), h22 = Math.max(0, Math.round((e2 - 1) * ((t3 + 1) / e2) ** 0.78));
    for (let t4 = e2 - h22; t4 <= e2; t4++) o22[t4] = "L";
    let i22 = t3 - (e2 - r22);
    if (i22 >= 0) for (let t4 = n2 - i22; t4 <= n2; t4++) o22[t4] = "R";
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
    let [h22, i22] = [...o22.entries()].sort((t3, e3) => e3[1] - t3[1]).map((t3) => t3[0]), f22 = n3.reduce((t3, e3, r3) => t3 | (e3 === h22 || e3 >= 0 && e3 !== i22 ? 1 << r3 : 0), 0);
    a22.set(l3, e2, I[f22], h22, i22 ?? void 0);
  }
  return a22;
}
var D = { 2: ["...L....", "..LL.R..", ".HHHHHH.", "........"], 3: [".....L....", "....LL....", "...LLL.R..", "..LLLL.RR.", ".HHHHHHHHH", ".........."], 4: ["......L.....", ".....LL.....", "....LLL.R...", "...LLLL.RR..", "..LLLLL.RRR.", "HHHHHHHHHHHH", ".HHHHHHHHHH.", "............"] }, B = { day: { L: [12, 13, 14], R: [10, 11], H: 16 }, night: { L: [6, 8, 10], R: [6, 7], H: 18 }, bay: { L: [4, 6, 8], R: [5, 6], H: 13 }, haze: { L: [0, 1, 2], R: [1, 2], H: 7 }, dim: { L: [9, 10, 11], R: [7, 8], H: 13 } };
function U(t2, e2 = "night", r22 = 0) {
  let n2 = B[e2];
  return P(t2, n2.L, n2.R, n2.H, r22);
}
function P(t2, e2, r22, n2, l22 = 0) {
  let a22 = D[t2] ?? v(t2), o22 = a22.filter((t3) => /[LR]/.test(t3)).length, h22 = 0, i22 = a22.map((t3) => {
    if (!/[LR]/.test(t3)) return t3;
    let e3 = h22++ / Math.max(1, o22);
    return t3.replace(/L/g, "abc"[Math.min(2, Math.floor(3 * e3))]).replace(/R/g, "de"[Math.min(1, Math.floor(2 * e3))]);
  }), f22 = (t3) => Math.max(0, Math.min(20, t3 + l22));
  return C(i22, { a: f22(e2[0]), b: f22(e2[1]), c: f22(e2[2]), d: f22(r22[0]), e: f22(r22[1]), H: f22(n2) });
}
var $ = /* @__PURE__ */ new Map();
function j(t2, e2, r22, n2, l22 = 0, a22 = []) {
  let o22 = 8 * t2, h22 = 16 * e2, i22 = h22 - 96, f22 = o22 > 1300 ? [[0, m(14)], [0.35, m(17)], [1, m(15)]] : [[0, m(16)], [0.5, m(17)], [1, m(15)]], u22 = Math.round(0.82 * o22), M22 = Math.round(i22 > 400 ? i22 - 110 : 0.5 * i22), s22 = (t3, e3, r3 = !1) => {
    let n3 = y(f22, e3 / i22), l3 = Math.hypot((t3 - u22) / o22 * 2, (e3 - M22) / (1.6 * i22));
    o22 > 1300 && (n3 = x(n3, m(9), 0.35 * Math.exp(-(l3 * l3) / 0.012)));
    let a3 = Math.floor(t3 / 8), h3 = Math.floor(e3 / 16);
    o22 > 1e3 && t3 > 0.62 * o22 && e3 > 0.3 * i22 && e3 < 0.75 * i22 && l3 > 0.2 && t3 % 8 < 4 && e3 % 16 < 8 && (a3 + h3) % 3 == 0 && L(a3, h3, 79) > 0.982 && (n3 = x(n3, m(5), 0.6));
    let s3 = Math.hypot(t3 - u22, e3 - M22), c22 = o22 > 1e3 ? 22 : 15;
    return !r3 && s3 < c22 ? n3 = x(m(0), m(4), g(0.45 * c22, c22, s3)) : !r3 && s3 < c22 + 8 && (n3 = x(n3, m(6), 0.6 * (1 - g(c22, c22 + 8, s3)))), e3 > i22 - 4 - 12 * z(t3 / 200, 0.3, 13) && (n3 = m(17)), n3;
  };
  return (t3, e3) => {
    let f3 = 0;
    for (let r3 of a22) {
      let n3 = (function(t4, e4, r4) {
        let n4 = (r4 - (t4.y - t4.h)) / t4.h;
        if (n4 < 0 || n4 >= 1) return null;
        let l3 = t4.w / 2 * (1 - 0.16 * (2 * n4 - 1) ** 2), a3 = (e4 - t4.cx) / l3;
        if (Math.abs(a3) > 1) return null;
        let o3 = a3 < -0.35 ? 0 : a3 < 0.4 ? 1 : 2, h3 = m([9, 12, 15][o3]);
        return 0.06 > Math.abs(a3) && (h3 = m([11, 14, 17][o3])), (n4 > 0.16 && n4 < 0.26 || n4 > 0.74 && n4 < 0.84) && (h3 = m([15, 17, 19][o3])), n4 < 0.08 && (h3 = m([6, 9, 12][o3])), h3;
      })(r3, t3, e3);
      if (n3) return n3;
    }
    if (t3 >= n2[0] && t3 < n2[1]) {
      if (e3 >= i22 - 2 && e3 < i22 + 4) return e3 < i22 ? m(8) : m(12);
      if (e3 >= i22 + 4 && e3 < i22 + 44 && (t3 - n2[0]) % 48 < 8) return x(m(19), m(16), g(i22 + 20, i22 + 44, e3));
    }
    if (e3 < i22) return s22(t3, e3);
    let M3 = (e3 - i22) / (h22 - i22), c22 = Math.sin(1.1 * e3 + 1.7 * l22 + 3 * L(t3 / 30, e3 / 5, 4)) * (1 + 4 * M3);
    (f3 = E(r22, t3 + c22, 2 * r22.y - e3)) && -0.3 > Math.sin(0.55 * e3 + 3 * L(t3 / 40, e3 / 8, 5)) && (f3 = 0);
    let d22 = f3 ? x(F[f3], m(16), 0.68) : s22(t3 + c22, 2 * i22 - e3, !0);
    d22 = x(d22, m(17), 0.35 + 0.3 * M3);
    let p22 = Math.exp(-(((t3 - u22) / (0.06 * o22)) ** 2));
    d22 = K(d22, t3, e3, M3, 9, x(m(11), m(4), p22), m(19), 0.38, l22);
    let w22 = Math.exp(-(((t3 - u22) / (32 + 90 * M3)) ** 2)) * g(0.55, 0.7, L(t3 / 48, e3 / 6 + 0.6 * l22, 9));
    return o22 > 1e3 && (d22 = x(d22, m(7), 0.6 * w22)), x(d22, m(14), g(h22 - 48, h22, e3));
  };
}
function K(t2, e2, r22, n2, l22, a22, o22, h22 = 0.4, i22 = 0, f22 = 0) {
  let u22 = (function(t3, e3, r3, n3, l3 = 0, a3 = 0) {
    let o3 = Math.floor(e3 / 8), h3 = 18 + 56 * r3, i3 = 0.8 - 0.04 * r3 + a3, f3 = (e4) => L((t3 + 5 * l3 * (1 + r3)) / h3, 0.5, 131 * n3 + 17 * e4), u3 = f3(o3), M22 = f3(o3 - 1);
    return u3 > i3 && M22 <= i3 ? 1 : M22 > i3 && f3(o3 - 2) <= i3 ? -1 : 0;
  })(e2, r22, n2, l22, i22, f22);
  return u22 > 0 ? x(t2, a22, 0.8 * h22) : u22 < 0 ? x(t2, o22, 0.45 * h22) : t2;
}
var O = { x: 13, deck: 13, w: 38 }, T = { harbour: (t2, e2, r22, n2, l22, a22) => j(t2, e2, r22, n2, l22, a22), wall: (t2, e2) => {
  let r22;
  return (function(t3, e3, r3 = 0) {
    let { W: n2, H: l22, hz: a22, mx: o22, my: h22 } = t3, i22 = (function(t4) {
      let e4 = [], r4 = Math.max(2, Math.round(t4.W / 420));
      for (let n4 = 0; n4 < r4; n4++) {
        let r5 = 10 + n4 * (0.03 * t4.W) + 10 * L(n4, 1, 7), l3 = Math.min(0.36 * t4.hz, 120) * (0.75 + 0.25 * L(n4, 2, 7)) * (1 - 0.15 * n4);
        e4.push({ x: r5, top: t4.hz + 10 - l3, base: t4.hz + 12, w: 9 });
      }
      let n3 = Math.max(3, Math.round(t4.W / 300));
      for (let r5 = 0; r5 < n3; r5++) {
        let n4 = t4.W - 12 - r5 * (0.032 * t4.W) - 8 * L(r5, 3, 7), l3 = Math.min(t4.hz, 300) * (0.5 + 0.22 * L(r5, 4, 7)) * (1 - 0.13 * r5) * (t4.W < 700 ? 0.4 : 1);
        e4.push({ x: n4, top: t4.hz + 10 - l3, base: t4.hz + 12, w: 11 });
      }
      return e4;
    })(t3), f22 = [[0, m(14)], [0.16, m(14)], [0.58, m(13)], [0.88, m(11)], [1, m(9)]], u22 = (t4) => a22 - 6 - (z(t4 / 340, 0.5, 5) - 0.45) * 110, M22 = (t4, e4, r4) => {
      let l3 = Math.hypot((t4 - o22) / n2 * 2, (e4 - h22) / (1.6 * a22)), M3 = y(f22, e4 / a22), s3 = g(0.04 * a22, 0.32 * a22, e4 + (L(t4 / 60, 0.5, 13) - 0.5) * a22 * 0.16);
      M3 = x(M3, m(5), 0.55 * Math.exp(-(l3 * l3) / 0.05) * s3);
      let c3 = g(0.58, 0.78, z(t4 / 170, e4 / 16, 3)) * g(a22, 0.3 * a22, e4) * g(0.3, 0.6, t4 / n2) * s3;
      M3 = x(M3, x(m(10), m(6), Math.exp(-(l3 * l3) / 0.08)), c3 * (n2 < 700 ? 0.15 : 0.5));
      let d3 = Math.floor(t4 / 8), p3 = Math.floor(e4 / 16);
      n2 > 1200 && t4 > 0.64 * n2 && e4 > 0.1 * a22 && e4 < 0.6 * a22 && l3 > 0.24 && t4 % 8 < 4 && e4 % 16 < 8 && (d3 + p3) % 3 == 0 && L(d3, p3, 77) > 0.982 && (M3 = x(M3, m(3), 0.7));
      let b22 = Math.hypot(t4 - o22, (e4 - h22) * 1);
      if (b22 < 22 ? M3 = x(m(0), m(4), g(10, 22, b22)) : b22 < 30 && (M3 = x(M3, m(6), 0.6 * (1 - g(22, 30, b22)))), e4 > u22(t4) && (M3 = x(m(15), m(12), 0.35)), ((t5, e5) => {
        let r5 = 7 * Math.round(t5 / 7) + (L(Math.round(t5 / 7), 0, 11) - 0.5) * 3, n3 = a22 - u22(r5);
        if (n3 < 3) return !1;
        let l4 = (5 + 10 * L(Math.round(t5 / 7), 1, 11)) * w((n3 - 3) / 14);
        return e5 > u22(r5) - l4 + 2.4 * Math.abs(t5 - r5);
      })(t4, e4) && (M3 = m(17)), !r4 || e4 > a22 - 40) for (let r5 of i22) {
        let n3 = (function(t5, e5, r6) {
          if (r6 < t5.top || r6 > t5.base) return 0;
          let n4 = r6 - t5.top, l4 = 0.72 + 0.28 * (n4 / (1.1 * t5.w) % 1), a3 = 0.24 * n4 * l4 + 0.6, o3 = e5 - t5.x;
          return Math.abs(o3) > a3 ? +(1 > Math.abs(o3) && r6 > t5.base - 6) : o3 > a3 - 2.2 ? 2 : 1;
        })(r5, t4, e4);
        if (n3) {
          M3 = m(n3 === 2 ? 16 : 19);
          break;
        }
      }
      return M3;
    }, s22 = `${n2},${l22},${a22}`, c22 = Q.get(s22);
    if (!c22) {
      let t4 = Math.ceil(n2 / 4) + 1, e4 = Math.ceil(a22 / 4) + 1;
      c22 = { bw: t4, bh: e4, data: new Float32Array(t4 * e4 * 3), done: new Uint8Array(e4) }, Q.size > 3 && Q.clear(), Q.set(s22, c22);
    }
    let d22 = c22, p22 = (t4, e4) => {
      let r4 = Math.max(0, Math.min(d22.bw - 1, Math.floor(t4 / 4))), n3 = Math.max(0, Math.min(d22.bh - 1, Math.floor(e4 / 4)));
      if (!d22.done[n3]) {
        for (let t5 = 0; t5 < d22.bw; t5++) d22.data.set(M22(4 * t5 + 2, 4 * n3 + 2, !1), (n3 * d22.bw + t5) * 3);
        d22.done[n3] = 1;
      }
      let l3 = (n3 * d22.bw + r4) * 3;
      return [d22.data[l3], d22.data[l3 + 1], d22.data[l3 + 2]];
    };
    return (h3, f3) => {
      if (f3 < a22) return p22(h3, f3);
      for (let t4 of i22) if (Math.abs(h3 - t4.x) < 26 - (f3 - a22) * 1.4 && f3 < t4.base + 4) return m(19);
      let u3 = (f3 - a22) / (l22 - a22), M3 = Math.sin(0.9 * f3 + 1.7 * r3 + 4 * L(h3 / 220, f3 / 6, 4)) * (1 + 5 * u3), s3 = [0, 0, 0], c3 = 0;
      for (let t4 of e3) {
        if (t4.off) continue;
        let e4 = E(t4, h3 + M3, 2 * t4.y - f3);
        if (e4) {
          c3 = e4;
          break;
        }
      }
      c3 && -0.2 > Math.sin(0.55 * f3 + 3 * L(h3 / 40, f3 / 8, 5)) && (c3 = 0);
      let d3 = x(m(14), m(17), u3);
      s3 = c3 ? x(F[c3], m(15), 0.82) : -0.35 > Math.sin(0.55 * f3 + 3 * L(h3 / 40, f3 / 8, 6)) ? d3 : x(x(p22(h3 + M3, 2 * a22 - f3), m(15), 0.45), d3, g(0.15, 0.5, u3)), s3 = x(s3, m(17), 0.3 + 0.35 * u3);
      let w22 = Math.exp(-(((h3 - o22) / (0.09 * n2)) ** 2));
      s3 = K(s3, h3, f3, u3, 8, x(m(11), m(4), w22), m(19), 0.38, r3);
      let y22 = Math.exp(-(((h3 - o22) / (4 + 34 * u3)) ** 2)) * g(0.5, 0.66, L(h3 / 16, 1.7 * Math.floor(f3 / 8) + 0.6 * r3, 9)), b22 = t3.fade ? g(l22 - (t3.fade + 6) * 16, l22 - 16 * t3.fade, f3) : 0;
      return s3 = x(s3, m(3), y22 * (n2 < 700 ? 0.4 : 0.8) * (1 - b22)), t3.fade && (s3 = x(s3, m(0), g(l22 - (t3.fade + 1) * 16, l22 - 40, Math.min(l22 - 40, f3 + (L(h3 / 160, 3.3, 17) - 0.5) * 22)))), s3;
    };
  })({ ...r22 = k(t2, e2), hz: Math.round(0.55 * r22.H), my: Math.round(0.22 * r22.H) }, []);
}, demo: (t2, e2) => (function(t3, e3 = Math.round(0.55 * t3)) {
  return (r22, n2) => {
    let l22 = 16 * e3 + 12, a22 = x(m(2), m(5), Math.min(1, n2 / l22)), o22 = Math.max(0, (n2 - l22) / (16 * t3 - l22)), h22 = K(x(m(11), m(17), o22), r22, n2, o22, 41, m(9), m(18), 0.3 * g(1, 0.8, o22));
    return x(a22, h22, g(l22 - 8, l22 + 16, n2));
  };
})(t2, e2), sea: (t2, e2) => {
  let r22;
  return r22 = O.deck, (t3, n2) => {
    let l22 = (r22 + 2) * 16 - 6, a22 = 8 * O.x, o22 = (O.x + O.w) * 8, h22 = 16 * r22, i22 = (r22 + 2) * 16 + 4;
    if (n2 >= h22 && n2 < i22) {
      let e3 = (n2 - h22) * 0.6;
      if (t3 >= a22 + e3 && t3 < o22 - 0.3 * e3) return n2 < h22 + 4 ? m(8) : x(m(13), m(17), (n2 - h22) / (i22 - h22));
    }
    if (t3 >= o22 - 48 && t3 < o22 - 16 && n2 >= h22 - 32 && n2 < h22) return n2 < h22 - 24 ? m(16) : n2 >= h22 - 20 && n2 < h22 - 12 && (t3 - o22) % 12 < -6 ? m(3) : m(12);
    if (n2 < l22) return x(m(3), m(6), n2 / l22);
    let f22 = (n2 - l22) / (16 * e2 - l22);
    return K(x(m(12), m(17), f22), t3, n2, f22, 61, m(8), m(18), 0.4);
  };
}, shore: (t2) => (e2, r22) => {
  if (e2 < 136 && r22 >= 184 && r22 < 208) return m(10);
  if (r22 < 192) return x(m(2), m(5), r22 / 192);
  let n2 = (r22 - 192) / (16 * t2 - 192);
  return K(x(m(11), m(17), n2), e2, r22, n2, 71, m(7), m(18), 0.4);
}, night: (t2) => (e2, r22) => K(x(m(18), m(15), r22 / (16 * t2)), e2, r22, r22 / (16 * t2), 31, m(11), m(19), 0.45), bay: (t2, e2) => (function(t3, e3 = Math.round(0.13 * t3)) {
  return (r22, n2) => {
    let l22 = 16 * e3;
    if (n2 < l22 - 16) return y([[0, m(1)], [1, m(4)]], n2 / Math.max(1, l22));
    let a22 = l22 - 3 - 6 * z(r22 / 160, 0.2, 35), o22 = 6 * Math.round(r22 / 6), h22 = a22 - (3 + 6 * L(o22 / 6, 1, 36)) + 2.2 * Math.abs(r22 - o22);
    if (n2 < l22 && n2 > Math.min(a22, h22)) return x(m(6), m(8), 0.5);
    if (n2 < l22) return m(4);
    let i22 = (n2 - l22) / Math.max(1, 16 * t3 - l22);
    return K(y([[0, m(5)], [0.12, m(8)], [0.5, m(11)], [1, m(14)]], i22), r22, n2, i22, 33, x(m(3), m(9), i22), x(m(9), m(17), i22), 0.42, 0, 0.08);
  };
})(t2, e2) };
var m89369_U = function(t2, e2) {
  let r22 = v(t2), n2 = 2 * t2 - 3, l22 = r22.filter((t3) => /[LR]/.test(t3)).length;
  return C(r22.map((t3, e3) => t3.includes("H") || e3 >= l22 ? t3 : [...t3].map((t4, r3) => r3 === n2 ? "M" : e3 >= l22 - 2 && r3 >= n2 - Math.round(0.8 * l22) && r3 <= n2 ? "L" : ".").join("")), { M: e2[0], L: e2[1], R: Math.min(20, e2[1] + 2), H: e2[2] });
};
var m89369_i = function(t2, r22) {
  let n2 = Math.max(...t2.map((t3) => t3.length)), l22 = new m97596_z(n2, Math.ceil(t2.length / 2));
  for (let e2 = 0; e2 < l22.h; e2++) for (let a22 = 0; a22 < n2; a22++) {
    let n3 = r22[t2[2 * e2]?.[a22] ?? "."] ?? -1, o22 = r22[t2[2 * e2 + 1]?.[a22] ?? "."] ?? -1;
    n3 < 0 && o22 < 0 || (n3 === o22 ? l22.set(a22, e2, "\u2588", n3) : o22 < 0 ? l22.set(a22, e2, "\u2580", n3) : n3 < 0 ? l22.set(a22, e2, "\u2584", o22) : l22.set(a22, e2, "\u2580", n3, o22));
  }
  return l22;
};
var m89369_A = (t2) => t2 >= 170 ? 40 : t2 < 90 ? 18 : 21, m89369_V = function(t2) {
  let e2 = [], r22 = Math.ceil(t2.hz / 16), n2 = t2.H / 16;
  return [{ row: r22 + 4, h: 3, n: Math.max(2, Math.round(t2.W / 420)) }, { row: r22 + 9, h: 4, n: Math.max(1, Math.round(t2.W / 600)) }, { row: n2 - 1 - (t2.fade ?? 0), h: 5, n: Math.max(1, Math.round(t2.W / 1e3)) }].forEach((r3, n3) => {
    for (let l22 = 0; l22 < r3.n; l22++) {
      let a22 = t2.W * (0.2 + 0.62 * ((l22 + 0.5 + 0.37 * n3 + (L(l22, n3, 21) - 0.5) * 0.4) / r3.n % 1));
      Math.abs(a22 - t2.mx) < 16 * r3.h && n3 < 2 || e2.push({ x: 8 * Math.round(a22 / 8), y: (r3.row - (n3 < 2 ? Math.round(2 * L(l22, n3, 23)) : 0)) * 16, h: 16 * r3.h });
    }
  }), e2;
};
var m89369_E = (t2) => T[t2.name](...t2.args);
var m89369_J = function(t2) {
  let e2 = $.get(t2);
  return e2 || (e2 = U(t2), $.set(t2, e2)), e2;
};

// output/boat-lake/scene-1.js
var l2 = 2 * Math.PI, a2 = [[-1, { zen: 16.6, hor: 12.5, horFar: 14, band: 0.16, glow: 0, glowR: 0.3, cloud: 17, cloudLit: 14, star: 1, land: 17.5, landLit: 15.5, pine: 19, pineLit: 17, deep: 18.6, far: 16, fres: 0.55, crest: -2.4, trough: 1, road: 4, roadA: 0.8, sail: 6, hull: 17 }], [-0.2, { zen: 16.6, hor: 11, horFar: 14, band: 0.14, glow: 2, glowR: 0.4, cloud: 16.5, cloudLit: 13, star: 0.85, land: 17.5, landLit: 16, pine: 19, pineLit: 17.5, deep: 18.4, far: 15, fres: 0.6, crest: -2.4, trough: 1, road: 4.5, roadA: 0.8, sail: 6, hull: 17 }], [-0.06, { zen: 16.2, hor: 5, horFar: 12.5, band: 0.08, glow: 7, glowR: 0.45, cloud: 15, cloudLit: 6, star: 0.25, land: 18, landLit: 16.5, pine: 19, pineLit: 18, deep: 17.6, far: 11, fres: 0.75, crest: -2.6, trough: 1, road: 3, roadA: 0.6, sail: 5, hull: 16.5 }], [0.03, { zen: 15.4, hor: 1, horFar: 10.5, band: 0.06, glow: 9, glowR: 0.4, cloud: 14, cloudLit: 2, star: 0, land: 17.5, landLit: 13.5, pine: 18.8, pineLit: 15.5, deep: 16.6, far: 7, fres: 0.8, crest: -2.8, trough: 1.2, road: 0, roadA: 1, sail: 3, hull: 16 }], [0.16, { zen: 14.6, hor: 1.5, horFar: 8, band: 0.08, glow: 8, glowR: 0.35, cloud: 12, cloudLit: 3, star: 0, land: 15.5, landLit: 10.5, pine: 18, pineLit: 14, deep: 15.6, far: 6.5, fres: 0.75, crest: -2.8, trough: 1.2, road: 0, roadA: 1, sail: 2, hull: 15.5 }], [0.42, { zen: 13.9, hor: 4, horFar: 5.5, band: 0.12, glow: 5, glowR: 0.25, cloud: 9, cloudLit: 3, star: 0, land: 13.5, landLit: 9, pine: 16.5, pineLit: 12.5, deep: 14, far: 7, fres: 0.7, crest: -2.6, trough: 1.2, road: 1, roadA: 0.9, sail: 1, hull: 14.5 }], [1, { zen: 13.6, hor: 4.5, horFar: 5, band: 0.14, glow: 4, glowR: 0.2, cloud: 8, cloudLit: 3, star: 0, land: 13, landLit: 8.5, pine: 16, pineLit: 12, deep: 13.6, far: 7, fres: 0.7, crest: -2.6, trough: 1.2, road: 1.5, roadA: 0.9, sail: 1, hull: 14.5 }]], o2 = (t2) => t2 * t2 * (3 - 2 * t2), h2 = (t2, e2 = 0, r22 = 1) => t2 < e2 ? e2 : t2 > r22 ? r22 : t2, i2 = (t2, e2, r22) => o2(h2((r22 - t2) / (e2 - t2))), f2 = (t2, e2, r22) => t2 + (e2 - t2) * r22, u2 = /* @__PURE__ */ new WeakMap();
function M2(t2, e2) {
  let n2 = u2.get(t2);
  if (!n2) {
    n2 = new Float32Array(t2.W + 200);
    for (let e3 = 0; e3 < n2.length; e3++) n2[e3] = Math.max(t2.hz - 48, t2.hz + 4 - (z((e3 - 100) / 300, 0.5, 5) - 0.45) * 180);
    u2.set(t2, n2);
  }
  let l22 = Math.round(e2) + 100;
  return n2[l22 < 0 ? 0 : l22 >= n2.length ? n2.length - 1 : l22];
}
var s2 = /* @__PURE__ */ new WeakMap();
function c2(t2) {
  let e2 = s2.get(t2);
  if (e2) return e2;
  if (e2 = [], !t2.full) return s2.set(t2, e2), e2;
  let n2 = (n3, l22, a22, o22, h22, i22) => {
    let f22 = l22;
    for (let l3 = 0; l3 < n3; l3++) {
      let u22 = Math.max(64, o22 * (0.62 + 0.38 * L(l3 + 0.5, 2, h22)) * (1 - l3 / n3 * 0.55));
      e2.push({ x: f22, top: t2.hz + 10 - u22, base: t2.hz + 12, w: i22 }), f22 += a22 * u22 * (0.18 + 0.22 * L(l3 + 0.5, 3, h22));
    }
  };
  return n2(Math.max(3, Math.round(t2.W / 360)), 10, 1, Math.min(0.36 * t2.hz, 130), 7, 9), n2(Math.max(4, Math.round(t2.W / 240)), t2.W - 12, -1, 0.66 * Math.min(t2.hz, 300), 8, 11), s2.set(t2, e2), e2;
}
function d2(t2, e2, r22, n2) {
  if (r22 < t2.top || r22 > t2.base) return 0;
  let l22 = r22 - t2.top, a22 = 0.72 + 0.28 * (l22 / (1.1 * t2.w) % 1), o22 = 0.24 * l22 * a22 + 0.6, h22 = e2 - t2.x;
  return Math.abs(h22) > o22 ? +(1 > Math.abs(h22) && r22 > t2.base - 6) : (n2 > t2.x ? h22 > 0.15 * o22 : h22 < -(0.15 * o22)) && Math.abs(h22) > o22 - 3.2 ? 2 : 1;
}
var p2 = /* @__PURE__ */ new WeakMap(), m2 = (t2) => Math.min(t2.hz, ...c2(t2).map((t3) => t3.top)), x2 = (t2) => t2.hz - 104;
function w2(t2, e2, n2, l22, a22 = !1) {
  let o22 = h2(1 - l22 / t2.hz), u22 = Math.exp(-(((n2 - e2.sx) / (0.42 * t2.W)) ** 2)), M22 = f2(e2.horFar, e2.hor, u22), s22 = e2.zen - 1.4 * (1 - o22);
  s22 -= (s22 - M22) * Math.exp(-o22 / e2.band);
  let c22 = (n2 - e2.sx) / t2.W, d22 = (l22 - e2.sy) / t2.hz;
  if (s22 -= e2.glow * Math.exp(-(c22 * c22 * 2.2 + d22 * d22) / (e2.glowR * e2.glowR)) * (0.35 + 0.65 * i2(0.5, 0, o22)), e2.moonEl > -0.1) {
    let r22 = (n2 - e2.mx) / t2.W, a3 = (l22 - e2.my) / t2.hz;
    s22 -= 2.6 * e2.night * Math.exp(-(r22 * r22 * 3 + a3 * a3) / 0.03);
  }
  if (t2.full || t2.W > 0) {
    let a3 = i2(0.5 * t2.W, 0.62 * t2.W, n2);
    if (a3 > 0 && o22 > 0.12 && o22 < 0.7) {
      let h22 = i2(0.6, 0.76, z((n2 - 4 * e2.t) / 230, l22 / 15, 3)) * i2(0.12, 0.22, o22) * i2(0.7, 0.5, o22) * a3;
      if (h22 > 0) {
        let r22 = Math.exp(-(((n2 - e2.lx) / t2.W) ** 2 * 6 + ((l22 - e2.ly) / t2.hz) ** 2 * 2));
        s22 = f2(s22, f2(e2.cloud, e2.cloudLit, r22), 0.85 * h22);
      }
    }
  }
  if (t2.full || (s22 = f2(14, s22, i2(80, 200, l22))), !a22) {
    if (e2.star > 0 && n2 % 8 < 4 && l22 % 16 < 8 && o22 > 0.3) {
      let a3 = Math.floor(n2 / 8), h22 = Math.floor(l22 / 16), i22 = L(1.37 * a3 + 0.5, 2.11 * h22 + 0.5, 91);
      (a3 + h22) % 3 == 0 && i22 > 0.86 && n2 > t2.copyW && L(a3 + 0.5, h22 + 0.5, 93) < e2.star * (o22 - 0.2) && Math.hypot((n2 - e2.mx) / t2.W * 2, (l22 - e2.my) / t2.hz) > 0.22 && (s22 = Math.min(s22, 4 + 6 * L(a3 + 0.5, h22 + 0.5, 95)));
    }
    if (t2.full && n2 < t2.copyW + 520) {
      let e3 = i2(t2.copyW + 520, t2.copyW - 60, n2) * i2(0.1, 0.22, o22);
      s22 < 13 && (s22 = f2(s22, 13, e3));
    }
    e2.sunEl > -0.2 && (s22 = g2(s22, n2, l22, e2.sx, e2.sy, 21, 0, 1.5, 0)), e2.moonEl > -0.2 && (s22 = g2(s22, n2, l22, e2.mx, e2.my, 18, 1, 3, 1));
  }
  return h2(s22, 0, 20);
}
function g2(t2, e2, r22, n2, l22, a22, o22, u22, M22) {
  let s22 = Math.hypot(e2 - n2, r22 - l22);
  if (s22 > a22 + 16) return t2;
  t2 = Math.min(t2, f2(t2, u22 + 2.5, 0.85 * Math.exp(-(((s22 - a22) / 7) ** 2))));
  let c22 = h2((a22 - s22) / 8 + 0.5);
  if (c22 <= 0) return t2;
  let d22 = o22 + (u22 - o22) * i2(0.5 * a22, a22, s22);
  return M22 && 7 > Math.hypot(e2 - n2 + 6, r22 - l22 + 2) && (d22 = 3.5), f2(t2, Math.min(t2, d22), c22);
}
function y2(t2, e2, n2, l22) {
  let a22 = (function(t3, e3, n3) {
    if (n3 >= t3.hz) return 0;
    let l3 = Math.round(e3 / 16), a3 = 16 * l3, o3 = t3.hz - M2(t3, a3);
    if (o3 < 6 || t3.hz - M2(t3, e3) < 6) return 0;
    let i3 = (10 + 12 * L(l3, 1, 11)) * h2((o3 - 3) / 18), f22 = Math.min(M2(t3, e3), M2(t3, a3) - i3 + 1.4 * Math.abs(e3 - a3));
    return n3 > f22 ? 1 + n3 - f22 : 0;
  })(t2, n2, l22);
  if (!a22) return -1;
  if (l22 > t2.hz - 5) return f2(e2.land, e2.landLit, 0.5);
  let o22 = M2(t2, n2 + 40) - M2(t2, n2 - 40), i22 = h2((e2.lx > n2 ? o22 : -o22) / 30, -1, 1), u22 = f2(e2.land, e2.landLit, 0.25 + 0.25 * i22);
  return a22 < 5 && (u22 = f2(u22, e2.landLit, 0.7)), u22;
}
var b2 = (t2, e2, r22, n2) => Math.sin(1.6 / (h2((r22 - t2.hz) / (t2.H - t2.hz)) + 0.12) + e2 / t2.W * 2.1 + 1e3 * n2 / 4200 * l2);
function L2(t2, e2, r22, n2) {
  if (n2 < t2.hz) {
    for (let l22 of c2(t2)) {
      let t3 = d2(l22, r22, n2, e2.lx);
      if (t3) return t3 === 2 ? e2.pineLit : e2.pine;
    }
    return -1;
  }
  for (let [l22, a22] of (function(t3) {
    let e3 = p2.get(t3);
    if (!e3) {
      let r3 = c2(t3);
      e3 = [r3.filter((e4) => e4.x < t3.W / 2).map((t4) => t4.x), r3.filter((e4) => e4.x >= t3.W / 2).map((t4) => t4.x)].filter((t4) => t4.length).map((t4) => [Math.min(...t4), Math.max(...t4)]), p2.set(t3, e3);
    }
    return e3;
  })(t2)) if (r22 > l22 - 26 + (n2 - t2.hz) * 1.4 && r22 < a22 + 26 - (n2 - t2.hz) * 1.4 && n2 < t2.hz + 16) return e2.pine + 0.5;
  return -1;
}
function z2(t2, e2, l22, a22, o22) {
  var u22;
  let M22, s22, p22, m22, x22;
  if (o22 < t2.hz) return -1;
  let g22 = c2(t2), L22 = e2.t, z22 = h2((o22 - t2.hz) / (t2.H - t2.hz)), H22 = b2(t2, a22, o22, L22) * i2(0.02, 0.3, z22), W22 = H22 * (1.5 + 6 * z22), A22 = 2 * t2.hz - o22 + H22 * (3 + 10 * z22), R22 = w2(t2, e2, a22 + W22, A22, !0), E22 = y2(t2, e2, a22 + W22, A22);
  for (let t3 of (E22 >= 0 && (R22 = E22), g22)) if (d2(t3, a22 + W22, A22, e2.lx)) {
    R22 = f2(e2.pine, R22, 0.3);
    break;
  }
  for (let t3 of l22) {
    if (t3.off || o22 < t3.y || o22 > t3.y + t3.h || Math.abs(a22 - t3.x) > 0.7 * t3.h) continue;
    let l3 = E(t3, a22 + W22, 2 * t3.y - o22);
    if (l3 && Math.sin(0.55 * o22 + 3 * L(a22 / 40, o22 / 8, 5)) > -0.2) {
      R22 = f2(R22, l3 === 3 ? e2.hull : e2.sail + 2 * (l3 === 2), 0.5);
      break;
    }
  }
  let F22 = f2(e2.far, e2.deep, Math.pow(z22, 0.7)), k22 = f2(F22, R22, e2.fres * Math.pow(1 - z22, 1.3));
  k22 -= 0.4 * H22;
  let Q22 = (u22 = 0.78 - 0.03 * z22 - 0.05 * H22, M22 = Math.floor(o22 / 8), s22 = 16 + 60 * z22, m22 = (p22 = (t3) => L((a22 + L22 * (4 + 10 * z22) * (1 & t3 ? 1 : -0.6)) / s22, 0.05 * L22 + (7 & t3) * 3.1, 131 + 17 * t3))(M22), x22 = p22(M22 - 1), m22 > u22 && x22 <= u22 ? 1 : x22 > u22 && p22(M22 - 2) <= u22 ? -1 : 0), v22 = t2.full ? 1 : 0.6;
  if (Q22 > 0 ? k22 += e2.crest * (0.4 + 0.3 * z22) * v22 : Q22 < 0 && (k22 += 0.6 * e2.trough * v22), e2.lEl > -0.05) {
    let t3 = Math.max(0, e2.lEl), n2 = (7 + 70 * z22) * (0.7 + 0.9 * t3), l3 = Math.exp(-(((a22 - e2.lx) / n2) ** 2));
    if (l3 > 0.02) {
      let n3 = l3 * i2(0, 0.35, z22 + 0.3 - 0.5 * t3) * e2.roadA * (e2.sunEl > -0.05 ? 1 : 0.85) * i2(-0.05, 0.03, e2.lEl), h22 = Q22 > 0 ? 1 : 0.6 * (Q22 === 0 && L(a22 / 10, 1.3 * Math.floor(o22 / 8) + 0.3 * L22, 9) > 0.62);
      k22 = f2(k22, e2.road, n3 * h22);
    }
  }
  return t2.fade && (k22 = f2(k22, 0, i2(t2.H - (t2.fade + 1) * 16, t2.H - 40, Math.min(t2.H - 40, o22 + (L(a22 / 160, 3.3, 17) - 0.5) * 22 + (L(a22 / 36, 7.1, 19) - 0.5) * 24)))), h2(k22, 0, 20);
}
function H2(t2, e2, r22 = 1) {
  let n2 = (t3) => Math.max(0, Math.min(20, Math.floor(t3 + e2))), l22 = t2.back * i2(0.5, 0.15, r22) > 0.5 ? 15 : t2.sail;
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
})(), Q2 = new Float64Array(4), v2 = new Int8Array(4);
function I2(t2, e2, r22, n2, l22, a22 = !0, o22 = 0.8) {
  Q2.fill(0), v2.fill(0);
  let i22 = a22 ? 4 : 2;
  for (let n3 = 0; n3 < i22; n3++) for (let l3 = 0; l3 < 2; l3++) {
    let a3 = t2(8 * e2 + 4 * (l3 + 0.5), 16 * r22 + 16 / i22 * (n3 + 0.5));
    if (a3 < 0) continue;
    let o3 = (n3 < i22 / 2 ? 0 : 2) + (l3 < 1 ? 0 : 1);
    Q2[o3] += a3, v2[o3]++;
  }
  let f22 = 0, u22 = 0, M22 = 0;
  for (let t3 = 0; t3 < 4; t3++) v2[t3] && (Q2[t3] /= v2[t3], f22 |= 1 << t3, u22++, M22 += Q2[t3]);
  if (!u22) {
    n2[l22] = 0, n2[l22 + 1] = -1, n2[l22 + 2] = -1;
    return;
  }
  if (u22 < 4) {
    n2[l22] = f22, n2[l22 + 1] = Math.round(M22 / u22), n2[l22 + 2] = -1;
    return;
  }
  let s22 = M22 / 4, c22 = 0;
  for (; c22 < F2.length - 2 && F2[c22 + 1].pos <= s22; ) c22++;
  let d22 = F2[c22], p22 = F2[c22 + 1], m22 = h2((s22 - d22.pos) / (p22.pos - d22.pos)) >= k2[(3 & r22) << 2 | 3 & e2] ? p22 : d22;
  p22.pos <= 1 && (m22 = F2[4 * (Math.round(s22) !== 0)]);
  let x22 = 0, w22 = m22.f, g22 = m22.b, y22 = m22.g, b22 = ((Q2[0] - m22.pos) ** 2 + (Q2[1] - m22.pos) ** 2 + (Q2[2] - m22.pos) ** 2 + (Q2[3] - m22.pos) ** 2) * o22;
  for (let t3 = 1; t3 < 15; t3++) {
    let e3 = 0, r3 = 0, n3 = 0, l3 = 0;
    for (let a4 = 0; a4 < 4; a4++) t3 & 1 << a4 ? (e3 += Q2[a4], r3++) : (n3 += Q2[a4], l3++);
    let a3 = Math.round(e3 / r3), o3 = Math.round(n3 / l3);
    if (a3 === o3) continue;
    let h22 = 0;
    for (let e4 = 0; e4 < 4; e4++) h22 += (Q2[e4] - (t3 & 1 << e4 ? a3 : o3)) ** 2;
    h22 < b22 && (b22 = h22, x22 = t3, w22 = a3, g22 = o3);
  }
  x22 ? n2[l22] = x22 : n2[l22] = y22, n2[l22 + 1] = w22, n2[l22 + 2] = g22;
}
function C2(t2, r22) {
  if (!t2.px) {
    let n2 = P2(t2.r0, t2.r1, t2.cols, r22);
    t2.px = m97596_B(n2.w, n2.h);
  }
  return t2.px;
}
function D2(t2, e2, r22, n2, l22 = 0, a22 = t2.cols) {
  for (let o22 of r22) {
    if (o22 < t2.r0 || o22 >= t2.r1) continue;
    let r3 = (o22 - t2.r0) * t2.cols * 3;
    for (let h22 = Math.max(0, l22); h22 < Math.min(t2.cols, a22); h22++) I2(e2, h22, o22, t2.cells, r3 + 3 * h22, n2);
  }
}
var m59908_A = 12e4, m59908_$ = 0.44, m59908_F = function(t2, e2, r22) {
  return r22.map((r3, n2) => {
    let l22 = A2(r3, H2(e2, (0.618 * n2 + 0.13) % 1, h2((r3.y - t2.hz) / (t2.H - t2.hz)))), a22 = r3.h >= 64 ? 4 : 2;
    return { g: l22, cx: Math.round(r3.x / 8 - l22.w / 2), cy: (r3.y - r3.h) / 16, dy: -b2(t2, r3.x, r3.y, e2.t) * a22, y: r3.y };
  }).sort((t3, e3) => t3.y - e3.y);
};
var m59908_B = (t2) => [Math.floor((t2 - 21 - 18) / 8), Math.ceil((t2 + 21 + 18) / 8)], m59908_C = (t2) => {
  let e2 = Math.floor((t2 - 21 - 18) / 16);
  return Array.from({ length: Math.max(0, Math.ceil((t2 + 21 + 18) / 16) - e2) }, (t3, r22) => e2 + r22);
};
var m59908_z = function(t2, e2, r22) {
  let n2, u22, M22, s22 = l2 * (n2 = (e2 % 1 + 1) % 1) - 0.25 * Math.sin(2 * l2 * n2), { cx: c22, rx: d22, ry: p22 } = (u22 = Math.min(t2.copyW + 40, 0.6 * t2.W), M22 = t2.full ? u22 + (t2.W - u22) * 0.3 : 0.5 * t2.W, { cx: M22, rx: t2.full ? (t2.W - u22) * 0.24 : 0.36 * t2.W, ry: t2.full ? 0.72 * t2.hz : Math.max(16, t2.hz - 96 - 21 - 4) }), m22 = Math.sin(s22), x22 = c22 - d22 * Math.cos(s22), w22 = t2.hz - p22 * m22, g22 = c22 + d22 * Math.cos(s22), y22 = t2.hz + p22 * m22, b22 = (function(t3) {
    let e3 = 1;
    for (; e3 < a2.length - 1 && t3 > a2[e3][0]; ) e3++;
    let [r3, n3] = a2[e3 - 1], [l22, i22] = a2[e3], u3 = o2(h2((t3 - r3) / (l22 - r3))), M3 = {};
    for (let t4 in n3) M3[t4] = f2(n3[t4], i22[t4], u3);
    return M3;
  })(m22), L22 = m22 > -0.05;
  return { ...b22, p: e2, t: r22, sx: x22, sy: w22, sunEl: m22, mx: g22, my: y22, moonEl: -m22, lx: L22 ? x22 : g22, ly: L22 ? w22 : y22, lEl: L22 ? m22 : -m22, night: i2(-0.02, -0.25, m22), back: i2(0.4, 0.12, m22) * i2(-0.1, 0, m22) };
};
var B2 = (t2) => Array.from({ length: t2.r1 - t2.r0 }, (e2, r22) => t2.r0 + r22), U2 = (t2, e2) => Math.round(t2 * e2);
function P2(t2, r22, n2, l22) {
  let a22 = U2(t2 * m97596_h, l22);
  return { top: a22, w: U2(n2 * m97596_D, l22), h: U2(r22 * m97596_h, l22) - a22 };
}
var $2 = { "\u2598": 1, "\u259D": 2, "\u2580": 3, "\u2596": 4, "\u258C": 5, "\u259E": 6, "\u259B": 7, "\u2597": 8, "\u259A": 9, "\u2590": 10, "\u259C": 11, "\u2584": 12, "\u2599": 13, "\u259F": 14, "\u2588": 15 };
function j2(t2, e2, r22, n2) {
  if (n2.kind === "sky") return (r3, n3) => w2(t2, e2, r3, n3);
  if (n2.kind === "horizon") return (r3, n3) => {
    let l3 = L2(t2, e2, r3, n3);
    return l3 >= 0 ? l3 : y2(t2, e2, r3, n3);
  };
  let l22 = 16 * n2.w0;
  return (n3, a22) => {
    if (a22 < l22) return -1;
    let o22 = L2(t2, e2, n3, a22);
    return o22 >= 0 ? o22 : z2(t2, e2, r22, n3, a22);
  };
}
var K2 = (t2, e2) => t2.kind === "water" ? e2.filter((e3) => O2(e3) >= t2.w0 && O2(e3) < t2.w1) : [], O2 = (t2) => t2.y / 16 - 1;
var m55548_Z = (t2, e2) => t2.findIndex((t3) => t3.kind === "water" && e2 >= t3.w0 && e2 < t3.w1);
var m55548_U = function(t2, r22, n2, l22) {
  let a22 = (t3) => U2(t3 * m97596_D, l22), o22 = U2(r22.r0 * m97596_h, l22), h22 = C2(r22, l22);
  for (let t3 of n2) {
    let n3 = (r3) => U2(r3 * m97596_h + t3.dy, l22) - o22;
    for (let l3 = 0; l3 < t3.g.h; l3++) for (let o3 = 0; o3 < t3.g.w; o3++) {
      let i22 = t3.cx + o3, f22 = t3.cy + l3, u22 = t3.g.fg[l3][o3], M22 = t3.g.bg[l3][o3], s22 = $2[t3.g.ch[l3][o3]] ?? 0;
      if (i22 < 0 || i22 >= r22.cols) continue;
      let c22 = a22(i22), d22 = a22(i22 + 1), p22 = a22(i22 + 0.5), m22 = n3(f22), x22 = n3(f22 + 1), w22 = n3(f22 + 0.5);
      if (M22 >= 0 && m97596_Q(h22, c22, m22, d22, x22, r[M22]), !s22 || u22 < 0) continue;
      let g22 = r[u22];
      1 & s22 && m97596_Q(h22, c22, m22, p22, w22, g22), 2 & s22 && m97596_Q(h22, p22, m22, d22, w22, g22), 4 & s22 && m97596_Q(h22, c22, w22, p22, x22, g22), 8 & s22 && m97596_Q(h22, p22, w22, d22, x22, g22);
    }
  }
  m97596_K(t2, h22);
}, m55548_q = function(t2, r22, n2) {
  let l22 = r22.drawn, a22 = C2(r22, n2), o22 = Math.max(1, Math.round(n2)), h22 = U2(r22.r0 * m97596_h, n2), i22 = (t3) => U2(t3 * m97596_D, n2), f22 = (t3) => U2((r22.r0 + t3) * m97596_h, n2) - h22, u22 = r22.cells;
  for (let t3 = 0; t3 < r22.r1 - r22.r0; t3++) {
    let n3 = f22(t3), h3 = f22(t3 + 1), M22 = f22(t3 + 0.5);
    for (let f3 = 0; f3 < r22.cols; f3++) {
      let s22 = (t3 * r22.cols + f3) * 3, c22 = u22[s22], d22 = u22[s22 + 1], p22 = u22[s22 + 2];
      if (l22[s22] === c22 && l22[s22 + 1] === d22 && l22[s22 + 2] === p22) continue;
      l22[s22] = c22, l22[s22 + 1] = d22, l22[s22 + 2] = p22;
      let m22 = i22(f3), x22 = i22(f3 + 1), w22 = i22(f3 + 0.5);
      if (m97596_Q(a22, m22, n3, x22, h3, p22 >= 0 ? r[p22] : 0), c22 && d22 >= 0) {
        let t4 = r[d22];
        c22 < 16 ? (1 & c22 && m97596_Q(a22, m22, n3, w22, M22, t4), 2 & c22 && m97596_Q(a22, w22, n3, x22, M22, t4), 4 & c22 && m97596_Q(a22, m22, M22, w22, h3, t4), 8 & c22 && m97596_Q(a22, w22, M22, x22, h3, t4)) : m97596_Q(a22, m22, n3, x22, h3, t4, c22, o22);
      }
      r22.r0 + t3 !== r22.blend || r22.solid?.[f3] || m97596_m(a22, m22, n3, x22, h3, o22);
    }
  }
  m97596_K(t2, a22);
};
var m55548_Q = function(t2) {
  let e2 = t2.hz / 16, r22 = t2.H / 16, n2 = [{ name: "sky", kind: "sky", r0: 0, r1: e2 + 1, w0: 0, w1: 0, f: 0.26, fine: !1 }], l22 = (t3, n3) => Math.round(0.26 * (1 - ((t3 + n3) / 2 - e2) / (r22 - e2)) ** 1.6 * 100) / 100;
  for (let t3 = e2; t3 < r22; ) {
    let a22 = Math.min(r22, t3 + 4), o22 = t3 === e2 ? 0.26 : l22(t3, a22);
    o22 < 0.05 && (a22 = r22, o22 = 0), n2.push({ name: `w${t3}`, kind: "water", r0: t3 - 4, r1: a22 + 1, w0: t3, w1: a22, f: o22, fine: !1 }), t3 = a22;
  }
  return n2.splice(1, 0, { name: "horizon", kind: "horizon", r0: Math.max(0, Math.floor(Math.min(x2(t2), m2(t2)) / 16)), r1: e2 + 2, w0: 0, w1: 0, f: 0.26, fine: !0 }), n2;
};
var m55548_i = (t2, e2) => {
  let r22 = t2.find((t3) => t3.kind === "water");
  return t2.map((t3) => {
    var n2, l22, a22;
    let o22;
    return n2 = t3.r0, l22 = t3.r1, a22 = t3.kind === "water" && t3 !== r22 ? t3.w0 : void 0, o22 = (l22 - n2) * e2 * 3, { r0: n2, r1: l22, cols: e2, cells: new Int8Array(o22), drawn: new Int8Array(o22).fill(-2), blend: a22 };
  });
}, m55548_n = function(t2, e2, r22, n2, l22) {
  n2.forEach((n3, a22) => D2(l22[a22], j2(t2, e2, r22, n3), B2(l22[a22]), n3.fine));
};
var m55548_G = function(t2, e2) {
  let r22 = Math.round(1e3 * t2 * e2);
  return { "--par": r22 / e2 + "px", "--n": Math.max(1, r22) };
}, m55548_C = function(t2, r22, n2) {
  let l22 = -1;
  t2.forEach((a22, o22) => {
    if (a22.kind !== "water") return;
    let h22 = r22[o22];
    if (l22 >= 0 && h22.blend !== void 0) {
      let r3 = Math.ceil((t2[l22].f - a22.f) * 1e3 / m97596_h) + 1, o3 = new Uint8Array(h22.cols);
      for (let e2 of K2(t2[l22], n2)) if (O2(e2) >= a22.w0 - r3) for (let t3 = Math.max(0, e2.cx - 1); t3 < Math.min(h22.cols, e2.cx + e2.g.w + 1); t3++) o3[t3] = 1;
      for (let t3 = 0; t3 < h22.cols; t3++) o3[t3] !== (h22.solid?.[t3] ?? 0) && (h22.drawn[((h22.blend - h22.r0) * h22.cols + t3) * 3] = -2);
      h22.solid = o3;
    }
    l22 = o22;
  });
}, m55548_D = function(t2, e2) {
  for (let r22 of e2) for (let e3 = Math.floor(r22.cy) - 1; e3 < r22.cy + r22.g.h + 1; e3++) if (!(e3 < t2.r0) && !(e3 >= t2.r1)) for (let n2 = Math.max(0, r22.cx); n2 < Math.min(t2.cols, r22.cx + r22.g.w); n2++) t2.drawn[((e3 - t2.r0) * t2.cols + n2) * 3] = -2;
}, m55548_M = function(t2, r22, n2) {
  let l22 = -1;
  for (let a22 = t2.length - 1; a22 >= 0; a22--) {
    let o22 = t2[a22];
    if (o22.kind !== "water") continue;
    l22 = a22;
    let h22 = r22 - n2(a22);
    if (h22 >= o22.w0 * m97596_h && h22 < o22.w1 * m97596_h) return h22;
  }
  return l22 < 0 ? r22 : r22 - n2(l22);
};
export {
  m55548_C,
  m55548_D,
  O2 as m55548_E,
  m55548_G,
  B2 as m55548_I,
  m55548_M,
  m55548_Q,
  m55548_U,
  m55548_Z,
  K2 as m55548_b,
  m55548_i,
  P2 as m55548_j,
  m55548_n,
  m55548_q,
  D2 as m55548_r,
  j2 as m55548_v,
  m59908_$,
  m59908_A,
  m59908_B,
  m59908_C,
  m59908_F,
  I2 as m59908_G,
  y2 as m59908_I,
  A2 as m59908_N,
  z2 as m59908_P,
  m2 as m59908_T,
  x2 as m59908_c,
  w2 as m59908_d,
  L2 as m59908_h,
  H2 as m59908_o,
  m59908_z,
  y as m87928_C,
  p as m87928_F,
  m as m87928_G,
  w as m87928_O,
  L as m87928_Q,
  g as m87928_k,
  z as m87928_m,
  m87928_x,
  x as m87928_y,
  m89369_A,
  m89369_E,
  O as m89369_I,
  m89369_J,
  P as m89369_O,
  E as m89369_P,
  m89369_U,
  m89369_V,
  C as m89369_W,
  U as m89369__,
  m89369_i,
  k as m89369_m,
  j as m89369_x,
  m97596_B,
  m97596_D,
  m97596_K,
  m97596_P,
  m97596_Q,
  m97596_h,
  m97596_m,
  e as m97596_p,
  m97596_q,
  r as m97596_v,
  m97596_z
};
