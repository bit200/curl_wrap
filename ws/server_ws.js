const WebSocket = require('ws');

// Start the server on port 8080
const wss = new WebSocket.Server({ port: 8080 }, () => {
    console.log('--- WebSocket Server started on ws://localhost:8080 ---');
});

// Listen for incoming client connections
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[Server] New client connected from: ${clientIp}`);

    // Send a welcome message to the newly connected Electron app
    ws.send(JSON.stringify({ message: 'Welcome! Connected to the test server.' }));

    // Listen for messages from the Electron app
    ws.on('message', (message) => {
        try {
            // Parse the message assuming it is JSON stringified
            const parsedData = JSON.parse(message);
            console.log('[Server] Received data object:', parsedData);

            // Optional: Broadcast confirmation back to the sending client
            ws.send(JSON.stringify({
                status: 'success',
                received: parsedData.status
            }));
        } catch (error) {
            // Handle plain text fallback if JSON parsing fails
            console.log(`[Server] Received raw string: ${message}`);
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
