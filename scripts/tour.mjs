// FreeFlow live demo tour: screenshots of the running app in each state.
import { chromium } from "playwright-core";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const pages = browser.contexts().flatMap((c) => c.pages());
  let main = null;
  let overlay = null;
  for (const p of pages) {
    const label = await p
      .evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label)
      .catch(() => null);
    if (label === "main") main = p;
    if (label === "overlay") overlay = p;
  }
  if (!main || !overlay) throw new Error("windows missing");
  await main.reload();
  await main.getByRole("button", { name: "Dictate" }).waitFor({ timeout: 15000 });
  await main.setViewportSize({ width: 1000, height: 700 });

  // 1. history with the demo row
  await main.getByRole("button", { name: "History" }).click();
  await main.waitForTimeout(1200);
  await main.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/opencode/demo-history.png" });

  // 2. live dictation -> overlay pill listening
  await main.getByRole("button", { name: "Dictate" }).click();
  await main.getByRole("button", { name: "Stop", exact: true }).waitFor({ timeout: 10000 });
  await overlay.waitForTimeout(600);
  await overlay.screenshot({
    path: "C:/Users/PC/AppData/Local/Temp/opencode/demo-overlay.png",
    omitBackground: true,
  });
  await main.getByRole("button", { name: "Stop", exact: true }).click();
  await main.waitForTimeout(800);

  // 3. settings
  await main.getByRole("button", { name: "Settings" }).click();
  await main.waitForFunction(
    () => document.body.textContent?.includes("small.en"),
    { timeout: 30000 },
  );
  await main.waitForTimeout(600);
  await main.screenshot({ path: "C:/Users/PC/AppData/Local/Temp/opencode/demo-settings.png" });

  await browser.close();
  console.log("TOUR_DONE");
}

main().catch((e) => {
  console.error("TOUR_ERROR", e.message);
  process.exit(1);
});
