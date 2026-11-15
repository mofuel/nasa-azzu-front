# TSUMI · Análisis y propuesta de frontend

## Estado actual de la interfaz

El storyboard de abajo se conserva como antecedente visual. El recorrido vigente es:
**lugar terrestre → región lunar o marciana → variable explicada → comparación con datos de la API**.
Se eliminaron el catálogo ilustrativo y el descenso a una fotografía de paisaje.
La selección centra y acerca el globo; las variables tienen apartados y leyendas de unidades.
Las limitaciones y fuentes se muestran por separado, sin presentar una coincidencia de relieve
como certificación de analogía. Véase [README.md](README.md).
Se mantiene la composición de consola del diseño original: globo a pantalla completa detrás
de paneles translúcidos, marco exterior, controles laterales y tarjetas de mediciones en la franja inferior.

## Antecedentes de diseño

Referencia: front-referencia.mp4, 496 × 368, 60 fps, 19,37 s. Se extrajeron 1.162 fotogramas. El storyboard muestrea cada 0,5 s y la lámina del HUD cada 0,2 s. El CSV registra diferencia media de luminancia entre fotogramas. El video muestra un globo y un HUD; el descenso a paisaje por capas es una adaptación propuesta.

| Fotogramas | Observación | Adaptación |
|---|---|---|
| 1–91 | Borde oscuro, halo y destello | Entrada orbital ligada al scroll |
| 91–241 | Alejamiento hasta ver la Tierra completa | Alejar cámara sobre el mismo globo interactivo |
| 241–373 | Rotación y marcadores | Mostrar catálogo, detener giro y habilitar arrastre |
| 373–505 | Trazado del marco y entrada del listado | Enfocar el punto y abrir ficha al seleccionarlo |
| 505–649 | Tarjetas y barrido del gráfico | Revelar resultados cuando responde el backend |
| 649–871 | HUD estable con globo en movimiento | Mantener la evidencia legible durante la consulta |
| 871–1162 | Salida del HUD y acercamiento al planeta | Reutilizar el gesto para el descenso al sitio |

## Recorrido

Órbita → globo libre → sitio → variable y referencia → Analizar → paisaje → evidencia → volver al mismo globo. GSAP controla la introducción y la transición. El usuario controla el globo durante la exploración. El paisaje separa cielo, relieve lejano, terreno medio y primer plano. Una capa de polvo cubre el cambio, y las capas se mueven a velocidades diferentes. La animación termina independientemente de la respuesta científica. Con movimiento reducido se accede a la misma información directamente.

## Integración

React, TypeScript y Vite para la interfaz, Three.js para la Tierra y pines, GSAP ScrollTrigger para la apertura, CSS y SVG para el panel. El backend ejecuta el cálculo y conserva la procedencia. Contrato propuesto:
- GET /sites → lista de id, name, lat, lon y coverage.
- GET /sites/{id}/comparisons → lista de id, label, variable y reference.
- POST /analyses → {siteId, comparisonId}. Devuelve {id, status, result?, message?}.
- GET /analyses/{id} → mismo esquema si el cálculo sigue en curso. Estados pending, running, completed, insufficient_data, failed.
- result → {earthValue, referenceValue, unit, difference, scale, limitation, sources: [{title, url}]}. Los valores y la diferencia provienen del backend.

El plan original contempla Python y resultados exportables. PostgreSQL figura como diseño propuesto. El primer corte usa un sitio ilustrativo para verificar la interfaz local. Con VITE_API_BASE_URL consume el contrato anterior. La evidencia se completa al conectar el backend científico.

Fuentes: https://github.com/77ALDO77/tsumi_nasa_SA/blob/main/CONTEXTO_RETO.md y https://github.com/77ALDO77/tsumi_nasa_SA/blob/main/FLUJO_TRABAJO.md.

## Réplica visual de Kestrel · orden de trabajo

Fuselab utiliza un globo Mapbox/WebGL y describe una secuencia procedural por tiempo. React, Vite y GSAP son elecciones de TSUMI. El objetivo es una consola geoespacial a pantalla completa. El mismo mapa permanece montado mientras entra la interfaz y se habilita el control manual.

| Orden | Referencia | Subtarea y criterio visual |
|---|---|---|
| 1 | F0001–F0241 (0–4 s) | Entrada completa. Borde terrestre grande, penumbra, halo, salida del destello y alejamiento hasta ver la esfera. Base técnica: Mapbox en proyección globo. Coreografía: GSAP, atmósfera del mapa y destello superpuesto. Validar encuadre y tamaño contra F0001, F0091 y F0241. |
| 2 | F0241–F0373 (4–6,2 s) | Giro, reencuadre y marcadores. Comparar escala y orientación. Usar capa geográfica de Mapbox. Validar que los puntos acompañen la cámara y desaparezcan al quedar ocluidos. |
| 3 | F0373–F0505 (6,2–8,4 s) | Trazar el perímetro, revelar divisiones y mostrar la lista con entradas escalonadas. SVG, CSS y GSAP. La interfaz se superpone al mismo mapa. |
| 4 | F0505–F0649 (8,4–10,8 s) | Revelar tarjetas y gráfico inferior. Replicar orden, opacidad y barrido de izquierda a derecha con máscara SVG o CSS. |
| 5 | F0649–F0871 (10,8–14,5 s) | Consola operativa. El clip mantiene el giro lento. TSUMI entrega el control al usuario al entrar en este estado. Se puede arrastrar, seleccionar un punto y consultar su ficha desde el mapa y la lista. |
| 6 | F0871–F1162 (14,5–19,35 s) | Salida escalonada y regreso al borde para un modo demo en loop. El dashboard operativo se queda en el estado interactivo. |
| 7 | Extensión TSUMI | Solicitar análisis real desde el punto seleccionado y presentar evidencia, unidades y fuentes en el HUD. El descenso por capas es una extensión del producto. |

Estado actual: la apertura y el globo interactivo se renderizan en Three.js con GSAP. La tabla anterior documenta el plan de réplica y usa Mapbox como referencia técnica. Si se incorpora Mapbox en una etapa posterior, habrá que instalar su SDK y configurar un token público para los estilos alojados. Los videos de referencia y las comparativas se conservan en la carpeta local ignorada por Git.

Fuentes: https://fuselabcreative.com/get-inspired/live-dashboard-ui-3d-webgl-globe/ y https://docs.mapbox.com/mapbox-gl-js/example/globe-spin/
