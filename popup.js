/* Chisa · hilo de subida — lógica del popup.
   Sin dependencias: storage, mensajes al puente y pintado del registro. */

const $ = (id) => document.getElementById(id);
const HAS_CHROME = typeof chrome !== "undefined" && !!chrome.tabs && !!chrome.storage;

const store = {
  active: false,
  dryRun: true,
  canvas: true,
  hits: [],
  tabId: null,
  onTikTok: false,
  onUpload: false,
  alive: false,
};

start();

async function start() {
  $("ver").textContent = "v" + (HAS_CHROME ? chrome.runtime.getManifest().version : "0.2.0");
  bind();

  if (!HAS_CHROME) {
    $("previewTag").hidden = false;
    Object.assign(store, {
      onTikTok: true,
      onUpload: true,
      alive: true,
      active: true,
      dryRun: false,
      canvas: true,
      hits: new URLSearchParams(location.search).has("empty") ? [] : demoHits(),
    });
    render();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  store.tabId = tab ? tab.id : null;
  const url = (tab && tab.url) || "";
  store.onTikTok = /^https:\/\/([a-z0-9-]+\.)?tiktok\.com\//i.test(url);
  store.onUpload = /\/upload|\/creator|\/studio/i.test(url);

  const saved = await chrome.storage.local.get(["chisaHilo", "chisaHits"]);
  const cfg = saved.chisaHilo || {};
  store.active = !!cfg.active;
  store.dryRun = cfg.dryRun !== false;
  store.canvas = cfg.canvas !== false;
  store.hits = Array.isArray(saved.chisaHits) ? saved.chisaHits : [];

  render();
  watch();
  ping();
}

function bind() {
  $("active").addEventListener("change", (e) => save({ active: e.target.checked }));
  $("canvas").addEventListener("change", (e) => save({ canvas: e.target.checked }));
  $("dryRun").addEventListener("change", (e) => save({ dryRun: e.target.checked }));
  $("copy").addEventListener("click", copyReport);
  $("clear").addEventListener("click", clearLog);
}

function save(patch) {
  Object.assign(store, patch);
  render();

  if (!HAS_CHROME) return;

  chrome.storage.local.set({
    chisaHilo: {
      active: store.active,
      dryRun: store.dryRun,
      canvas: store.canvas,
    },
  });

  if (store.tabId) {
    chrome.tabs
      .sendMessage(store.tabId, {
        type: "chisa:config",
        active: store.active,
        dryRun: store.dryRun,
        canvas: store.canvas,
      })
      .catch(() => {});
  }
}

function watch() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.chisaHits) {
      store.hits = Array.isArray(changes.chisaHits.newValue)
        ? changes.chisaHits.newValue
        : [];
      renderLog();
    }

    if (changes.chisaHilo) {
      const cfg = changes.chisaHilo.newValue || {};
      store.active = !!cfg.active;
      store.dryRun = cfg.dryRun !== false;
      store.canvas = cfg.canvas !== false;
      render();
    }
  });
}

async function ping() {
  if (!store.tabId) return;

  try {
    const res = await chrome.tabs.sendMessage(store.tabId, { type: "chisa:status" });
    if (res && res.ok) {
      store.alive = true;
      store.onTikTok = true;
      store.onUpload = /\/upload|\/creator|\/studio/i.test(res.href || "");
      render();
    }
  } catch (_) {
    store.alive = false;
    render();
  }
}

/* ---------------------------------------------------------------- */
/* pintado                                                           */
/* ---------------------------------------------------------------- */

