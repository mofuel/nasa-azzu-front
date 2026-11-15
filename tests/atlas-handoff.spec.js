import {test, expect} from '@playwright/test';

test('handoff never leaves an empty WebGL frame after resizing', async ({page}, testInfo) => {
  await page.addInitScript(() => { window.__resizeFrames = []; });
  await page.route('**/api/sites', route => route.fulfill({json: []}));
  // Keep the regression independent of the external satellite provider.
  await page.route('**/tiles.maps.eox.at/**', route => route.abort());
  await page.route('**/main.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace('new ResizeObserver(resizeViewport)', [
      'new ResizeObserver(() => {',
      'resizeViewport();',
      'if (intro.time() < 5.5) return;',
      'const gl = renderer.getContext();',
      'const pixel = new Uint8Array(4);',
      'gl.readPixels(Math.floor(canvas.width/2), Math.floor(canvas.height/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);',
      'window.__resizeFrames.push({time: intro.time(), pixel: Array.from(pixel)});',
      '})',
    ].join('\n'));
    expect(body).not.toBe(source);
    await route.fulfill({response, body});
  });
  await page.goto(process.env.ATLAS_URL || '/');
  await expect(page.locator('.console-frame')).toBeVisible({timeout: 30000});
  await expect.poll(() => page.evaluate(() => window.__resizeFrames.length)).toBeGreaterThan(2);
  const frames = await page.evaluate(() => window.__resizeFrames);
  expect(frames.filter(frame => frame.pixel[3] === 0)).toEqual([]);
  await testInfo.attach('WebGL frames after each resize', {body: JSON.stringify(frames, null, 2), contentType: 'application/json'});
  await page.screenshot({path: testInfo.outputPath('dashboard-after-handoff.png')});
});
test('intro imagery credit stays fixed and fades before the dashboard', async ({page}, testInfo) => {
  await page.addInitScript(() => { window.__creditFrames = []; });
  await page.route('**/api/sites', route => route.fulfill({json: []}));
  await page.route('**/tiles.maps.eox.at/**', route => route.abort());
  await page.route('**/main.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replaceAll('renderer.render(scene, camera)', [
      '(() => {',
      'const credit = el.querySelector(".imagery-credit");',
      'if (cinematic && credit && intro.time() > 5.5) {',
      'const rect = credit.getBoundingClientRect();',
      'window.__creditFrames.push({time: intro.time(), x: rect.x, y: rect.y, opacity: Number(getComputedStyle(credit).opacity)});',
      '}',
      'return renderer.render(scene, camera);',
      '})()',
    ].join('\n').replaceAll('\n', String.fromCharCode(10)));
    expect(body).not.toBe(source);
    await route.fulfill({response, body});
  });
  await page.goto(process.env.ATLAS_URL || '/');
  await expect(page.locator('.console-frame')).toBeVisible({timeout: 30000});
  const frames = await page.evaluate(() => window.__creditFrames);
  expect(frames.length).toBeGreaterThan(3);
  expect(Math.max(...frames.map(f => f.x)) - Math.min(...frames.map(f => f.x))).toBeLessThan(1);
  expect(Math.max(...frames.map(f => f.y)) - Math.min(...frames.map(f => f.y))).toBeLessThan(1);
  expect(frames.some(f => f.time < 6.5 && f.opacity < .01)).toBe(true);
  await expect(page.locator('.imagery-credit')).toBeVisible();
  await testInfo.attach('Credit positions per frame', {body: JSON.stringify(frames), contentType: 'application/json'});
});