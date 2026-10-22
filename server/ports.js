// The gateway's ports, and where its tools and the dev server find it. PORT and HTTP_PORT in the environment override them.
const PORT = Number(process.env.PORT || 8976);           // SNAP over TCP, for the Java client
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080); // the page, SNAP over HTTP, /status, /auth and /admin

module.exports = { PORT, HTTP_PORT };
