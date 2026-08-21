import assert from "node:assert/strict";
import test from "node:test";
import {
  runEventCockpitVerification,
  runEventLiveUpdateAuthorizationVerification,
} from "../src/data/eventCockpitVerification.js";
import { runEventStaffingRuleChecks } from "../src/data/eventStaffingSuggestionRules.js";

function assertAllChecksPassed(results) {
  const failed = results.filter((result) => !result.passed).map((result) => result.id);
  assert.deepEqual(failed, []);
}

test("event cockpit scenarios remain valid", () => {
  assertAllChecksPassed(runEventCockpitVerification());
});

test("event live-update authorization scenarios remain valid", () => {
  assertAllChecksPassed(runEventLiveUpdateAuthorizationVerification());
});

test("event staffing scenarios remain valid", () => {
  assertAllChecksPassed(runEventStaffingRuleChecks());
});
