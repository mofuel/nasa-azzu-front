import {test, expect} from '@playwright/test';

// Integration checks against the atlas preview started by Playwright.
const atlasURL = process.env.ATLAS_URL || '/';

async function openAtlas(page, reducedMotion = 'no-preference') {
  await page.addInitScript(() => localStorage.setItem('azzu-language', 'es'));

  // UI fixtures do not depend on downloads from the satellite provider.
  await page.route('**/tiles.maps.eox.at/**', route => route.abort());
  await page.emulateMedia({reducedMotion});
  // Observe the rendered camera in the browser without modifying application files.
  await page.route('**/main.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const instrumented = source.replaceAll(
      /renderer\.render\(scene, camera\)/g,
      '(window.__atlasProbe = {position: camera.position.toArray(), autoRotate: controls.autoRotate, damping: controls.enableDamping, pins: pins.children.map(pin => ({id: pin.userData.site.id, selected: pin.material === selectedPinMat, mars: pin.material === marsPinMat, scale: pin.scale.x, distance: camera.position.distanceTo(pin.position), renderOrder: pin.renderOrder, screen: pin.position.clone().project(camera).toArray(), visible: pin.visible}))}, renderer.render(scene, camera))',
    );
    expect(instrumented).not.toBe(source);
    await route.fulfill({response, body: instrumented});
  });
  await page.goto(atlasURL);
  const skip = page.getByRole('button', {name: 'Saltar introducción'});
  if (await skip.isVisible()) {
    await skip.click({timeout: 1500}).catch(async error => {
      // The introduction may finish naturally between checking and clicking.
      if (!await page.locator('.console-frame').isVisible()) throw error;
    });
  }
  await expect(page.getByRole('heading', {name: 'Análogos terrestres'})).toBeVisible();
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

const sites = [
  {id: 'TIE-CINDER-LAKE', name: 'TIE-CINDER-LAKE', lat: 35.32, lon: -111.52, coverage: 'Sitio registrado para comparación',
    location: {status: 'ok', country: 'Estados Unidos', province: 'Arizona', district: 'Condado de Coconino', source: '© OpenStreetMap (Nominatim)'}},
  {id: 'T~N35W112~0~0', name: 'Candidato Arizona', lat: 35.58, lon: -111.63, coverage: 'Candidato detectado · 3/3'},
  {id: 'T~N19E018~4~7', name: 'Zona Tibesti', lat: 19.79, lon: 18.47, coverage: 'Zona candidata · 57 teselas (513,0 km²)',
    zone: {tiles: 57, areaKm2: 513, isZone: true, references: ['Malapert', 'Mons Mouton'], bodies: ['luna'], searchArea: 'Exploración: Tibesti',
      known: false, nearestKnownSite: 'Cinder Lake', nearestKnownKm: 11900, bbox: [18.2, 19.6, 18.7, 20]}},
  {id: 'T~N38W070~2~5', name: 'Zona Neuquén', lat: -37.8, lon: -69.9, coverage: 'Zona candidata · 6 teselas (54,0 km²) · 3/3 frente a Gale · base del monte Sharp (Marte)',
    zone: {tiles: 6, areaKm2: 54, isZone: true, references: ['Gale · base del monte Sharp'], bodies: ['marte'], searchArea: 'Exploración ampliada',
      known: false, nearestKnownSite: 'Death Valley', nearestKnownKm: 9000, bbox: [-70, -37.9, -69.8, -37.7]}}
];
const variables = [
  ['pendiente_mediana', 'Pendiente mediana'], ['pendiente_p90', 'Pendiente P90'], ['relieve', 'Relieve P95–P5']
];
const choices = [['Luna', 'Malapert'], ['Luna', 'Mons Mouton'], ['Marte', 'Gale · aterrizaje de Curiosity'],
  ['Marte', 'Gale · base del monte Sharp']].flatMap(([body, ref]) =>
  variables.map(([key, name]) => ({id: ref + '~' + key, label: ref + ' · ' + name, variable: name, reference: body + ' · ' + ref})));
