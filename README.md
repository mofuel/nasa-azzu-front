# nasa-azzu-front

**TSUMI Atlas** es un prototipo de consola geoespacial para explorar análogos terrestres de la Luna y Marte. La apertura orbital se renderiza en WebGL y entrega el control al mismo globo interactivo. Desde el catálogo se puede seleccionar un sitio y abrir su ficha.

## Desarrollo local

Requiere Node.js 20.19+ o 22.12+.

```bash
npm ci
npm run dev
```

Abre la URL que imprime Vite. En modo local, Atacama sirve como caso ilustrativo para probar la selección y el descenso. El catálogo incluye sitios de referencia del reto y seis ubicaciones exploratorias de Asia y el Pacífico para probar la navegación. Las coordenadas de estas seis ubicaciones vienen del [Global Volcanism Program del Smithsonian](https://volcano.si.edu/).

## Conectar la API

Copia `.env.example` a `.env.local`, asigna `VITE_API_BASE_URL` a la URL base de la API (por ejemplo, `http://localhost:8000/api`) y reinicia Vite. Si la API se sirve desde otro origen, debe permitir el origen de Vite mediante CORS. El frontend consulta el catálogo y el estado del análisis, y muestra las mediciones, el gráfico comparativo y sus fuentes en la misma consola.

Consulta el [análisis de la referencia y el contrato propuesto de la API](ANALISIS-FRONTEND.md).

```bash
npm run build
```

## Recursos visuales

- [Textura terrestre del ejemplo de Three.js](https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg)
- [Fotografía del paisaje ilustrativo en Unsplash](https://images.unsplash.com/photo-1473580044384-7ba9967e16a0)

- Mapas de Three.js para [relieve](https://threejs.org/examples/textures/planets/earth_normal_2048.jpg) y [separación de tierra y agua](https://threejs.org/examples/textures/planets/earth_specular_2048.jpg)

## Pruebas del globo

Con las dependencias instaladas, ejecuta:

  npx playwright install chromium
  npm test

Playwright inicia Vite y comprueba en escritorio y móvil el giro automático,
el arrastre, la detención al soltar y la preferencia de movimiento reducido.