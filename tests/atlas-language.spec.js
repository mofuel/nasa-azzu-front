import {test, expect} from '@playwright/test';

const site = {id:'T~N30W069~0~0', name:'Zona 30,80° S 69,08° O', lat:-30.8, lon:-69.08,
  coverage:'Zona candidata · 11 teselas (99,0 km²) · 3/3 frente a Malapert Massif (Luna)',
  zone:{isZone:true, bodies:['luna'], references:['Malapert Massif'], tiles:11, areaKm2:99}};
const comparisons = ['pendiente_mediana','pendiente_p90','relieve'].map((key,i) => ({id:'LUN-M~'+key,
  label:key, variable:['Pendiente mediana','Pendiente P90','Relieve P95–P5'][i], reference:'Luna · Malapert Massif'}));

test('English is the default and switching preserves the selection and analysis', async ({page},testInfo) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const posts=[];
  let catalogs=0;
  await page.route('**/tiles.maps.eox.at/**',r=>r.abort());
  await page.route('**/api/**',r=>{
    const path=new URL(r.request().url()).pathname;
    if(path.endsWith('/sites')) { catalogs++; return r.fulfill({json:[site]}); }
    if(path.endsWith('/comparisons')) return r.fulfill({json:comparisons});
    if(path.endsWith('/analyses')) {
      posts.push(r.request().postDataJSON());
      return r.fulfill({json:{id:'test',status:'completed',result:{earthValue:7.25,referenceValue:6,unit:'°',difference:1.25,
        scale:'Tesela de 3 km a 60 m (Copernicus GLO-30, celda TEST) frente a la mediana de 5 subventanas de 3 km de Malapert Massif (LRO LOLA).',
        limitation:'Pendiente mediana: la referencia va de 11,7° a 26,2° (P10–P90) y este sitio queda fuera. El relieve puede orientar ensayos de movilidad y navegación; requiere inspección de campo.',sources:[]}}});
    }
    return r.fulfill({status:503});
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('heading',{name:'Earth analogs',exact:true})).toBeVisible();
  const toggle=page.locator('.language-toggle');
  const global=page.getByRole('button',{name:'Global view',exact:true});
  expect(await toggle.evaluate(el=>el.nextElementSibling?.textContent)).toBe('Global view');
  await expect(global).toBeVisible();
  await page.locator('.site-button').first().click();
  await expect(page.locator('.site-detail')).toContainText('Zone 30.8° S, 69.08° W');
  await expect(page.locator('#reference')).toHaveValue('Luna · Malapert Massif');
  await expect(page.locator('#reference optgroup')).toHaveAttribute('label','Moon');
  await page.getByRole('button',{name:'View comparison',exact:true}).click();
  await expect(page.locator('.comparison-result')).toContainText('7.25 °');
  await expect(page.locator('.comparison-result')).toContainText('The Earth location has 1.25 ° more typical slope');
  await page.getByText('Scale and comparison method',{exact:true}).click();
  await expect(page.locator('.comparison-result')).toContainText('3 km tile at 60 m');
  await expect(page.locator('.comparison-result')).toContainText('the reference ranges from 11.7° to 26.2°');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('lang','es');
  await expect(page.getByRole('heading',{name:'Análogos terrestres',exact:true})).toBeVisible();
  await expect(page.locator('.comparison-result')).toContainText('7,25 °');
  await expect(page.locator('.site-button[aria-pressed=true]')).toHaveCount(1);
  expect(catalogs).toBe(1);
  expect(posts).toEqual([{siteId:site.id,comparisonId:comparisons[0].id}]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','es');
  await expect(page.getByRole('button',{name:'Vista global',exact:true})).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.screenshot({path:testInfo.outputPath('english-dashboard.png')});
});

test('catalog errors and retry controls follow the selected language', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/tiles.maps.eox.at/**',r=>r.abort());
  await page.route('**/api/**',r=>r.fulfill({status:503}));
  await page.goto('/');
  await expect(page.locator('[role=alert]')).toContainText('The location list could not be loaded. The API returned status 503');
  await expect(page.getByRole('button',{name:'Retry catalog'})).toBeVisible();
  await page.locator('.language-toggle').click();
  await expect(page.locator('[role=alert]')).toContainText('No se pudo cargar la lista de lugares. La API respondió con el código 503');
  await expect(page.getByRole('button',{name:'Reintentar catálogo'})).toBeVisible();
});
