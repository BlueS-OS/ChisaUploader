/* Chisa · hilo de subida — puente (mundo aislado).
   Lee la configuración de chrome.storage, se la pasa a page.js y guarda el
   registro de lo que se ha visto/cortado. */

(function () {
  "use strict";

  const KEY = "chisaHilo";
  const HITS = "chisaHits";
  const MAX_HITS = 25;

  let cfg = { active: false, dryRun: true, canvas: true };

  function push() {
    window.postMessage(
      {
        source: "chisa-hilo-ext",
        type: "config",
        active: cfg.active,
        dryRun: cfg.dryRun,
        canvas: cfg.canvas,
      },
      "*"
    );
  }

  function load() {
    chrome.storage.local.get(KEY, function (data) {
      const saved = data[KEY] || {};
      cfg = {
        active: !!saved.active,
        dryRun: saved.dryRun !== false,
        canvas: saved.canvas !== false,
      };
      push();
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes[KEY]) return;
    const saved = changes[KEY].newValue || {};
    cfg = {
      active: !!saved.active,
      dryRun: saved.dryRun !== false,
      canvas: saved.canvas !== false,
    };
    push();
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "chisa-hilo") return;

    if (data.type === "ready") {
      push();
      return;
    }

    if (data.type !== "hit" && data.type !== "dry" && data.type !== "miss") return;

    chrome.storage.local.get(HITS, function (saved) {
      const hits = Array.isArray(saved[HITS]) ? saved[HITS] : [];
      hits.unshift({
        at: Date.now(),
        kind: data.type,
        url: String(data.url || ""),
        method: String(data.method || ""),
        removed: Array.isArray(data.removed) ? data.removed : [],
        forced: Array.isArray(data.forced) ? data.forced : [],
        bytesIn: Number(data.bytesIn) || 0,
        bytesOut: Number(data.bytesOut) || 0,
      });
      chrome.storage.local.set({ [HITS]: hits.slice(0, MAX_HITS) });
    });
  });

  chrome.runtime.onMessage.addListener(function (message, sender, reply) {
    if (!message) return;

    if (message.type === "chisa:status") {
      reply({
        ok: true,
        active: cfg.active,
        dryRun: cfg.dryRun,
        canvas: cfg.canvas,
        href: location.href,
      });
      return;
    }

    if (message.type === "chisa:config") {
      cfg = {
        active: !!message.active,
        dryRun: !!message.dryRun,
        canvas: message.canvas !== false,
      };
      push();
      reply({ ok: true });
    }
  });

  load();
})();