function completed(body) {
  const relief = body.comparisonId.endsWith('~relieve');
  return {id: 'prueba', status: 'completed', result: {
    earthValue: relief ? 250 : 7, referenceValue: relief ? 200 : 6, unit: relief ? 'm' : '°',
    difference: relief ? 50 : 1, scale: 'Teselas de 3 km a 60 m. Referencia: mediana regional.',
    limitation: 'MODIS: enero y julio de 2025. No reproduce gravedad, atmósfera ni radiación.',
    sources: [{title: 'NASA · fuente de prueba', url: 'https://www.nasa.gov/'}, {title: 'No abrir', url: 'javascript:alert(1)'}]
  }};
}
async function mockApi(page, options = {}) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/search/status')) return route.fulfill({json: options.searchState ?? {
      celdas: {hecha: 27, pendiente: 5, en_curso: 1}, teselas: 58978, teselas_candidatas: 32,
      zonas_candidatas: 4, zonas_lejos_de_analogos_conocidos: 3, candidatas_aisladas: 9,
      ultima_actualizacion: '2026-11-15T23:00:00Z',
      trabajadores: [{estado: 'procesando', celda_id: 'N25E039', senal_reciente: true, actualizado_utc: '2026-11-15T23:00:00Z', celdas_elegibles: 4145}],
      contexto_nasa: {meses: ['2025-01', '2025-07'], version_qa: 'modis-qa-v2', umbral_ndvi: .3}
    }});
    if (path.endsWith('/sites')) {
      return route.fulfill({json: sites});
    }
    if (path.endsWith('/comparisons')) return route.fulfill({json: choices});
    if (path.endsWith('/analyses')) {
      const body = route.request().postDataJSON();
      return route.fulfill(await (options.analysis?.(body) ?? {json: completed(body)}));
    }
    return route.fulfill({status: 404});
  });
}

test('selecting a place centers and zooms in, highlights it and can be repeated', async ({page}) => {
  await mockApi(page);
  await openAtlas(page, 'reduce');
  const initial = await camera(page);
  await page.getByRole('button', {name: 'Candidato Arizona', exact: true}).click();
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeCloseTo(1.8, 3);
  expect(Math.hypot(...initial)).toBeGreaterThan(3);
  const lat = sites[1].lat * Math.PI / 180, lon = sites[1].lon * Math.PI / 180;
  const direction = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
  const alignment = (await camera(page)).reduce((sum, value, i) => sum + value / 1.8 * direction[i], 0);
  expect(alignment).toBeGreaterThan(.9999);
  expect(await page.evaluate(() => window.__atlasProbe.pins.filter(p => p.selected).map(p => p.id))).toEqual([sites[1].id]);
  await expect.poll(() => page.evaluate(() => {
    const selected = window.__atlasProbe.pins.find(pin => pin.selected);
    return selected.scale / selected.distance;
  })).toBeCloseTo(.03, 5);
  expect(await page.evaluate(() => {
    const pins = window.__atlasProbe.pins;
    return pins.filter(pin => !pin.selected).every(pin => pin.renderOrder < pins.find(pin => pin.selected).renderOrder);
  })).toBe(true);
  await page.getByRole('button', {name: 'Vista global', exact: true}).click();
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeGreaterThan(3);
  await page.getByRole('button', {name: 'Candidato Arizona', exact: true}).click();
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeCloseTo(1.8, 3);
  await page.getByRole('button', {name: 'Alejar', exact: true}).click();
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeGreaterThan(2);
  await page.getByRole('button', {name: 'Volver al lugar'}).click();
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeCloseTo(1.8, 3);
  const viewport = page.viewportSize();
  await page.setViewportSize({width: viewport.width - 20, height: viewport.height - 20});
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeCloseTo(1.8, 3);
});

test('clicking a globe marker also zooms in and stops the automatic rotation', async ({page}) => {
  await mockApi(page);
  await openAtlas(page);
  await expect.poll(() => page.evaluate(() => window.__atlasProbe.pins.filter(pin => pin.visible).length)).toBeGreaterThan(0);
  const pin = await page.evaluate(() => window.__atlasProbe.pins.find(pin => pin.visible));
  const box = await page.locator('.globe canvas').boundingBox();
  await page.mouse.click(box.x + (pin.screen[0] + 1) / 2 * box.width, box.y + (1 - pin.screen[1]) / 2 * box.height);
  await expect(page.locator('.site-button[aria-pressed=true]')).toHaveCount(1);
  await expect.poll(async () => Math.hypot(...await camera(page))).toBeCloseTo(1.8, 3);
  expect(await page.evaluate(() => window.__atlasProbe.autoRotate)).toBe(false);
});

