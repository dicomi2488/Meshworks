const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const entryFile = "gear-puzzle.html";
const host = process.env.HOST || "127.0.0.1";
const initialPort = Number.parseInt(process.env.PORT || "3000", 10);
const maxPortAttempts = 10;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function safeResolve(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath =
    pathname === "/" ? entryFile : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

function handleRequest(req, res) {
  const filePath = safeResolve(req.url || "/");
  if (!filePath) {
    send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      send(
        res,
        404,
        { "Content-Type": "text/plain; charset=utf-8" },
        "Not found",
      );
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      contentTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        send(
          res,
          500,
          { "Content-Type": "text/plain; charset=utf-8" },
          "Failed to read file",
        );
        return;
      }

      send(res, 200, { "Content-Type": contentType }, data);
    });
  });
}

function startServer(port, attemptsLeft = maxPortAttempts) {
  const server = http.createServer(handleRequest);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.warn(`Port ${port} is busy, trying ${port + 1}...`);
      startServer(port + 1, attemptsLeft - 1);
      return;
    }

    throw err;
  });

  server.listen(port, host, () => {
    console.log(`Dev server running at http://${host}:${port}`);
    console.log(`Serving ${entryFile} from ${rootDir}`);
  });
}

startServer(initialPort);
