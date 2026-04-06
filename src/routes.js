const fs = require("fs");
const path = require("path");
const { discoverDevices } = require("./discovery");
const { castGetVolume, castSetVolume } = require("./cast");
const { loadAliases, saveAliases } = require("./aliases");

const INDEX_HTML = path.join(__dirname, "..", "public", "index.html");

const readBody = (req) => {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
};

const handleRequest = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Serve UI
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const html = fs.readFileSync(INDEX_HTML, "utf8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end("Could not load index.html");
    }
    return;
  }

  // Discover devices
  if (url.pathname === "/api/devices") {
    console.log("Scanning for Cast devices...");
    const devices = await discoverDevices();
    const aliases = loadAliases();
    console.log(`Found ${devices.length} device(s):`, devices.map(d => d.name).join(", "));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ devices, aliases }));
    return;
  }

  // Set alias
  if (url.pathname === "/api/alias" && req.method === "POST") {
    const body = await readBody(req);
    const aliases = loadAliases();
    if (body.alias) {
      aliases[body.ip] = body.alias;
    } else {
      delete aliases[body.ip];
    }
    saveAliases(aliases);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // TV control routes: /api/tv/:ip/volume, /volume/up, /volume/down, /volume/set, /mute/toggle
  const tvMatch = url.pathname.match(/^\/api\/tv\/([^/]+)(\/.*)/);
  if (tvMatch) {
    const ip = tvMatch[1];
    const action = tvMatch[2];

    try {
      if (action === "/volume") {
        const vol = await castGetVolume(ip);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(vol));
        return;
      }

      if (action === "/volume/up") {
        const vol = await castGetVolume(ip);
        const result = await castSetVolume(ip, { level: Math.min(1, vol.level + 0.05) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (action === "/volume/down") {
        const vol = await castGetVolume(ip);
        const result = await castSetVolume(ip, { level: Math.max(0, vol.level - 0.05) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (action.startsWith("/volume/set")) {
        const level = parseFloat(url.searchParams.get("level"));
        if (isNaN(level)) throw new Error("Invalid level");
        const result = await castSetVolume(ip, { level: Math.max(0, Math.min(1, level)) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (action === "/mute/toggle") {
        const vol = await castGetVolume(ip);
        const result = await castSetVolume(ip, { muted: !vol.muted });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
};

module.exports = { handleRequest };
