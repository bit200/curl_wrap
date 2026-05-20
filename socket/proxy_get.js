const express = require("express");
const {createServer} = require("http");
const {Server} = require("socket.io");
const {wsMainPort} = require("../env");
const {timer} = require("./../libs/timer");

const app = express();
app.set("trust proxy", true);

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
        items: sockets.map(it => {
            return {
                ip: it.ip,
                code: it.code,
                id: it.id
            }
        })
    })
})
async function onSmartCurl (data, res) {
    try {
        let {url, code, ip} = data;
        console.log("qqqqq url, code, ip", {url, code, ip});

        let clientResponse;
        let matchedSocket = null;

        // Check if filtering parameters were provided

        async function action () {
            if (!matchedSocket) {
                return res.status(404).json({
                    status: "err",
                    message: "No connected socket matches the specified criteria."
                });
            }

            let timeout = (data.timeout || 60000) + 5000;

            clientResponse = await io.timeout(timeout)
                .to(matchedSocket.id)
                .emitWithAck("curl", data);


            console.log("qqqqq clientResponse", clientResponse);
            let response = clientResponse ? clientResponse[0] : {}
            let html = response?.html || '-';

            res.status(200).json({
                status: "ok",
                url,
                regexps: data.woReg ? {} : {
                    otvet: html.match(/ответчик/gi)?.length,
                    503: html.match(/\<h2\>503\<\/h2\>/gi)?.length,
                    'информация недоступна': html.match(/Информация временно недоступна/gi)?.length,
                    'дел не назначено': html.match(/дел не назначено/gi)?.length,
                },
                socket: matchedSocket ? {
                    ip: matchedSocket.ip,
                    code: matchedSocket.code,
                    id: matchedSocket.id,
                } : {},
                query: data,
                res: response
            });
        }


        if (code || ip) {
            // 1. Fetch all active sockets
            matchedSocket = await getSocket({ip, code})
            await action()

        } else {
            let sockets = await io.fetchSockets();
            matchedSocket = sockets[0];
            await action()
        }



    } catch (err) {
        console.log("qqqqq err", err);
        // Triggers if no socket client responds within 15 seconds
        res.status(504).json({status: "error", message: "Socket client timeout or no clients connected", err: err.toString()});
    }
}


app.get("/odb", async (req, res) => {
    let data = req.query;
    data.url = `${data.domain}/modules.php?name=sud_delo&srv_num=1&H_date=${data || '19.05.2026'}`
    onSmartCurl(data, res).then()
});
app.get("/curl", async (req, res) => {
    onSmartCurl(req.query, res).then()
});
app.post("/curl", async (req, res) => {
    onSmartCurl(req.body, res).then()
});

// Socket.io logic
io.on("connection", (socket) => {
    console.log("Client connected via Socket.io:", socket.id);

    socket.on("init", (initData) => {

        // You can attach the code directly to the socket object for future route tracking!
        // const connectionIp = socket.handshake.address;
        const forwarded = socket.handshake.headers["x-forwarded-for"];

        const realIp = forwarded
            ? forwarded.split(",")[0].trim()
            : socket.handshake.address;

        console.log("qqqqq forwarded", forwarded, socket.conn.remoteAddress);

        // Save identifying parameters directly onto the socket instance
        socket.code = initData.code;
        socket.ip = (initData.force_ip || realIp).replace('::ffff:', '');

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