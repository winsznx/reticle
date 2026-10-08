/* Reticle embed: <img data-reticle="<circuits>:<id>" data-frame="0">. No wallet, key or backend. */
(function () {
  var RPCS = ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com", "https://xlayer.drpc.org"];
  var RENDERER = "__RENDERER__";
  var GAS_PER_GATE = __GAS_PER_GATE__;
  var GAS_BUDGET = __GAS_BUDGET__;

  function rpc(method, params, i) {
    i = i || 0;
    return fetch(RPCS[i], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.error) throw new Error(j.error.message);
        return j.result;
      })
      .catch(function (e) {
        if (i + 1 < RPCS.length && !/revert/i.test(e.message)) return rpc(method, params, i + 1);
        throw e;
      });
  }

  function word(n) { return BigInt(n).toString(16).padStart(64, "0"); }
  function call(to, data) { return rpc("eth_call", [{ to: to, data: data }, "latest"]); }
  function slot(h, n) { return parseInt(h.substr(2 + n * 64, 64), 16); }

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

  function evalRow(addr, id, yBits, nIn, frame, y) {
    var input = ((y | (frame << yBits)) & 255).toString(16).padStart(2, "0").padEnd(64, "0");
    return call(addr, "0x934d06ea" + word(id) + word(64) + word(1) + input).then(function (h) {
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
      return evalRow(addr, id, yBits, info.nIn, frame, y).then(function (r) { rows[y] = r; return worker(); });
    }
    return Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]).then(function () { return rowsToSvg(rows); });
  }

  function viaRenderer(addr, id, frame) {
    return call(RENDERER, "0xb9a4e835" + addr.slice(2).toLowerCase().padStart(64, "0") + word(id) + word(frame)).then(function (h) {
      var len = slot(h, 1), bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = parseInt(h.substr(2 + 128 + i * 2, 2), 16);
      return new TextDecoder().decode(bytes);
    });
  }

  function render(img) {
    var spec = (img.getAttribute("data-reticle") || "").split(":");
    var addr = spec[0], id = spec[1], frame = +(img.getAttribute("data-frame") || 0);
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr) || !/^\d+$/.test(id || "")) { img.setAttribute("data-reticle-state", "error"); return Promise.resolve(); }
    img.setAttribute("data-reticle-state", "loading");
    return call(addr, "0x084d60f1" + word(id))
      .then(function (h) {
        var info = { nIn: slot(h, 0), w: slot(h, 1), gates: slot(h, 3) };
        var fits = RENDERER && info.gates * info.w * GAS_PER_GATE < GAS_BUDGET;
        var run = fits
          ? viaRenderer(addr, id, frame).then(function (s) { return [s, "ReticleRenderer.svg"]; }, function () { return viaEval(addr, id, frame, info).then(function (s) { return [s, "per-row eval"]; }); })
          : viaEval(addr, id, frame, info).then(function (s) { return [s, "per-row eval"]; });
        return run;
      })
      .then(function (r) {
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r[0]);
        img.style.imageRendering = "pixelated";
        if (!img.alt) img.alt = "Reticle circuit #" + id + ", drawn by its own gates on X Layer";
        img.setAttribute("data-reticle-state", "ok");
        if (img.hasAttribute("data-verify")) {
          return rpc("eth_blockNumber", []).then(function (b) {
            img.title = "rendered from chain, block " + parseInt(b, 16) + " (" + r[1] + ")";
          });
        }
      })
      .catch(function () { img.setAttribute("data-reticle-state", "error"); });
  }

  function run() { [].forEach.call(document.querySelectorAll("img[data-reticle]"), render); }
  window.Reticle = { render: render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
