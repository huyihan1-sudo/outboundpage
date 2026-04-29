const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--start-maximized', '--remote-debugging-port=9223'],
  });
  const page = await browser.newPage({ viewport: null });
  await page.goto('https://server327.web-hosting.com:2083/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  console.log('CPANEL_BROWSER_READY');
  console.log(await page.title());
  setInterval(() => {}, 1000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
