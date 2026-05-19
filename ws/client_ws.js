const WebSocket = require('ws');
const {wsServer} = require("../env");
const {curl_direct} = require("./curl");
const {saveUp, getUp} = require("./saveUp");
const {clearHtml} = require("./clearHtml");
const {parseUrl} = require("./parseUrl");

class WSClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.isCustomClosed = false;
    }

    connect() {
        this.isCustomClosed = false;
        this.ws = new WebSocket(this.url);

        this.ws.on('open', async () => {
            let code = await getUp("code.md")
            if (!code) {
                code = new Date().getTime() + '__' + Math.random().toString(36).substring(2, 12).padEnd(10, '0');
                await saveUp('code.md', code, true)
            }

            console.log(`[WS] Connected to ${this.url}`, {code});
            this.send({signal: 'inited', code, type: 'curl_client'})

        });

        this.ws.on('message', async (data) => {
            try {
                let json = JSON.parse(data)
                if (json.signal == 'curl') {
                    let parseInfo = await parseUrl(json)
                    this.ws.send({signal: 'main_proxy', parseInfo})
                }
            } catch (e) {
            }
        });

        this.ws.on('close', () => {
            console.log('[WS] Connection closed.');
            if (!this.isCustomClosed) {
                console.log('[WS] Reconnecting in 5 seconds...');
                setTimeout(() => this.connect(), 2000);
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
    console.log("Starting standalone WebSocket client...",);
    wsClient.connect();
}
