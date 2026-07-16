import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tool = path.join(repoRoot, "tools", "semantic-kg.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graph-it-smoke-"));

function run(command, args, cwd = tmp) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout;
}

function assertFile(relativePath) {
  const file = path.join(tmp, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Expected file missing: ${relativePath}`);
}

try {
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "graph-it-smoke", version: "0.0.0", scripts: { test: "echo ok" } }, null, 2));
  fs.writeFileSync(path.join(tmp, "README.md"), "# Smoke Project\n\nArchitecture notes for Graph-It security and MCP bootstrap.\n");
  fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "src", "app.js"), "export function bootstrapGraphIt(){ return 'enterprise local graph'; }\n");

  run("node", [tool, "bootstrap", tmp, "--build"], repoRoot);
  assertFile("tools/semantic-kg.mjs");
  assertFile(".semantic-kg/graph.json");

  run("node", ["tools/semantic-kg.mjs", "query", "--intent=code", "bootstrapGraphIt"]);
  const packOut = run("node", ["tools/semantic-kg.mjs", "pack", "--intent=code", "--budget=800", "bootstrapGraphIt"]);
  const packJson = JSON.parse(fs.readFileSync(path.join(tmp, ".semantic-kg/context-pack.json"), "utf8"));
  if (!(packJson.originalTokens > 0) || !(packJson.packedTokens > 0)) throw new Error("Pack token estimates should be positive");
  // Budget fit: packed tokens stay within budget plus at most one small degradation item.
  if (packJson.packedTokens > packJson.budgetTokens + 60) throw new Error(`Pack exceeded budget by more than one item: ${packJson.packedTokens} > ${packJson.budgetTokens}`);
  // Reversibility: every non-live packed item must carry a reload pointer.
  for (const bucket of ["graph", "compressed", "offloaded"]) {
    for (const item of packJson.buckets[bucket] || []) {
      if (item.reloadWith === undefined || item.reloadWith === null) throw new Error(`Packed ${bucket} item ${item.id} missing reloadWith`);
    }
  }

  // Token estimator must not undercount punctuation-dense code the way bytes/4 did.
  const graph = JSON.parse(fs.readFileSync(path.join(tmp, ".semantic-kg/graph.json"), "utf8"));
  if (!(graph._approxTokens > 0)) throw new Error("graph.json missing positive _approxTokens header");
  if (!/Do not load this file whole/.test(graph._warning || "")) throw new Error("graph.json missing raw-read warning header");
  const bytesOver4 = Math.ceil(Buffer.byteLength(JSON.stringify(graph, null, 2), "utf8") / 4);
  if (!(graph._approxTokens >= bytesOver4)) throw new Error("Estimator regressed below bytes/4 (should be conservative for code)");
  const statsOut = JSON.parse(run("node", ["tools/semantic-kg.mjs", "stats"]));
  if (!(statsOut.graphApproxTokens > 0)) throw new Error("stats missing graphApproxTokens");
  if (statsOut.tokenizer !== "heuristic") throw new Error("default tokenizer should be heuristic");
  const statsExact = JSON.parse(run("node", ["tools/semantic-kg.mjs", "stats", "--tokenizer=exact"]));
  if (statsExact.tokenizer !== "heuristic") throw new Error("exact request without a package should fall back to heuristic");

  run("node", ["tools/semantic-kg.mjs", "quality"]);
  const evalOut = run("node", ["tools/semantic-kg.mjs", "eval", "--k=5", "--auto=15"]);
  const evalJson = JSON.parse(fs.readFileSync(path.join(tmp, ".semantic-kg/eval-report.json"), "utf8"));
  if (!(evalJson.summary.cases > 0)) throw new Error("Eval produced no cases");
  if (typeof evalJson.summary.hitRateAtK !== "number") throw new Error("Eval missing hitRateAtK");
  if (evalJson.summary.hitRateAtK < 0.7) throw new Error(`Eval hit@k regressed: ${evalJson.summary.hitRateAtK}`);
  run("node", ["tools/semantic-kg.mjs", "export", "all"]);
  run("node", ["tools/semantic-kg.mjs", "proof", "architecture", "bootstrapGraphIt"]);
  run("node", ["tools/semantic-kg.mjs", "obsidian"]);
  run("node", ["tools/semantic-kg.mjs", "auto", "--once", "--no-obsidian"]);
  run("node", ["tools/semantic-kg.mjs", "freshness"]);
  run("node", ["tools/semantic-kg.mjs", "session-prompt", "--print"]);
  run("node", ["tools/semantic-kg.mjs", "enrich", "--provider", "local", "--extract-text", "--limit=10"]);
  run("node", ["tools/semantic-kg.mjs", "examples", "--name", "smoke", "--public"]);
  run("node", ["tools/semantic-kg.mjs", "agent-rules", "all"]);
  run("node", ["tools/semantic-kg.mjs", "mcp-config"]);

  assertFile(".semantic-kg/exports/graph.graphml");
  assertFile(".semantic-kg/exports/graph.cypher");
  assertFile(".semantic-kg/exports/graph.svg");
  assertFile(".semantic-kg/proof/proof.md");
  assertFile(".semantic-kg/eval-report.json");
  assertFile(".semantic-kg/eval-report.md");
  assertFile(".semantic-kg/freshness.json");
  assertFile(".semantic-kg/session-start.md");
  assertFile(".semantic-kg/context-pack.json");
  assertFile(".semantic-kg/wiki/obsidian/Agent Start Here.md");
  assertFile(".semantic-kg/wiki/obsidian/Backlinks Index.md");
  assertFile(".semantic-kg/wiki/obsidian/MOCs/index.md");
  assertFile(".semantic-kg/wiki/obsidian/.obsidian/app.json");
  const agentStart = fs.readFileSync(path.join(tmp, ".semantic-kg/wiki/obsidian/Agent Start Here.md"), "utf8");
  if (!agentStart.includes("Navigation contract")) throw new Error("Obsidian agent entry is missing navigation guidance");
  const symbolNote = fs.readdirSync(path.join(tmp, ".semantic-kg/wiki/obsidian/symbols")).find(f => f.endsWith(".md"));
  if (!symbolNote) throw new Error("Expected at least one Obsidian symbol note");
  const symbolText = fs.readFileSync(path.join(tmp, ".semantic-kg/wiki/obsidian/symbols", symbolNote), "utf8");
  for (const expected of ["Intelligence summary", "Source excerpt", "Neighborhood map", "Agent prompts"]) {
    if (!symbolText.includes(expected)) throw new Error(`Obsidian symbol note missing section: ${expected}`);
  }
  assertFile(".semantic-kg/enrichment/local-extract/manifest.json");
  assertFile("worked/smoke/review.md");
  assertFile(".graph-it/agent-rules/generic-graph-it.md");
  console.log("Graph-It smoke test passed");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
