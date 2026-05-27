/* ══════════════════════════════════════════
   galeria.js
   ══════════════════════════════════════════
   ⚠️  ANTES DE USAR: rellena las 4 variables
   de configuración aquí abajo.
   ══════════════════════════════════════════ */

var CONFIG = {
  // ── Cloudinary ──────────────────────────
  CLOUD_NAME   : "dp7mmtidz",           // tu cloud name
  UPLOAD_PRESET: "panoramicas_uis",     // tu preset (unsigned)

  // ── JSONBin ─────────────────────────────
  JSONBIN_KEY  : "$2a$10$/qNjsBdnTJBExz6gFnIsoutG83/fBAlxpU3jXm9QBiF9SX0j9VpS6", // Master Key
  BIN_ID       : "6a164007f47d5c455c3b4387"  // bin "UIS"
};

/* ── URLs base ─────────────────────────── */
var CL_URL = "https://api.cloudinary.com/v1_1/" + CONFIG.CLOUD_NAME + "/image/upload";
var JB_URL = "https://api.jsonbin.io/v3/b/" + CONFIG.BIN_ID;
var JB_HDR = {
  "X-Master-Key": CONFIG.JSONBIN_KEY,
  "Content-Type": "application/json"
};

/* ── Estado ────────────────────────────── */
var todasLasImagenes = [];   // array cargado de JSONBin
var filtroActual     = "todas";
var tipoSubida       = "panoramica";
var archivoSubida    = null;

// visor featured
var fScale = 1, fOx = 0, fOy = 0;
var fDrag = false, fDx, fDy, fDox, fDoy;

// visor modal
var mScale = 1, mOx = 0, mOy = 0;
var mDrag = false, mDx, mDy, mDox, mDoy;
var modalIdActual = null;


var featuredScale = 1;
var featuredX = 0;
var featuredY = 0;

var featuredDragging = false;
var featuredStartX = 0;
var featuredStartY = 0;
var featuredOriginX = 0;
var featuredOriginY = 0;

var featuredViewer = document.getElementById("featured-viewer");
var featuredImg = document.getElementById("featured-img");

function applyFeaturedTransform() {
  featuredImg.style.transform =
    "translate(" + featuredX + "px," + featuredY + "px) scale(" + featuredScale + ")";
}

window.zoomFeatured = function (factor) {
  featuredScale *= factor;

  // límites
  featuredScale = Math.max(0.3, Math.min(featuredScale, 20));

  applyFeaturedTransform();
};

window.resetFeatured = function () {
  featuredScale = 1;
  featuredX = 0;
  featuredY = 0;

  applyFeaturedTransform();
};

// ── ZOOM con rueda ──
featuredViewer.addEventListener("wheel", function (e) {
  e.preventDefault();

  var rect = featuredViewer.getBoundingClientRect();

  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;

  var factor = e.deltaY < 0 ? 1.12 : 0.88;

  featuredX = mx - (mx - featuredX) * factor;
  featuredY = my - (my - featuredY) * factor;

  featuredScale *= factor;

  featuredScale = Math.max(0.3, Math.min(featuredScale, 20));

  applyFeaturedTransform();

}, { passive: false });

// ── DRAG ──
featuredViewer.addEventListener("mousedown", function (e) {

  featuredDragging = true;

  featuredStartX = e.clientX;
  featuredStartY = e.clientY;

  featuredOriginX = featuredX;
  featuredOriginY = featuredY;

  featuredViewer.style.cursor = "grabbing";
});

window.addEventListener("mousemove", function (e) {

  if (!featuredDragging) return;

  featuredX = featuredOriginX + (e.clientX - featuredStartX);
  featuredY = featuredOriginY + (e.clientY - featuredStartY);

  applyFeaturedTransform();
});

window.addEventListener("mouseup", function () {

  featuredDragging = false;
  featuredViewer.style.cursor = "grab";
});



/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", function () {
  cargarGaleria();
  initFeaturedViewer();
  initModalViewer();
  initSubirArea();
});

/* ══════════════════════════════════════════
   JSONBIN — leer
   ══════════════════════════════════════════ */