test('variables have their own explanations, units, reference and evidence', async ({page}, testInfo) => {
  await mockApi(page);
  await openAtlas(page, 'reduce');
  await page.getByRole('button', {name: 'Cinder Lake', exact: true}).click();
  await expect(page.getByRole('radio', {name: /Inclinación habitual/})).toBeChecked();
  await expect(page.getByText(/0° es plano/)).toBeVisible();
  await page.getByRole('radio', {name: /Zonas más inclinadas/}).check();
  await expect(page.getByText(/no es la pendiente máxima/)).toBeVisible();
  await page.getByRole('radio', {name: /Desnivel del terreno/}).check();
  await expect(page.getByText(/no mayor altitud sobre el mar/)).toBeVisible();
  await page.getByLabel('2. Elige una región').selectOption('Luna · Mons Mouton');
  await expect(page.getByRole('radio', {name: /Desnivel del terreno/})).toBeChecked();
  const request = page.waitForRequest(req => req.url().endsWith('/analyses') && req.method() === 'POST');
  await page.getByRole('button', {name: 'Ver comparación', exact: true}).click();
  expect((await request).postDataJSON()).toEqual({siteId: sites[0].id, comparisonId: 'Mons Mouton~relieve'});
  await expect(page.getByText('El lugar terrestre tiene 50 m más de desnivel que la referencia.')).toBeVisible();
  await expect(page.locator('.console-metric')).toHaveCount(4);
  await expect(page.locator('.console-minimap')).toContainText('Ubicación');
  await expect(page.locator('.console-metric').filter({hasText: 'Diferencia'})).toContainText('50 m');
  if (testInfo.project.name === 'desktop') {
    const globe = await page.locator('.globe canvas').boundingBox();
    const readouts = await page.locator('.console-readouts').boundingBox();
    // The globe continues behind the glass console, rather than living in a small upper card.
    expect(globe.y).toBeLessThan(readouts.y);
    expect(globe.y + globe.height).toBeGreaterThan(readouts.y + readouts.height);
  }
  await expect(page.getByLabel('Leyenda del gráfico')).toContainText('Mediana de la región de referencia');
  await page.screenshot({path: testInfo.outputPath('atlas-console.png'), fullPage: true});
  await page.getByText('Fuentes de datos', {exact: true}).click();
  await expect(page.getByRole('link', {name: 'NASA · fuente de prueba'})).toHaveAttribute('href', 'https://www.nasa.gov/');
  await expect(page.getByRole('link', {name: 'No abrir'})).toHaveCount(0);
  await expect(page.getByText(/Vista previa del paisaje|región por definir|Previsualizar descenso/)).toHaveCount(0);
  const width = await page.evaluate(() => ({content: document.documentElement.scrollWidth, viewport: innerWidth}));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  await page.screenshot({path: testInfo.outputPath('atlas-comparison.png'), fullPage: true});
  await page.getByRole('radio', {name: /Inclinación habitual/}).check();
  await expect(page.locator('.comparison-result')).toHaveCount(0);
});

