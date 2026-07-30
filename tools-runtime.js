/**
 * Diyaa — generic tool engine. Reads the current page's data-tool
 * slug, looks up its config in tools-config.js, renders the right
 * controls, and wires up upload / process / download / clear for
 * every tool using the same tested code path.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    const slug = document.body.dataset.tool;
    const config = window.DiyaaToolsConfig && window.DiyaaToolsConfig[slug];
    if (!config || !window.Diyaa) return;

    const { AppState, Utils, Toast, Dropzone, UI } = window.Diyaa;

    const controlsHost = document.getElementById('tool-controls');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const btnProcess = document.getElementById('btn-process');
    const btnClear = document.getElementById('btn-clear');
    const btnZip = document.getElementById('btn-download-zip');
    const grid = document.getElementById('image-grid');
    const emptyState = document.getElementById('empty-state');
    const textResults = document.getElementById('text-results');

    if (fileInput && config.accept) fileInput.setAttribute('accept', config.accept);
    if (fileInput && config.multiple === false) fileInput.removeAttribute('multiple');
    if (dropzone) {
      const hint = dropzone.querySelector('.dropzone-hint');
      if (hint && config.accept) {
        const label = config.accept === 'image/*' ? 'any common image format' : config.accept.toUpperCase();
        hint.textContent = `Supports ${label} — everything stays on your device`;
      }
    }

    // ── Render controls from config ──
    const values = {};
    if (controlsHost) {
      config.controls.forEach((c) => {
        values[c.id] = c.value;
        const row = document.createElement('div');
        row.className = 'control-group' + (c.type === 'text' ? ' grow' : '');

        if (c.type === 'slider') {
          row.innerHTML = `
            <label class="control-label">${c.label}: <span class="mono" data-val="${c.id}">${c.value}${c.unit || ''}</span></label>
            <input type="range" id="ctrl-${c.id}" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${c.value}">`;
        } else if (c.type === 'number') {
          row.innerHTML = `
            <label class="control-label">${c.label}</label>
            <input type="number" id="ctrl-${c.id}" min="${c.min}" max="${c.max}" value="${c.value}">`;
        } else if (c.type === 'select') {
          const opts = c.options.map(o => `<option value="${o.v}" ${o.v === c.value ? 'selected' : ''}>${o.l}</option>`).join('');
          row.innerHTML = `<label class="control-label">${c.label}</label><select id="ctrl-${c.id}">${opts}</select>`;
        } else if (c.type === 'text') {
          row.innerHTML = `<label class="control-label">${c.label}</label><input type="text" id="ctrl-${c.id}" value="${Utils.escapeHtml(c.value)}">`;
        } else if (c.type === 'checkbox') {
          row.innerHTML = `<label class="control-label" style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="ctrl-${c.id}" ${c.value ? 'checked' : ''}> ${c.label}</label>`;
        } else if (c.type === 'checkbox-group') {
          const opts = c.options.map(o => `
            <label style="display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0;">
              <input type="checkbox" class="ctrl-group-${c.id}" value="${o}" ${c.value.includes(o) ? 'checked' : ''}> ${o}px
            </label>`).join('');
          row.innerHTML = `<label class="control-label">${c.label}</label><div>${opts}</div>`;
        } else if (c.type === 'crop-visual') {
          row.className = 'control-group grow';
          row.innerHTML = `
            <div class="crop-tool">
              <div class="crop-presets" role="group" aria-label="Aspect ratio">
                <button type="button" class="ratio-btn active" data-ratio="0">Free</button>
                <button type="button" class="ratio-btn" data-ratio="1">1:1</button>
                <button type="button" class="ratio-btn" data-ratio="1.3333">4:3</button>
                <button type="button" class="ratio-btn" data-ratio="0.75">3:4</button>
                <button type="button" class="ratio-btn" data-ratio="1.7778">16:9</button>
                <button type="button" class="ratio-btn" data-ratio="0.5625">9:16</button>
              </div>
              <div class="crop-stage" id="crop-stage">
                <p class="crop-empty" id="crop-empty">Upload an image below to position the crop area.</p>
                <div class="crop-image-frame" id="crop-image-frame" style="display:none;">
                  <img id="crop-preview-img" alt="Crop preview" draggable="false">
                  <div class="crop-mask" id="mask-top"></div>
                  <div class="crop-mask" id="mask-bottom"></div>
                  <div class="crop-mask" id="mask-left"></div>
                  <div class="crop-mask" id="mask-right"></div>
                  <div class="crop-box" id="crop-box">
                    <div class="crop-handle" data-handle="nw"></div>
                    <div class="crop-handle" data-handle="ne"></div>
                    <div class="crop-handle" data-handle="sw"></div>
                    <div class="crop-handle" data-handle="se"></div>
                    <div class="crop-dims" id="crop-dims"></div>
                  </div>
                </div>
              </div>
              <p class="crop-hint">The same crop area is applied to every image you upload in this batch.</p>
            </div>`;
        }
        controlsHost.appendChild(row);
      });
    }

    function readValues() {
      config.controls.forEach((c) => {
        if (c.type === 'slider' || c.type === 'number') {
          values[c.id] = parseFloat(document.getElementById(`ctrl-${c.id}`).value);
        } else if (c.type === 'select') {
          values[c.id] = document.getElementById(`ctrl-${c.id}`).value;
        } else if (c.type === 'text') {
          values[c.id] = document.getElementById(`ctrl-${c.id}`).value;
        } else if (c.type === 'checkbox') {
          values[c.id] = document.getElementById(`ctrl-${c.id}`).checked;
        } else if (c.type === 'checkbox-group') {
          values[c.id] = Array.from(document.querySelectorAll(`.ctrl-group-${c.id}:checked`)).map(el => parseInt(el.value));
        } else if (c.type === 'crop-visual') {
          values[c.id] = { ...cropState };
        }
      });
    }

    // ── Live-update slider value labels ──
    if (controlsHost) {
      controlsHost.addEventListener('input', (e) => {
        if (e.target.matches('input[type="range"]')) {
          const id = e.target.id.replace('ctrl-', '');
          const label = controlsHost.querySelector(`[data-val="${id}"]`);
          const cfg = config.controls.find(c => c.id === id);
          if (label && cfg) label.textContent = e.target.value + (cfg.unit || '');
        }
      });
    }

    // ── Interactive crop tool (used by the crop-image tool only) ──
    const cropControlConfig = config.controls.find((c) => c.type === 'crop-visual');
    let cropState = cropControlConfig ? { ...cropControlConfig.value } : { x: 0, y: 0, w: 100, h: 100 };
    let cropRatio = 0; // 0 = free
    let cropNaturalSize = { w: 0, h: 0 };

    function initCropTool() {
      const stage = document.getElementById('crop-stage');
      const frame = document.getElementById('crop-image-frame');
      const img = document.getElementById('crop-preview-img');
      const box = document.getElementById('crop-box');
      const dims = document.getElementById('crop-dims');
      const emptyMsg = document.getElementById('crop-empty');
      const maskTop = document.getElementById('mask-top');
      const maskBottom = document.getElementById('mask-bottom');
      const maskLeft = document.getElementById('mask-left');
      const maskRight = document.getElementById('mask-right');
      if (!stage || !frame || !img || !box) return;

      function syncBoxFromState() {
        const { x, y, w, h } = cropState;
        box.style.left = x + '%';
        box.style.top = y + '%';
        box.style.width = w + '%';
        box.style.height = h + '%';

        // Darken everything outside the crop box using 4 masks sized to
        // fit exactly within the image frame — avoids relying on
        // overflow:hidden (which would also clip the resize handles
        // whenever the box touches an edge, making them ungrabbable).
        if (maskTop) { maskTop.style.cssText = `left:0;top:0;width:100%;height:${y}%;`; }
        if (maskBottom) { maskBottom.style.cssText = `left:0;top:${y + h}%;width:100%;height:${Math.max(0, 100 - (y + h))}%;`; }
        if (maskLeft) { maskLeft.style.cssText = `left:0;top:${y}%;width:${x}%;height:${h}%;`; }
        if (maskRight) { maskRight.style.cssText = `left:${x + w}%;top:${y}%;width:${Math.max(0, 100 - (x + w))}%;height:${h}%;`; }

        if (dims && cropNaturalSize.w) {
          const pxW = Math.round(cropNaturalSize.w * (w / 100));
          const pxH = Math.round(cropNaturalSize.h * (h / 100));
          dims.textContent = `${pxW} × ${pxH} px`;
        }
      }

      function clampState() {
        cropState.w = Math.min(100, Math.max(5, cropState.w));
        cropState.h = Math.min(100, Math.max(5, cropState.h));
        cropState.x = Math.min(100 - cropState.w, Math.max(0, cropState.x));
        cropState.y = Math.min(100 - cropState.h, Math.max(0, cropState.y));
      }

      // Show the first uploaded image as the crop preview
      function loadPreview() {
        if (AppState.files.length === 0) {
          frame.style.display = 'none';
          if (emptyMsg) emptyMsg.style.display = 'block';
          return;
        }
        const first = AppState.files[0];
        if (img.dataset.loadedFor === first.previewUrl) return; // already showing this file
        img.dataset.loadedFor = first.previewUrl;
        img.onload = () => {
          cropNaturalSize = { w: img.naturalWidth, h: img.naturalHeight };
          frame.style.display = 'inline-block';
          if (emptyMsg) emptyMsg.style.display = 'none';
          clampState();
          syncBoxFromState();
        };
        img.src = first.previewUrl;
      }

      // ── Aspect ratio presets ──
      const ratioButtons = document.querySelectorAll('.ratio-btn');
      ratioButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          ratioButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          cropRatio = parseFloat(btn.dataset.ratio) || 0;
          if (cropRatio > 0 && cropNaturalSize.w) {
            // Recompute height to match the chosen ratio, keeping the
            // crop box's current width and top-left corner in place.
            const boxPxW = cropNaturalSize.w * (cropState.w / 100);
            const boxPxH = boxPxW / cropRatio;
            cropState.h = Math.min(100, (boxPxH / cropNaturalSize.h) * 100);
            clampState();
            syncBoxFromState();
          }
        });
      });

      // ── Drag to move / resize via corner handles (mouse + touch) ──
      let dragMode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se'
      let dragStart = null;

      // Percentages are computed against the image FRAME (which
      // shrink-wraps to the image's actual rendered size), not the
      // outer stage — otherwise a letterboxed image (stage wider than
      // the scaled image) would put the crop box out of alignment with
      // what's actually visible.
      function framePercentFromEvent(e) {
        const rect = frame.getBoundingClientRect();
        return {
          xPct: ((e.clientX - rect.left) / rect.width) * 100,
          yPct: ((e.clientY - rect.top) / rect.height) * 100
        };
      }

      function onPointerDown(e, mode) {
        e.preventDefault();
        dragMode = mode;
        const p = framePercentFromEvent(e);
        dragStart = { ...p, box: { ...cropState } };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      }

      function onPointerMove(e) {
        if (!dragMode) return;
        const p = framePercentFromEvent(e);
        const dx = p.xPct - dragStart.xPct;
        const dy = p.yPct - dragStart.yPct;
        const start = dragStart.box;

        if (dragMode === 'move') {
          cropState.x = start.x + dx;
          cropState.y = start.y + dy;
        } else {
          // Resize from whichever corner is being dragged
          let { x, y, w, h } = start;
          if (dragMode.includes('e')) w = start.w + dx;
          if (dragMode.includes('w')) { w = start.w - dx; x = start.x + dx; }
          if (dragMode.includes('s')) h = start.h + dy;
          if (dragMode.includes('n')) { h = start.h - dy; y = start.y + dy; }

          if (cropRatio > 0 && cropNaturalSize.w) {
            // Keep the locked aspect ratio while resizing from a corner
            const pxW = cropNaturalSize.w * (w / 100);
            const pxH = pxW / cropRatio;
            const newHPct = (pxH / cropNaturalSize.h) * 100;
            if (dragMode.includes('n')) y = start.y + start.h - newHPct;
            h = newHPct;
          }
          cropState = { x, y, w, h };
        }
        clampState();
        syncBoxFromState();
      }

      function onPointerUp() {
        dragMode = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }

      box.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('crop-handle')) return; // handled below
        onPointerDown(e, 'move');
      });
      box.querySelectorAll('.crop-handle').forEach((handle) => {
        handle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          onPointerDown(e, handle.dataset.handle);
        });
      });

      // Recompute pixel positioning (percent-based, so mostly automatic)
      // whenever the viewport size changes.
      window.addEventListener('resize', syncBoxFromState);

      loadPreview();
      // Re-check the preview every time files change (see hookIntoRenderFiles below)
      initCropTool._refresh = loadPreview;
    }

    if (cropControlConfig) initCropTool();

    // ── Upload handling ──
    if (dropzone && fileInput) {
      Dropzone.init('dropzone', 'file-input', (files) => {
        files.forEach(file => {
          const previewUrl = URL.createObjectURL(file);
          AppState.addFile(file, previewUrl);
        });
        renderFiles();
        updateButtons();
      });
    }

    function renderFiles() {
      if (config.kind === 'text') {
        renderTextResults();
        return;
      }
      if (grid) {
        UI.renderGrid('image-grid', AppState.files, {
          showDownload: true,
          onRemove: (index) => {
            AppState.removeFile(index);
            renderFiles();
            updateButtons();
          }
        });
      }
      if (emptyState) UI.toggleEmptyState('empty-state', AppState.files.length === 0);
      if (initCropTool._refresh) initCropTool._refresh();
    }

    function renderTextResults() {
      if (!textResults) return;
      textResults.innerHTML = '';
      if (AppState.files.length === 0) {
        if (emptyState) UI.toggleEmptyState('empty-state', true);
        return;
      }
      if (emptyState) UI.toggleEmptyState('empty-state', false);

      AppState.files.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'text-result-card';
        card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;';
        const label = document.createElement('div');
        label.className = 'mono';
        label.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-bottom:8px;word-break:break-all;';
        label.textContent = item.file.name;
        const textarea = document.createElement('textarea');
        textarea.readOnly = true;
        textarea.style.cssText = 'width:100%;min-height:100px;font-family:ui-monospace,monospace;font-size:12px;background:var(--surface-hover);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;resize:vertical;';
        textarea.value = item.metadata || '';
        card.appendChild(label);
        card.appendChild(textarea);

        if (item.metadata) {
          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'margin-top:8px;display:flex;gap:8px;';
          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn btn-secondary';
          copyBtn.textContent = 'Copy';
          copyBtn.onclick = async () => {
            const ok = await Utils.copyToClipboard(item.metadata);
            Toast.show(ok ? 'Copied to clipboard' : 'Could not copy — select and copy manually', ok ? 'success' : 'error');
          };
          btnRow.appendChild(copyBtn);
          card.appendChild(btnRow);
        }
        textResults.appendChild(card);
      });
    }

    function updateButtons() {
      const hasFiles = AppState.files.length > 0;
      const hasDone = AppState.getCompletedCount() > 0;
      if (btnProcess) btnProcess.disabled = !hasFiles || AppState.processing;
      if (btnClear) btnClear.disabled = !hasFiles;
      if (btnZip) btnZip.disabled = !hasDone || config.kind === 'text' || config.kind === 'combine';
    }

    if (btnProcess) {
      btnProcess.addEventListener('click', async () => {
        if (AppState.processing || AppState.files.length === 0) return;
        AppState.processing = true;
        updateButtons();
        readValues();
        const originalLabel = btnProcess.textContent;
        btnProcess.textContent = 'Processing…';
        if (dropzone) dropzone.classList.add('scanning');

        try {
          if (config.kind === 'combine') {
            const files = AppState.files.map(f => f.file);
            const result = await config.processAll(files, values);
            Utils.downloadBlob(result.blob, result.name);
            Toast.show('Your file is ready and downloading!', 'success');
          } else {
            const total = AppState.files.length;
            for (let i = 0; i < total; i++) {
              const item = AppState.files[i];
              if (item.status === 'done') continue;
              try {
                const result = await config.process(item.file, values);
                if (config.kind === 'text') {
                  item.metadata = result.text;
                } else {
                  item.blob = result.blob;
                  item.outputName = result.name;
                }
                item.status = 'done';
              } catch (err) {
                console.error(err);
                item.status = 'error';
                Toast.show((err && err.message) || `Could not process ${item.file.name}`, 'error');
              }
              UI.setProgress('progress-bar', Math.round(((i + 1) / total) * 100));
              renderFiles();
            }
            const doneCount = AppState.getCompletedCount();
            if (doneCount > 0) Toast.show(`Done! ${doneCount} file(s) processed.`, 'success');
            UI.setProgress('progress-bar', 0);
          }
        } finally {
          AppState.processing = false;
          if (dropzone) dropzone.classList.remove('scanning');
          btnProcess.textContent = originalLabel;
          updateButtons();
        }
      });
    }

    if (btnZip) {
      btnZip.addEventListener('click', async () => {
        const doneFiles = AppState.files
          .filter(f => f.status === 'done' && f.blob)
          .map(f => ({ name: f.outputName || f.file.name, blob: f.blob }));
        if (doneFiles.length) {
          await Utils.createZip(doneFiles, `diyaa-${slug}.zip`);
          Toast.show('Downloading your files as a ZIP…', 'success');
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        AppState.clearFiles();
        if (fileInput) fileInput.value = '';
        renderFiles();
        updateButtons();
      });
    }

    renderFiles();
    updateButtons();
  });
})();
