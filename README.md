# nasa-azzu-front

**TZUMY Atlas** permite explorar lugares terrestres y comparar su relieve con regiones de la Luna o Marte. Distingue sitios registrados de candidatos por revisar: ninguno se presenta como aprobado por NASA.

El recorrido es **lugar → región de referencia → variable → comparación**. Cada variable tiene
un apartado con nombre sencillo, definición y leyenda de unidades:

- **Inclinación habitual:** pendiente mediana, en grados.
- **Zonas más inclinadas:** pendiente P90; no es la pendiente máxima.
- **Desnivel del terreno:** relieve P95–P5, en metros; no es altitud sobre el mar.

El gráfico muestra valores y una diferencia explicada en palabras. Escala, contexto ambiental,
límites y fuentes se consultan por separado. NDVI y temperatura aparecen como contexto cuando
los proporciona la API; no se inventan comparaciones planetarias de estas variables.

La presentación conserva la consola orbital: marco exterior, globo grande de fondo,
panel lateral translúcido con la selección y las variables, y franja inferior con tarjetas
de variable, Tierra, referencia, diferencia y ubicación. Las tarjetas numéricas solo aparecen
cuando hay mediciones; no se rellenan con cifras de muestra. El globo continúa detrás de los
paneles de cristal en escritorio; en móvil los apartados se apilan para mantener la lectura.

## Desarrollo local

Requiere Node.js 20.19+ o 22.12+.

```bash
npm ci
npm run dev
```

Abre la URL que imprime Vite. Se necesita una API para obtener lugares y mediciones.
No hay catálogo de muestra, cifras ficticias ni descenso a una fotografía ilustrativa.
Si el servicio no está disponible, se muestra un aviso con opción de reintentar.

## Conectar la API

Por defecto se usa `/api` en el mismo origen (como en el despliegue con nginx).
Para desarrollo local, copia `.env.example` a `.env.local`, asigna `VITE_API_BASE_URL`
a la URL de la API (por ejemplo, `http://localhost:8000/api`) y reinicia Vite.
Si se sirve desde otro origen, debe permitir el origen de Vite mediante CORS.
El contrato existente no cambia.

## Navegación del globo

Seleccionar un lugar, desde la lista o desde un marcador, detiene el giro, centra la cámara
y hace zoom. El punto seleccionado se muestra más grande y en ámbar; los demás, en azul.
Hay controles para acercar, alejar, recuperar la vista global y volver al lugar seleccionado.
Se respeta la preferencia de movimiento reducido. En móvil, el globo, el catálogo y la
comparación se apilan sin superponerse.

La textura terrestre es de vista global: **el zoom no aporta imágenes de detalle de la tesela**.

Consulta el [análisis de la referencia y el contrato propuesto de la API](ANALISIS-FRONTEND.md).

```bash
npm run build
```

## Recursos visuales

- [Textura terrestre del ejemplo de Three.js](https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg)

- Mapas de Three.js para [relieve](https://threejs.org/examples/textures/planets/earth_normal_2048.jpg) y [separación de tierra y agua](https://threejs.org/examples/textures/planets/earth_specular_2048.jpg)

## Pruebas del globo

Con las dependencias instaladas, ejecuta:

  npx playwright install chromium
  npm test

También se pueden ejecutar `bun run build` y `bun run test` con las dependencias instaladas.

Playwright inicia Vite y ejecuta 16 comprobaciones, repartidas entre escritorio y móvil:
giro y arrastre, movimiento reducido, centrado y zoom repetible, selección de variables,
leyendas, cambio de referencia, resultados sin datos, errores y reintentos.
Las mediciones de las pruebas son fixtures interceptadas, no resultados científicos.
