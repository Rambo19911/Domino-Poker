const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(__dirname, "..", "dist");
const localModules = new Set(["aiService", "dominoTile", "gameState", "player", "types"]);

for (const fileName of fs.readdirSync(distDir)) {
  if (!fileName.endsWith(".js")) continue;
  const filePath = path.join(distDir, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const fixed = source.replace(
    /(from\s+["']\.\/)([^"'.]+)(["'])/g,
    (match, prefix, moduleName, suffix) =>
      localModules.has(moduleName) ? `${prefix}${moduleName}.js${suffix}` : match
  );
  fs.writeFileSync(filePath, fixed);
}
