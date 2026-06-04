import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const VERSION = `v${pkg.version}`;

const BUILD_DIR = "release";
const ZIP_NAME = `ovoo-chrome-extension-${VERSION}.zip`;

const FILES_TO_COPY = [
  "manifest.json",
  "dist",
];

// Clean old release folder
if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true });
}

// Create release folder
fs.mkdirSync(BUILD_DIR);

// Copy required files
for (const file of FILES_TO_COPY) {
  fs.cpSync(file, path.join(BUILD_DIR, file), { recursive: true });
}

// Create zip
execSync(`./scripts/make_bundle.sh ${BUILD_DIR} ${ZIP_NAME}`, { stdio: "inherit" });

console.log(`\nRelease created: ${ZIP_NAME}`);