function render() {
  $("active").checked = store.active;
  $("canvas").checked = store.canvas;
  $("canvas").disabled = !store.active;
  $("canvasRow").classList.toggle("is-idle", !store.active);
  $("dryRun").checked = store.dryRun;
  $("dryRun").disabled = !store.active;
  $("dryRow").classList.toggle("is-idle", !store.active);

  const status = document.querySelector(".status");
  status.classList.remove("is-live", "is-warn", "is-off");

  let title = "Fuera de TikTok";
  let hint = "Abre tiktok.com para usar el corte.";

  if (store.onTikTok && !store.alive && HAS_CHROME) {
    status.classList.add("is-warn");
    title = "TikTok · recarga la pestaña";
    hint = "La extensión se instala al cargar la página.";
  } else if (store.onTikTok && store.onUpload) {
    status.classList.add("is-live");
    title = "TikTok · en la subida";
    hint = store.active
      ? store.dryRun
        ? "Observando: no se modifica nada."
        : "Cortando el hilo en cada subida."
      : "El corte está apagado.";
  } else if (store.onTikTok) {
    status.classList.add("is-live");
    title = "TikTok · fuera de la subida";
    hint = "Entra en la pantalla de subida.";
  } else if (!HAS_CHROME) {
    status.classList.add("is-live");
    title = "TikTok · en la subida";
    hint = "Vista previa con datos de ejemplo.";
  } else {
    status.classList.add("is-off");
  }

  $("tabState").textContent = title;
  $("tabHint").textContent = hint;
  renderLog();
}

function renderLog() {
  const list = $("hits");
  list.textContent = "";
  $("empty").hidden = store.hits.length > 0;

  for (const hit of store.hits.slice(0, 12)) {
    const li = document.createElement("li");
    li.className = "hit hit-" + hit.kind;

    const time = document.createElement("time");
    time.textContent = new Date(hit.at).toLocaleTimeString("es-ES", { hour12: false });

    const path = document.createElement("span");
    path.className = "path";
    path.textContent = shortPath(hit.url);
    path.title = hit.url;

    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent =
      hit.kind === "hit" ? "cortado" : hit.kind === "dry" ? "observado" : "visto";

    const detail = document.createElement("span");
    detail.className = "detail";
    const n = (hit.removed ? hit.removed.length : 0) + (hit.forced ? hit.forced.length : 0);
    detail.textContent =
      hit.kind === "miss"
        ? "sin cambios"
        : n + (n === 1 ? " campo" : " campos") +
          (hit.removed && hit.removed.length ? " · " + hit.removed.slice(0, 3).join(", ") : "");

    li.append(time, path, kind, detail);
    list.appendChild(li);
  }
}

function shortPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? "…" : "");
  } catch (_) {
    return String(url).slice(0, 48);
  }
}

/* ---------------------------------------------------------------- */
/* acciones                                                          */
/* ---------------------------------------------------------------- */

async function copyReport() {
  const lines = [
    "Chisa · hilo de subida",
    "activo: " +
      (store.active ? "sí" : "no") +
      " · modo: " +
      (store.dryRun ? "observar" : "cortar") +
      " · lienzo: " +
      (store.canvas ? "sí" : "no"),
    "",
  ];

  if (!store.hits.length) lines.push("(sin registros)");

  for (const hit of store.hits.slice(0, 20)) {
    lines.push(
      [
        new Date(hit.at).toISOString(),
        hit.kind,
        hit.method,
        hit.url,
        "quitados=[" + (hit.removed || []).join(", ") + "]",
        "forzados=[" + (hit.forced || []).join(", ") + "]",
      ].join(" ")
    );
  }

  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    flash("copy", "Copiado");
  } catch (_) {
    flash("copy", "No se pudo");
  }
}

async function clearLog() {
  store.hits = [];
  renderLog();

  if (!HAS_CHROME) return;
  await chrome.storage.local.set({ chisaHits: [] });
  flash("clear", "Limpio");
}

function flash(id, text) {
  const button = $(id);
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}

/* ---------------------------------------------------------------- */
/* vista previa (sin chrome.*)                                       */
/* ---------------------------------------------------------------- */

function demoHits() {
  const now = Date.now();
  return [
    {
      at: now - 40000,
      kind: "hit",
      method: "POST",
      url: "https://www.tiktok.com/api/post/item/create/?aid=1988",
      removed: ["draft", "canvas_config", "vedit_segment_info"],
      forced: ["post_type: 2 → 3", "cloud_edit_is_use_video_canvas: → false"],
    },
    {
      at: now - 220000,
      kind: "dry",
      method: "POST",
      url: "https://www.tiktok.com/api/post/item/create/?aid=1988",
      removed: ["draft", "canvas_config"],
      forced: ["post_type: 2 → 3"],
    },
    {
      at: now - 600000,
      kind: "miss",
      method: "POST",
      url: "https://www.tiktok.com/api/upload/chunk/",
      removed: [],
      forced: [],
    },
  ];
}
