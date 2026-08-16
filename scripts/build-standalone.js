const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, "standalone");

function run(cmd, cwd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { cwd, stdio: "inherit" });
}

if (!fs.existsSync(path.join(ROOT, "dist", "userScript.js"))) {
    run("npm run build", ROOT);
}

fs.mkdirSync(path.join(STANDALONE, "userscript"), { recursive: true });
fs.copyFileSync(
    path.join(ROOT, "dist", "userScript.js"),
    path.join(STANDALONE, "userscript", "userScript.js")
);
console.log("copied dist/userScript.js -> standalone/userscript/userScript.js");

const svcDir = path.join(STANDALONE, "service");
if (!fs.existsSync(path.join(svcDir, "node_modules"))) {
    run("npm install", svcDir);
}
run("npm run build", svcDir);
console.log("built standalone/service/dist/index.js");