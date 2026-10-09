/* Reticle embed: <img data-reticle="<circuits>:<id>" data-frame="0">. No wallet, key or backend. */
(function () {
  var RPCS = ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com", "https://xlayer.drpc.org"];
  var RENDERER = "__RENDERER__";
  var GAS_PER_GATE = __GAS_PER_GATE__;
  var GAS_BUDGET = __GAS_BUDGET__;
  var MAX = 6, active = 0, queue = [], mem = {};

  /* at most MAX requests in flight across every embed on the page */
  function slot(fn) {
    return new Promise(function (res, rej) {
      function go() {
        active++;
        fn().then(res, rej).then(function () { active--; var n = queue.shift(); if (n) n(); });
      }
      active < MAX ? go() : queue.push(go);
    });
  }

  function post(url, method, params) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) })
      .then(function (r) {
        if (r.status == 429 || r.status >= 500) throw { t: 1 };
        return r.json();
      })
      .then(function (j) {
        if (j.error) {
          if (j.error.code == -32005 || /rate|limit|too many|timeout/i.test(j.error.message)) throw { t: 1 };
          throw new Error(j.error.message);
        }
        return j.result;
      });
  }

  /* ordered endpoints, two backoff retries each on 429, 5xx and network errors, reverts fail at once */
  function rpc(method, params) {
    var i = 0, n = 0;
    function step() {
      return slot(function () { return post(RPCS[i], method, params); }).catch(function (e) {
        if (e instanceof Error && !(e instanceof TypeError)) throw e;
        if (n < 2) {
          n++;
          return new Promise(function (r) { setTimeout(r, (250 << n) + Math.random() * 250); }).then(step);
        }
        if (++i < RPCS.length) { n = 0; return step(); }
        throw 0;
      });
    }
    return step();
  }

  /* circuits are immutable: cache by circuits:id:frame:row in memory and sessionStorage */
  function cget(k) {
    if (mem[k]) return mem[k];
    try { return (mem[k] = sessionStorage.getItem("rt:" + k) || undefined); } catch (e) {}
  }
  function cset(k, v) {
    mem[k] = v;
    try { sessionStorage.setItem("rt:" + k, v); } catch (e) {}
  }

  function word(n) { return BigInt(n).toString(16).padStart(64, "0"); }
  function call(to, data) { return rpc("eth_call", [{ to: to, data: data }, "latest"]); }
  function slotAt(h, n) { return parseInt(h.substr(2 + n * 64, 64), 16); }

  function rowsToSvg(rows) {
    var w = rows.length, body = "";
    rows.forEach(function (row, y) {
      for (var x = 0; x < w; ) {
        if (!row[x]) { x++; continue; }
        var s = x;
        while (x < w && row[x]) x++;
        body += '<rect x="' + s + '" y="' + y + '" width="' + (x - s) + '" height="1"/>';
      }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + w + '" shape-rendering="crispEdges"><rect width="' + w + '" height="' + w + '" fill="#F2EFE6"/><g fill="#0B0B0C">' + body + "</g></svg>";
  }

  function evalRow(addr, id, yBits, frame, y) {
    var k = addr.toLowerCase() + ":" + id + ":" + frame + ":" + y, hit = cget(k);
    var input = ((y | (frame << yBits)) & 255).toString(16).padStart(2, "0").padEnd(64, "0");
    return (hit ? Promise.resolve(hit) : call(addr, "0x934d06ea" + word(id) + word(64) + word(1) + input).then(function (h) { cset(k, h); return h; })).then(function (h) {
      var row = [];
      for (var x = 0; x < (1 << yBits); x++) row.push(((parseInt(h.substr(2 + 128 + (x >> 3) * 2, 2), 16) >> (x & 7)) & 1) === 1);
      return row;
    });
  }

  function viaEval(addr, id, frame, info) {
    var yBits = Math.log2(info.w), rows = [], next = 0;
    function worker() {
      if (next >= info.w) return Promise.resolve();
      var y = next++;
      return evalRow(addr, id, yBits, frame, y).then(function (r) { rows[y] = r; return worker(); });
    }
    return Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]).then(function () { return rowsToSvg(rows); });
  }

  function viaRenderer(addr, id, frame) {
    return call(RENDERER, "0xb9a4e835" + addr.slice(2).toLowerCase().padStart(64, "0") + word(id) + word(frame)).then(function (h) {
      var len = slotAt(h, 1), bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = parseInt(h.substr(2 + 128 + i * 2, 2), 16);
      return new TextDecoder().decode(bytes);
    });
  }

  function show(img, id, svg, label, verify) {
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    img.style.imageRendering = "pixelated";
    if (!img.alt) img.alt = "Reticle #" + id;
    img.setAttribute("data-reticle-state", "ok");
    if (verify) img.title = "rendered from chain, " + label;
  }

  function render(img) {
    var spec = (img.getAttribute("data-reticle") || "").split(":");
    var addr = spec[0], id = spec[1], frame = +(img.getAttribute("data-frame") || 0), verify = img.hasAttribute("data-verify");
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr) || !/^\d+$/.test(id || "")) { img.setAttribute("data-reticle-state", "error"); return Promise.resolve(); }
    img.setAttribute("data-reticle-state", "loading");
    var key = addr.toLowerCase() + ":" + id + ":" + frame + ":svg", hit = cget(key);
    if (hit) { var c = JSON.parse(hit); show(img, id, c[0], "block " + c[2] + " (" + c[1] + ", session cache)", verify); return Promise.resolve(); }
    return call(addr, "0x084d60f1" + word(id))
      .then(function (h) {
        var info = { nIn: slotAt(h, 0), w: slotAt(h, 1), gates: slotAt(h, 3) };
        var eval_ = function () { return viaEval(addr, id, frame, info).then(function (s) { return [s, "per-row eval"]; }); };
        return RENDERER && info.gates * info.w * GAS_PER_GATE < GAS_BUDGET
          ? viaRenderer(addr, id, frame).then(function (s) { return [s, "ReticleRenderer.svg"]; }, eval_)
          : eval_();
      })
      .then(function (r) {
        return (verify ? rpc("eth_blockNumber", []) : Promise.resolve("0x0")).then(function (b) {
          b = parseInt(b, 16);
          cset(key, JSON.stringify([r[0], r[1], b]));
          show(img, id, r[0], "block " + b + " (" + r[1] + ")", verify);
        });
      })
      .catch(function () { img.setAttribute("data-reticle-state", "error"); });
  }

  function run() { [].forEach.call(document.querySelectorAll("img[data-reticle]"), render); }
  window.Reticle = { render: render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
