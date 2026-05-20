let {clearHtml} = require("./clearHtml");
let {saveUp, getUp} = require("./saveUp");
const {curl_direct, curl_direct_ws} = require("./curl");

async function parseUrl (json) {

    // let html = await getUp('curl.html')
    let cd = new Date().getTime()
    let {html, status, headers } = await curl_direct_ws(json.url, json)
    // console.log("qqqqq html ----->>>>>>>> ", json, {size: html?.length} );
    if (json.saveUp) {
        await saveUp(json.saveUp, html)
    }
    return {html, ms: new Date().getTime() - cd, status, headers};
}

module.exports = {parseUrl}
