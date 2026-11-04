const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const GREEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" x="0" y="0" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512" xml:space="preserve"><g><path fill="#1f9d4c" d="M500.885 480.632c0 17.291-14.088 31.379-31.38 31.379H42.466c-17.291 0-31.351-14.088-31.351-31.379V31.368c0-17.291 14.06-31.38 31.351-31.38h427.039c17.291 0 31.38 14.088 31.38 31.38z" opacity="1"></path><g fill-rule="evenodd" clip-rule="evenodd"><path fill="#ffffff" d="M171.414 156.376h169.257l-84.642 174.387zm200.013-38.551H140.63a19.23 19.23 0 0 0-16.328 9.043c-3.515 5.613-3.912 12.671-.992 18.624l115.398 237.827c3.203 6.661 9.95 10.857 17.32 10.857a19.24 19.24 0 0 0 17.348-10.857l115.398-237.827c2.891-5.953 2.523-13.011-1.021-18.624a19.22 19.22 0 0 0-16.326-9.043" opacity="1"></path><path fill="#147536" d="M369.613 512.011h99.893c17.291 0 31.38-14.088 31.38-31.379v-243.61L387.754 126.868a19.21 19.21 0 0 1 1.021 18.624L273.376 383.318a19.24 19.24 0 0 1-17.348 10.857 19.36 19.36 0 0 1-10.715-3.232zM256.028 330.764l84.643-174.388H171.414z" opacity="1"></path></g></g></svg>`;

function buildIco(entries) {
  // entries: array of { size: number, buffer: Buffer }
  const headerSize = 6 + 16 * entries.length;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type = 1
  header.writeUInt16LE(entries.length, 4);

  const chunks = [header];
  for (let i = 0; i < entries.length; i++) {
    const { size, buffer } = entries[i];
    const entryOffset = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2); // color count
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // color planes
    header.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    header.writeUInt32LE(buffer.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    chunks.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat(chunks);
}

async function renderPng(browser, size) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1
  });
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;width:${size}px;height:${size}px">
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" style="display:block">
      ${GREEN_SVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}
    </svg>
  </body></html>`;
  await page.setContent(html);
  const buf = await page.screenshot({ omitBackground: true, type: 'png' });
  await page.close();
  return buf;
}

(async () => {
  // 1. Write SVG
  fs.writeFileSync(path.resolve('assets/app-icon.svg'), GREEN_SVG, 'utf8');
  console.log('Updated assets/app-icon.svg');

  // Launch Chrome
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  // 2. Render target PNGs
  const png512 = await renderPng(browser, 512);
  fs.writeFileSync('assets/app-icon.png', png512);
  console.log('Updated assets/app-icon.png (512x512)');

  fs.writeFileSync('website/icon.png', png512);
  console.log('Updated website/icon.png (512x512)');

  const png96 = await renderPng(browser, 96);
  fs.writeFileSync('renderer/brand-mark.png', png96);
  console.log('Updated renderer/brand-mark.png (96x96)');

  const extensionSizes = [
    { size: 128, file: 'extension/icons/icon128.png' },
    { size: 48, file: 'extension/icons/icon48.png' },
    { size: 32, file: 'extension/icons/icon32.png' },
    { size: 16, file: 'extension/icons/icon16.png' }
  ];

  for (const item of extensionSizes) {
    const buf = await renderPng(browser, item.size);
    fs.writeFileSync(item.file, buf);
    console.log(`Updated ${item.file} (${item.size}x${item.size})`);
  }

  // 3. Render ICO sizes: 16, 20, 24, 32, 40, 48, 64, 128, 256
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icoEntries = [];
  for (const s of icoSizes) {
    const buf = await renderPng(browser, s);
    icoEntries.push({ size: s, buffer: buf });
  }
  const icoBuffer = buildIco(icoEntries);
  fs.writeFileSync('build/icon.ico', icoBuffer);
  console.log('Updated build/icon.ico with 9 sizes');

  // 4. Update store-assets popup preview
  const popupPage = await browser.newPage({
    viewport: { width: 640, height: 400 },
    deviceScaleFactor: 1
  });
  const popupHtml = fs.readFileSync('extension/popup.html', 'utf8');
  const popupCss = fs.readFileSync('extension/popup.css', 'utf8');
  const icon48Base64 = fs.readFileSync('extension/icons/icon48.png').toString('base64');
  const fullHtml = `<!DOCTYPE html><html><head><style>
    ${popupCss}
    body { margin: 20px auto; width: 340px; box-shadow: 0 12px 32px rgba(0,0,0,0.3); border-radius: 14px; overflow: hidden; }
    html { background: #0b120e; display: flex; align-items: center; justify-content: center; height: 100%; }
  </style></head>
  ${popupHtml.replace('icons/icon48.png', 'data:image/png;base64,' + icon48Base64)}
  </html>`;
  await popupPage.setContent(fullHtml);
  await popupPage.screenshot({ path: 'store-assets/chrome-web-store-popup-640x400.png', omitBackground: false });
  await popupPage.close();
  console.log('Updated store-assets/chrome-web-store-popup-640x400.png');

  await browser.close();
  console.log('All branding assets successfully generated!');
})().catch(err => {
  console.error('Error generating branding assets:', err);
  process.exit(1);
});
