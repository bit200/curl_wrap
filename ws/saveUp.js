const fs = require('fs');
const path = require('path');

async function saveUp (name, content) {
    const dir = path.join(__dirname, `../up/${name}`);
    const targetDir = path.dirname(dir);

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(dir, `<meta charset="utf-8">\n\n` + content, 'utf8');
}

async function getUp (name) {
    const dir = path.join(__dirname, `../up/${name}`);
    try {
        return await fs.promises.readFile(dir, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

module.exports = { saveUp, getUp };
