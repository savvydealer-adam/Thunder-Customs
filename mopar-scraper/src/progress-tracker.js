/**
 * Progress Tracker
 * Uses SQLite to track scraping progress for resume capability
 */

import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import path from 'path';

export class ProgressTracker {
  constructor(dbPath = './data/progress.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    // Ensure directory exists
    await mkdir(path.dirname(this.dbPath), { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma("busy_timeout = 5000"); // 5 second timeout for concurrent access

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        input_file TEXT NOT NULL,
        output_file TEXT NOT NULL,
        total_parts INTEGER DEFAULT 0,
        completed_parts INTEGER DEFAULT 0,
        failed_parts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        part_number TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        title TEXT,
        description TEXT,
        msrp TEXT,
        sale_price TEXT,
        price_source TEXT,
        image_url TEXT,
        image_source TEXT,
        local_image TEXT,
        source_url TEXT,
        error TEXT,
        attempts INTEGER DEFAULT 0,
        processed_at TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        UNIQUE(job_id, part_number)
      );

      CREATE INDEX IF NOT EXISTS idx_parts_job_status ON parts(job_id, status);
      CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number);
    `);

    // Add new columns if they don't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE parts ADD COLUMN msrp TEXT`);
    } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
    try {
      this.db.exec(`ALTER TABLE parts ADD COLUMN sale_price TEXT`);
    } catch (e) { if (!e.message.includes('duplicate column')) throw e; }
    try {
      this.db.exec(`ALTER TABLE parts ADD COLUMN image_source TEXT`);
    } catch (e) { if (!e.message.includes('duplicate column')) throw e; }

    return this;
  }

  /**
   * Create a new scraping job
   */
  createJob(inputFile, outputFile, partNumbers) {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (input_file, output_file, total_parts, status, started_at)
      VALUES (?, ?, ?, 'running', datetime('now'))
    `);

    const result = stmt.run(inputFile, outputFile, partNumbers.length);
    const jobId = result.lastInsertRowid;

    // Insert all part numbers
    const insertPart = this.db.prepare(`
      INSERT OR IGNORE INTO parts (job_id, part_number)
      VALUES (?, ?)
    `);

    const insertMany = this.db.transaction((parts) => {
      for (const partNumber of parts) {
        insertPart.run(jobId, partNumber);
      }
    });

    insertMany(partNumbers);

    return jobId;
  }

  /**
   * Get the most recent incomplete job
   */
  getIncompleteJob() {
    return this.db.prepare(`
      SELECT * FROM jobs
      WHERE status IN ('running', 'paused')
      ORDER BY created_at DESC
      LIMIT 1
    `).get();
  }

  /**
   * Get job by ID
   */
  getJob(jobId) {
    return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  }

  /**
   * Get all pending parts for a job
   */
  getPendingParts(jobId, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM parts
      WHERE job_id = ? AND status = 'pending'
      ORDER BY id
      LIMIT ?
    `).all(jobId, limit);
  }

  /**
   * Get failed parts for retry
   */
  getFailedParts(jobId, maxAttempts = 3) {
    return this.db.prepare(`
      SELECT * FROM parts
      WHERE job_id = ? AND status = 'failed' AND attempts < ?
      ORDER BY id
    `).all(jobId, maxAttempts);
  }

  /**
   * Update part status after processing
   */
  updatePart(jobId, partNumber, result) {
    const stmt = this.db.prepare(`
      UPDATE parts SET
        status = ?,
        title = ?,
        description = ?,
        msrp = ?,
        sale_price = ?,
        price_source = ?,
        image_url = ?,
        image_source = ?,
        local_image = ?,
        source_url = ?,
        error = ?,
        attempts = attempts + 1,
        processed_at = datetime('now')
      WHERE job_id = ? AND part_number = ?
    `);

    stmt.run(
      result.status || 'success',
      result.title || null,
      result.description || null,
      result.msrp || null,
      result.salePrice || null,
      result.priceSource || null,
      result.imageUrl || null,
      result.imageSource || null,
      result.localImage || null,
      result.sourceUrl || null,
      result.error || null,
      jobId,
      partNumber
    );

    // Update job counters
    this.updateJobProgress(jobId);
  }

  /**
   * Update job progress counters
   */
  updateJobProgress(jobId) {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM parts WHERE job_id = ?
    `).get(jobId);

    this.db.prepare(`
      UPDATE jobs SET
        completed_parts = ?,
        failed_parts = ?
      WHERE id = ?
    `).run(stats.completed, stats.failed, jobId);
  }

  /**
   * Mark job as complete
   */
  completeJob(jobId) {
    this.db.prepare(`
      UPDATE jobs SET
        status = 'completed',
        completed_at = datetime('now')
      WHERE id = ?
    `).run(jobId);
  }

  /**
   * Pause a job
   */
  pauseJob(jobId) {
    this.db.prepare(`
      UPDATE jobs SET status = 'paused'
      WHERE id = ?
    `).run(jobId);
  }

  /**
   * Resume a paused job
   */
  resumeJob(jobId) {
    this.db.prepare(`
      UPDATE jobs SET status = 'running'
      WHERE id = ?
    `).run(jobId);
  }

  /**
   * Get job statistics
   */
  getJobStats(jobId) {
    const job = this.getJob(jobId);
    if (!job) return null;

    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM parts WHERE job_id = ?
    `).get(jobId);

    return {
      job,
      ...stats,
      progressPercent: ((stats.success + stats.failed) / stats.total * 100).toFixed(1)
    };
  }

  /**
   * Get all completed parts with data (for export)
   */
  getCompletedParts(jobId) {
    return this.db.prepare(`
      SELECT * FROM parts
      WHERE job_id = ? AND status = 'success'
      ORDER BY id
    `).all(jobId);
  }

  /**
   * Get all parts (for full export including failures)
   */
  getAllParts(jobId) {
    return this.db.prepare(`
      SELECT * FROM parts
      WHERE job_id = ?
      ORDER BY id
    `).all(jobId);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

export default ProgressTracker;
