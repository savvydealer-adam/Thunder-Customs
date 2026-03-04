import cron from "node-cron";
import { importRoughCountryFeed } from "../scripts/import-rough-country";

let isImportRunning = false;

const IMPORT_TIMEOUT = 10 * 60 * 1000;
const RETRY_DELAY = 5 * 60 * 1000;

async function runWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Import timed out")), timeout)
    ),
  ]);
}

async function runImport(): Promise<ReturnType<typeof importRoughCountryFeed>> {
  return runWithTimeout(
    () => importRoughCountryFeed({
      onProgress: (current, total) => {
        if (current % 1000 === 0) {
          console.log(`[Cron] RC Import progress: ${current}/${total}`);
        }
      },
    }),
    IMPORT_TIMEOUT
  );
}

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
      const stats = await runImport();

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
      console.log(`[Cron] Waiting ${RETRY_DELAY / 60000} minutes before retry...`);

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

      const retryStart = Date.now();
      console.log(`[Cron] Retry: Starting Rough Country import at ${new Date().toISOString()}`);
      try {
        const stats = await runImport();
        const retryDuration = ((Date.now() - retryStart) / 1000).toFixed(1);
        console.log(
          `[Cron] Retry: Rough Country import complete in ${retryDuration}s — ` +
          `${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
        );
      } catch (retryError) {
        const retryDuration = ((Date.now() - retryStart) / 1000).toFixed(1);
        console.error(`[Cron] Retry: Rough Country import also failed after ${retryDuration}s:`, retryError);
      }
    } finally {
      isImportRunning = false;
    }
  }, {
    timezone: "America/Denver",
  });

  console.log("[Cron] Scheduled Rough Country import daily at 2:00 AM Mountain Time");
}
