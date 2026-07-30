/**
 * Diyaa — single source of truth for every tool on the site.
 * Used by the search page, the "All tools" page, and related-tools
 * widgets, so adding a tool only ever means editing this one file.
 */
(function (global) {
  'use strict';

  const TOOLS = [
    // ── Convert ──
    { slug: 'jpg-to-png', icon: '🔄', name: 'JPG to PNG', desc: 'Convert JPG images to PNG with full transparency support, no quality loss.', category: 'Convert', keywords: 'jpg to png converter convert image transparency' },
    { slug: 'png-to-jpg', icon: '🔄', name: 'PNG to JPG', desc: 'Convert PNG images to JPG to shrink file size for sharing and web use.', category: 'Convert', keywords: 'png to jpg converter convert image compress' },
    { slug: 'webp-to-jpg', icon: '🔄', name: 'WebP to JPG', desc: 'Convert modern WebP images to widely-supported JPG.', category: 'Convert', keywords: 'webp to jpg converter convert image compatibility' },
    { slug: 'webp-to-png', icon: '🔄', name: 'WebP to PNG', desc: 'Convert WebP images to PNG while keeping transparency.', category: 'Convert', keywords: 'webp to png converter convert image transparency' },
    { slug: 'avif-to-jpg', icon: '🔄', name: 'AVIF to JPG', desc: 'Convert next-gen AVIF images to universally-supported JPG.', category: 'Convert', keywords: 'avif to jpg converter convert image' },
    { slug: 'avif-to-png', icon: '🔄', name: 'AVIF to PNG', desc: 'Convert AVIF images to PNG without losing quality.', category: 'Convert', keywords: 'avif to png converter convert image' },
    { slug: 'heic-to-jpg', icon: '📱', name: 'HEIC to JPG', desc: 'Convert iPhone HEIC photos to JPG that opens everywhere.', category: 'Convert', keywords: 'heic to jpg converter iphone photo convert' },
    { slug: 'heic-to-png', icon: '📱', name: 'HEIC to PNG', desc: 'Convert iPhone HEIC photos to PNG.', category: 'Convert', keywords: 'heic to png converter iphone photo convert' },
    { slug: 'bmp-to-png', icon: '🔄', name: 'BMP to PNG', desc: 'Convert large, uncompressed BMP files into compact PNG.', category: 'Convert', keywords: 'bmp to png converter convert image compress' },
    { slug: 'gif-to-png', icon: '🔄', name: 'GIF to PNG', desc: 'Extract a single frame from a GIF as a static PNG image.', category: 'Convert', keywords: 'gif to png converter convert image frame extract' },
    { slug: 'svg-to-png', icon: '🔄', name: 'SVG to PNG', desc: 'Convert scalable SVG vector graphics to PNG at a custom resolution.', category: 'Convert', keywords: 'svg to png converter convert vector image' },
    { slug: 'tiff-to-jpg', icon: '🔄', name: 'TIFF to JPG', desc: 'Convert professional TIFF images to JPG.', category: 'Convert', keywords: 'tiff to jpg converter convert image professional' },
    { slug: 'image-to-ico', icon: '🖼️', name: 'Image to ICO', desc: 'Turn any image into a multi-size .ico file for favicons and apps.', category: 'Convert', keywords: 'image to ico converter favicon icon maker' },
    { slug: 'image-to-base64', icon: '🔤', name: 'Image to Base64 / Data URL', desc: 'Convert an image to a Base64-encoded Data URL you can paste into code.', category: 'Convert', keywords: 'image to base64 data url encode convert' },

    // ── Edit & adjust ──
    { slug: 'resize-image', icon: '📐', name: 'Resize Image', desc: 'Resize images to exact dimensions or scale proportionally.', category: 'Edit', keywords: 'resize image online change dimensions scale' },
    { slug: 'crop-image', icon: '✂️', name: 'Crop Image', desc: 'Crop images to the exact area you need.', category: 'Edit', keywords: 'crop image online trim cut photo' },
    { slug: 'rotate-image', icon: '🔃', name: 'Rotate Image', desc: 'Rotate images cleanly by 90°, 180°, or 270° — no quality loss.', category: 'Edit', keywords: 'rotate image online turn photo angle' },
    { slug: 'flip-image', icon: '🔁', name: 'Flip Image', desc: 'Flip images horizontally or vertically.', category: 'Edit', keywords: 'flip image online mirror photo horizontal vertical' },
    { slug: 'grayscale-image', icon: '⚫', name: 'Grayscale Image', desc: 'Convert photos to classic black-and-white.', category: 'Edit', keywords: 'grayscale image black and white filter photo editor' },
    { slug: 'sepia-image', icon: '🟤', name: 'Sepia Photo Effect', desc: 'Apply a warm, vintage sepia tone to any photo.', category: 'Edit', keywords: 'sepia filter vintage photo effect image editor' },
    { slug: 'invert-image-colors', icon: '🌓', name: 'Invert Colors', desc: 'Invert the colors of an image for a negative-film effect.', category: 'Edit', keywords: 'invert colors image negative effect editor' },
    { slug: 'brightness-contrast', icon: '☀️', name: 'Brightness & Contrast', desc: 'Fine-tune brightness and contrast with live sliders.', category: 'Edit', keywords: 'brightness contrast image editor adjust photo' },
    { slug: 'saturation-hue', icon: '🎨', name: 'Saturation & Hue', desc: 'Adjust color saturation and shift hue for creative color grading.', category: 'Edit', keywords: 'saturation hue image editor color adjust photo' },
    { slug: 'blur-image', icon: '🌫️', name: 'Blur Image', desc: 'Apply an adjustable Gaussian-style blur to any photo.', category: 'Edit', keywords: 'blur image online soften photo effect' },
    { slug: 'sharpen-image', icon: '🔍', name: 'Sharpen Image', desc: 'Sharpen soft or slightly out-of-focus photos.', category: 'Edit', keywords: 'sharpen image online enhance clarity photo' },
    { slug: 'pixelate-image', icon: '🟪', name: 'Pixelate Image', desc: 'Pixelate a photo, or a face or plate for privacy, with adjustable block size.', category: 'Edit', keywords: 'pixelate image mosaic censor privacy photo editor' },
    { slug: 'watermark-image', icon: '💧', name: 'Watermark Image', desc: 'Stamp a custom text watermark onto your photos in seconds.', category: 'Edit', keywords: 'watermark image editor add text logo photo protect' },
    { slug: 'remove-exif', icon: '🕵️', name: 'Remove EXIF Metadata', desc: 'Strip hidden camera, date, and GPS location metadata from photos.', category: 'Edit', keywords: 'remove exif metadata strip gps privacy photo' },

    // ── Compress & export ──
    { slug: 'compress-image', icon: '🗜️', name: 'Compress Image', desc: 'Shrink image file size by up to 80% with barely any visible quality loss.', category: 'Compress', keywords: 'compress image online reduce file size optimize' },
    { slug: 'image-to-pdf', icon: '📄', name: 'Images to PDF', desc: 'Combine multiple images into a single, ready-to-share PDF.', category: 'Compress', keywords: 'image to pdf converter combine merge photos document' }
  ];

  global.DiyaaToolsData = TOOLS;
})(window);
