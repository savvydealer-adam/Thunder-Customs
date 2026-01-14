/**
 * Image Downloader
 * Download and save product images locally
 */

import got from 'got';
import { createWriteStream } from 'fs';
import { mkdir, access, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from 'path';

export class ImageDownloader {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './data/images';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
  }

  async init() {
    // Ensure output directory exists
    await mkdir(this.outputDir, { recursive: true });
    return this;
  }

  /**
   * Verify path is within output directory (prevent directory traversal)
   */
  isPathSafe(filepath) {
    const resolved = path.resolve(filepath);
    const outputResolved = path.resolve(this.outputDir);
    return resolved.startsWith(outputResolved + path.sep) || resolved === outputResolved;
  }

  /**
   * Cleanup resources
   */
  async close() {
    // No persistent connections to clean up currently
    // This method exists for API consistency and future-proofing
  }

  /**
   * Download an image and save it locally
   */
  async downloadImage(imageUrl, partNumber) {
    if (!imageUrl) return null;

    const safePartNumber = partNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const extension = this.getExtension(imageUrl);
    const filename = safePartNumber + extension;
    const filepath = path.join(this.outputDir, filename);

    if (!this.isPathSafe(filepath)) {
      console.error('Unsafe path detected for ' + partNumber + ', skipping');
      return null;
    }

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        await this.download(imageUrl, filepath);
        return filepath;
      } catch (error) {
        console.error('Download attempt ' + attempt + ' failed for ' + partNumber + ':', error.message);
        if (attempt === this.retries) return null;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  }

  async download(url, filepath) {
    try {
      await access(filepath);
      await unlink(filepath);
    } catch { }

    const downloadStream = got.stream(url, {
      timeout: { request: this.timeout },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.google.com/'
      },
      followRedirect: true,
      maxRedirects: 5
    });

    const writeStream = createWriteStream(filepath);
    await pipeline(downloadStream, writeStream);
  }

  getExtension(url) {
    try {
      const urlObj = new URL(url);
      const ext = path.extname(urlObj.pathname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
      return '.jpg';
    } catch { return '.jpg'; }
  }

  async downloadMultiple(imageUrls, partNumber) {
    if (!imageUrls || !imageUrls.length) return [];
    const results = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      const suffix = i === 0 ? '' : '_' + (i + 1);
      const safePartNumber = partNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
      const extension = this.getExtension(url);
      const filename = safePartNumber + suffix + extension;
      const filepath = path.join(this.outputDir, filename);

      if (!this.isPathSafe(filepath)) {
        console.error('Unsafe path for ' + partNumber + ', skipping');
        continue;
      }

      try {
        await this.download(url, filepath);
        results.push(filepath);
      } catch (error) {
        console.error('Failed to download image ' + (i + 1) + ' for ' + partNumber + ':', error.message);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return results;
  }
}

export default ImageDownloader;