async function cargarGaleria() {
  try {
    var res = await fetch(JB_URL + "/latest", {
      headers: { "X-Master-Key": CONFIG.JSONBIN_KEY }
    });
    if (!res.ok) throw new Error("JSONBin error " + res.status);
    var json = await res.json();
    // filtra objetos de inicialización que no sean entradas reales
    var raw = Array.isArray(json.record) ? json.record : [];
    todasLasImagenes = raw.filter(function (x) {
      return x && x.id && x.url && x.nombre;
    });
    renderGaleria();
    renderDashboard();
  } catch (e) {
    console.error("No se pudo cargar la galería:", e);
    document.getElementById("pano-grid").innerHTML =
      '<div class="grid-empty"><div class="empty-icon">⚠️</div>' +
      '<h3>No se pudo cargar la galería</h3>' +
      '<p>Verifica que el BIN_ID y la API Key de JSONBin sean correctos.</p></div>';
    document.getElementById("podium").innerHTML =
      '<div class="podium-loading">No se pudo cargar el ranking.</div>';
  }
}

/* ══════════════════════════════════════════
   JSONBIN — guardar todo el array
   ══════════════════════════════════════════ */
async function guardarBin() {
  var res = await fetch(JB_URL, {
    method : "PUT",
    headers: JB_HDR,
    body   : JSON.stringify(todasLasImagenes.filter(function(x){ return x && x.id && x.url && x.nombre; }))
  });
  if (!res.ok) throw new Error("No se pudo guardar en JSONBin: " + res.status);
}

/* ══════════════════════════════════════════
   RENDER GALERÍA
   ══════════════════════════════════════════ */
function renderGaleria() {
  var grid = document.getElementById("pano-grid");

  var lista = todasLasImagenes.slice().sort(function (a, b) {
    return b.likes - a.likes;
  });

  if (filtroActual === "panoramica") {
    lista = lista.filter(function (x) { return x.tipo === "panoramica"; });
  } else if (filtroActual === "megapixel") {
    lista = lista.filter(function (x) { return x.tipo === "megapixel"; });
  } else if (filtroActual === "recientes") {
    lista = lista.slice().sort(function (a, b) {
      return new Date(b.fecha) - new Date(a.fecha);
    });
  }

  if (!lista.length) {
    grid.innerHTML =
      '<div class="grid-empty">' +
      '<div class="empty-icon">🖼️</div>' +
      '<h3>Aún no hay imágenes</h3>' +
      '<p>¡Sé el primero en publicar tu panorámica!</p></div>';
    return;
  }

  // ranking global por likes (para medallas)
  var rankMap = {};
  todasLasImagenes.slice().sort(function (a, b) { return b.likes - a.likes; })
    .forEach(function (item, i) { rankMap[item.id] = i + 1; });

  grid.innerHTML = lista.map(function (item) {
    var rank = rankMap[item.id];
    var medalHtml = "";
    if (rank === 1) medalHtml = '<div class="card-rank gold">1</div>';
    else if (rank === 2) medalHtml = '<div class="card-rank silver">2</div>';
    else if (rank === 3) medalHtml = '<div class="card-rank bronze">3</div>';

    var liked = estaLiked(item.id);
    var fecha = formatFecha(item.fecha);
    var tipoLabel = item.tipo === "panoramica" ? "🌅 Panorámica" : "🔭 Megapixel";

    return (
      '<div class="pano-card" onclick="abrirModal(\'' + item.id + '\')">' +
        '<div class="card-thumb">' +
          '<img src="' + item.url + '" alt="' + item.nombre + '" loading="lazy">' +
          '<div class="card-tipo">' + tipoLabel + '</div>' +
          medalHtml +
        '</div>' +
        '<div class="card-body">' +
          '<div>' +
            '<div class="card-autor">' + escHtml(item.nombre) + '</div>' +
            '<div class="card-fecha">' + fecha + '</div>' +
          '</div>' +
          '<button class="like-btn ' + (liked ? "liked" : "") + '" ' +
            'onclick="toggleLike(event, \'' + item.id + '\')">' +
            '<span class="like-heart">♥</span>' +
            '<span id="lc-' + item.id + '">' + item.likes + '</span>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }).join("");
}

/* ── filtrar ── */
window.filtrar = function (tipo, btn) {
  filtroActual = tipo;
  document.querySelectorAll(".filter-tab").forEach(function (b) {
    b.classList.remove("active");
  });
  btn.classList.add("active");
  renderGaleria();
};

/* ══════════════════════════════════════════
   DASHBOARD / RANKING
   ══════════════════════════════════════════ */
function renderDashboard() {
  var sorted = todasLasImagenes.slice().sort(function (a, b) {
    return b.likes - a.likes;
  });

  // ── Podio ──
  var podium = document.getElementById("podium");
  var top3 = sorted.slice(0, 3);

  if (!top3.length) {
    podium.innerHTML = '<div class="podium-loading">Aún no hay imágenes en la galería.</div>';
  } else {
    // reordenar para visual: 2º · 1º · 3º
    var orden = [top3[1], top3[0], top3[2]].filter(Boolean);
    var ranks = [2, 1, 3];

    podium.innerHTML = orden.map(function (item, i) {
      var r = item === top3[0] ? 1 : item === top3[1] ? 2 : 3;
      return (
        '<div class="podium-item rank-' + r + '" onclick="abrirModal(\'' + item.id + '\')">' +
          '<div class="podium-thumb">' +
            '<img src="' + item.url + '" alt="' + item.nombre + '" loading="lazy">' +
            '<div class="podium-medal">' + r + '</div>' +
          '</div>' +
          '<div class="podium-bar"></div>' +
          '<div class="podium-name">' + escHtml(item.nombre) + '</div>' +
          '<div class="podium-likes">♥ ' + item.likes + ' likes</div>' +
        '</div>'
      );
    }).join("");
  }

  // ── Stats ──
  var totalLikes = todasLasImagenes.reduce(function (s, x) { return s + (parseInt(x.likes) || 0); }, 0);
  var totalImg   = todasLasImagenes.length;
  var leader     = sorted[0] ? sorted[0].nombre : "—";

  document.getElementById("stats-row").innerHTML =
    '<div class="stat-card">' +
      '<div class="stat-icon teal">🖼️</div>' +
      '<div><div class="stat-val">' + totalImg + '</div><div class="stat-lbl">Panorámicas publicadas</div></div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="stat-icon blue">♥</div>' +
      '<div><div class="stat-val">' + totalLikes + '</div><div class="stat-lbl">Likes totales</div></div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="stat-icon gold">🏆</div>' +
      '<div><div class="stat-val" style="font-size:18px">' + escHtml(leader) + '</div>' +
      '<div class="stat-lbl">Líder del ranking</div></div>' +
    '</div>';
}

/* ══════════════════════════════════════════
   LIKES
   ══════════════════════════════════════════ */
function getLikedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem("uis_likes") || "[]"));
  } catch (e) { return new Set(); }
}

