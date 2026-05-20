const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const {wsMainPort, proxyGetPort} = require("../env");

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io attached to the same HTTP server
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Express route: /curl?url=https://example.com
app.get("/curl", (req, res) => {
    const targetUrl = req.query.url;

    console.log("Received URL via query:", targetUrl);

    // Respond with status OK
    res.status(200).json({ status: "ok", urlReceived: targetUrl });
});

// Socket.io logic
io.on("connection", (socket) => {
    console.log("Client connected via Socket.io:", socket.id);

    socket.on("message", (data) => {
        console.log("qqqqq messsage", data);
        socket.broadcast.emit("message", data);
    });
});

// Single port for both Express and Socket.io
const PORT = wsMainPort;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});