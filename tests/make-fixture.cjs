// Test books use a generated, copyright-free image bundled alongside this script.
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('../vendor/jszip.min.js');

async function makeFixture(directory = path.join(__dirname, 'fixtures')) {
  fs.mkdirSync(directory, { recursive: true });
  const jpeg = fs.readFileSync(path.join(__dirname, 'page.jpg'));
  const zip = new JSZip();
  for (let page = 120; page >= 1; page--) zip.file(`Volume 1/${page}.jpg`, jpeg);
  zip.file('__MACOSX/._1.jpg', 'metadata');
  zip.file('Volume 1/._2.jpg', 'metadata');
  zip.file('ComicInfo.xml', '<ComicInfo><Title>Reader test</Title></ComicInfo>');
  const output = path.join(directory, 'reader-test-120.cbz');
  fs.writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return output;
}
module.exports = makeFixture;
if (require.main === module) makeFixture().then(p => console.log(p)).catch(e => { console.error(e); process.exitCode = 1; });