function saveLikedSet(s) {
  localStorage.setItem("uis_likes", JSON.stringify(Array.from(s)));
}

function estaLiked(id) {
  return getLikedSet().has(id);
}

window.toggleLike = async function (e, id) {
  e.stopPropagation();

  var liked = getLikedSet();
  var item  = todasLasImagenes.find(function (x) { return x.id === id; });
  if (!item) return;

  if (liked.has(id)) {
    item.likes = Math.max(0, item.likes - 1);
    liked.delete(id);
  } else {
    item.likes += 1;
    liked.add(id);
  }

  saveLikedSet(liked);

  // actualizar UI inmediato
  var ctr = document.getElementById("lc-" + id);
  if (ctr) ctr.textContent = item.likes;
  var btn = ctr ? ctr.closest(".like-btn") : null;
  if (btn) btn.classList.toggle("liked", liked.has(id));

  // actualizar modal si está abierto
  if (modalIdActual === id) {
    var ml = document.getElementById("modal-likes");
    if (ml) ml.textContent = item.likes;
    var mlb = document.getElementById("modal-like-btn");
    if (mlb) mlb.classList.toggle("liked", liked.has(id));
  }

  // guardar en JSONBin
  try {
    await guardarBin();
    renderDashboard();
  } catch (err) {
    console.error("Error guardando like:", err);
  }
};

window.likeModal = function () {
  if (modalIdActual) toggleLike({ stopPropagation: function () {} }, modalIdActual);
};

/* ══════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════ */
window.abrirModal = function (id) {
  var item = todasLasImagenes.find(function (x) { return x.id === id; });
  if (!item) return;

  modalIdActual = id;

  document.getElementById("modal-autor").textContent   = item.nombre;
  document.getElementById("modal-tipo").textContent    = item.tipo === "panoramica" ? "🌅 Panorámica" : "🔭 Megapixel";
  document.getElementById("modal-fecha").textContent   = formatFecha(item.fecha);
  document.getElementById("modal-likes").textContent   = item.likes;
  document.getElementById("modal-download").href       = item.url;

  var liked = estaLiked(id);
  document.getElementById("modal-like-btn").classList.toggle("liked", liked);

  var img = document.getElementById("modal-img");
  img.src = item.url;
  img.onload = function () { resetModal(); };

  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
};

window.cerrarModal = function (e) {
  if (e && e.target !== document.getElementById("modal-overlay")) return;
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
  modalIdActual = null;
};

