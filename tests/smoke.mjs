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
  run("node", ["tools/semantic-kg.mjs", "pack", "--intent=code", "--budget=800", "bootstrapGraphIt"]);
  run("node", ["tools/semantic-kg.mjs", "quality"]);
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
