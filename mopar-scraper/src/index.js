#!/usr/bin/env node

/**
 * Mopar Parts Scraper
 * CLI tool for scraping Mopar parts data from Google
 */

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import cliProgress from 'cli-progress';
import path from 'path';
import { fileURLToPath } from 'url';

import { readPartNumbers, writeResults } from './csv-handler.js';
import { MoparScraper } from './scraper.js';
import { MoparApiScraper } from './api-scraper.js';
import { ImageDownloader } from './image-downloader.js';
import { ProgressTracker } from './progress-tracker.js';
import { startViewer } from './viewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

const program = new Command();

program
  .name('mopar-scraper')
  .description('Scrape Mopar parts data (images, prices, descriptions) from Google')
  .version('1.0.0');

/**
 * Scrape command - start a new scraping job
 */
program
  .command('scrape')
  .description('Start scraping parts from a CSV file')
  .argument('<input>', 'Input CSV file with part numbers')
  .option('-o, --output <file>', 'Output CSV file', './data/output/results.csv')
  .option('-d, --delay <ms>', 'Delay between requests in ms', '1000')
  .option('-b, --batch <size>', 'Batch size before saving', '10')
  .option('--api', 'Use Google Custom Search API (default, no CAPTCHA)', true)
  .option('--no-api', 'Use Puppeteer browser scraping instead')
  .option('--headless', 'Run browser in headless mode (puppeteer only)', true)
  .option('--no-headless', 'Show browser window (puppeteer only)')
  .option('--no-images', 'Skip downloading images')
  .option('--viewer', 'Open live image viewer in browser')
  .action(async (input, options) => {
    await runScraper(input, options);
  });

/**
 * Viewer command - open image viewer for results
 */
program
  .command('viewer')
  .description('Open live image viewer to see scraped images')
  .option('-o, --output <file>', 'Results CSV file to view', './data/output/results.csv')
  .option('-p, --port <number>', 'Port for viewer server', '3333')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📸 Mopar Parts Image Viewer\n'));
    startViewer(options.output, parseInt(options.port));
  });

/**
 * Resume command - continue an incomplete job
 */
program
  .command('resume')
  .description('Resume an incomplete scraping job')
  .option('-j, --job <id>', 'Specific job ID to resume')
  .option('-d, --delay <ms>', 'Delay between requests in ms', '3000')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Show browser window')
  .action(async (options) => {
    await resumeScraper(options);
  });

/**
 * Status command - check job progress
 */
program
  .command('status')
  .description('Check the status of scraping jobs')
  .option('-j, --job <id>', 'Specific job ID')
  .action(async (options) => {
    await showStatus(options);
  });

/**
 * Export command - export results to CSV
 */
program
  .command('export')
  .description('Export completed results to CSV')
  .option('-j, --job <id>', 'Specific job ID')
  .option('-o, --output <file>', 'Output CSV file')
  .option('--include-failed', 'Include failed parts in export')
  .action(async (options) => {
    await exportResults(options);
  });

/**
 * Main scraper function
 */
