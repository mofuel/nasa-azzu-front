# nasa-azzu-front

**TSUMI Atlas** es un prototipo de consola geoespacial para explorar análogos terrestres de la Luna y Marte. La apertura orbital se renderiza en WebGL y entrega el control al mismo globo interactivo. Desde el catálogo se puede seleccionar un sitio y abrir su ficha.

## Desarrollo local

Requiere Node.js 20.19+ o 22.12+.

```bash
npm ci
npm run dev
```

Abre la URL que imprime Vite. En modo local, Atacama sirve como caso ilustrativo para probar la selección y el descenso.

## Conectar la API

Copia `.env.example` a `.env.local`, asigna `VITE_API_BASE_URL` a la URL base de la API (por ejemplo, `http://localhost:8000/api`) y reinicia Vite. Si la API se sirve desde otro origen, debe permitir el origen de Vite mediante CORS. El frontend consulta el catálogo y el estado del análisis, y muestra el resultado con sus fuentes cuando llega.

Consulta el [análisis de la referencia y el contrato propuesto de la API](ANALISIS-FRONTEND.md).

```bash
npm run build
```

## Recursos visuales

- [Textura terrestre del ejemplo de Three.js](https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg)
- [Fotografía del paisaje ilustrativo en Unsplash](https://images.unsplash.com/photo-1473580044384-7ba9967e16a0)
