/**
 * Diyaa — declarative configuration for every tool's upload rules,
 * on-page controls, and processing logic. The generic engine in
 * tools-runtime.js reads this file so every tool page can share one
 * robust, tested codebase instead of 30 hand-written scripts.
 */
(function (global) {
  'use strict';

  function ext(name) {
    const m = /\.[^./\\]+$/.exec(name || '');
    return m ? m[0] : '';
  }
  function baseName(name, newExt) {
    return (name || 'image').replace(/\.[^./\\]+$/, '') + newExt;
  }

  const CONFIG = {

    // ── Convert ──
    'jpg-to-png': {
      accept: '.jpg,.jpeg', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92), name: baseName(file.name, '.png') })
    },
    'png-to-jpg': {
      accept: '.png', kind: 'image', multiple: true,
      controls: [{ id: 'quality', type: 'slider', label: 'Quality', min: 60, max: 100, value: 92, unit: '%' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/jpeg', v.quality / 100), name: baseName(file.name, '.jpg') })
    },
    'webp-to-jpg': {
      accept: '.webp', kind: 'image', multiple: true,
      controls: [{ id: 'quality', type: 'slider', label: 'Quality', min: 60, max: 100, value: 92, unit: '%' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/jpeg', v.quality / 100), name: baseName(file.name, '.jpg') })
    },
    'webp-to-png': {
      accept: '.webp', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92), name: baseName(file.name, '.png') })
    },
    'avif-to-jpg': {
      accept: '.avif', kind: 'image', multiple: true,
      controls: [{ id: 'quality', type: 'slider', label: 'Quality', min: 60, max: 100, value: 92, unit: '%' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/jpeg', v.quality / 100), name: baseName(file.name, '.jpg') })
    },
    'avif-to-png': {
      accept: '.avif', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92), name: baseName(file.name, '.png') })
    },
    'heic-to-jpg': {
      accept: '.heic,.heif', kind: 'image', multiple: true,
      controls: [{ id: 'quality', type: 'slider', label: 'Quality', min: 60, max: 100, value: 92, unit: '%' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/jpeg', v.quality / 100), name: baseName(file.name, '.jpg') })
    },
    'heic-to-png': {
      accept: '.heic,.heif', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92), name: baseName(file.name, '.png') })
    },
    'bmp-to-png': {
      accept: '.bmp', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92), name: baseName(file.name, '.png') })
    },
    'gif-to-png': {
      accept: '.gif', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92), name: baseName(file.name, '.png') })
    },
    'svg-to-png': {
      accept: '.svg', kind: 'image', multiple: true,
      controls: [{ id: 'width', type: 'number', label: 'Output width (px)', min: 16, max: 8000, value: 1024 }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/png', 0.92, parseInt(v.width) || 1024), name: baseName(file.name, '.png') })
    },
    'tiff-to-jpg': {
      accept: '.tif,.tiff', kind: 'image', multiple: true,
      controls: [{ id: 'quality', type: 'slider', label: 'Quality', min: 60, max: 100, value: 92, unit: '%' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.convert(file, 'image/jpeg', v.quality / 100), name: baseName(file.name, '.jpg') })
    },
    'image-to-ico': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [{ id: 'sizes', type: 'checkbox-group', label: 'Sizes to include', options: [16, 32, 48, 64, 128, 256], value: [16, 32, 48, 64, 128, 256] }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.toICO(file, v.sizes.length ? v.sizes : [32, 64, 128, 256]), name: baseName(file.name, '.ico') })
    },
    'image-to-base64': {
      accept: 'image/*', kind: 'text', multiple: true,
      controls: [],
      process: async (file) => ({ text: await Diyaa.ImageProcessor.toDataURL(file), name: baseName(file.name, '.txt') })
    },

    // ── Edit & adjust ──
    'resize-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [
        { id: 'width', type: 'number', label: 'Width (px)', min: 1, max: 8000, value: 1280 },
        { id: 'height', type: 'number', label: 'Height (px)', min: 1, max: 8000, value: 720 },
        { id: 'maintain', type: 'checkbox', label: 'Maintain aspect ratio', value: true }
      ],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.resize(file, parseInt(v.width) || 1280, parseInt(v.height) || 720, !!v.maintain), name: baseName(file.name, ext(file.name) || '.png') })
    },
    'crop-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [
        { id: 'crop', type: 'crop-visual', value: { x: 0, y: 0, w: 100, h: 100 } }
      ],
      process: async (file, v) => {
        const c = v.crop || { x: 0, y: 0, w: 100, h: 100 };
        const info = await Diyaa.ImageProcessor.getImageInfo(file);
        const x = Math.round(info.width * (c.x / 100));
        const y = Math.round(info.height * (c.y / 100));
        const w = Math.min(info.width - x, Math.round(info.width * (c.w / 100)));
        const h = Math.min(info.height - y, Math.round(info.height * (c.h / 100)));
        return { blob: await Diyaa.ImageProcessor.crop(file, x, y, w, h), name: baseName(file.name, ext(file.name) || '.png') };
      }
    },
    'rotate-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [{ id: 'degrees', type: 'select', label: 'Rotate', options: [{ v: 90, l: '90° clockwise' }, { v: 180, l: '180°' }, { v: 270, l: '270° clockwise' }], value: 90 }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.rotate(file, parseInt(v.degrees)), name: baseName(file.name, ext(file.name) || '.png') })
    },
    'flip-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [{ id: 'direction', type: 'select', label: 'Flip direction', options: [{ v: 'horizontal', l: 'Horizontal' }, { v: 'vertical', l: 'Vertical' }], value: 'horizontal' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.flip(file, v.direction), name: baseName(file.name, ext(file.name) || '.png') })
    },
    'grayscale-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.grayscale(file), name: baseName(file.name, '.png') })
    },
    'sepia-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.sepia(file), name: baseName(file.name, '.png') })
    },
    'invert-image-colors': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.invert(file), name: baseName(file.name, '.png') })
    },
    'brightness-contrast': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [
        { id: 'brightness', type: 'slider', label: 'Brightness', min: -100, max: 100, value: 0 },
        { id: 'contrast', type: 'slider', label: 'Contrast', min: -100, max: 100, value: 0 }
      ],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.adjustBrightnessContrast(file, parseInt(v.brightness), parseInt(v.contrast)), name: baseName(file.name, '.png') })
    },
    'saturation-hue': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [
        { id: 'saturation', type: 'slider', label: 'Saturation', min: 0, max: 300, value: 100, unit: '%' },
        { id: 'hue', type: 'slider', label: 'Hue rotate', min: -180, max: 180, value: 0, unit: '°' }
      ],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.adjustSaturationHue(file, parseInt(v.saturation), parseInt(v.hue)), name: baseName(file.name, '.png') })
    },
    'blur-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [{ id: 'radius', type: 'slider', label: 'Blur radius', min: 0, max: 20, value: 5, unit: 'px' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.blur(file, parseFloat(v.radius)), name: baseName(file.name, '.png') })
    },
    'sharpen-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [{ id: 'amount', type: 'slider', label: 'Sharpen amount', min: 0, max: 3, step: 0.1, value: 1 }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.sharpen(file, parseFloat(v.amount)), name: baseName(file.name, '.png') })
    },
    'pixelate-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [{ id: 'blockSize', type: 'slider', label: 'Block size', min: 2, max: 50, value: 12, unit: 'px' }],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.pixelate(file, parseInt(v.blockSize)), name: baseName(file.name, '.png') })
    },
    'watermark-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [
        { id: 'text', type: 'text', label: 'Watermark text', value: '© Your Name' },
        { id: 'position', type: 'select', label: 'Position', options: [{ v: 'bottom-right', l: 'Bottom right' }, { v: 'bottom-left', l: 'Bottom left' }, { v: 'top-right', l: 'Top right' }, { v: 'top-left', l: 'Top left' }, { v: 'center', l: 'Center' }], value: 'bottom-right' },
        { id: 'opacity', type: 'slider', label: 'Opacity', min: 10, max: 100, value: 60, unit: '%' }
      ],
      process: async (file, v) => ({ blob: await Diyaa.ImageProcessor.watermark(file, v.text || 'Watermark', { position: v.position, opacity: v.opacity / 100 }), name: baseName(file.name, ext(file.name) || '.png') })
    },
    'remove-exif': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [],
      process: async (file) => ({ blob: await Diyaa.ImageProcessor.removeEXIF(file), name: baseName(file.name, ext(file.name) || '.jpg') })
    },

    // ── Compress & export ──
    'compress-image': {
      accept: 'image/*', kind: 'image', multiple: true,
      controls: [
        { id: 'quality', type: 'slider', label: 'Compression level', min: 10, max: 95, value: 80, unit: '%' },
        { id: 'maxWidth', type: 'number', label: 'Max width (px, 0 = no limit)', min: 0, max: 8000, value: 0 },
        { id: 'format', type: 'select', label: 'Output format', options: [{ v: 'auto', l: 'Auto (WebP/JPG)' }, { v: 'jpg', l: 'JPG' }, { v: 'png', l: 'PNG' }, { v: 'webp', l: 'WebP' }], value: 'auto' }
      ],
      process: async (file, v) => {
        const quality = v.quality / 100;
        const maxWidth = parseInt(v.maxWidth) || 0;
        const img = await Diyaa.ImageProcessor.loadImage(URL.createObjectURL(file));
        const { canvas, ctx } = Diyaa.ImageProcessor.createCanvas(img.naturalWidth || 800, img.naturalHeight || 600);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const finalCanvas = maxWidth > 0 ? Diyaa.ImageProcessor.resizeCanvas(canvas, maxWidth) : canvas;

        if (v.format === 'jpg') return { blob: await Diyaa.ImageProcessor.canvasToBlob(finalCanvas, 'image/jpeg', quality), name: baseName(file.name, '.jpg') };
        if (v.format === 'png') return { blob: await Diyaa.ImageProcessor.canvasToBlob(finalCanvas, 'image/png', quality), name: baseName(file.name, '.png') };
        if (v.format === 'webp') return { blob: await Diyaa.ImageProcessor.canvasToBlob(finalCanvas, 'image/webp', quality), name: baseName(file.name, '.webp') };

        const webpBlob = await Diyaa.ImageProcessor.canvasToBlob(finalCanvas, 'image/webp', quality);
        if (webpBlob && webpBlob.size < file.size * 0.9) return { blob: webpBlob, name: baseName(file.name, '.webp') };
        return { blob: await Diyaa.ImageProcessor.canvasToBlob(finalCanvas, 'image/jpeg', quality), name: baseName(file.name, '.jpg') };
      }
    },
    'image-to-pdf': {
      accept: 'image/*', kind: 'combine', multiple: true,
      controls: [
        { id: 'pageSize', type: 'select', label: 'Page size', options: [{ v: 'a4', l: 'A4' }, { v: 'letter', l: 'Letter' }, { v: 'fit', l: 'Fit to image' }], value: 'a4' },
        { id: 'orientation', type: 'select', label: 'Orientation', options: [{ v: 'auto', l: 'Auto' }, { v: 'portrait', l: 'Portrait' }, { v: 'landscape', l: 'Landscape' }], value: 'auto' },
        { id: 'quality', type: 'slider', label: 'Image quality', min: 50, max: 95, value: 85, unit: '%' }
      ],
      processAll: async (files, v) => ({
        blob: await Diyaa.ImageProcessor.imagesToPDF(files, { pageSize: v.pageSize, orientation: v.orientation, imageQuality: v.quality / 100 }),
        name: 'diyaa-images.pdf'
      })
    }
  };

  global.DiyaaToolsConfig = CONFIG;
})(window);