async function runScraper(inputFile, options) {
  const useApi = options.api !== false;
  console.log(chalk.blue.bold('\n🔧 Mopar Parts Scraper\n'));
  console.log(chalk.gray(`Mode: ${useApi ? 'Google Custom Search API' : 'Puppeteer Browser'}\n`));

  // Start viewer if requested
  if (options.viewer) {
    startViewer(options.output, 3333);
  }

  const spinner = ora('Initializing...').start();

  try {
    // Initialize components
    const tracker = await new ProgressTracker(path.join(DATA_DIR, 'progress.db')).init();

    // Use API scraper by default (no CAPTCHA issues!)
    const scraper = useApi
      ? await new MoparApiScraper().init()
      : await new MoparScraper({ headless: options.headless }).init();
    const imageDownloader = options.images !== false
      ? await new ImageDownloader({ outputDir: path.join(DATA_DIR, 'images') }).init()
      : null;

    // Read part numbers
    spinner.text = 'Reading input file...';
    const parts = await readPartNumbers(inputFile);

    if (parts.length === 0) {
      spinner.fail('No part numbers found in input file');
      process.exit(1);
    }

    spinner.succeed(`Found ${chalk.green(parts.length)} part numbers`);

    // Create job
    const partNumbers = parts.map(p => p.partNumber);
    const jobId = tracker.createJob(inputFile, options.output, partNumbers);
    console.log(chalk.gray(`Job ID: ${jobId}`));

    // Setup progress bar
    const progressBar = new cliProgress.SingleBar({
      format: 'Progress |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | ETA: {eta}s | {part}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(parts.length, 0, { part: '' });

    const delay = parseInt(options.delay) || 3000;
    let processed = 0;

    // Process parts
    for (const { partNumber } of parts) {
      try {
        progressBar.update(processed, { part: partNumber });

        // Check if already processed
        const pending = tracker.getPendingParts(jobId, 1);
        if (pending.length === 0 || pending[0].part_number !== partNumber) {
          // Already processed, skip
          processed++;
          continue;
        }

        // Scrape part data
        const result = await scraper.searchPart(partNumber);

        // Download image if enabled and found
        if (imageDownloader && result.imageUrl) {
          const localPath = await imageDownloader.downloadImage(result.imageUrl, partNumber);
          if (localPath) {
            result.localImage = localPath;
          }
        }

        // Update tracker
        tracker.updatePart(jobId, partNumber, result);

        processed++;
        progressBar.update(processed, { part: partNumber });

        // Random delay to avoid detection
        const randomDelay = delay + Math.random() * 1000;
        await new Promise(r => setTimeout(r, randomDelay));

      } catch (error) {
        console.error(`\n${chalk.red('Error processing')} ${partNumber}: ${error.message}`);

        tracker.updatePart(jobId, partNumber, {
          status: 'failed',
          error: error.message
        });

        // Handle different error types
        if (error.message.includes('quota exceeded')) {
          console.log(chalk.yellow('\n⚠️  API quota exceeded! Daily limit reached.'));
          console.log(chalk.gray('Free tier: 100 queries/day. Upgrade at https://console.cloud.google.com'));
          break; // Stop processing - no point continuing
        } else if (error.message.includes('CAPTCHA')) {
          console.log(chalk.yellow('\n⚠️  CAPTCHA detected! Waiting 5 minutes...'));
          await new Promise(r => setTimeout(r, 300000));
        }

        processed++;
      }
    }

    progressBar.stop();

    // Complete job
    tracker.completeJob(jobId);

    // Export results
    const allParts = tracker.getAllParts(jobId);
    await writeResults(options.output, allParts.map(p => ({
      partNumber: p.part_number,
      title: p.title,
      description: p.description,
      msrp: p.msrp,
      salePrice: p.sale_price,
      priceSource: p.price_source,
      imageUrl: p.image_url,
    imageSource: p.image_source,
      imageSource: p.image_source,
      localImage: p.local_image,
      sourceUrl: p.source_url,
      status: p.status,
      error: p.error,
      scrapedAt: p.processed_at
    })));

    // Show summary
    const stats = tracker.getJobStats(jobId);
    console.log(chalk.green.bold('\n✅ Scraping Complete!\n'));
    console.log(`Total Parts: ${stats.total}`);
    console.log(`Successful: ${chalk.green(stats.success)}`);
    console.log(`Failed: ${chalk.red(stats.failed)}`);
    console.log(`Output: ${options.output}`);

    // Cleanup
    await scraper.close();
    tracker.close();

  } catch (error) {
    spinner.fail(`Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Resume an incomplete job
 */
async function resumeScraper(options) {
  console.log(chalk.blue.bold('\n🔧 Resuming Mopar Parts Scraper\n'));

  const tracker = await new ProgressTracker(path.join(DATA_DIR, 'progress.db')).init();

  let job;
  if (options.job) {
    job = tracker.getJob(parseInt(options.job));
  } else {
    job = tracker.getIncompleteJob();
  }

  if (!job) {
    console.log(chalk.yellow('No incomplete jobs found.'));
    tracker.close();
    return;
  }

  console.log(chalk.gray(`Resuming Job #${job.id}: ${job.input_file}`));

  const stats = tracker.getJobStats(job.id);
  console.log(`Progress: ${stats.success + stats.failed}/${stats.total} (${stats.progressPercent}%)`);
  console.log(`Remaining: ${stats.pending}\n`);

  // Resume scraping
  const scraper = await new MoparScraper({ headless: options.headless }).init();
  const imageDownloader = await new ImageDownloader({ outputDir: path.join(DATA_DIR, 'images') }).init();

  tracker.resumeJob(job.id);

  const progressBar = new cliProgress.SingleBar({
    format: 'Progress |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {part}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  progressBar.start(stats.total, stats.success + stats.failed, { part: '' });

  const delay = parseInt(options.delay) || 3000;
  let pendingParts = tracker.getPendingParts(job.id, 100);

  while (pendingParts.length > 0) {
    for (const part of pendingParts) {
      try {
        progressBar.update(progressBar.value, { part: part.part_number });

        const result = await scraper.searchPart(part.part_number);

        if (result.imageUrl) {
          const localPath = await imageDownloader.downloadImage(result.imageUrl, part.part_number);
          if (localPath) result.localImage = localPath;
        }

        tracker.updatePart(job.id, part.part_number, result);
        progressBar.increment(1, { part: part.part_number });

        const randomDelay = delay + Math.random() * 1000;
        await new Promise(r => setTimeout(r, randomDelay));

      } catch (error) {
        console.error(`\n${chalk.red('Error')} ${part.part_number}: ${error.message}`);
        tracker.updatePart(job.id, part.part_number, {
          status: 'failed',
          error: error.message
        });
        progressBar.increment(1);

        if (error.message.includes('CAPTCHA')) {
          console.log(chalk.yellow('\n⚠️  CAPTCHA detected! Waiting 5 minutes...'));
          await new Promise(r => setTimeout(r, 300000));
        }
      }
    }

    pendingParts = tracker.getPendingParts(job.id, 100);
  }

  progressBar.stop();
  tracker.completeJob(job.id);

  // Export final results
  const allParts = tracker.getAllParts(job.id);
  await writeResults(job.output_file, allParts.map(p => ({
    partNumber: p.part_number,
    title: p.title,
    description: p.description,
    msrp: p.msrp,
    salePrice: p.sale_price,
    priceSource: p.price_source,
    imageUrl: p.image_url,
    imageSource: p.image_source,
    localImage: p.local_image,
    sourceUrl: p.source_url,
    status: p.status,
    error: p.error,
    scrapedAt: p.processed_at
  })));

  const finalStats = tracker.getJobStats(job.id);
  console.log(chalk.green.bold('\n✅ Scraping Complete!\n'));
  console.log(`Successful: ${chalk.green(finalStats.success)}`);
  console.log(`Failed: ${chalk.red(finalStats.failed)}`);

  await scraper.close();
  tracker.close();
}

/**
 * Show job status
 */
async function showStatus(options) {
  const tracker = await new ProgressTracker(path.join(DATA_DIR, 'progress.db')).init();

  if (options.job) {
    const stats = tracker.getJobStats(parseInt(options.job));
    if (!stats) {
      console.log(chalk.red('Job not found'));
      tracker.close();
      return;
    }

    console.log(chalk.blue.bold(`\nJob #${stats.job.id}\n`));
    console.log(`Status: ${stats.job.status}`);
    console.log(`Input: ${stats.job.input_file}`);
    console.log(`Output: ${stats.job.output_file}`);
    console.log(`Progress: ${stats.progressPercent}%`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  ${chalk.green('Success')}: ${stats.success}`);
    console.log(`  ${chalk.yellow('Pending')}: ${stats.pending}`);
    console.log(`  ${chalk.red('Failed')}: ${stats.failed}`);

  } else {
    // Show all recent jobs
    const jobs = tracker.db.prepare(`
      SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10
    `).all();

    if (jobs.length === 0) {
      console.log(chalk.yellow('No jobs found'));
      tracker.close();
      return;
    }

    console.log(chalk.blue.bold('\nRecent Jobs\n'));

    for (const job of jobs) {
      const status = job.status === 'completed' ? chalk.green(job.status)
        : job.status === 'running' ? chalk.blue(job.status)
          : chalk.yellow(job.status);

      console.log(`#${job.id} - ${status} - ${job.completed_parts}/${job.total_parts} - ${path.basename(job.input_file)}`);
    }
  }

  tracker.close();
}

/**
 * Export results to CSV
 */
async function exportResults(options) {
  const tracker = await new ProgressTracker(path.join(DATA_DIR, 'progress.db')).init();

  let job;
  if (options.job) {
    job = tracker.getJob(parseInt(options.job));
  } else {
    job = tracker.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1').get();
  }

  if (!job) {
    console.log(chalk.red('No jobs found'));
    tracker.close();
    return;
  }

  const parts = options.includeFailed
    ? tracker.getAllParts(job.id)
    : tracker.getCompletedParts(job.id);

  const outputFile = options.output || job.output_file;

  await writeResults(outputFile, parts.map(p => ({
    partNumber: p.part_number,
    title: p.title,
    description: p.description,
    msrp: p.msrp,
    salePrice: p.sale_price,
    priceSource: p.price_source,
    imageUrl: p.image_url,
    imageSource: p.image_source,
    localImage: p.local_image,
    sourceUrl: p.source_url,
    status: p.status,
    error: p.error,
    scrapedAt: p.processed_at
  })));

  console.log(chalk.green(`✅ Exported ${parts.length} parts to ${outputFile}`));
  tracker.close();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\nGracefully shutting down...'));
  console.log('Progress has been saved. Run "npm run resume" to continue.');
  process.exit(0);
});

program.parse();
