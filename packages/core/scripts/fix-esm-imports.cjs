const fs = require("node:fs");
const path = require("node:path");

// TypeScript ar moduleResolution "Bundler" emitē relatīvos importus bez .js
// paplašinājuma, bet Node ESM izpildē pieprasa pilnu specifikatoru. Šis skripts
// pēc būves rekursīvi apstaigā dist/ un pievieno pareizo paplašinājumu visiem
// relatīvajiem import/export specifikatoriem (gan ./, gan ../, ieskaitot
// apakšmapes kā multiplayer/). Tas ir tīri būves infrastruktūras solis un
// nemaina nekādu spēles loģiku.

const distDir = path.join(__dirname, "..", "dist");

// Atbilst gan `import ... from "X"`, gan `export ... from "X"` ar relatīvu X.
const importPattern = /(\bfrom\s+["'])(\.\.?\/[^"']+)(["'])/g;

function resolveSpecifier(fileDir, specifier) {
  if (specifier.endsWith(".js")) return specifier;

  const target = path.resolve(fileDir, specifier);
  if (fs.existsSync(`${target}.js`)) {
    return `${specifier}.js`;
  }
  if (
    fs.existsSync(target) &&
    fs.statSync(target).isDirectory() &&
    fs.existsSync(path.join(target, "index.js"))
  ) {
    const suffix = specifier.endsWith("/") ? "index.js" : "/index.js";
    return `${specifier}${suffix}`;
  }
  return specifier;
}

function fixFile(filePath) {
  const fileDir = path.dirname(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const fixed = source.replace(
    importPattern,
    (_match, prefix, specifier, suffix) =>
      `${prefix}${resolveSpecifier(fileDir, specifier)}${suffix}`
  );
  if (fixed !== source) {
    fs.writeFileSync(filePath, fixed);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath);
    } else if (entry.name.endsWith(".js")) {
      fixFile(entryPath);
    }
  }
}

walk(distDir);
