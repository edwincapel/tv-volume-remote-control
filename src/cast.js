const { Client } = require("castv2-client");

const connections = new Map(); // ip -> { client, connected }

const getConnection = (ip) => {
  return new Promise((resolve, reject) => {
    const existing = connections.get(ip);
    if (existing && existing.connected) return resolve(existing.client);

    const c = new Client();
    c.connect(ip, () => {
      connections.set(ip, { client: c, connected: true });
      resolve(c);
    });
    c.on("error", (err) => {
      connections.delete(ip);
      reject(err);
    });
    c.on("close", () => {
      connections.delete(ip);
    });
  });
};

const castGetVolume = (ip) => {
  return new Promise(async (resolve, reject) => {
    try {
      const c = await getConnection(ip);
      c.getVolume((err, vol) => (err ? reject(err) : resolve(vol)));
    } catch (e) { reject(e); }
  });
};

const castSetVolume = (ip, opts) => {
  return new Promise(async (resolve, reject) => {
    try {
      const c = await getConnection(ip);
      c.setVolume(opts, (err, vol) => (err ? reject(err) : resolve(vol)));
    } catch (e) { reject(e); }
  });
};

module.exports = { getConnection, castGetVolume, castSetVolume };
