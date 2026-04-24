const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "..", "devices.cache.json");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// mDNS PTR query for _googlecast._tcp.local
const QUERY = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x0b, 0x5f, 0x67, 0x6f,
  0x6f, 0x67, 0x6c, 0x65, 0x63, 0x61, 0x73, 0x74,
  0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f,
  0x63, 0x61, 0x6c, 0x00, 0x00, 0x0c, 0x00, 0x01,
]);

// Marker = length-prefixed "_googlecast" label (0x0b + "_googlecast").
const GOOGLECAST_MARKER = Buffer.from([
  0x0b, 0x5f, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x63, 0x61, 0x73, 0x74,
]);

const loadCache = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const now = Date.now();
    const fresh = {};
    for (const [ip, entry] of Object.entries(raw)) {
      if (entry && entry.lastSeen && now - entry.lastSeen < CACHE_TTL_MS) {
        fresh[ip] = entry;
      }
    }
    return fresh;
  } catch {
    return {};
  }
};

const saveCache = (cache) => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {}
};

// Pull the service-instance label that precedes each _googlecast marker in a PTR response.
const extractInstanceNames = (buf) => {
  const names = [];
  let idx = 0;
  while (idx < buf.length) {
    const pos = buf.indexOf(GOOGLECAST_MARKER, idx);
    if (pos < 1) break;
    const len = buf[pos - 1];
    const start = pos - 1 - len;
    if (len > 0 && len < 64 && start >= 0) {
      const label = buf.slice(start, pos - 1);
      let printable = true;
      for (const b of label) {
        if (b < 0x20 || b >= 0x7f) { printable = false; break; }
      }
      if (printable) names.push(label.toString("utf8"));
    }
    idx = pos + GOOGLECAST_MARKER.length;
  }
  return names;
};

// TXT entries are length-prefixed key=value strings; read the value up to the next control byte.
const extractTxtValue = (buf, key) => {
  const needle = Buffer.from(key);
  const pos = buf.indexOf(needle);
  if (pos < 0) return null;
  let end = pos + needle.length;
  while (end < buf.length && buf[end] >= 0x20) end++;
  if (end === pos + needle.length) return null;
  return buf.slice(pos + needle.length, end).toString("utf8");
};

const discoverDevices = (timeout = 10000) => {
  return new Promise((resolve) => {
    const cache = loadCache();
    const devices = new Map();
    for (const [ip, entry] of Object.entries(cache)) devices.set(ip, entry);

    const mdns = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try { mdns.close(); } catch {}
      const fresh = {};
      for (const [ip, entry] of devices) fresh[ip] = entry;
      saveCache(fresh);
      resolve([...devices.values()]);
    };

    const timer = setTimeout(finish, timeout);

    mdns.on("message", (msg, rinfo) => {
      const fn = extractTxtValue(msg, "fn=");
      const md = extractTxtValue(msg, "md=");
      const instances = extractInstanceNames(msg);
      // Skip our own outbound query echo, which carries none of these.
      if (!fn && !md && instances.length === 0) return;

      const existing = devices.get(rinfo.address) || { ip: rinfo.address };
      const name = fn || existing.name || instances[0];
      const model = md || existing.model || instances[0] || name;
      devices.set(rinfo.address, {
        ip: rinfo.address,
        name: name || rinfo.address,
        model: model || name || rinfo.address,
        lastSeen: Date.now(),
      });
    });

    mdns.on("error", () => { clearTimeout(timer); finish(); });

    mdns.bind(5353, () => {
      try { mdns.addMembership("224.0.0.251"); } catch {}
      const burst = () => {
        if (settled) return;
        try { mdns.send(QUERY, 0, QUERY.length, 5353, "224.0.0.251"); } catch {}
      };
      // Spaced >1s apart; responders rate-limit duplicate questions (RFC 6762 §7.3).
      burst();
      setTimeout(burst, 1500);
      setTimeout(burst, 4000);
      setTimeout(burst, 7000);
    });
  });
};

module.exports = { discoverDevices };
