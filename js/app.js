/**
 * ═══════════════════════════════════════════════════════════════
 * Diyaa — Free Online Image Tools
 * Shared JavaScript Library
 * Version: 3.0
 * All operations run 100% client-side in the browser.
 * No file is ever uploaded to a server. No CDN dependencies.
 * ═══════════════════════════════════════════════════════════════
 */

(function(global) {
  'use strict';

  // ─── Site root detection (subpath-safe) ───
  // This site may be hosted at a domain root ("https://example.com/") OR
  // inside a subpath, e.g. a GitHub Pages project site
  // ("https://user.github.io/repo-name/"). document.currentScript is only
  // reliable during this script's initial synchronous execution, so we
  // capture it immediately and derive the site root from wherever this
  // very file (js/app.js) was actually loaded from — this then drives
  // service-worker registration/scope instead of a hardcoded "/".
  const SITE_ROOT = (function () {
    const script = document.currentScript;
    if (script && script.src) {
      return script.src.replace(/js\/app\.js(\?.*)?(#.*)?$/, '');
    }
    return location.origin + '/';
  })();

  // ─── Configuration ───
  const CONFIG = {
    MAX_FILES: 50,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_CANVAS_DIMENSION: 4096,
    SUPPORTED_INPUT_FORMATS: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'image/gif', 'image/bmp', 'image/avif', 'image/heic',
      'image/heif', 'image/tiff', 'image/tif', 'image/svg+xml',
      'image/x-icon', 'image/vnd.microsoft.icon'
    ],
    SUPPORTED_EXTENSIONS: [
      '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
      '.avif', '.heic', '.heif', '.tiff', '.tif', '.svg', '.ico'
    ],
    OUTPUT_FORMATS: {
      'png': { mime: 'image/png', ext: '.png' },
      'jpg': { mime: 'image/jpeg', ext: '.jpg' },
      'webp': { mime: 'image/webp', ext: '.webp' },
      'avif': { mime: 'image/avif', ext: '.avif' }
    }
  };

  // ─── State Management ───
  const AppState = {
    files: [],
    processing: false,
    currentTool: '',

    addFile(file, previewUrl) {
      this.files.push({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        file,
        previewUrl,
        status: 'pending', // pending, processing, done, error
        blob: null,
        outputName: null,
        metadata: null
      });
      return this.files[this.files.length - 1];
    },

    removeFile(index) {
      if (this.files[index]) {
        URL.revokeObjectURL(this.files[index].previewUrl);
        this.files.splice(index, 1);
      }
    },

    clearFiles() {
      this.files.forEach(f => URL.revokeObjectURL(f.previewUrl));
      this.files = [];
    },

    getCompletedCount() {
      return this.files.filter(f => f.status === 'done').length;
    }
  };

  // ─── Utility Functions ───
  const Utils = {
    /**
     * Format bytes to human-readable size
     */
    formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Escape HTML to prevent XSS. Encodes quotes too, since escaped
     * values are used inside HTML attributes (e.g. alt="...") as well
     * as text content — unescaped quotes there would let a crafted
     * filename break out of the attribute.
     */
    escapeHtml(text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /**
     * Debounce function calls
     */
    debounce(fn, delay) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    /**
     * Generate a safe filename
     */
    safeFilename(name, ext) {
      const base = name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\u0600-\u06FF\-_]/g, '_');
      return base + ext;
    },

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          return true;
        } catch (e) {
          return false;
        } finally {
          document.body.removeChild(textarea);
        }
      }
    },

    /**
     * Share content using Web Share API
     */
    async share(data) {
      if (navigator.share) {
        try {
          await navigator.share(data);
          return true;
        } catch (err) {
          return false;
        }
      }
      return false;
    },

    /**
     * Download a blob as a file
     */
    downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    /**
     * Create a ZIP file from blobs using the local, dependency-free
     * ZIP writer below (LocalZip). No CDN, no external library.
     */
    async createZip(files, zipName = 'diyaa-files.zip') {
      const entries = [];
      for (const f of files) {
        const buf = await f.blob.arrayBuffer();
        entries.push({ name: f.name, data: new Uint8Array(buf) });
      }
      const blob = await LocalZip.build(entries);
      this.downloadBlob(blob, zipName);
    },

    /**
     * Get image dimensions and info
     */
    async getImageInfo(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio: (img.naturalWidth / img.naturalHeight).toFixed(2),
            size: file.size,
            type: file.type,
            name: file.name
          });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
      });
    }
  };

  // ─── Toast Notifications ───
  const Toast = {
    container: null,

    init() {
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.setAttribute('role', 'status');
        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(this.container);
      }
    },

    show(message, type = '', duration = 3500) {
      this.init();
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;

      const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
      };

      if (type && icons[type]) {
        toast.innerHTML = `<span style="font-size:16px">${icons[type]}</span> ${message}`;
      }

      this.container.appendChild(toast);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
      });

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
      }, duration);
    }
  };

  // ─── Local ZIP writer (replaces JSZip — no CDN, store-only, no compression) ───
  const LocalZip = {
    _crcTable: null,

    _makeCrcTable() {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
      }
      return table;
    },

    crc32(data) {
      if (!this._crcTable) this._crcTable = this._makeCrcTable();
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc = this._crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    _dosDateTime() {
      const d = new Date();
      const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
      const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
      return { time, date };
    },

    /**
     * Build a ZIP archive (STORE method, uncompressed) from entries
     * [{ name: string, data: Uint8Array }]. Returns a Blob.
     * Pure JS, no external library — keeps every tool 100% local.
     */
    async build(entries) {
      const encoder = new TextEncoder();
      const { time, date } = this._dosDateTime();
      const localParts = [];
      const centralParts = [];
      let offset = 0;

      for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name.replace(/\\/g, '/'));
        const data = entry.data;
        const crc = this.crc32(data);
        const size = data.length;

        const localHeader = new DataView(new ArrayBuffer(30));
        localHeader.setUint32(0, 0x04034b50, true);
        localHeader.setUint16(4, 20, true);
        localHeader.setUint16(6, 0, true);
        localHeader.setUint16(8, 0, true); // stored, no compression
        localHeader.setUint16(10, time, true);
        localHeader.setUint16(12, date, true);
        localHeader.setUint32(14, crc, true);
        localHeader.setUint32(18, size, true);
        localHeader.setUint32(22, size, true);
        localHeader.setUint16(26, nameBytes.length, true);
        localHeader.setUint16(28, 0, true);

        localParts.push(new Uint8Array(localHeader.buffer), nameBytes, data);

        const centralHeader = new DataView(new ArrayBuffer(46));
        centralHeader.setUint32(0, 0x02014b50, true);
        centralHeader.setUint16(4, 20, true);
        centralHeader.setUint16(6, 20, true);
        centralHeader.setUint16(8, 0, true);
        centralHeader.setUint16(10, 0, true);
        centralHeader.setUint16(12, time, true);
        centralHeader.setUint16(14, date, true);
        centralHeader.setUint32(16, crc, true);
        centralHeader.setUint32(20, size, true);
        centralHeader.setUint32(24, size, true);
        centralHeader.setUint16(28, nameBytes.length, true);
        centralHeader.setUint16(30, 0, true);
        centralHeader.setUint16(32, 0, true);
        centralHeader.setUint16(34, 0, true);
        centralHeader.setUint16(36, 0, true);
        centralHeader.setUint32(38, 0, true);
        centralHeader.setUint32(42, offset, true);

        centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes);

        offset += 30 + nameBytes.length + size;
      }

      const centralStart = offset;
      let centralSize = 0;
      centralParts.forEach(p => centralSize += p.length);

      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(4, 0, true);
      end.setUint16(6, 0, true);
      end.setUint16(8, entries.length, true);
      end.setUint16(10, entries.length, true);
      end.setUint32(12, centralSize, true);
      end.setUint32(16, centralStart, true);
      end.setUint16(20, 0, true);

      return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], { type: 'application/zip' });
    }
  };

  // ─── Local PDF writer (replaces jsPDF — no CDN, embeds JPEG pages) ───
  const LocalPDF = {
    /**
     * Build a simple PDF with one JPEG image per page.
     * pages: [{ jpegBytes: Uint8Array, pageW, pageH, imgX, imgY, imgW, imgH }]
     * Coordinates and sizes are in PDF points (1/72 inch).
     * Returns a Blob. Pure JS, no external library.
     */
    build(pages) {
      const chunks = [];
      const offsets = [];
      let length = 0;

      const push = (str) => {
        const bytes = (typeof str === 'string') ? new TextEncoder().encode(str) : str;
        chunks.push(bytes);
        length += bytes.length;
      };

      push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

      const objOffsets = [];
      const objCount = 2 + pages.length * 3; // catalog, pages, then per-page: page, contents, image
      let nextObjNum = 3;

      const pageObjNums = [];
      const contentObjNums = [];
      const imageObjNums = [];
      pages.forEach(() => {
        pageObjNums.push(nextObjNum++);
        contentObjNums.push(nextObjNum++);
        imageObjNums.push(nextObjNum++);
      });

      // 1: Catalog
      objOffsets[1] = length;
      push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

      // 2: Pages
      objOffsets[2] = length;
      const kids = pageObjNums.map(n => `${n} 0 R`).join(' ');
      push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

      pages.forEach((p, i) => {
        const pageNum = pageObjNums[i];
        const contentNum = contentObjNums[i];
        const imageNum = imageObjNums[i];

        objOffsets[pageNum] = length;
        push(`${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pageW.toFixed(2)} ${p.pageH.toFixed(2)}] ` +
             `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`);

        const content = `q ${p.imgW.toFixed(2)} 0 0 ${p.imgH.toFixed(2)} ${p.imgX.toFixed(2)} ${p.imgY.toFixed(2)} cm /Im0 Do Q`;
        objOffsets[contentNum] = length;
        push(`${contentNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

        objOffsets[imageNum] = length;
        push(`${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pixelW} /Height ${p.pixelH} ` +
             `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`);
        push(p.jpegBytes);
        push(`\nendstream\nendobj\n`);
      });

      const xrefStart = length;
      const totalObjs = nextObjNum - 1;
      push(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
      for (let i = 1; i <= totalObjs; i++) {
        const off = objOffsets[i] || 0;
        push(String(off).padStart(10, '0') + ' 00000 n \n');
      }
      push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

      return new Blob(chunks, { type: 'application/pdf' });
    }
  };

  // ─── Local baseline TIFF reader (uncompressed & PackBits only) ───
  // Full TIFF supports many compressions (LZW, JPEG-in-TIFF, etc.) which
  // would require bundling a large decoder. This lightweight reader
  // covers the common baseline case; unsupported files throw a clear error.
  const LocalTIFF = {
    async decode(file) {
      const buf = await file.arrayBuffer();
      const view = new DataView(buf);
      let little;
      if (view.getUint16(0) === 0x4949) little = true;
      else if (view.getUint16(0) === 0x4D4D) little = false;
      else throw new Error('Not a valid TIFF file');

      const g16 = (o) => view.getUint16(o, little);
      const g32 = (o) => view.getUint32(o, little);

      let ifdOffset = g32(4);
      const tags = {};
      const count = g16(ifdOffset);
      for (let i = 0; i < count; i++) {
        const entryOffset = ifdOffset + 2 + i * 12;
        const tag = g16(entryOffset);
        const type = g16(entryOffset + 2);
        const numValues = g32(entryOffset + 4);
        const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
        const size = (typeSizes[type] || 1) * numValues;
        const valueOffset = size <= 4 ? entryOffset + 8 : g32(entryOffset + 8);
        tags[tag] = { type, numValues, valueOffset, size };
      }

      const readVals = (tag) => {
        if (!tags[tag]) return null;
        const { type, numValues, valueOffset } = tags[tag];
        const vals = [];
        for (let i = 0; i < numValues; i++) {
          if (type === 3) vals.push(g16(valueOffset + i * 2));
          else if (type === 4) vals.push(g32(valueOffset + i * 4));
          else vals.push(view.getUint8(valueOffset + i));
        }
        return vals;
      };

      const width = readVals(256)[0];
      const height = readVals(257)[0];
      const compression = readVals(259) ? readVals(259)[0] : 1;
      const stripOffsets = readVals(273);
      const stripByteCounts = readVals(279);
      const samplesPerPixel = readVals(277) ? readVals(277)[0] : 3;
      const rowsPerStrip = readVals(278) ? readVals(278)[0] : height;

      if (compression !== 1 && compression !== 32773) {
        throw new Error('This TIFF uses a compression method (e.g. LZW or JPEG) that this fully offline tool cannot decode. Please re-export as an uncompressed TIFF.');
      }
      if (!stripOffsets) {
        throw new Error('Unsupported TIFF layout (tiled TIFFs are not supported).');
      }

      const rgba = new Uint8ClampedArray(width * height * 4);
      let destRow = 0;

      for (let s = 0; s < stripOffsets.length; s++) {
        let src = new Uint8Array(buf, stripOffsets[s], stripByteCounts[s]);

        if (compression === 32773) {
          // PackBits decompression
          const out = [];
          let p = 0;
          while (p < src.length) {
            const n = src[p++] << 24 >> 24; // signed byte
            if (n >= 0) {
              for (let k = 0; k <= n; k++) out.push(src[p++]);
            } else if (n !== -128) {
              const b = src[p++];
              for (let k = 0; k < 1 - n; k++) out.push(b);
            }
          }
          src = new Uint8Array(out);
        }

        const rowsInStrip = Math.min(rowsPerStrip, height - destRow);
        let srcPos = 0;
        for (let r = 0; r < rowsInStrip; r++) {
          for (let c = 0; c < width; c++) {
            const di = (destRow * width + c) * 4;
            if (samplesPerPixel >= 3) {
              rgba[di] = src[srcPos];
              rgba[di + 1] = src[srcPos + 1];
              rgba[di + 2] = src[srcPos + 2];
              rgba[di + 3] = 255;
              srcPos += samplesPerPixel;
            } else {
              const v = src[srcPos];
              rgba[di] = rgba[di + 1] = rgba[di + 2] = v;
              rgba[di + 3] = 255;
              srcPos += 1;
            }
          }
          destRow++;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
      return canvas;
    }
  };

  // ─── Image Processing Core ───
  const ImageProcessor = {
    /**
     * Get image dimensions and file info.
     * (Also available as Utils.getImageInfo — exposed here too because
     * this is the namespace every tool page actually calls.)
     */
    getImageInfo(file) {
      return Utils.getImageInfo(file);
    },

    /**
     * Load an image from a URL
     */
    loadImage(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
    },

    /**
     * Create a canvas with optional dimensions
     */
    createCanvas(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      return { canvas, ctx };
    },

    /**
     * Resize canvas while maintaining aspect ratio
     */
    resizeCanvas(sourceCanvas, maxDimension) {
      if (!maxDimension || maxDimension <= 0) return sourceCanvas;

      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      if (w <= maxDimension && h <= maxDimension) return sourceCanvas;

      const ratio = Math.min(maxDimension / w, maxDimension / h);
      const nw = Math.round(w * ratio);
      const nh = Math.round(h * ratio);

      const { canvas, ctx } = this.createCanvas(nw, nh);
      ctx.drawImage(sourceCanvas, 0, 0, nw, nh);
      return canvas;
    },

    /**
     * Convert canvas to blob with fallbacks
     */
    async canvasToBlob(canvas, mimeType, quality) {
      return new Promise((resolve) => {
        // Try requested format
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          // Fallback to PNG
          canvas.toBlob((blob2) => {
            if (blob2) {
              resolve(blob2);
              return;
            }
            // Last resort: JPEG
            canvas.toBlob((blob3) => resolve(blob3), 'image/jpeg', 0.92);
          }, 'image/png');
        }, mimeType, quality);
      });
    },

    /**
     * Decode any supported source file into a ready-to-use canvas.
     * Handles TIFF via the local baseline decoder, attempts native
     * browser HEIC/HEIF decoding (works in Safari; other browsers
     * throw a clear, honest error), and uses normal <img> decoding
     * for everything else the browser understands natively.
     */
    async loadAsCanvas(file) {
      const name = (file.name || '').toLowerCase();
      const isTiff = file.type === 'image/tiff' || name.endsWith('.tif') || name.endsWith('.tiff');
      const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
                     name.endsWith('.heic') || name.endsWith('.heif');

      if (isTiff) {
        try {
          return await LocalTIFF.decode(file);
        } catch (err) {
          throw err;
        }
      }

      if (isHeic) {
        try {
          const img = await this.loadImage(URL.createObjectURL(file));
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) throw new Error('empty');
          const { canvas, ctx } = this.createCanvas(w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return canvas;
        } catch (err) {
          throw new Error('This browser cannot decode HEIC/HEIF files locally. Safari supports it natively — in other browsers, please convert the photo to JPG first using your phone or computer\'s built-in tools, then use that JPG here.');
        }
      }

      const img = await this.loadImage(URL.createObjectURL(file));
      const w = img.naturalWidth || img.width || 800;
      const h = img.naturalHeight || img.height || 600;
      const { canvas, ctx } = this.createCanvas(w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas;
    },

    /**
     * Convert image file to another format
     */
    async convert(file, targetFormat, quality = 0.92, maxDimension = 0) {
      const sourceCanvas = await this.loadAsCanvas(file);
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;

      const { canvas, ctx } = this.createCanvas(w, h);

      // Fill white background for JPEG (no alpha channel)
      if (targetFormat === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }

      ctx.drawImage(sourceCanvas, 0, 0, w, h);

      // Resize if needed
      const finalCanvas = maxDimension > 0 ? this.resizeCanvas(canvas, maxDimension) : canvas;

      // Convert to blob
      const blob = await this.canvasToBlob(finalCanvas, targetFormat, quality);

      if (!blob) {
        throw new Error('Failed to create image blob');
      }

      return blob;
    },

    /**
     * Compress an image
     */
    async compress(file, quality = 0.8, maxDimension = 0) {
      const img = await this.loadImage(URL.createObjectURL(file));
      let w = img.naturalWidth || 800;
      let h = img.naturalHeight || 600;

      const { canvas, ctx } = this.createCanvas(w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const finalCanvas = maxDimension > 0 ? this.resizeCanvas(canvas, maxDimension) : canvas;

      // Try WebP first (better compression), fallback to JPEG
      let blob = await this.canvasToBlob(finalCanvas, 'image/webp', quality);
      if (!blob || blob.size > file.size * 0.95) {
        blob = await this.canvasToBlob(finalCanvas, 'image/jpeg', quality);
      }

      return blob;
    },

    /**
     * Resize image to specific dimensions
     */
    async resize(file, targetWidth, targetHeight, maintainAspect = true) {
      const img = await this.loadImage(URL.createObjectURL(file));
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (maintainAspect) {
        const ratio = Math.min(targetWidth / w, targetHeight / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      } else {
        w = targetWidth;
        h = targetHeight;
      }

      const { canvas, ctx } = this.createCanvas(w, h);
      ctx.drawImage(img, 0, 0, w, h);

      return await this.canvasToBlob(canvas, file.type || 'image/png', 0.92);
    },

    /**
     * Crop image to a pixel rectangle
     */
    async crop(file, x, y, cropWidth, cropHeight) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(cropWidth, cropHeight);
      ctx.drawImage(img, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      return await this.canvasToBlob(canvas, file.type || 'image/png', 0.92);
    },

    /**
     * Rotate image
     */
    async rotate(file, degrees) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      const is90or270 = degrees === 90 || degrees === 270;
      const { canvas, ctx } = this.createCanvas(
        is90or270 ? h : w,
        is90or270 ? w : h
      );

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2);

      return await this.canvasToBlob(canvas, file.type || 'image/png', 0.92);
    },

    /**
     * Flip image
     */
    async flip(file, direction) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);

      if (direction === 'horizontal') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, canvas.height);
        ctx.scale(1, -1);
      }

      ctx.drawImage(img, 0, 0);
      return await this.canvasToBlob(canvas, file.type || 'image/png', 0.92);
    },

    /**
     * Apply grayscale filter
     */
    async grayscale(file) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Apply sepia filter
     */
    async sepia(file) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }

      ctx.putImageData(imageData, 0, 0);
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Invert colors
     */
    async invert(file) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }

      ctx.putImageData(imageData, 0, 0);
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Adjust brightness and contrast
     */
    async adjustBrightnessContrast(file, brightness = 0, contrast = 0) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

      for (let i = 0; i < data.length; i += 4) {
        data[i] = factor * (data[i] - 128) + 128 + brightness;
        data[i + 1] = factor * (data[i + 1] - 128) + 128 + brightness;
        data[i + 2] = factor * (data[i + 2] - 128) + 128 + brightness;
      }

      ctx.putImageData(imageData, 0, 0);
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Apply blur effect
     */
    async blur(file, radius = 5) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Adjust saturation and hue using the canvas 2D filter pipeline
     * (native to the browser, no external library needed)
     */
    async adjustSaturationHue(file, saturation = 100, hue = 0) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const { canvas, ctx } = this.createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.filter = `saturate(${saturation}%) hue-rotate(${hue}deg)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Sharpen image using a 3x3 convolution kernel
     */
    async sharpen(file, amount = 1) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const w = img.naturalWidth, h = img.naturalHeight;
      const { canvas, ctx } = this.createCanvas(w, h);
      ctx.drawImage(img, 0, 0);

      const src = ctx.getImageData(0, 0, w, h);
      const dst = ctx.createImageData(w, h);
      const a = amount;
      const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];

      const sd = src.data, dd = dst.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0;
            let k = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const yy = Math.min(h - 1, Math.max(0, y + ky));
                const xx = Math.min(w - 1, Math.max(0, x + kx));
                sum += sd[(yy * w + xx) * 4 + c] * kernel[k++];
              }
            }
            dd[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, sum));
          }
          dd[(y * w + x) * 4 + 3] = sd[(y * w + x) * 4 + 3];
        }
      }

      ctx.putImageData(dst, 0, 0);
      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Pixelate image (mosaic effect)
     */
    async pixelate(file, blockSize = 10) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const w = img.naturalWidth, h = img.naturalHeight;
      const smallW = Math.max(1, Math.round(w / blockSize));
      const smallH = Math.max(1, Math.round(h / blockSize));

      const small = this.createCanvas(smallW, smallH);
      small.ctx.drawImage(img, 0, 0, smallW, smallH);

      const { canvas, ctx } = this.createCanvas(w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small.canvas, 0, 0, smallW, smallH, 0, 0, w, h);

      return await this.canvasToBlob(canvas, 'image/png', 0.92);
    },

    /**
     * Add a text watermark
     */
    async watermark(file, text, options = {}) {
      const {
        position = 'bottom-right',
        opacity = 0.5,
        fontSize = 0, // 0 = auto scale with image
        color = '#ffffff'
      } = options;

      const img = await this.loadImage(URL.createObjectURL(file));
      const w = img.naturalWidth, h = img.naturalHeight;
      const { canvas, ctx } = this.createCanvas(w, h);
      ctx.drawImage(img, 0, 0);

      const size = fontSize > 0 ? fontSize : Math.max(16, Math.round(w * 0.035));
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, size * 0.06);

      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const pad = size * 0.6;

      let x, y;
      if (position.includes('right')) x = w - textW - pad; else if (position.includes('left')) x = pad; else x = (w - textW) / 2;
      if (position.includes('bottom')) y = h - pad; else if (position.includes('top')) y = pad + size; else y = h / 2;

      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;

      return await this.canvasToBlob(canvas, file.type || 'image/png', 0.92);
    },

    /**
     * Convert an image to a multi-resolution .ico file
     * (embeds PNG data per size — supported by all modern OSes/browsers)
     */
    async toICO(file, sizes = [16, 32, 48, 64, 128, 256]) {
      const img = await this.loadImage(URL.createObjectURL(file));
      const pngBuffers = [];

      for (const size of sizes) {
        const { canvas, ctx } = this.createCanvas(size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const blob = await this.canvasToBlob(canvas, 'image/png', 1);
        const buf = new Uint8Array(await blob.arrayBuffer());
        pngBuffers.push({ size, data: buf });
      }

      const headerSize = 6 + pngBuffers.length * 16;
      let totalSize = headerSize;
      pngBuffers.forEach(p => totalSize += p.data.length);

      const out = new Uint8Array(totalSize);
      const view = new DataView(out.buffer);

      view.setUint16(0, 0, true);
      view.setUint16(2, 1, true); // type: icon
      view.setUint16(4, pngBuffers.length, true);

      let offset = headerSize;
      pngBuffers.forEach((p, i) => {
        const entryOffset = 6 + i * 16;
        const dim = p.size >= 256 ? 0 : p.size; // 0 means 256
        view.setUint8(entryOffset, dim);
        view.setUint8(entryOffset + 1, dim);
        view.setUint8(entryOffset + 2, 0);
        view.setUint8(entryOffset + 3, 0);
        view.setUint16(entryOffset + 4, 1, true);
        view.setUint16(entryOffset + 6, 32, true);
        view.setUint32(entryOffset + 8, p.data.length, true);
        view.setUint32(entryOffset + 12, offset, true);
        out.set(p.data, offset);
        offset += p.data.length;
      });

      return new Blob([out], { type: 'image/x-icon' });
    },

    /**
     * Read a file as a Base64 Data URL string
     */
    toDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    },

    /**
     * Convert images to PDF using the local, dependency-free PDF
     * writer (LocalPDF) — no jsPDF, no CDN.
     * Returns a Blob (the finished PDF file).
     */
    async imagesToPDF(files, options = {}) {
      const {
        pageSize = 'a4', // 'a4' | 'letter' | 'fit'
        imageQuality = 0.85,
        orientation = 'auto' // 'auto' | 'portrait' | 'landscape'
      } = options;

      // Standard page sizes in PDF points (1pt = 1/72in)
      const SIZES = {
        a4: [595.28, 841.89],
        letter: [612, 792]
      };

      const pages = [];

      for (const file of files) {
        const img = await this.loadImage(URL.createObjectURL(file));
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        // Scale down very large images before JPEG re-encoding
        const maxDim = CONFIG.MAX_CANVAS_DIMENSION;
        let canvasW = imgW, canvasH = imgH;
        if (canvasW > maxDim || canvasH > maxDim) {
          const ratio = Math.min(maxDim / canvasW, maxDim / canvasH);
          canvasW = Math.round(canvasW * ratio);
          canvasH = Math.round(canvasH * ratio);
        }
        const { canvas, ctx } = this.createCanvas(canvasW, canvasH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.drawImage(img, 0, 0, canvasW, canvasH);

        const jpegBlob = await this.canvasToBlob(canvas, 'image/jpeg', imageQuality);
        const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

        let pageW, pageH;
        if (pageSize === 'fit') {
          pageW = imgW * 0.75; // px -> pt at 96dpi baseline
          pageH = imgH * 0.75;
        } else {
          const isLandscape = orientation === 'landscape' ||
            (orientation === 'auto' && imgW > imgH);
          const base = SIZES[pageSize] || SIZES.a4;
          pageW = isLandscape ? base[1] : base[0];
          pageH = isLandscape ? base[0] : base[1];
        }

        let drawW = pageW, drawH = (imgH / imgW) * drawW;
        if (drawH > pageH) {
          drawH = pageH;
          drawW = (imgW / imgH) * drawH;
        }
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;

        pages.push({
          jpegBytes, pageW, pageH,
          imgX: x, imgY: y, imgW: drawW, imgH: drawH,
          pixelW: canvasW, pixelH: canvasH
        });
      }

      return LocalPDF.build(pages);
    },

    /**
     * Extract EXIF data (basic)
     */
    async getEXIF(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const view = new DataView(e.target.result);
          const exif = {};

          // Basic JPEG EXIF parsing
          if (view.getUint16(0, false) === 0xFFD8) {
            let offset = 2;
            while (offset < view.byteLength) {
              const marker = view.getUint16(offset, false);
              if (marker === 0xFFE1) { // APP1 (EXIF)
                const length = view.getUint16(offset + 2, false);
                // Basic EXIF extraction would go here
                exif.hasEXIF = true;
                break;
              }
              if (marker === 0xFFD9) break; // EOI
              offset += 2 + view.getUint16(offset + 2, false);
            }
          }

          resolve(exif);
        };
        reader.readAsArrayBuffer(file.slice(0, 65536));
      });
    },

    /**
     * Remove EXIF data by re-encoding
     */
    async removeEXIF(file) {
      return await this.convert(file, file.type || 'image/jpeg', 0.92, 0);
    }
  };

  // ─── Dropzone Handler ───
  const Dropzone = {
    init(elementId, inputId, onFiles, options = {}) {
      const zone = document.getElementById(elementId);
      const input = document.getElementById(inputId);

      if (!zone || !input) return;

      // Click to browse
      zone.addEventListener('click', (e) => {
        if (e.target !== input) input.click();
      });

      // Keyboard accessibility
      zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });

      // File input change
      input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length) {
          this.validateAndProcess(files, onFiles, options);
        }
        e.target.value = '';
      });

      // Drag & drop
      ['dragenter', 'dragover'].forEach(event => {
        zone.addEventListener(event, (e) => {
          e.preventDefault();
          e.stopPropagation();
          zone.classList.add('drag-over');
        });
      });

      ['dragleave', 'drop'].forEach(event => {
        zone.addEventListener(event, (e) => {
          e.preventDefault();
          e.stopPropagation();
          zone.classList.remove('drag-over');
        });
      });

      zone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(f => this.isImageFile(f));

        if (imageFiles.length !== files.length) {
          Toast.show('Non-image files were ignored', 'warning');
        }

        if (imageFiles.length) {
          this.validateAndProcess(imageFiles, onFiles, options);
        }
      });
    },

    isImageFile(file) {
      return file.type.startsWith('image/') || 
             CONFIG.SUPPORTED_EXTENSIONS.some(ext => 
               file.name.toLowerCase().endsWith(ext)
             );
    },

    validateAndProcess(files, onFiles, options) {
      const valid = [];

      for (const file of files) {
        if (file.size > CONFIG.MAX_FILE_SIZE) {
          Toast.show(`File too large: ${file.name}`, 'error');
          continue;
        }
        valid.push(file);
      }

      if (AppState.files.length + valid.length > CONFIG.MAX_FILES) {
        Toast.show(`Maximum ${CONFIG.MAX_FILES} images allowed`, 'error');
        return;
      }

      if (valid.length) {
        onFiles(valid);
        Toast.show(`Added ${valid.length} image(s)`, 'success');
      }
    }
  };

  // ─── UI Components ───
  const UI = {
    /**
     * Render image grid
     */
    renderGrid(containerId, files, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '';

      files.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.setAttribute('role', 'listitem');

        const showDownload = options.showDownload && item.status === 'done' && item.blob;
        const statusText = item.status === 'done' ? '✓ Ready' : Utils.formatBytes(item.file.size);

        card.innerHTML = `
          <span class="image-card-status ${item.status === 'done' ? 'done' : ''}">${statusText}</span>
          <button class="image-card-remove" data-index="${index}" aria-label="Remove ${Utils.escapeHtml(item.file.name)}">✕</button>
          <img src="${item.previewUrl}" alt="Preview of ${Utils.escapeHtml(item.file.name)}" loading="lazy" width="140" height="110">
          <div class="image-card-meta">
            <span class="image-card-name mono">${Utils.escapeHtml(item.file.name)}</span>
            <span class="image-card-size">${Utils.formatBytes(item.file.size)}</span>
            ${showDownload ? `<button class="image-card-dl" data-index="${index}">⬇ Download</button>` : ''}
          </div>
        `;

        container.appendChild(card);
      });

      // Attach event listeners
      container.querySelectorAll('.image-card-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index);
          options.onRemove?.(idx);
        });
      });

      container.querySelectorAll('.image-card-dl').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index);
          const item = files[idx];
          if (item?.blob) {
            Utils.downloadBlob(item.blob, item.outputName || item.file.name);
          }
        });
      });
    },

    /**
     * Update progress bar
     */
    setProgress(barId, percentage) {
      const bar = document.getElementById(barId);
      const fill = document.getElementById(barId + '-fill');
      if (!bar || !fill) return;

      bar.classList.toggle('active', percentage > 0 && percentage < 100);
      fill.style.width = percentage + '%';
    },

    /**
     * Toggle button states
     */
    toggleButtons(buttons) {
      Object.entries(buttons).forEach(([id, enabled]) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !enabled;
      });
    },

    /**
     * Show/hide empty state
     */
    toggleEmptyState(emptyId, show) {
      const el = document.getElementById(emptyId);
      if (el) el.style.display = show ? 'block' : 'none';
    }
  };

  // ─── Theme Manager (Dark / Light Mode) ───
  const ThemeManager = {
    STORAGE_KEY: 'diyaa-theme',

    getCurrent() {
      const attr = document.documentElement.getAttribute('data-theme');
      return (attr === 'light' || attr === 'dark') ? attr : 'dark';
    },

    apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b0f17');
      document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
        btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      });
    },

    toggle() {
      const next = this.getCurrent() === 'light' ? 'dark' : 'light';
      this.apply(next);
      try { localStorage.setItem(this.STORAGE_KEY, next); } catch (e) { /* ignore */ }
    },

    init() {
      // The actual initial theme was already applied synchronously by the
      // tiny inline script in <head> (before first paint, to avoid a
      // flash of the wrong theme). Here we just sync button states and
      // wire up the click handler.
      this.apply(this.getCurrent());
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.theme-toggle');
        if (btn) this.toggle();
      });
    }
  };

  // ─── Header Scroll Effect ───
  function initHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          header.classList.toggle('scrolled', window.scrollY > 10);
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ─── Back to Top ───
  function initBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          btn.classList.toggle('visible', window.scrollY > 500);
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ─── Mobile Menu ───
  function initMobileMenu() {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.header-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', nav.classList.contains('open'));
    });
  }

  // ─── Service Worker Registration (PWA + Offline) ───
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Service Workers require http(s); skip silently when opened via file:// locally
    if (location.protocol === 'file:') return;

    window.addEventListener('load', () => {
      // IMPORTANT: capture whether this page was already controlled by a
      // service worker BEFORE registering. `controllerchange` fires both
      // (a) the very first time a service worker ever takes control of a
      // page, and (b) when a genuinely new version replaces an existing
      // one. Only case (b) should trigger a reload — reloading on a
      // first-ever visit would wipe out whatever the person just uploaded
      // moments after they arrived, for no visible reason.
      const wasAlreadyControlled = !!navigator.serviceWorker.controller;

      navigator.serviceWorker.register(SITE_ROOT + 'sw.js', { scope: SITE_ROOT }).catch((err) => {
        console.error('Service worker registration failed:', err);
      });

      if (wasAlreadyControlled) {
        // A newer version has taken over an already-active session — safe
        // to refresh automatically once, since there's nothing in progress
        // yet from this pageview.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          location.reload();
        });
      }
    });
  }

  // ─── Offline page "Try again" button (no inline handlers, for CSP) ───
  function initRetryButton() {
    const btn = document.getElementById('retry-btn');
    if (btn) btn.addEventListener('click', () => location.reload());
  }

  // ─── Initialize ───
  function init() {
    ThemeManager.init();
    initHeader();
    initBackToTop();
    initMobileMenu();
    initRetryButton();
    registerServiceWorker();

    // Add toBlob polyfill for Safari
    if (!HTMLCanvasElement.prototype.toBlob) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        value: function(callback, type, quality) {
          const canvas = this;
          setTimeout(() => {
            const dataUrl = canvas.toDataURL(type, quality);
            const binStr = atob(dataUrl.split(',')[1]);
            const len = binStr.length;
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              arr[i] = binStr.charCodeAt(i);
            }
            callback(new Blob([arr], { type: type || 'image/png' }));
          });
        }
      });
    }
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Public API ───
  global.Diyaa = {
    CONFIG,
    AppState,
    Utils,
    Toast,
    ImageProcessor,
    Dropzone,
    UI,
    LocalZip,
    LocalPDF,
    ThemeManager
  };

})(window);
