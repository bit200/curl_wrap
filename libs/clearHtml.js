function clearHtml(html) {
    return (html || '')
        .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/style>/gi, '')
        // .replace(/\s\bclass=(["'])([\s\S]*?)\1/gi, '')
        .replace(/\s\bstyle=(["'])([\s\S]*?)\1/gi, '')
        .replace(/\s\bvalign==(["'])([\s\S]*?)\1/gi, '')
        .replace(/\s\balign==(["'])([\s\S]*?)\1/gi, '')
        .replace(/\s\bonClick==(["'])([\s\S]*?)\1/gi, '')
        .replace(/\bonclick=(["'])([\s\S]*?)\1/gi, '')
        .replace(/href=(\'|\")#(\'|\")\s/gi, '')
        .replace(/\n\n/gi, '\n')
}


module.exports = {clearHtml}
