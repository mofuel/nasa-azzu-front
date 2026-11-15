import {test, expect} from '@playwright/test';

// Integration checks against the atlas preview started by Playwright.
const atlasURL = process.env.ATLAS_URL || '/';

async function openAtlas(page, reducedMotion = 'no-preference') {
  await page.emulateMedia({reducedMotion});
  // Observe the rendered camera in the browser without modifying application files.
  await page.route('**/main.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const instrumented = source.replaceAll(
      /renderer\.render\(scene, camera\)/g,
      '(window.__atlasProbe = {position: camera.position.toArray(), autoRotate: controls.autoRotate, damping: controls.enableDamping}, renderer.render(scene, camera))',
    );
    expect(instrumented).not.toBe(source);
    await route.fulfill({response, body: instrumented});
  });
  await page.goto(atlasURL);
  const skip = page.getByRole('button', {name: 'Saltar introducción'});
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('.console-frame')).toBeVisible();
  await page.waitForFunction(() => window.__atlasProbe);
}

const camera = page => page.evaluate(() => window.__atlasProbe.position);
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

test('Earth rotates slowly then stops permanently after dragging', async ({page}, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openAtlas(page);
  const start = await camera(page);
  await expect.poll(async () => distance(start, await camera(page))).toBeGreaterThan(.015);
  expect(await page.evaluate(() => window.__atlasProbe.autoRotate)).toBe(true);

  const box = await page.locator('.globe canvas').boundingBox();
  const x = box.x + box.width * .53;
  const y = box.y + box.height * .3;
  const beforeDrag = await camera(page);
  if (testInfo.project.name === 'mobile') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + step * 8, y: y + step * 2}]});
    }
    await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 130, y + 40, {steps: 12});
    await page.mouse.up();
  }
  await expect.poll(async () => distance(beforeDrag, await camera(page))).toBeGreaterThan(.1);
  await expect.poll(() => page.evaluate(() => window.__atlasProbe.autoRotate)).toBe(false);
  expect(await page.evaluate(() => window.__atlasProbe.damping)).toBe(false);
  const released = await camera(page);
  // A real wait is necessary to verify continued immobility after release.
  await page.waitForTimeout(2000);
  expect(distance(released, await camera(page))).toBeLessThan(.000001);
  await page.screenshot({path: testInfo.outputPath('atlas-after-drag.png')});
  expect(errors).toEqual([]);
});

test('Earth remains stationary when reduced motion is enabled', async ({page}) => {
  await openAtlas(page, 'reduce');
  expect(await page.evaluate(() => window.__atlasProbe.autoRotate)).toBe(false);
  const start = await camera(page);
  await page.waitForTimeout(1000);
  expect(distance(start, await camera(page))).toBeLessThan(.000001);
});
