/* Chisa · hilo de subida — script de página (mundo MAIN).
   No usa ninguna API de la extensión: solo envuelve fetch/XHR y avisa por
   postMessage. Todo el análisis ocurre aquí, en tu navegador. */

(function () {
  "use strict";

  if (window.__CHISA_HILO__) return;
  window.__CHISA_HILO__ = { version: "0.2.0" };

  /* Reglas del modo 720: las mismas que usa el editor web de TikTok para
     decidir si un vídeo pasa por su lienzo en la nube (y si lo recomprime). */
  const DELETE_KEYS = ["draft", "canvas_config", "vedit_segment_info"];

  /* El cuerpo solo se toca si trae una de estas raíces en el primer nivel. */
  const TRIGGERS = ["single_post_req_list", "vedit_common_info", "post_common_info"];

  let active = false;
  let dryRun = true;
  let canvas = true;
  let gotConfig = false;

  function post(type, data) {
    try {
      window.postMessage(Object.assign({ source: "chisa-hilo", type: type }, data || {}), "*");
    } catch (_) {
      /* silencio: nunca romper la página por un mensaje */
    }
  }

  function isTarget(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin === location.origin) return true;
      return /(^|\.)tiktok\.com$/i.test(u.hostname);
    } catch (_) {
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* limpieza                                                          */
  /* ---------------------------------------------------------------- */

  function walk(node, path, out) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], path + "[" + i + "]", out);
      return;
    }

    for (const key of Object.keys(node)) {
      const value = node[key];
      const where = path ? path + "." + key : key;

      if (DELETE_KEYS.indexOf(key) !== -1) {
        delete node[key];
        out.removed.push(where);
        continue;
      }

      if (key === "post_type" && value === 2) {
        node[key] = 3;
        out.forced.push(where + ": 2 → 3");
        continue;
      }

      if (key === "cloud_edit_is_use_video_canvas" && value !== undefined && value !== false) {
        node[key] = false;
        out.forced.push(where + ": → false");
        continue;
      }

      walk(value, where, out);
    }
  }

  function sanitize(root) {
    const out = { removed: [], forced: [] };
    walk(root, "", out);
    return {
      removed: out.removed,
      forced: out.forced,
      changed: out.removed.length + out.forced.length > 0,
    };
  }

  function hasTrigger(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    return TRIGGERS.some(function (key) {
      return !!node[key];
    });
  }

  /* Devuelve el body ya cortado, o null si no hay nada que tocar. */
  function handle(text, url, method) {
    if (typeof text !== "string" || text.length < 2) return null;

    let body;
    try {
      body = JSON.parse(text);
    } catch (_) {
      return null;
    }
    if (!body || typeof body !== "object" || !hasTrigger(body)) return null;

    const result = sanitize(body);
    const info = {
      url: String(url),
      method: String(method),
      removed: result.removed,
      forced: result.forced,
      bytesIn: text.length,
    };

    if (!result.changed) {
      post("miss", info);
      return null;
    }

    if (dryRun) {
      post("dry", info);
      return null;
    }

    const out = JSON.stringify(body);
    info.bytesOut = out.length;
    post("hit", info);
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* lienzo (modo 720)                                                 */
  /* ---------------------------------------------------------------- */

  function isUploadPage() {
    const href = location.href;
    return href.indexOf("/upload") !== -1 || href.indexOf("/creator-center") !== -1;
  }

  /* Un blob de 8 bytes, con la misma URL para cualquier vídeo: el editor de
     TikTok no puede leer el archivo y no lo pasa por su lienzo en la nube. */
  const nativeCreateObjectURL = URL.createObjectURL;
  let dummyUrl = null;

  function dummy() {
    if (dummyUrl) return dummyUrl;
    try {
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      dummyUrl = nativeCreateObjectURL.call(URL, new Blob([bytes], { type: "application/octet-stream" }));
    } catch (_) {
      dummyUrl = null;
    }
    return dummyUrl;
  }

  URL.createObjectURL = function (obj) {
    try {
      if (active && !dryRun && canvas && isUploadPage()) {
        const url = dummy();
        if (url) return url;
      }
    } catch (_) {
      /* ante cualquier duda, se devuelve el objeto original */
    }
    return nativeCreateObjectURL.call(URL, obj);
  };

  /* ---------------------------------------------------------------- */
  /* fetch                                                             */
  /* ---------------------------------------------------------------- */

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      try {
        if (!active) return nativeFetch.apply(this, arguments);

        const method = String(
          (init && init.method) || (input && input.method) || "GET"
        ).toUpperCase();
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (method === "GET" || !isTarget(url)) return nativeFetch.apply(this, arguments);

        if (typeof Request !== "undefined" && input instanceof Request) {
          const copy = input.clone();
          return copy
            .text()
            .then((text) => {
              const out = handle(text, url, method);
              if (!out) return nativeFetch.call(this, input, init);
              return nativeFetch.call(this, input, Object.assign({}, init, { body: out }));
            })
            .catch(() => nativeFetch.call(this, input, init));
        }

        if (init && typeof init.body === "string") {
          const out = handle(init.body, url, method);
          if (out) init = Object.assign({}, init, { body: out });
          return nativeFetch.call(this, input, init);
        }

        if (
          init &&
          init.body &&
          typeof init.body === "object" &&
          !(init.body instanceof FormData) &&
          !(init.body instanceof Blob) &&
          !(init.body instanceof ArrayBuffer) &&
          !ArrayBuffer.isView(init.body)
        ) {
          const out = handle(JSON.stringify(init.body), url, method);
          if (out) init = Object.assign({}, init, { body: out });
          return nativeFetch.call(this, input, init);
        }

        return nativeFetch.apply(this, arguments);
      } catch (_) {
        return nativeFetch.apply(this, arguments);
      }
    };
  }

  /* ---------------------------------------------------------------- */
  /* XMLHttpRequest                                                    */
  /* ---------------------------------------------------------------- */

  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const nativeOpen = XHR.prototype.open;
    const nativeSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      this.__chisaHilo = {
        method: String(method || "GET").toUpperCase(),
        url: String(url || ""),
      };
      return nativeOpen.apply(this, arguments);
    };

    XHR.prototype.send = function (body) {
      try {
        const meta = this.__chisaHilo;
        if (
          active &&
          meta &&
          meta.method !== "GET" &&
          isTarget(meta.url) &&
          typeof body === "string"
        ) {
          const out = handle(body, meta.url, meta.method);
          if (out) body = out;
        }
      } catch (_) {
        /* si algo falla, se envía el body original */
      }
      return nativeSend.call(this, body);
    };
  }

  /* ---------------------------------------------------------------- */
  /* aviso en la página                                                */
  /* ---------------------------------------------------------------- */

  function badge() {
    const onUpload = /\/upload|\/creator|\/studio/i.test(location.href);
    let el = document.getElementById("chisa-hilo-badge");

    if (!active || !onUpload) {
      if (el) el.remove();
      return;
    }

    if (!el) {
      el = document.createElement("div");
      el.id = "chisa-hilo-badge";
      (document.body || document.documentElement).appendChild(el);
    }

    el.textContent =
      "千 Chisa · " +
      (dryRun ? "observando" : "corte activo" + (canvas ? " + lienzo" : ""));
    el.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "padding:7px 11px",
      "background:#0a0a0c",
      "color:#f3efe8",
      "border:1px solid rgba(208,32,46,.7)",
      "border-top:2px solid #d0202e",
      "border-radius:2px",
      "font:600 11px/1.2 'Segoe UI',system-ui,sans-serif",
      "letter-spacing:.08em",
      "text-transform:uppercase",
      "box-shadow:0 8px 24px rgba(0,0,0,.5)",
      "pointer-events:none",
    ].join(";");
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "chisa-hilo-ext" || data.type !== "config") return;

    active = !!data.active;
    dryRun = !!data.dryRun;
    canvas = data.canvas !== false;
    gotConfig = true;
    badge();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", badge);
  } else {
    badge();
  }

  /* El puente puede inyectarse un instante después: se anuncia hasta que
     conteste, sin bucles infinitos. */
  let tries = 0;
  const timer = setInterval(function () {
    if (gotConfig || tries++ > 24) {
      clearInterval(timer);
      return;
    }
    post("ready", { version: "0.2.0" });
  }, 250);
  post("ready", { version: "0.2.0" });
})();