/* ── viewer modal ── */
function initModalViewer() {
  var frame = document.getElementById("modal-viewer");

  frame.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = frame.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var f  = e.deltaY < 0 ? 1.15 : 0.87;
    mOx = mx - (mx - mOx) * f;
    mOy = my - (my - mOy) * f;
    mScale *= f;
    applyModal();
  }, { passive: false });

  frame.addEventListener("mousedown", function (e) {
    mDrag = true; mDx = e.clientX; mDy = e.clientY; mDox = mOx; mDoy = mOy;
    frame.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", function (e) {
    if (!mDrag) return;
    mOx = mDox + (e.clientX - mDx);
    mOy = mDoy + (e.clientY - mDy);
    applyModal();
  });
  window.addEventListener("mouseup", function () {
    mDrag = false;
    frame.style.cursor = "grab";
  });
}

function applyModal() {
  document.getElementById("modal-img").style.transform =
    "translate(" + mOx + "px," + mOy + "px) scale(" + mScale + ")";
}

function resetModal() {
  var frame = document.getElementById("modal-viewer");
  var img   = document.getElementById("modal-img");
  if (!img.naturalWidth) return;
  var fw = frame.clientWidth  / img.naturalWidth;
  var fh = frame.clientHeight / img.naturalHeight;
  mScale = Math.min(fw, fh, 1);
  mOx = (frame.clientWidth  - img.naturalWidth  * mScale) / 2;
  mOy = (frame.clientHeight - img.naturalHeight * mScale) / 2;
  applyModal();
}

/* ══════════════════════════════════════════
   FEATURED VIEWER
   ══════════════════════════════════════════ */
function initFeaturedViewer() {
  var frame = document.getElementById("featured-viewer");
  var img   = document.getElementById("featured-img");

  img.onload = function () {
    var fw = frame.clientWidth  / img.naturalWidth;
    var fh = frame.clientHeight / img.naturalHeight;
    fScale = Math.min(fw, fh, 1);
    fOx = (frame.clientWidth  - img.naturalWidth  * fScale) / 2;
    fOy = (frame.clientHeight - img.naturalHeight * fScale) / 2;
    applyFeatured();
    var mp = (img.naturalWidth * img.naturalHeight / 1e6).toFixed(1);
    document.getElementById("featured-res").textContent =
      mp + " MP · " + img.naturalWidth + "×" + img.naturalHeight + " px";
    document.getElementById("featured-mp").textContent = mp + " MP";
  };

  frame.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = frame.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var f  = e.deltaY < 0 ? 1.15 : 0.87;
    fOx = mx - (mx - fOx) * f;
    fOy = my - (my - fOy) * f;
    fScale *= f;
    applyFeatured();
  }, { passive: false });

  frame.addEventListener("mousedown", function (e) {
    fDrag = true; fDx = e.clientX; fDy = e.clientY; fDox = fOx; fDoy = fOy;
    frame.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", function (e) {
    if (!fDrag) return;
    fOx = fDox + (e.clientX - fDx);
    fOy = fDoy + (e.clientY - fDy);
    applyFeatured();
  });
  window.addEventListener("mouseup", function () {
    fDrag = false;
    frame.style.cursor = "grab";
  });
}

function applyFeatured() {
  document.getElementById("featured-img").style.transform =
    "translate(" + fOx + "px," + fOy + "px) scale(" + fScale + ")";
}

window.zoomFeatured = function (f) {
  var frame = document.getElementById("featured-viewer");
  var cx = frame.clientWidth  / 2;
  var cy = frame.clientHeight / 2;
  fOx = cx - (cx - fOx) * f;
  fOy = cy - (cy - fOy) * f;
  fScale *= f;
  applyFeatured();
};

window.resetFeatured = function () {
  var frame = document.getElementById("featured-viewer");
  var img   = document.getElementById("featured-img");
  var fw = frame.clientWidth  / img.naturalWidth;
  var fh = frame.clientHeight / img.naturalHeight;
  fScale = Math.min(fw, fh, 1);
  fOx = (frame.clientWidth  - img.naturalWidth  * fScale) / 2;
  fOy = (frame.clientHeight - img.naturalHeight * fScale) / 2;
  applyFeatured();
};

/* ══════════════════════════════════════════
   SUBIR IMAGEN
   ══════════════════════════════════════════ */
function initSubirArea() {
  var area  = document.getElementById("subir-area");
  var input = document.getElementById("subir-input");

  area.addEventListener("click", function () { input.click(); });

  input.addEventListener("change", function () {
    if (input.files[0]) setArchivoSubida(input.files[0]);
    input.value = "";
  });

  area.addEventListener("dragover", function (e) {
    e.preventDefault(); area.classList.add("dragover");
  });
  area.addEventListener("dragleave", function () {
    area.classList.remove("dragover");
  });
  area.addEventListener("drop", function (e) {
    e.preventDefault(); area.classList.remove("dragover");
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) setArchivoSubida(f);
  });
}

