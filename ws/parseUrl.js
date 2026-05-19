let {clearHtml} = require("./clearHtml");
let {saveUp, getUp} = require("./saveUp");
const {curl_direct} = require("./curl");

async function parseUrl (json) {
    // let html = await getUp('curl.html')
    let cd = new Date().getTime()
    let html = await curl_direct(json.url, json)
    // console.log("qqqqq html ----->>>>>>>> ", json, {size: html?.length} );
    await saveUp('curl2.html', clearHtml(html))
    return {html, cd: new Date().getTime() - cd};
}

module.exports = {parseUrl}
