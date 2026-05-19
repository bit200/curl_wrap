const WebSocket = require('ws');
const {wsServer} = require("../env");
const {curl_direct} = require("./curl");
const {saveUp, getUp} = require("./saveUp");
const {clearHtml} = require("./clearHtml");

class WSClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.isCustomClosed = false;
    }

    connect() {
        this.isCustomClosed = false;
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            console.log(`[WS] Connected to ${this.url}`);
        });

        this.ws.on('message', async (data) => {
            console.log(`[WS] Received: ${data}`, data.messages, data.toString());

            // let html = await curl_direct("https://sudrf.ru")
            let html = await getUp('curl.html')
            // let html = await curl_direct("https://krasnodar-prikubansky--krd.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=457286424&case_uid=c5af6679-6d16-4a0f-a309-c70d00b157b4&delo_id=1540005")
            await saveUp('curl2.html', clearHtml(html))
            console.log("qqqqq html", html );

        });

        this.ws.on('close', () => {
            console.log('[WS] Connection closed.');
            if (!this.isCustomClosed) {
                console.log('[WS] Reconnecting in 5 seconds...');
                setTimeout(() => this.connect(), 5000);
            }
        });

        this.ws.on('error', (error) => {
            console.error('[WS] Error:', error.message);
        });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = typeof data === 'object' ? JSON.stringify(data) : data;
            this.ws.send(payload);
            return true;
        }
        console.warn('[WS] Cannot send message, socket not open.');
        return false;
    }

    disconnect() {
        this.isCustomClosed = true;
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Export the class so Electron can still use it
module.exports = WSClient;

// --- EXECUTION BLOCK FOR STANDALONE RUNS ---
// This checks if the file is being run directly via 'node client_ws.js'
if (require.main === module) {
    const wsClient = new WSClient(wsServer);
    console.log("Starting standalone WebSocket client...");

    // Call connect to open the socket and keep the process alive
    wsClient.connect();


}
