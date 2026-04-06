const http = require("http");
const { handleRequest } = require("./src/routes");

const PORT = 3000;

const server = http.createServer(handleRequest);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  TV Remote Control`);
  console.log(`  =================`);
  console.log(`  Open http://localhost:${PORT}`);
  console.log(`  Scans for all Cast-enabled TVs on the network\n`);
});