test('missing measurements are not replaced with illustrative numbers', async ({page}) => {
  await mockApi(page, {analysis: () => ({json: {id: 'sin-datos', status: 'insufficient_data', message: 'Esta celda todavía no se ha procesado.'}})});
  await openAtlas(page, 'reduce');
  await page.getByRole('button', {name: 'Cinder Lake', exact: true}).click();
  await page.getByRole('button', {name: 'Ver comparación', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Esta celda todavía no se ha procesado.');
  await expect(page.locator('.comparison-result')).toHaveCount(0);
  await expect(page.locator('.console-bar-row')).toHaveCount(0);
});

test('a failed analysis can be retried without a permanently disabled button', async ({page}) => {
  let fail = true;
  await mockApi(page, {analysis: body => fail ? {status: 503} : {json: completed(body)}});
  await openAtlas(page, 'reduce');
  await page.getByRole('button', {name: 'Cinder Lake', exact: true}).click();
  await page.getByRole('button', {name: 'Ver comparación', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('503');
  await expect(page.getByRole('button', {name: 'Ver comparación', exact: true})).toBeEnabled();
  fail = false;
  await page.getByRole('button', {name: 'Ver comparación', exact: true}).click();
  await expect(page.locator('.comparison-result')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an unavailable catalog does not silently show demo locations', async ({page}) => {
  await page.route('**/api/sites', route => route.fulfill({status: 503}));
  await openAtlas(page, 'reduce');
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar la lista');
  await expect(page.locator('.site-button')).toHaveCount(0);
  await expect(page.getByText('Desierto de Atacama', {exact: true})).toHaveCount(0);
  await page.route('**/api/sites', route => route.fulfill({json: sites}));
  await page.getByRole('button', {name: 'Reintentar catálogo'}).click();
  await expect(page.getByRole('button', {name: 'Cinder Lake', exact: true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('search activity distinguishes real processing from a stale signal', async ({page}) => {
  await mockApi(page);
  await openAtlas(page, 'reduce');
  const activity = page.getByRole('region', {name: 'Estado de la búsqueda'});
  await expect(activity).toContainText('Analizando terreno');
  await expect(activity).toContainText('5 en cola');
  await activity.getByText('Actividad y datos NASA', {exact: true}).click();
  await expect(activity).toContainText('no son lugares únicos');
  await expect(activity).toContainText('no promete descubrimientos infinitos');
  await expect(activity).toContainText('4 zonas de 3 o más teselas (3 lejos de análogos NASA conocidos) y 9 candidatas aisladas');
  const catalog = page.getByLabel('Catálogo de sitios');
  await expect(catalog.getByRole('heading', {name: 'Zonas candidatas (2)'})).toBeVisible();
  await expect(catalog.getByRole('heading', {name: 'Candidatos aislados (1)'})).toBeVisible();
  await page.route('**/api/search/status', route => route.fulfill({json: {
    celdas: {hecha: 27}, teselas: 58978, teselas_candidatas: 0, ultima_actualizacion: null,
    trabajadores: [{estado: 'procesando', celda_id: 'N25E039', senal_reciente: false, actualizado_utc: '2026-11-15T21:00:00Z', celdas_elegibles: 4145}],
    contexto_nasa: null
  }}));
  await page.reload();
  await expect(activity).toContainText('Sin señal reciente del trabajador');
  await expect(activity.locator('.activity-dot.active')).toHaveCount(0);
});

test('lunar and martian candidates are told apart in the list, globe and comparison', async ({page}) => {
  await mockApi(page);
  await openAtlas(page, 'reduce');
  const catalog = page.getByLabel('Catálogo de sitios');
  const mars = catalog.getByRole('button', {name: /^Zona Neuquén/});
  await expect(mars).toContainText('Marte');
  await expect(catalog.getByRole('button', {name: /^Zona Tibesti/})).toContainText('Luna');
  // Globe: only the Mars-only candidate uses the martian marker.
  await expect.poll(() => page.evaluate(() => window.__atlasProbe.pins.filter(p => p.mars).map(p => p.id))).toEqual(['T~N38W070~2~5']);
  await page.getByRole('radio', {name: 'Marte', exact: true}).check();
  await expect(catalog.getByRole('button', {name: /^Zona Tibesti/})).toHaveCount(0);
  await expect(catalog.getByRole('button', {name: 'Cinder Lake', exact: true})).toBeVisible();  // registered sites stay
  await expect.poll(() => page.evaluate(() => window.__atlasProbe.pins.map(p => p.id).sort())).toEqual(['TIE-CINDER-LAKE', 'T~N38W070~2~5']);
  await mars.click();
  const select = page.getByLabel('2. Elige una región');
  // Opens with the reference it was found against, not merely the first martian one.
  await expect(select).toHaveValue('Marte · Gale · base del monte Sharp');
  await expect(select.locator('optgroup')).toHaveCount(2);
  expect(await select.locator('optgroup').evaluateAll(groups => groups.map(g => g.label))).toEqual(['Luna', 'Marte']);
  // Panels turn reddish while comparing against Mars and lunar grey against the Moon.
  await expect(page.locator('main')).toHaveAttribute('data-body', 'marte');
  await select.selectOption('Luna · Malapert');
  await expect(page.locator('main')).toHaveAttribute('data-body', 'luna');
  // A place without cached administrative data says so instead of guessing.
  await expect(page.locator('.console-place')).toContainText('Ubicación administrativa pendiente de consulta');
  await page.getByRole('radio', {name: 'Luna y Marte'}).check();
  await expect(catalog.getByRole('button', {name: /^Zona Tibesti/})).toBeVisible();
  await catalog.getByRole('button', {name: 'Cinder Lake', exact: true}).click();
  await expect(page.locator('.console-place')).toContainText('Condado de Coconino, Arizona, Estados Unidos');
  await expect(page.locator('.site-detail .place')).toHaveText('Condado de Coconino, Arizona, Estados Unidos');
});

test('NASA context has its own units, missing data and explicit limits', async ({page}) => {
  await mockApi(page, {analysis: body => ({json: {
    ...completed(body), result: {...completed(body).result, earthContext: {
      months: ['2025-01', '2025-07'], resolutionDegrees: .05,
      ndviMax: null, ndviValidMonths: 0, lstDayMaxK: 310.2, lstDayValidMonths: 2,
      lstNightMinK: null, lstNightValidMonths: 0, ndviThreshold: .3, passesNdviScreen: false
    }}
  }})});
  await openAtlas(page, 'reduce');
  await page.getByRole('button', {name: 'Cinder Lake', exact: true}).click();
  await page.getByRole('button', {name: 'Ver comparación', exact: true}).click();
  await page.getByText('Contexto NASA terrestre · vegetación y temperatura', {exact: true}).click();
  const context = page.locator('.nasa-context');
  await expect(context).toContainText('310,2 K');
  await expect(context.getByText('Sin dato válido', {exact: true})).toHaveCount(2);
  await expect(context).toContainText('No cumple el filtro o faltan meses válidos');
  await expect(context).toContainText('no son extremos anuales');
  await expect(context).toContainText('no NASA');
});
