const fs = require("fs");
const path = require("path");

const ALIASES_FILE = path.join(__dirname, "..", "aliases.json");

const loadAliases = () => {
  try {
    return JSON.parse(fs.readFileSync(ALIASES_FILE, "utf8"));
  } catch {
    return {};
  }
};

const saveAliases = (aliases) => {
  fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2));
};

module.exports = { loadAliases, saveAliases };