function setArchivoSubida(file) {
  archivoSubida = file;
  var reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("preview-img").src = e.target.result;
    document.getElementById("preview-container").style.display = "block";
    document.getElementById("subir-area").style.display = "none";
  };
  reader.readAsDataURL(file);
}

window.quitarPreview = function () {
  archivoSubida = null;
  document.getElementById("preview-container").style.display = "none";
  document.getElementById("subir-area").style.display = "block";
};

window.setTipo = function (t) {
  tipoSubida = t;
  document.getElementById("tipo-pan").classList.toggle("active", t === "panoramica");
  document.getElementById("tipo-meg").classList.toggle("active", t === "megapixel");
};

window.publicarImagen = async function () {
  var nombre = document.getElementById("input-nombre").value.trim();
  var errEl  = document.getElementById("subir-error");
  var succEl = document.getElementById("subir-success");
  var progEl = document.getElementById("subir-progress");
  var btnEl  = document.getElementById("btn-publicar");

  // validar
  errEl.classList.remove("show");
  succEl.style.display = "none";

  if (!archivoSubida) {
    errEl.textContent = "Selecciona una imagen primero.";
    errEl.classList.add("show"); return;
  }
  if (!nombre) {
    errEl.textContent = "Escribe tu nombre.";
    errEl.classList.add("show"); return;
  }
  if (CONFIG.BIN_ID === "TU_BIN_ID_AQUI") {
    errEl.textContent = "⚠️ Falta configurar el BIN_ID en galeria.js.";
    errEl.classList.add("show"); return;
  }

  progEl.style.display = "block";
  btnEl.disabled = true;

  try {
    // 1. Subir a Cloudinary
    setStatus("Subiendo imagen a Cloudinary...");
    var fd = new FormData();
    fd.append("file",          archivoSubida);
    fd.append("upload_preset", CONFIG.UPLOAD_PRESET);

    var clRes = await fetch(CL_URL, { method: "POST", body: fd });
    if (!clRes.ok) throw new Error("Cloudinary error " + clRes.status);
    var clData = await clRes.json();
    var imgUrl = clData.secure_url;

    // 2. Leer bin actual
    setStatus("Guardando en la galería...");
    var binRes = await fetch(JB_URL + "/latest", {
      headers: { "X-Master-Key": CONFIG.JSONBIN_KEY }
    });
    var binJson = await binRes.json();
    var actual = (Array.isArray(binJson.record) ? binJson.record : []).filter(function(x){ return x && x.id && x.url && x.nombre; });

    // 3. Añadir entrada
    var nueva = {
      id    : "img_" + Date.now(),
      nombre: nombre,
      tipo  : tipoSubida,
      url   : imgUrl,
      likes : 0,
      fecha : new Date().toISOString()
    };
    actual.push(nueva);
    todasLasImagenes = actual;

    // 4. Guardar bin
    var putRes = await fetch(JB_URL, {
      method : "PUT",
      headers: JB_HDR,
      body   : JSON.stringify(actual)
    });
    if (!putRes.ok) throw new Error("JSONBin error " + putRes.status);

    // ✓ Listo
    progEl.style.display = "none";
    succEl.style.display  = "flex";
    renderGaleria();
    renderDashboard();

    // reset form
    archivoSubida = null;
    document.getElementById("input-nombre").value = "";
    document.getElementById("preview-container").style.display = "none";
    document.getElementById("subir-area").style.display = "block";

  } catch (err) {
    progEl.style.display = "none";
    errEl.textContent = "Error: " + err.message;
    errEl.classList.add("show");
    console.error(err);
  } finally {
    btnEl.disabled = false;
  }
};

function setStatus(msg) {
  document.getElementById("subir-status").textContent = msg;
}

window.verGaleria = function () {
  document.getElementById("pano-grid").scrollIntoView({ behavior: "smooth" });
};

/* ══════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════ */
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFecha(iso) {
  if (!iso) return "";
  try {
    var d = new Date(iso);
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) { return iso; }
}
window.fullscreenFeatured = async function () {
  var viewer = document.getElementById("featured-viewer");

  if (!viewer) {
    console.error("No existe featured-viewer");
    return;
  }

  try {
    if (!document.fullscreenElement) {
      await viewer.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.error("Fullscreen error:", err);
  }
};