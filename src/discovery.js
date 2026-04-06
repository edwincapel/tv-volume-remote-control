const dgram = require("dgram");

const discoverDevices = (timeout = 6000) => {
  return new Promise((resolve) => {
    const devices = new Map();
    const mdns = dgram.createSocket({ type: "udp4", reuseAddr: true });

    // mDNS query for _googlecast._tcp.local PTR record
    const query = Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x0b, 0x5f, 0x67, 0x6f,
      0x6f, 0x67, 0x6c, 0x65, 0x63, 0x61, 0x73, 0x74,
      0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f,
      0x63, 0x61, 0x6c, 0x00, 0x00, 0x0c, 0x00, 0x01,
    ]);

    const timer = setTimeout(() => {
      mdns.close();
      resolve([...devices.values()]);
    }, timeout);

    mdns.on("message", (msg, rinfo) => {
      const text = msg.toString("utf8", 0, msg.length);
      // Extract friendly name from mDNS TXT record (fn=...)
      const fnMatch = text.match(/fn=([^\x00-\x1f]+)/);
      const mdMatch = text.match(/md=([^\x00-\x1f]+)/);
      const name = fnMatch ? fnMatch[1] : null;
      const model = mdMatch ? mdMatch[1] : null;
      if (name && !devices.has(rinfo.address)) {
        devices.set(rinfo.address, {
          ip: rinfo.address,
          name,
          model: model || name,
        });
      }
    });

    mdns.on("error", () => {
      clearTimeout(timer);
      mdns.close();
      resolve([...devices.values()]);
    });

    mdns.bind(5353, () => {
      try {
        mdns.addMembership("224.0.0.251");
      } catch {}
      mdns.send(query, 0, query.length, 5353, "224.0.0.251");
      // Send a second query after 1s to catch late responders
      setTimeout(() => {
        try { mdns.send(query, 0, query.length, 5353, "224.0.0.251"); } catch {}
      }, 1500);
    });
  });
};

module.exports = { discoverDevices };
