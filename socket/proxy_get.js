const express = require("express");
const {createServer} = require("http");
const {Server} = require("socket.io");
const {wsMainPort, proxyGetPort} = require("../env");
const {timer} = require("./timer");

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io attached to the same HTTP server
const io = new Server(httpServer, {
    cors: {origin: "*"}
});

async function getSocket({ip, code}) {
    const sockets = await io.fetchSockets();

    const matchedSocket = sockets.find((s) => {
        console.log("qqqqq code, ip", {code, ip}, s.code, s.ip);
        const matchCode = code ? s.code === code : true;
        const matchIp = ip ? s.ip === ip : true;
        return matchCode && matchIp;
    });
    return matchedSocket
}


// Express route: /curl?url=https://example.com
app.get("/clients", async (req, res) => {
    const sockets = await io.fetchSockets();
    res.send({
        clients: sockets.map(it => {
            return {
                id: it.id,
                ip: it.ip,
                code: it.code
            }
        })
    })
})
app.get("/curl", async (req, res) => {

    try {
        let {url, code, ip} = req.query;

        let clientResponse;
        let matchedSocket = null;

        // Check if filtering parameters were provided
        if (code || ip) {
            // 1. Fetch all active sockets
            matchedSocket = await getSocket({ip, code})

            if (!matchedSocket) {
                return res.status(404).json({
                    status: "err",
                    message: "No connected socket matches the specified criteria."
                });
            }

            clientResponse = await io.timeout(15000)
                .to(matchedSocket.id)
                .emitWithAck("curl", {url});
        } else {
            clientResponse = await io.timeout(15000)
                .emitWithAck("curl", {url});
        }

        res.status(200).json({
            status: "ok",
            socket: {
                code: matchedSocket.code,
                ip: matchedSocket.ip,
            },
            url,
            query: req.query,
            res: clientResponse[0]
        });

    } catch (err) {
        // Triggers if no socket client responds within 15 seconds
        res.status(504).json({status: "error", message: "Socket client timeout or no clients connected"});
    }
});

// Socket.io logic
io.on("connection", (socket) => {
    console.log("Client connected via Socket.io:", socket.id);

    socket.on("init", (initData) => {

        // You can attach the code directly to the socket object for future route tracking!
        const connectionIp = socket.handshake.address;

        // Save identifying parameters directly onto the socket instance
        socket.code = initData.code;
        socket.ip = (initData.force_ip || connectionIp).replace('::ffff:', '');

        console.log(`Registration received from socket ${socket.id}:`, socket.ip, initData);
    });

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