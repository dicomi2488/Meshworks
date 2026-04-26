const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const outDir = path.join(rootDir, "dist");
const entryFile = "gear-puzzle.html";
const outputHtmlFile = "index.html";
const localAssetPattern = /\b(?:src|href)\s*=\s*["']([^"'#?]+(?:\?[^"']*)?)["']/gi;

function toOutputPath(relativePath) {
  return path.join(outDir, relativePath);
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const sourcePath = path.resolve(rootDir, normalizedPath);

  if (!sourcePath.startsWith(rootDir)) {
    throw new Error(`Refusing to copy path outside workspace: ${relativePath}`);
  }

  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Missing referenced file: ${relativePath}`);
  }

  const targetPath = toOutputPath(normalizedPath);
  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return normalizedPath;
}

function collectLocalAssets(htmlSource) {
  const assets = new Set();
  let match = localAssetPattern.exec(htmlSource);

  while (match) {
    const rawValue = match[1].trim();
    const cleanValue = rawValue.split("?")[0];

    if (
      cleanValue &&
      !cleanValue.startsWith("http://") &&
      !cleanValue.startsWith("https://") &&
      !cleanValue.startsWith("data:") &&
      !cleanValue.startsWith("javascript:") &&
      !cleanValue.startsWith("//")
    ) {
      assets.add(cleanValue.replace(/^\/+/, ""));
    }

    match = localAssetPattern.exec(htmlSource);
  }

  return [...assets];
}

function build() {
  const entryPath = path.join(rootDir, entryFile);
  const htmlSource = fs.readFileSync(entryPath, "utf8");

  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDirectory(outDir);

  const copiedFiles = new Set();

  for (const asset of collectLocalAssets(htmlSource)) {
    copiedFiles.add(copyFile(asset));
  }

  fs.writeFileSync(path.join(outDir, outputHtmlFile), htmlSource, "utf8");

  console.log(`Built static site to ${outDir}`);
  console.log("Copied files:");
  console.log(`- ${outputHtmlFile}`);
  for (const file of [...copiedFiles].sort()) {
    console.log(`- ${file}`);
  }
}

build();
