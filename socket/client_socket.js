const { io } = require("socket.io-client");
const {wsMainPort, wsDomain} = require("../env");
const {getUp, saveUp} = require("../ws/saveUp");
const {parseUrl} = require("../ws/parseUrl");
const socket = io(`${wsDomain}:${wsMainPort}`);

console.log("qqqqq aaaaaaaaaaaaa", );

socket.on("connect", async () => {
    console.log("[WS] Connected to server, starting initialization...");

    // Send initial test message
    socket.emit("message", { text: "Hello Server!" });

    try {
        // Fetch or generate the unique client code
        let code = await getUp("code.md");
        if (!code) {
            code = new Date().getTime() + '__' + Math.random().toString(36).substring(2, 12).padEnd(10, '0');
            await saveUp('code.md', code, true);
        }

        console.log(`[WS] Initializing registration`, { code });

        socket.emit("init", {
            code: code
        });

    } catch (error) {
        console.error("Failed during init payload generation:", error);
    }
});

socket.on("curl", async (data, callback) => {
    console.log("Client received curl event data:", data);

    // Perform your logic here...
    const {html, ms, status, headers} = await parseUrl(data)
    // const resultData = { processed: true, time: Date.now() };
    // Invoke the callback to send data back to the server's 'await'
    callback({ms, status, headers, html});
});