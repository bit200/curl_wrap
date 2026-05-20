const http = require('http');
const https = require('https');
const {URL} = require('url');
const iconv = require('iconv-lite');
const {clearHtml} = require("./clearHtml");

async function curl_direct_ws(url, options = {}) {
    return new Promise((_resolve, reject) => {
        try {
            let timeout =  +options.timeout || 10000;
            function resolve (html, status = 'ok') {
                // console.log("qqqqq defaultHeaders",html, defaultHeaders, options );

                _resolve({html, status, headers: {...defaultHeaders, timeout}, url})
            }


            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const defaultHeaders = {
                'User-Agent': options.agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': options.lng || 'ru,en-US;q=0.9,en;q=0.8',
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1"
            };

            defaultHeaders['Referer'] = options.ref || 'https://ya.ru/search/?lr=971&search_source=yaru_desktop_common&search_domain=yaru';

            const requestOptions = {
                method: options.method || 'GET',
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                headers: {...defaultHeaders, ...options.headers},
                // Set the low-level socket timeout (defaulting to 10 seconds if not provided)
                timeout
            };

            const req = protocol.request(requestOptions, (res) => {
                const chunks = [];

                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);

                    // let htmlText = buffer.toString('utf8');
                    let htmlText = iconv.decode(buffer, 'win1251');


                    if (!options.woClean) {
                        htmlText = clearHtml(htmlText)
                    }

                    resolve(htmlText);
                });
            });

            // Handle the timeout event directly on the request object
            req.on('timeout', () => {
                req.destroy(); // Actively destroy the socket to stop the request
                resolve('timeout error', 'err');
            });

            req.on("close", () => console.log("connection closed early"));
            req.on("abort", () => console.log("aborted by server"));
            req.on("aborted", () => console.log("response aborted"));

            req.on('error', (err) => {
                // If the request was manually destroyed by a timeout, ignore the resulting error
                if (req.destroyed && !err.code) return;
                console.log("qqqqq err", err);

                resolve('PARSER ERRROR 1 \n\n' + url + '\n\n' + err.toString(), 'err');
            });

            if (options.body) {
                req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
            }

            req.end();
        } catch (e) {
            resolve('PARSER ERRROR 2 \n\n' + url + '\n\n' + e.toString(), 'err');
        }
    });
}

module.exports = {curl_direct_ws};
