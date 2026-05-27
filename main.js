document.addEventListener("DOMContentLoaded", function () {

  var HF_URL = "https://kevinsalinas-panoramicas-uis.hf.space";

  var visorScale = 1, visorOx = 0, visorOy = 0;
  var dragging = false, dragStartX, dragStartY, dragStartOx, dragStartOy;
  var modo = "panoramica";
  var archivos = [];

  var uploadArea  = document.getElementById("upload-area");
  var fileInput   = document.getElementById("file-input");
  var viewerFrame = document.getElementById("viewer-frame");

  // ── MODO ──
  window.setMode = function (m) {
    modo = m;
    document.getElementById("tab-pan").classList.toggle("active", m === "panoramica");
    document.getElementById("tab-gig").classList.toggle("active", m === "megapixel");
  };

  // ── CLICK en área de subida ──
  uploadArea.addEventListener("click", function (e) {
    if (e.target.closest(".file-chip")) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", function () {
    agregarArchivos(Array.from(fileInput.files));
    fileInput.value = "";
  });

  // ── DRAG & DROP ──
  uploadArea.addEventListener("dragover", function (e) {
    e.preventDefault(); e.stopPropagation();
    uploadArea.classList.add("dragover");
  });
  uploadArea.addEventListener("dragleave", function (e) {
    e.stopPropagation();
    uploadArea.classList.remove("dragover");
  });
  uploadArea.addEventListener("drop", function (e) {
    e.preventDefault(); e.stopPropagation();
    uploadArea.classList.remove("dragover");
    var nuevos = Array.from(e.dataTransfer.files).filter(function (f) {
      return f.type.startsWith("image/");
    });
    agregarArchivos(nuevos);
  });

  function agregarArchivos(nuevos) {
    archivos = archivos.concat(nuevos);
    renderFileList();
  }

  window.quitarArchivo = function (i) {
    archivos.splice(i, 1);
    renderFileList();
  };

  function renderFileList() {
    var list  = document.getElementById("file-list");
    var count = document.getElementById("file-count");
    list.innerHTML = archivos.map(function (f, i) {
      return (
        '<div class="file-chip">&#128247; ' + f.name +
        ' <button onclick="quitarArchivo(' + i + ')">&#215;</button></div>'
      );
    }).join("");
    var n = archivos.length;
    count.textContent =
      n + " imagen" + (n !== 1 ? "es" : "") +
      " seleccionada" + (n !== 1 ? "s" : "");
  }

  // ── PASOS DE PROGRESO ──
  function setPaso(n) {
    for (var i = 1; i <= 4; i++) {
      var el = document.getElementById("ps" + i);
      el.classList.remove("active", "done");
      if (i < n)  el.classList.add("done");
      if (i === n) el.classList.add("active");
    }
  }

  // ── UPLOAD ──
  async function uploadFile(file) {
    var fd = new FormData();
    fd.append("files", file);

    var endpoints = [
      HF_URL + "/upload",
      HF_URL + "/gradio_api/upload"
    ];

    var res;
    for (var i = 0; i < endpoints.length; i++) {
      res = await fetch(endpoints[i], { method: "POST", body: fd });
      if (res.ok) {
        var paths = await res.json();
        var p = Array.isArray(paths) ? paths[0] : paths;
        if (typeof p === "object" && p.path) p = p.path;
        return p;
      }
    }
    throw new Error("No se pudo subir: " + file.name + " (status " + (res ? res.status : "?") + ")");
  }

  // ── GENERAR ──
  window.generarImagen = async function () {
    if (archivos.length < 2) {
      mostrarError("Necesitas seleccionar al menos 2 imágenes.");
      return;
    }
    ocultarError();
    mostrarProcesando(true);
    document.getElementById("viewer-section").classList.remove("show");

    // Ocultar botón publicar mientras procesa
    document.getElementById("btn-publicar-galeria").style.display = "none";

    setPaso(1);
    var t2 = setTimeout(function () { setPaso(2); }, 2000);
    var t3 = setTimeout(function () { setPaso(3); }, 6000);
    var t4 = setTimeout(function () { setPaso(4); }, 12000);

    try {
      var apiName = modo === "panoramica" ? "procesar_panoramica" : "procesar_gigapixel";

      // 1. Subir archivos
      var uploadedPaths = await Promise.all(archivos.map(uploadFile));

      // 2. Construir payload con meta requerido por Gradio 6
      var gradioFiles = uploadedPaths.map(function (p, idx) {
        return {
          path: p,
          orig_name: archivos[idx].name,
          mime_type: archivos[idx].type,
          meta: { _type: "gradio.FileData" }
        };
      });

      // 3. Llamar al procesamiento
      var postRes = await fetch(HF_URL + "/gradio_api/call/" + apiName, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [gradioFiles] })
      });

      if (!postRes.ok) {
        var errText = await postRes.text();
        throw new Error("Error del servidor (" + postRes.status + "): " + errText.slice(0, 200));
      }

      var json = await postRes.json();
      var event_id = json.event_id;
      if (!event_id) throw new Error("No se obtuvo event_id del servidor.");

      // 4. Recoger resultado SSE
      var getRes = await fetch(HF_URL + "/gradio_api/call/" + apiName + "/" + event_id);
      if (!getRes.ok) throw new Error("Error obteniendo resultado: " + getRes.status);

      var text = await getRes.text();
      var lineas = text.split("\n").filter(function (l) { return l.startsWith("data:"); });
      if (!lineas.length) throw new Error("Sin respuesta del servidor.");

      var data = JSON.parse(lineas[lineas.length - 1].replace("data: ", ""));

      clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      setPaso(4);

      if (!data[0]) throw new Error(data[2] || "Error en el procesamiento.");

      // Normalizar URL de la imagen resultado
      var imgResult = data[0];
      var imgUrl;
      if (typeof imgResult === "string") {
        imgUrl = imgResult.startsWith("http") ? imgResult : HF_URL + "/file=" + imgResult;
      } else if (imgResult.url) {
        imgUrl = imgResult.url;
      } else if (imgResult.path) {
        imgUrl = HF_URL + "/file=" + imgResult.path;
      } else {
        throw new Error("Formato de respuesta inesperado.");
      }

      mostrarProcesando(false);
      mostrarVisor(imgUrl, data[2] || "");

    } catch (err) {
      clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      mostrarProcesando(false);
      mostrarError(err.message + ". Verifica que el Space de Hugging Face esté activo.");
      console.error(err);
    }
  };

  // ── UI HELPERS ──
  function mostrarProcesando(show) {
    document.getElementById("processing").classList.toggle("show", show);
    document.getElementById("btn-generar").disabled = show;
  }

  function mostrarError(msg) {
    var b = document.getElementById("error-box");
    b.textContent = msg;
    b.classList.add("show");
  }

  function ocultarError() {
    document.getElementById("error-box").classList.remove("show");
  }

  // ── VISOR ──
  function mostrarVisor(imgUrl, info) {
    var section = document.getElementById("viewer-section");
    var img     = document.getElementById("viewer-img");

    section.classList.add("show");
    section.scrollIntoView({ behavior: "smooth" });
    img.src = imgUrl;
    document.getElementById("minimap-img").src = imgUrl;

    img.onload = function () {
      var fw = viewerFrame.clientWidth  / img.naturalWidth;
      var fh = viewerFrame.clientHeight / img.naturalHeight;
      visorScale = Math.min(fw, fh);
      visorOx = (viewerFrame.clientWidth  - img.naturalWidth  * visorScale) / 2;
      visorOy = (viewerFrame.clientHeight - img.naturalHeight * visorScale) / 2;
      aplicarTransform();
      var mp = (img.naturalWidth * img.naturalHeight / 1e6).toFixed(1);
      document.getElementById("viewer-res").textContent =
        mp + " MP · " + img.naturalWidth + "×" + img.naturalHeight + " px";
      actualizarMinimap();
    };

    // Botón descargar
    document.getElementById("btn-download").onclick = function () {
      var a = document.createElement("a");
      a.href = imgUrl;
      a.download = "resultado_" + modo + "_" + Date.now() + ".jpg";
      a.target = "_blank";
      a.click();
    };

    // ── Mostrar botón "Publicar en galería" ──
    var btnPub = document.getElementById("btn-publicar-galeria");
    btnPub.style.display = "flex";

    // Guardar datos en sessionStorage para que galeria.js los recoja
    sessionStorage.setItem("galeria_img_url",  imgUrl);
    sessionStorage.setItem("galeria_img_modo", modo);
  }

  // ── IR A PUBLICAR ──
  // Redirige a galeria.html con la URL ya guardada en sessionStorage
   window.irAPublicar = function () {
    var img = document.getElementById("viewer-img");
    if (img && img.src) {
      sessionStorage.setItem("galeria_img_url",  img.src);
      sessionStorage.setItem("galeria_img_modo", modo);
      window.location.href = "galeria.html#subir-resultado";
    }
  };

  function aplicarTransform() {
    document.getElementById("viewer-img").style.transform =
      "translate(" + visorOx + "px," + visorOy + "px) scale(" + visorScale + ")";
    actualizarMinimap();
  }

  function actualizarMinimap() {
    var img    = document.getElementById("viewer-img");
    var cursor = document.getElementById("minimap-cursor");
    var mmap   = document.getElementById("minimap");
    if (!img.naturalWidth) return;
    var vw = viewerFrame.clientWidth  / (img.naturalWidth  * visorScale);
    var vh = viewerFrame.clientHeight / (img.naturalHeight * visorScale);
    var cx = (-visorOx / (img.naturalWidth  * visorScale)) * mmap.clientWidth;
    var cy = (-visorOy / (img.naturalHeight * visorScale)) * mmap.clientHeight;
    cursor.style.left   = Math.max(0, cx) + "px";
    cursor.style.top    = Math.max(0, cy) + "px";
    cursor.style.width  = Math.min(mmap.clientWidth,  vw * mmap.clientWidth)  + "px";
    cursor.style.height = Math.min(mmap.clientHeight, vh * mmap.clientHeight) + "px";
  }

  window.zoomVisor = function (f) {
    var cx = viewerFrame.clientWidth  / 2;
    var cy = viewerFrame.clientHeight / 2;
    visorOx = cx - (cx - visorOx) * f;
    visorOy = cy - (cy - visorOy) * f;
    visorScale *= f;
    aplicarTransform();
  };

  window.resetVisor = function () {
    var img = document.getElementById("viewer-img");
    var fw  = viewerFrame.clientWidth  / img.naturalWidth;
    var fh  = viewerFrame.clientHeight / img.naturalHeight;
    visorScale = Math.min(fw, fh);
    visorOx = (viewerFrame.clientWidth  - img.naturalWidth  * visorScale) / 2;
    visorOy = (viewerFrame.clientHeight - img.naturalHeight * visorScale) / 2;
    aplicarTransform();
  };

  // ── VISOR: scroll zoom ──
  viewerFrame.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = viewerFrame.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var f  = e.deltaY < 0 ? 1.15 : 0.87;
    visorOx = mx - (mx - visorOx) * f;
    visorOy = my - (my - visorOy) * f;
    visorScale *= f;
    aplicarTransform();
  }, { passive: false });

  // ── VISOR: drag ──
  viewerFrame.addEventListener("mousedown", function (e) {
    dragging    = true;
    dragStartX  = e.clientX;
    dragStartY  = e.clientY;
    dragStartOx = visorOx;
    dragStartOy = visorOy;
    viewerFrame.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    visorOx = dragStartOx + (e.clientX - dragStartX);
    visorOy = dragStartOy + (e.clientY - dragStartY);
    aplicarTransform();
  });

  window.addEventListener("mouseup", function () {
    dragging = false;
    viewerFrame.style.cursor = "grab";
  });

});