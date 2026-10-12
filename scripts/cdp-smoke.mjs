// FreeFlow CDP smoke: drives the REAL Tauri app UI over WebView2 remote debugging.
// Run: $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
//       src-tauri\target\debug\freeflow.exe   (cwd = repo root)
// Then: node scripts/cdp-smoke.mjs
import { chromium } from "playwright-core";

const CDP = "http://127.0.0.1:9223";
const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const contexts = browser.contexts();
  const pages = contexts.flatMap((c) => c.pages());
  check("cdp pages found (main+overlay)", pages.length >= 2, `${pages.length} pages`);

  // Route by Tauri window label.
  let main = null;
  for (const p of pages) {
    const label = await p
      .evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label)
      .catch(() => null);
    if (label === "main") main = p;
  }
  check("main window routed by label", !!main);
  if (!main) throw new Error("no main page");

  // Fresh React state: a previous run may have left a dictation hanging.
  await main.reload();
  await main.getByRole("button", { name: "Dictate" }).waitFor({ timeout: 15000 });

  check("heading", (await main.textContent("h1"))?.includes("FreeFlow"));

  // Dictate with no mic: start succeeds (capture fails async in its thread),
  // UI flips to Stop; stopping an empty buffer surfaces the honest error.
  // Proves start/stop_dictation IPC through the real UI.
  await main.getByRole("button", { name: "Dictate" }).click();
  await main.getByRole("button", { name: "Stop dictation" }).waitFor({ timeout: 10000 });
  check("dictate starts (button flips)", true);
  await main.getByRole("button", { name: "Stop dictation" }).click();
  await main.waitForTimeout(2000);
  const errText = (await main.locator("header + p").textContent().catch(() => "")) ?? "";
  check("stop surfaces empty-buffer error", /recording too short/i.test(errText), errText.slice(0, 80));

  // Dictionary round-trip through real IPC + sqlite.
  await main.getByRole("button", { name: "Dictionary" }).click();
  const phrase = `CDPProbe ${Date.now() % 100000}`;
  await main.getByPlaceholder("Add a phrase…").fill(phrase);
  await main.getByRole("button", { name: "Add", exact: true }).click();
  await main.waitForTimeout(1000);
  check("dictionary add renders", ((await main.content()) ?? "").includes(phrase));

  // Snippets round-trip.
  await main.getByRole("button", { name: "Snippets" }).click();
  await main.getByPlaceholder("trigger").fill("cdpbrb");
  await main.getByPlaceholder("expansion").fill("cdp be right back");
  await main.getByRole("button", { name: "Save", exact: true }).first().click();
  await main.waitForTimeout(1000);
  check("snippet add renders", ((await main.content()) ?? "").includes("cdpbrb"));

  // History (empty, but proves get_history IPC).
  await main.getByRole("button", { name: "History" }).click();
  await main.waitForTimeout(1000);
  check(
    "history empty-state",
    ((await main.content()) ?? "").includes("No dictations yet"),
  );

  // Settings: sidecar-backed model list.
  await main.getByRole("button", { name: "Settings" }).click();
  await main.waitForFunction(
    () => document.body.textContent?.includes("small.en"),
    { timeout: 30000 },
  );
  const body = (await main.content()) ?? "";
  check("settings shows models", body.includes("small.en"));
  check("settings groups en/multilingual", /English-only/.test(body) && /Multilingual/.test(body));

  await main.screenshot({ path: "scripts/cdp-settings.png" });

  await browser.close();
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
}

main().catch((e) => {
  console.error("CDP_SMOKE_ERROR", e.message);
  process.exit(2);
});
