# Mopar Parts Scraper

Scrape Mopar parts data (images, prices, descriptions) from Google searches.

## Features

- **Google Custom Search API** (NEW): Official Google API - no CAPTCHA issues!
- **Google Search Scraping**: Fallback browser scraping with stealth mode
- **Image Download**: Downloads product images locally
- **Price Extraction**: Extracts pricing from search results
- **Progress Tracking**: SQLite-based progress tracking for resume capability
- **Resume Support**: Can resume interrupted jobs without losing progress

## Installation

```bash
cd mopar-scraper
npm install
```

## Google Custom Search API Setup (Recommended)

The API method is recommended - no CAPTCHAs, faster, more reliable.

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Note your Project ID

### 2. Enable Custom Search API

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Custom Search API"
3. Click **Enable**

### 3. Create API Key

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials > API Key**
3. Copy the API key
4. (Optional) Restrict the key to Custom Search API only

### 4. Create a Custom Search Engine

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/cse/all)
2. Click **Add** to create new search engine
3. Under "Sites to search", enter `*.com` (to search entire web)
4. Give it a name like "Mopar Parts Search"
5. Click **Create**
6. Go to **Control Panel** for your search engine
7. Copy the **Search engine ID** (cx parameter)
8. Enable **Image search** in settings
9. Enable **Search the entire web**

### 5. Set Environment Variables

```bash
# Windows (PowerShell)
$env:GOOGLE_API_KEY="your-api-key-here"
$env:GOOGLE_SEARCH_ENGINE_ID="your-search-engine-id"

# Windows (CMD)
set GOOGLE_API_KEY=your-api-key-here
set GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Linux/Mac
export GOOGLE_API_KEY="your-api-key-here"
export GOOGLE_SEARCH_ENGINE_ID="your-search-engine-id"
```

Or create a `.env` file in the project root (add to .gitignore):
```
GOOGLE_API_KEY=your-api-key-here
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
```

### API Pricing

- **Free tier**: 100 queries/day
- **Paid**: $5 per 1,000 queries (after free tier)
- Each part uses ~2 queries (images + web search)

So free tier = ~50 parts/day, or pay ~$0.01 per part for unlimited

## Usage

### Start a new scraping job

```bash
# Using Google Custom Search API (default - recommended)
npm run scrape -- ./data/input/parts.csv

# With options
npm run scrape -- ./data/input/parts.csv -o ./data/output/results.csv

# Use browser scraping instead (if API not set up)
npm run scrape -- ./data/input/parts.csv --no-api

# Show browser window (puppeteer mode only)
npm run scrape -- ./data/input/parts.csv --no-api --no-headless
```

### Resume an interrupted job

```bash
npm run resume

# Resume a specific job
npm run resume -- -j 1
```

### Check job status

```bash
npm run status

# Check specific job
npm run status -- -j 1
```

### Export results

```bash
npm run export

# Export including failed parts
npm run export -- --include-failed -o ./custom-output.csv
```

## Input CSV Format

The input CSV should have a column with part numbers. The scraper will automatically detect columns named:
- `part_number`
- `PartNumber`
- `SKU`
- `part`

Example:
```csv
part_number
68293031AA
68293032AA
04892646AA
```

## Output CSV Format

| Column | Description |
|--------|-------------|
| part_number | The Mopar part number |
| title | Product title from search results |
| description | Product description |
| price | Price found (e.g., "$123.45") |
| price_source | Where the price was found |
| image_url | Original image URL |
| local_image | Path to downloaded image |
| source_url | Source webpage URL |
| scraped_at | Timestamp of scraping |
| status | success/failed |
| error | Error message if failed |

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <file>` | ./data/output/results.csv | Output CSV file path |
| `-d, --delay <ms>` | 1000 | Delay between requests (ms) |
| `-b, --batch <size>` | 10 | Batch size before saving |
| `--api` | true | Use Google Custom Search API (recommended) |
| `--no-api` | - | Use Puppeteer browser scraping instead |
| `--headless` | true | Run browser in headless mode (puppeteer only) |
| `--no-headless` | - | Show browser window (puppeteer only) |
| `--no-images` | - | Skip downloading images |

## Important Notes

### API Mode (Default)
- No CAPTCHAs or bot detection issues
- Much faster than browser scraping
- Free tier: 100 queries/day (~50 parts)
- Paid: $5 per 1,000 queries (~500 parts for $5)

### Browser Scraping Mode (--no-api)
- Use if you haven't set up the API
- Google will block requests if you scrape too fast
- For 10,000+ parts, consider:
  - Running in batches of 500-1000
  - Using longer delays (5-10 seconds)
  - Running during off-peak hours

### CAPTCHA Handling (Browser Mode Only)
- If a CAPTCHA is detected, the scraper will pause for 5 minutes
- For persistent CAPTCHAs, run with `--no-headless` and solve manually

### Resuming
- Progress is saved to SQLite database after each part
- Press Ctrl+C to gracefully stop
- Run `npm run resume` to continue from where you left off

## File Structure

```
mopar-scraper/
├── src/
│   ├── index.js           # CLI interface
│   ├── api-scraper.js     # Google Custom Search API (recommended)
│   ├── scraper.js         # Puppeteer browser scraper (fallback)
│   ├── csv-handler.js     # CSV read/write
│   ├── image-downloader.js # Image downloading
│   └── progress-tracker.js # SQLite progress tracking
├── data/
│   ├── input/             # Put your CSV files here
│   ├── output/            # Results saved here
│   └── images/            # Downloaded images
├── package.json
└── README.md
```

## Troubleshooting

### "Missing Google API credentials"
- Make sure you've set the environment variables:
  - `GOOGLE_API_KEY` - Your API key from Google Cloud Console
  - `GOOGLE_SEARCH_ENGINE_ID` - Your Custom Search Engine ID
- Or use `--no-api` to fall back to browser scraping

### "API quota exceeded"
- Free tier is 100 queries/day (~50 parts)
- Wait until tomorrow or upgrade to paid at Google Cloud Console
- Or use `--no-api` for browser scraping (slower, may hit CAPTCHAs)

### "CAPTCHA detected" (Browser mode)
- Wait for the automatic 5-minute pause
- Or run with `--no-headless` to solve manually
- Consider switching to API mode (recommended)

### "Navigation timeout" (Browser mode)
- Increase timeout in scraper options
- Check your internet connection
- Google may be temporarily blocking

### No images found
- Some parts may not have images available online
- Try searching the part number manually to verify

### Missing prices
- Not all parts will have pricing in search results
- Try the part number directly on Google Shopping to verify
