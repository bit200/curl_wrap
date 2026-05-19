const WebSocket = require('ws');
const {wsServer} = require("../env");
const {curl_direct} = require("./curl");
const {saveUp, getUp} = require("./saveUp");
const {clearHtml} = require("./clearHtml");
const {parseUrl} = require("./parseUrl");

async function delay (ms) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), ms)
    })
}


let ind =0;
let last_curl_cd = 0
class WSClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.isCustomClosed = false;
    }

    connect() {
        this.isCustomClosed = false;
        this.ws = new WebSocket(this.url);
        let _this = this;

        function onSend (data) {
            _this.ws.send(JSON.stringify(data))
        }

        this.ws.on('open', async () => {
            let code = await getUp("code.md")
            if (!code) {
                code = new Date().getTime() + '__' + Math.random().toString(36).substring(2, 12).padEnd(10, '0');
                await saveUp('code.md', code, true)
            }
            console.log(`[WS] Connected to ${this.url}`, {code});
            this.send({signal: 'INIT', type: 'ws_client', code, force_ip: 'force_local'})
            // this.send({signal: 'CURL', url: 'https://itrum.ru'})
        });

        this.ws.on('message', async (data) => {
            try {
                // console.log("qqqqq MSG ", ++ind);

                let json = JSON.parse(data.toString())
                let {signal} = json
                if (signal == 'CURL') {
                    let cd = new Date().getTime();
                    console.log("qqqqq CURL SIGNAL WS ----------->>>>>>>>>>>>>>", json.url );
                    let delta = (join.min_interval_ms || 0) - (cd - last_curl_cd)
                    if (delta > 0)  {
                        last_curl_cd = cd;
                        await delay(delta)
                    }

                    let parseInfo = await parseUrl(json)
                    onSend({signal: 'CURL_RES', parseInfo, json})
                }
            } catch (e) {
                console.log("qqqqq eeeeeeee", e);
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
