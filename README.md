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

El panel de actividad consulta `/api/search/status` cada 30 segundos y distingue procesamiento,
espera y ausencia de señal reciente. Muestra la cola, el último avance y los meses MODIS;
no interpreta un contenedor encendido como búsqueda activa ni promete un dominio infinito.
El contexto NASA tiene un apartado propio con NDVI/LST, unidades, meses válidos y límites,
incluidos los valores sin dato, sin inventar una comparación térmica planetaria.

El catálogo separa sitios registrados, **zonas candidatas** (3 o más teselas candidatas
cercanas que la API agrupa por distancia) y candidatos aislados. Cada zona se marca y compara
por su mejor tesela; el área suma solo las teselas que cumplen. Agrupar no valida la zona.

Los candidatos se distinguen por el cuerpo frente al que se detectaron: etiqueta «Luna» o
«Marte» en el catálogo, marcador rojo en el globo para los solo marcianos y un filtro
Luna/Marte que afecta a la lista y al globo. El selector de comparación agrupa las regiones
por cuerpo y abre la del cuerpo en que se encontró el candidato. Marte usa la banda P25–P75.
Los paneles toman un tono gris lunar al comparar con la Luna y rojizo al comparar con Marte.

La tarjeta «Ubicación» muestra distrito, provincia y país (caché de OpenStreetMap/Nominatim en la
API) junto a las coordenadas. Si aún no se ha consultado o el punto está en el mar, lo dice.

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
y hace zoom. El punto seleccionado conserva su tamaño, se muestra en ámbar y se dibuja por encima de los demás marcadores.
Hay controles para acercar, alejar, recuperar la vista global y volver al lugar seleccionado.
Se respeta la preferencia de movimiento reducido. En móvil, el globo, el catálogo y la
comparación se apilan sin superponerse.

Al acercarse, el globo carga mosaicos Sentinel-2 de 2016 con más detalle (ver «Imágenes
satelitales del globo»). Son contexto visual: **no son los datos que se comparan** ni muestran
el estado actual del terreno.

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

Playwright inicia Vite y ejecuta 32 comprobaciones, repartidas entre escritorio y móvil:
giro y arrastre, movimiento reducido, centrado y zoom repetible, selección de variables,
leyendas, cambio de referencia, resultados sin datos, errores y reintentos, actividad, zonas
candidatas, distinción Luna/Marte, contexto NASA, transición de la introducción y crédito de las imágenes.
Las mediciones de las pruebas son fixtures interceptadas, no resultados científicos.

## Imágenes satelitales del globo

La vista global y el zoom usan el mosaico original Sentinel-2 cloudless 2016 de EOX,
capa WMTS s2cloudless_3857, con datos Copernicus Sentinel modificados de 2016.
Licencia de las imágenes: Creative Commons Attribution 4.0 International (CC BY 4.0).
No representa imágenes actuales. La resolución original de hasta 10 m limita el detalle
del acercamiento; el zoom no genera detalle adicional. Requiere conexión al servicio EOX.

Atribución: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH
(Contains modified Copernicus Sentinel data 2016).
En Tzumy las imágenes se reproyectan sobre una esfera y reciben iluminación visual
durante la introducción. Son un fondo de visualización; no sustituyen los datos de análisis.

- Servicio y licencia por capa: https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml
- Licencia: https://creativecommons.org/licenses/by/4.0/
- Información del mosaico: https://www.eox.at/2025/03/sentinel-2-cloudless-2024/
## Idiomas

La interfaz inicia en inglés. El botón English / Español, a la izquierda de Vista global, cambia el idioma sin reiniciar el globo ni perder la selección. La preferencia se guarda localmente. Se traducen las etiquetas y plantillas del contrato de la API; los identificadores, las mediciones y los nombres propios se conservan.
