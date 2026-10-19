import assert from "node:assert/strict";
import test from "node:test";
import { detectLocale, t } from "./i18n.ts";
import { createState, ROOMS, sabotage, tick } from "./simulation.ts";

test("preferred browser language determines Japanese or English; UA is a legacy fallback only", () => {
  assert.equal(detectLocale({ languages: ["ja-JP", "en-US"], language: "en-US" }), "ja");
  assert.equal(detectLocale({ languages: ["en-US", "ja-JP"], language: "ja-JP", userAgent: "Browser (ja-JP)" }), "en");
  assert.equal(detectLocale({ languages: ["fr-FR", "ja"], language: "ja" }), "en");
  assert.equal(detectLocale({ languages: ["", " ja-JP "], language: "en" }), "ja");
  assert.equal(detectLocale({ language: "JA_jp" }), "ja");
  assert.equal(detectLocale({ userAgent: "Legacy Browser (Mac; ja-JP)" }), "ja");
  assert.equal(detectLocale({ userAgent: "Modern Browser" }), "en");
});

test("display localization covers composed labels, actions and logs without mutating deterministic state", () => {
  const state = createState(21);
  state.status = "running";
  sabotage(state, "lock", "reception");
  tick(state, 1);
  const snapshot = JSON.stringify(state);
  for (const log of state.decisions) assert.doesNotMatch(t(log.reason, "en"), /[ぁ-龯]/);
  for (const room of ROOMS) assert.doesNotMatch(t(room.clue, "en"), /[ぁ-龯]/);
  const target = t("対象：受付 · サムが在室 · 扉封鎖中（サムは退室不可）", "en");
  assert.equal(target, "Target: Reception · Sam is here · Door sealed (Sam cannot leave)");
  assert.equal(t("再使用まで 12秒", "en"), "Ready in 12s");
  assert.equal(t("追跡 ON", "en"), "Follow ON");
  for (const [ja, en] of [["サム", "Sam"], ["サム · 隠れている", "Sam · Hiding"], ["ぬこぬこさん · 接近", "Nukonuko-san · Approaching"], ["移動先：非常用電源室", "Destination: Generator room"]]) {
    assert.equal(t(ja, "en"), en);
    assert.equal(t(ja, "ja"), ja);
  }
  assert.equal(t("受付に停電。この部屋に干渉が続きます。", "en"), "Reception · Blackout. The interference remains active in this room.");
  assert.equal(t("恐怖 +17", "ja"), "恐怖 +17");
  assert.equal(t("request_123 / reception", "en"), "request_123 / reception");
  assert.equal(t(target, "en"), target);
  assert.equal(JSON.stringify(state), snapshot);
});
