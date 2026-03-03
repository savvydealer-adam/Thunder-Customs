import cron from "node-cron";
import { importRoughCountryFeed } from "../scripts/import-rough-country";

let isImportRunning = false;

export function startCronJobs() {
  cron.schedule("0 2 * * *", async () => {
    if (isImportRunning) {
      console.log("[Cron] Rough Country import already running, skipping");
      return;
    }

    isImportRunning = true;
    const startTime = Date.now();
    console.log(`[Cron] Starting scheduled Rough Country import at ${new Date().toISOString()}`);

    try {
      const stats = await importRoughCountryFeed({
        onProgress: (current, total) => {
          if (current % 1000 === 0) {
            console.log(`[Cron] RC Import progress: ${current}/${total}`);
          }
        },
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Cron] Rough Country import complete in ${duration}s — ` +
        `${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
      );

      if (stats.errorMessages.length > 0) {
        console.log(`[Cron] First errors: ${stats.errorMessages.slice(0, 5).join("; ")}`);
      }
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[Cron] Rough Country import failed after ${duration}s:`, error);
    } finally {
      isImportRunning = false;
    }
  }, {
    timezone: "America/Denver",
  });

  console.log("[Cron] Scheduled Rough Country import daily at 2:00 AM Mountain Time");
}
