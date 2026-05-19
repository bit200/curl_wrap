const WebSocket = require('ws');
const {parseUrl} = require("./parseUrl");
const env = require('../env')

// Start the server on port 8080
const wss = new WebSocket.Server({port: env.wsMainPort}, () => {
    console.log('--- WebSocket Server started on ws://localhost:8080 ---');
});

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    // console.log(`[Server] New client connected from: ${clientIp}`);

    // ws.send(JSON.stringify({ message: 'Welcome! Connected to the test server.' }));

    ws.on('message', async (message) => {
        try {
            // Parse the message assuming it is JSON stringified
            const json = JSON.parse(message);
            let {signal, ip = 'local', type, code} = json
            console.log('[Server] Received data object:', json, signal, clientIp);

            if (signal == 'inited') {
                console.log("qqqqq INITED CONNECTION", {code});
                ws.type = type;
                ws.code = code;
                ws.ip = clientIp;

            } else if (signal === 'curl') {
                if (/local/gi.test(ip)) {
                    let parseInfo = await parseUrl(json)
                    sendTo('main_server', {parseInfo, json})
                } else {
                    sendTo('curl_client', json)
                }
            } else if (signal === 'main_proxy') {
                sendTo('main_server', json)
            }


            // Optional: Broadcast confirmation back to the sending client
            // ws.send(JSON.stringify({
            //     status: 'success',
            //     received: parsedData.status
            // }));
        } catch (error) {
            // Handle plain text fallback if JSON parsing fails
            console.log(`[Server] Received raw string: ${message}`, error);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('[Server] Client disconnected');
    });

    // Handle connection errors
    ws.on('error', (error) => {
        console.error(`[Server] Socket error: ${error.message}`);
    });
});

function sendTo(type, msg) {
    wss.clients.forEach((client) => {
        // Check if the connection is still open/active
        if (client.readyState === WebSocket.OPEN && client.type == type) {
            client.send(JSON.stringify(msg))
            console.log(`Sending update to client with code: ${client.code} at IP: ${client.ip}`, client.type, {type});
        }
    });

}

