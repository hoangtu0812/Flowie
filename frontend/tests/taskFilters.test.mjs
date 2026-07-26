// Pure-logic checks for the task filter/sort helpers.
//
// Imports the real implementation (src/lib/taskFilters.ts) — Node strips the
// types at runtime, so there is no duplicated logic to drift out of sync.
//
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  groupTasks,
} from "../src/lib/taskFilters.ts";

const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const tasks = [
  { id: "1", title: "Alpha", status: "todo", priority: "urgent", dueDate: yesterday, assigneeId: "u1" },
  { id: "2", title: "Beta", status: "todo", priority: "low", dueDate: tomorrow },
  { id: "3", title: "Gamma", status: "done", priority: "high", assigneeId: "u1" },
  { id: "4", title: "Delta", status: "todo", priority: "medium", moscow: "must", storyPoints: 8, riceScore: 42 },
];

const ids = (ts) => ts.map((t) => t.id);
const f = (patch = {}) => ({ ...EMPTY_FILTERS, ...patch });

test("no filters keeps everything", () => {
  assert.equal(applyFilters(tasks, EMPTY_FILTERS, "position", "").length, 4);
});

test("assignee filter", () => {
  assert.deepEqual(ids(applyFilters(tasks, f({ assignee: "u1" }), "position", "")), ["1", "3"]);
});

test("unassigned filter", () => {
  assert.deepEqual(ids(applyFilters(tasks, f({ assignee: "none" }), "position", "")), ["2", "4"]);
});

test("priority filter", () => {
  assert.deepEqual(ids(applyFilters(tasks, f({ priority: "urgent" }), "position", "")), ["1"]);
});

test("moscow filter", () => {
  assert.deepEqual(ids(applyFilters(tasks, f({ moscow: "must" }), "position", "")), ["4"]);
});

test("hideDone drops completed tasks", () => {
  assert.deepEqual(ids(applyFilters(tasks, f({ hideDone: true }), "position", "")), ["1", "2", "4"]);
});

test("overdue excludes done tasks and tasks with no due date", () => {
  assert.deepEqual(ids(applyFilters(tasks, f({ overdue: true }), "position", "")), ["1"]);
});

test("search matches the title case-insensitively", () => {
  assert.deepEqual(ids(applyFilters(tasks, EMPTY_FILTERS, "position", "amm")), ["3"]);
});

test("priority sort puts urgent first", () => {
  assert.equal(applyFilters(tasks, EMPTY_FILTERS, "priority", "")[0].id, "1");
});

test("title sort is alphabetical", () => {
  assert.equal(applyFilters(tasks, EMPTY_FILTERS, "title", "")[0].title, "Alpha");
});

test("points and rice sort descending", () => {
  assert.equal(applyFilters(tasks, EMPTY_FILTERS, "points", "")[0].id, "4");
  assert.equal(applyFilters(tasks, EMPTY_FILTERS, "rice", "")[0].id, "4");
});

test("due sort: earliest first, undated sink to the bottom", () => {
  const sorted = applyFilters(tasks, EMPTY_FILTERS, "due", "");
  assert.equal(sorted[0].id, "1", "overdue task first");
  assert.ok(!sorted[3].dueDate, "a task without a due date ends up last");
});

test("hasActiveFilters reflects deviation from defaults", () => {
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters(f({ overdue: true })), true);
});

// — grouping (swimlanes) —
const label = (k) => (k === "unassigned" ? "Chưa gán" : k === "none" ? "Chưa đặt" : k);

test("group=none keeps a single bucket", () => {
  const g = groupTasks(tasks, "none", label);
  assert.equal(g.length, 1);
  assert.equal(g[0].tasks.length, 4);
});

test("group=status defers to the board's own columns", () => {
  const g = groupTasks(tasks, "status", label);
  assert.equal(g.length, 1, "status grouping is handled by the column layout");
});

test("group=assignee separates unassigned work", () => {
  const g = groupTasks(tasks, "assignee", label);
  const byKey = Object.fromEntries(g.map((x) => [x.key, x.tasks.length]));
  assert.equal(byKey["u1"], 2);
  assert.equal(byKey["unassigned"], 2);
  assert.equal(g.find((x) => x.key === "unassigned").label, "Chưa gán");
});

test("group=priority buckets by priority", () => {
  const g = groupTasks(tasks, "priority", label);
  const byKey = Object.fromEntries(g.map((x) => [x.key, x.tasks.length]));
  assert.equal(byKey["urgent"], 1);
  assert.equal(byKey["low"], 1);
  assert.equal(byKey["high"], 1);
  assert.equal(byKey["medium"], 1);
});

test("group=moscow puts unset tasks in their own lane", () => {
  const g = groupTasks(tasks, "moscow", label);
  const byKey = Object.fromEntries(g.map((x) => [x.key, x.tasks.length]));
  assert.equal(byKey["must"], 1);
  assert.equal(byKey["none"], 3, "tasks without a MoSCoW value group together");
});

test("groups are ordered by size, biggest lane first", () => {
  const g = groupTasks(tasks, "moscow", label);
  assert.ok(g[0].tasks.length >= g[g.length - 1].tasks.length);
});
