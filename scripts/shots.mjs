// FreeFlow README screenshots: tidy demo data, shoot each tab to docs/shots/.
import { chromium } from "playwright-core";

const CDP = "http://127.0.0.1:9223";

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const pages = browser.contexts().flatMap((c) => c.pages());
  let main = null;
  for (const p of pages) {
    const label = await p
      .evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label)
      .catch(() => null);
    if (label === "main") main = p;
  }
  if (!main) throw new Error("no main page");
  await main.reload();
  await main.getByRole("button", { name: "Dictate" }).waitFor({ timeout: 15000 });
  await main.setViewportSize({ width: 1000, height: 700 });

  const shot = (name) => main.screenshot({ path: `docs/shots/${name}.png` });

  // Dictionary: replace probe residue with presentable demo words.
  await main.getByRole("button", { name: "Dictionary" }).click();
  for (const w of ["Kowalski", "Tauri", "faster-whisper"]) {
    await main.getByPlaceholder("Add a word to dictionary…").fill(w);
    await main.getByRole("button", { name: "Add word" }).click();
    await main.waitForTimeout(400);
  }
  await shot("dictionary");

  // Snippets: one clean demo row.
  await main.getByRole("button", { name: "Snippets" }).click();
  await main.getByPlaceholder("trigger").fill("brb");
  await main.getByPlaceholder("expansion").fill("be right back");
  await main.getByRole("button", { name: "Save", exact: true }).first().click();
  await main.waitForTimeout(600);
  await shot("snippets");

  // History (empty-state is the honest shot).
  await main.getByRole("button", { name: "History" }).click();
  await main.waitForTimeout(600);
  await shot("history");

  // Meetings.
  await main.getByRole("button", { name: "Notetaker" }).click();
  await main.waitForTimeout(600);
  await shot("meetings");

  // Settings last (sidecar-backed).
  await main.getByRole("button", { name: "Settings" }).click();
  await main.waitForFunction(
    () => document.body.textContent?.includes("small.en"),
    { timeout: 30000 },
  );
  await main.waitForTimeout(800);
  await shot("settings");

  await browser.close();
  console.log("SHOTS_DONE");
}

main().catch((e) => {
  console.error("SHOTS_ERROR", e.message);
  process.exit(1);
});
