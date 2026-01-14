/**
 * Live Image Viewer for Mopar Scraper
 * Opens a browser window showing scraped images in real-time
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

export function startViewer(outputFile, port = 3333) {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getViewerHtml());
    } else if (req.url === '/api/results') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });

      try {
        const results = loadResults(outputFile);
        res.end(JSON.stringify(results));
      } catch (error) {
        res.end(JSON.stringify({ error: error.message, results: [] }));
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`\n📸 Image Viewer running at http://localhost:${port}`);
    console.log('   Auto-refreshes every 5 seconds\n');
  });

  // Open in browser
  const start = process.platform === 'win32' ? 'start' :
                process.platform === 'darwin' ? 'open' : 'xdg-open';
  import('child_process').then(cp => {
    cp.exec(`${start} http://localhost:${port}`);
  }).catch(() => {
    console.log('Could not open browser automatically. Please open http://localhost:' + port + ' manually.');
  });

  return server;
}

function loadResults(outputFile) {
  const filePath = outputFile || path.join(DATA_DIR, 'output/results.csv');

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  return records.map(r => ({
    partNumber: r.partNumber || r.part_number,
    title: r.title,
    description: r.description,
    msrp: r.msrp,
    salePrice: r.salePrice || r.sale_price,
    imageUrl: r.imageUrl || r.image_url,
    imageSource: r.imageSource || r.image_source,
    additionalImages: r.additionalImages ? JSON.parse(r.additionalImages) : [],
    status: r.status,
    scrapedAt: r.scrapedAt || r.scraped_at
  }));
}

function getViewerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mopar Scraper - Image Viewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
    }
    .header {
      background: rgba(255,255,255,0.05);
      padding: 20px 40px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header h1 { font-size: 24px; color: #fff; }
    .stats {
      display: flex;
      gap: 20px;
      font-size: 14px;
    }
    .stat {
      padding: 8px 16px;
      background: rgba(255,255,255,0.1);
      border-radius: 20px;
    }
    .stat.success { color: #22c55e; }
    .stat.failed { color: #ef4444; }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 30px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    }
    .card-image {
      width: 100%;
      height: 200px;
      object-fit: contain;
      background: #0d0d1a;
    }
    .card-image.error {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      font-size: 14px;
    }
    .card-body {
      padding: 16px;
    }
    .part-number {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
      font-family: monospace;
    }
    .title {
      font-size: 13px;
      color: #888;
      margin-bottom: 8px;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .prices {
      margin-bottom: 8px;
    }
    .price-label {
      font-size: 11px;
      color: #888;
      margin-right: 4px;
    }
    .msrp {
      font-size: 14px;
      color: #888;
      text-decoration: line-through;
    }
    .sale-price {
      font-size: 18px;
      font-weight: 600;
      color: #22c55e;
    }
    .meta {
      font-size: 11px;
      color: #666;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .status-badge, .source-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .status-badge.success {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }
    .source-badge {
      background: rgba(100, 100, 100, 0.2);
      color: #888;
    }
    .source-badge.official {
      background: rgba(102, 126, 234, 0.2);
      color: #667eea;
    }
    .status-badge.error, .status-badge.failed {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .thumbnails {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .thumbnail {
      width: 50px;
      height: 50px;
      object-fit: cover;
      border-radius: 8px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.2s;
    }
    .thumbnail:hover {
      border-color: #667eea;
    }
    .empty {
      text-align: center;
      padding: 60px;
      color: #666;
    }
    .empty h2 { margin-bottom: 10px; color: #888; }
    .refresh-indicator {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal.open { display: flex; }
    .modal img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
    }
    .modal-close {
      position: absolute;
      top: 20px;
      right: 30px;
      font-size: 40px;
      color: #fff;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Mopar Scraper - Image Viewer</h1>
    <div class="stats">
      <div class="stat">Total: <span id="total">0</span></div>
      <div class="stat success">Success: <span id="success">0</span></div>
      <div class="stat failed">Failed: <span id="failed">0</span></div>
      <div class="refresh-indicator" title="Auto-refreshing"></div>
    </div>
  </div>

  <div class="container">
    <div class="grid" id="grid"></div>
    <div class="empty" id="empty" style="display: none;">
      <h2>No results yet</h2>
      <p>Start the scraper and results will appear here automatically</p>
    </div>
  </div>

  <div class="modal" id="modal" onclick="closeModal()">
    <span class="modal-close">&times;</span>
    <img id="modal-image" src="" alt="Full size">
  </div>

  <script>
    // Escape HTML to prevent XSS
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Escape URL to prevent javascript: protocol injection
    function safeUrl(url) {
      if (!url) return '';
      const u = url.toLowerCase().trim();
      if (u.startsWith('javascript:') || u.startsWith('data:')) return '';
      return url.replace(/"/g, '&quot;');
    }

    let lastCount = 0;

    async function loadResults() {
      try {
        const response = await fetch('/api/results');
        const data = await response.json();
        renderResults(data);
      } catch (error) {
        console.error('Error loading results:', error);
      }
    }

    function renderResults(results) {
      const grid = document.getElementById('grid');
      const empty = document.getElementById('empty');

      // Update stats
      const success = results.filter(r => r.status === 'success').length;
      const failed = results.filter(r => r.status !== 'success').length;
      document.getElementById('total').textContent = results.length;
      document.getElementById('success').textContent = success;
      document.getElementById('failed').textContent = failed;

      if (results.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
      }

      grid.style.display = 'grid';
      empty.style.display = 'none';

      // Only re-render if count changed
      if (results.length === lastCount) return;
      lastCount = results.length;

      grid.innerHTML = results.map(item => \`
        <div class="card">
          \${item.imageUrl
            ? \`<img class="card-image" src="\${safeUrl(item.imageUrl)}" alt="\${escapeHtml(item.partNumber)}" onclick="openModal(safeUrl(item.imageUrl))" onerror="this.outerHTML='<div class=\\\\'card-image error\\\\'>Image failed to load</div>'">\`
            : '<div class="card-image error">No image found</div>'
          }
          <div class="card-body">
            <div class="part-number">\${escapeHtml(item.partNumber)}</div>
            <div class="title">\${escapeHtml(item.title) || "No title"}</div>
            <div class="prices">
              \${item.msrp ? \`<div class="msrp"><span class="price-label">MSRP:</span> \${escapeHtml(item.msrp)}</div>\` : ''}
              \${item.salePrice ? \`<div class="sale-price"><span class="price-label">Sale:</span> \${escapeHtml(item.salePrice)}</div>\` : ''}
            </div>
            <div class="meta">
              <span class="status-badge \${item.status}">\${escapeHtml(item.status)}</span>
              \${item.imageSource ? \`<span class="source-badge \${item.imageSource === 'store.mopar.com' ? 'official' : ''}">\${escapeHtml(item.imageSource)}</span>\` : ''}
            </div>
            \${item.additionalImages && item.additionalImages.length > 0 ? \`
              <div class="thumbnails">
                \${item.additionalImages.map(img => \`
                  <img class="thumbnail" src="\${safeUrl(img)}" onclick="openModal(safeUrl(img))" onerror="this.style.display='none'">
                \`).join('')}
              </div>
            \` : ''}
          </div>
        </div>
      \`).reverse().join('');
    }

    function openModal(src) {
      event.stopPropagation();
      document.getElementById('modal-image').src = src;
      document.getElementById('modal').classList.add('open');
    }

    function closeModal() {
      document.getElementById('modal').classList.remove('open');
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Initial load
    loadResults();

    // Auto-refresh every 5 seconds
    setInterval(loadResults, 5000);
  </script>
</body>
</html>`;
}

export default startViewer;
