import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import './style.css'
import { satelliteLayer } from './satellite-layer'

type Site = { id: string; name: string; lat: number; lon: number; coverage: string }
type Comparison = { id: string; label: string; variable: string; reference: string }
type EarthContext = { months: string[]; resolutionDegrees: number; ndviMax: number | null; ndviValidMonths: number | null; lstDayMaxK: number | null; lstDayValidMonths: number | null; lstNightMinK: number | null; lstNightValidMonths: number | null; ndviThreshold: number; passesNdviScreen: boolean }
type Result = { earthValue: number; referenceValue: number; unit: string; difference: number; scale: string; limitation: string; sources: { title: string; url: string }[]; earthContext?: EarthContext | null }
type Analysis = { id: string; status: 'pending' | 'running' | 'completed' | 'insufficient_data' | 'failed'; result?: Result; message?: string }
type SearchState = {
  celdas: Record<string, number>; teselas: number; teselas_candidatas: number; ultima_actualizacion: string | null;
  trabajadores: { estado: string; celda_id: string | null; senal_reciente: boolean; actualizado_utc: string; celdas_elegibles: number | null }[];
  contexto_nasa: { meses: string[]; version_qa: string; umbral_ndvi: number } | null
}
const api = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') || '/api'
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const variableGuides: Record<string, { name: string; description: string; legend: string; difference: string }> = {
  pendiente_mediana: {
    name: 'Inclinación habitual',
    description: 'Resume qué tan inclinado es el terreno: la mitad de las pendientes está por debajo de este valor y la otra mitad, por encima.',
    legend: 'Se mide en grados (°). 0° es plano; un valor mayor indica un terreno más inclinado.',
    difference: 'de inclinación habitual'
  },
  pendiente_p90: {
    name: 'Zonas más inclinadas',
    description: 'Es la pendiente que no supera el 90 % del terreno. Ayuda a reconocer zonas exigentes para caminar o circular con un vehículo; no es la pendiente máxima.',
    legend: 'Se mide en grados (°). Un valor mayor indica pendientes más pronunciadas.',
    difference: 'de inclinación en el percentil 90'
  },
  relieve: {
    name: 'Desnivel del terreno',
    description: 'Mide la diferencia de altura entre las partes bajas y altas, dejando fuera el 5 % más bajo y el 5 % más alto.',
    legend: 'Se mide en metros (m). Un valor mayor indica más variación de altura, no mayor altitud sobre el mar.',
    difference: 'de desnivel'
  }
}

function variableGuide(choice: Comparison) {
  return variableGuides[choice.id.split('~').at(-1)!] ?? {
    name: choice.variable, description: '', legend: 'Las dos mediciones se muestran en la misma unidad.', difference: ''
  }
}

const number = (value: number) => value.toLocaleString('es', { maximumFractionDigits: 2 })
const coordinates = (site: Site) => `${number(Math.abs(site.lat))}° ${site.lat < 0 ? 'S' : 'N'}, ${number(Math.abs(site.lon))}° ${site.lon < 0 ? 'O' : 'E'}`
const catalogNames: Record<string, string> = {
  'TIE-SFVF': 'Campo volcánico de San Francisco',
  'TIE-SP-CRATER': 'Cráter SP'
}
const siteName = (site: Site) => site.name === site.id && site.id.startsWith('TIE-')
  ? catalogNames[site.id] ?? site.id.slice(4).toLowerCase().split('-').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
  : site.name

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(api + path, init)
  if (!response.ok) throw new Error('La API respondió con el código ' + response.status)
  try { return await response.json() }
  catch { throw new Error('El servicio no devolvió datos válidos.') }
}


function SearchActivity() {
  const [state, setState] = useState<SearchState>()
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let controller: AbortController
    async function refresh() {
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      try {
        const value = await request<SearchState>('/search/status', { signal })
        if (!signal.aborted) { setState(value); setUnavailable(false) }
      } catch {
        if (!signal.aborted) setUnavailable(true)
      }
    }
    void refresh()
    const timer = setInterval(refresh, 30000)
    return () => { clearInterval(timer); controller?.abort() }
  }, [])
  const recent = state?.trabajadores.filter(w => w.senal_reciente) ?? []
  const processing = !!state?.celdas.en_curso && recent.length > 0
  const title = !state ? 'Consultando actividad…'
    : !recent.length ? 'Sin señal reciente del trabajador'
    : processing ? 'Analizando terreno'
    : state.celdas.pendiente ? 'Cola preparada para analizar'
    : recent.some(w => w.estado === 'agotado') ? 'Áreas del perfil recorridas' : 'Esperando nuevas áreas'
  return <section className="search-activity" aria-label="Estado de la búsqueda" aria-live="polite">
    <strong><i className={processing && !unavailable ? 'activity-dot active' : 'activity-dot'} aria-hidden="true" />{unavailable ? 'Estado de búsqueda no disponible' : title}</strong>
    {state && !unavailable && <>
      <p>{number(state.celdas.pendiente ?? 0)} en cola · {number((state.celdas.hecha ?? 0) + (state.celdas.sin_datos ?? 0))} terminadas · {number(state.celdas.error ?? 0)} con error</p>
      <details><summary>Actividad y datos NASA</summary>
        <p>{number(state.teselas)} registros de relieve a distintas resoluciones; no son lugares únicos.</p>
        <p>{number(state.teselas_candidatas)} teselas candidatas a 60 m, pendientes de revisión científica.</p>
        {state.ultima_actualizacion && <p>Última celda terminada: <time dateTime={state.ultima_actualizacion}>{new Date(state.ultima_actualizacion).toLocaleString('es')}</time>.</p>}
        <p>{state.contexto_nasa ? `MODIS con control de calidad: ${state.contexto_nasa.meses.join(', ')}.` : 'Contexto NASA MODIS aún no disponible.'}</p>
        {!recent.length && <p>No podemos confirmar que el trabajador siga activo; esto no demuestra que esté detenido.</p>}
        <p>La búsqueda usa un perfil de NDVI bajo con datos suficientes. Puede excluir zonas con nieve, nubes o vegetación. Cuando se agotan las áreas seleccionadas, espera; no promete descubrimientos infinitos.</p>
      </details>
    </>}
    {unavailable && <p>Puedes seguir consultando los lugares y sus comparaciones.</p>}
  </section>
}


function EarthContextPanel({ context }: { context: EarthContext }) {
  const coverage = (n: number | null) => n === null ? 'cobertura no informada' : `${n}/${context.months.length} meses válidos`
  return <details className="console-evidence nasa-context">
    <summary>Contexto NASA terrestre · vegetación y temperatura</summary>
    <p>MODIS · {context.months.join(', ')} · píxel de {number(context.resolutionDegrees)}°, muestreado en el centro del lugar. No describe cada punto de la tesela.</p>
    <dl className="context-values">
      <div><dt>Vegetación · NDVI máximo</dt><dd>{context.ndviMax === null ? 'Sin dato válido' : context.ndviMax.toLocaleString('es', { maximumFractionDigits: 4 })}</dd><small>{coverage(context.ndviValidMonths)}</small></div>
      <div><dt>Mayor media mensual diurna</dt><dd>{context.lstDayMaxK === null ? 'Sin dato válido' : number(context.lstDayMaxK) + ' K'}</dd><small>{coverage(context.lstDayValidMonths)}</small></div>
      <div><dt>Menor media mensual nocturna</dt><dd>{context.lstNightMinK === null ? 'Sin dato válido' : number(context.lstNightMinK) + ' K'}</dd><small>{coverage(context.lstNightValidMonths)}</small></div>
    </dl>
    <p><strong>Cómo leerlo:</strong> NDVI es un indicador de vegetación, no una prueba de suelo desnudo. El umbral {number(context.ndviThreshold)} lo eligió el equipo, no NASA. {context.passesNdviScreen ? 'Cumple este filtro exploratorio.' : 'No cumple el filtro o faltan meses válidos.'}</p>
    <p>K significa kelvin. Estas temperaturas son contexto terrestre de los meses disponibles: no son extremos anuales, temperatura del aire, amplitud día/noche ni comparación térmica con la Luna o Marte.</p>
  </details>
}

function location(site: Pick<Site, 'lat' | 'lon'>, radius = 1.014) {
  const lat = THREE.MathUtils.degToRad(site.lat)
  const lon = THREE.MathUtils.degToRad(site.lon)
  return new THREE.Vector3(radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lon))
}

type MotionPoint = readonly [time: number, value: number]

function smoothTrack(points: readonly MotionPoint[]) {
  const slopes = points.slice(1).map(([time, value], i) =>
    (value - points[i][1]) / (time - points[i][0])
  )
  // A shared tangent preserves speed across adjacent segments without overshooting.
  const tangents = points.map((_, i) => {
    const left = slopes[i - 1] ?? 0
    const right = slopes[i] ?? 0
    return left * right > 0 ? 2 * left * right / (left + right) : 0
  })
  return (time: number) => {
    const end = points.findIndex(([at]) => at > time)
    if (end <= 0) return points[end === 0 ? 0 : points.length - 1][1]
    const [startTime, start] = points[end - 1]
    const [endTime, finish] = points[end]
    const duration = endTime - startTime
    const t = (time - startTime) / duration
    const remaining = 1 - t
    return THREE.MathUtils.lerp(start, finish, t * t * (3 - 2 * t)) +
      duration * t * remaining * (remaining * tangents[end - 1] - t * tangents[end])
  }
}

const INTRO_END = 6.5

const orbitX = smoothTrack([[0, 1.47], [.5, 1.44], [1, 1.35], [1.5, 1.10], [2, .93], [2.5, .748], [2.75, .669], [3, .607], [3.5, .55], [3.75, .518], [4, .5]])
const orbitY = smoothTrack([[0, .25], [.5, .27], [1, .31], [1.5, .43], [2.35, .473], [2.8, .473], [3.5, .50]])
const orbitRadius = smoothTrack([[0, 1.38], [.5, 1.35], [1, 1.24], [1.5, .91], [2, .71], [2.5, .508], [2.75, .437], [3, .366], [3.5, .29], [3.75, .267], [4, .25], [4.5, .27], [5, .312], [5.5, .346], [6, .381], [6.5, .398]])
const orbitAngle = smoothTrack([[0, -.56], [1, -.51], [1.5, -.43], [2, -.34], [2.5, -.23], [3, -.105], [4, .035], [4.5, .24], [5, .62], [5.5, 1.12], [6, 1.82], [6.5, 2.34]])
const orbitLatitude = smoothTrack([[0, 18], [4.4, 18], [6.5, 3]])
const surfaceReveal = smoothTrack([[0, 0], [4, 0], [5.5, 1]])
const markerReveal = smoothTrack([[0, 0], [5.03, 0], [5.23, .73], [5.55, 1]])
const solarX = smoothTrack([[0, .427], [.5, .436], [1, .429], [1.25, .393], [1.5, .307], [2, .18], [2.65, .107], [3, .126], [3.5, .23], [3.75, .296], [4, .335]])
const solarY = smoothTrack([[0, .25], [1, .25], [1.5, .23], [2, .26], [2.5, .26], [3, .282], [3.5, .34], [4, .35]])
const solarFlash = smoothTrack([[0, .36], [.5, .49], [1, .78], [1.55, 1], [3.48, .98], [3.74, .90], [4, .57], [4.85, 0]])
const solarOcclusion = smoothTrack([[0, 0], [3.59, 0], [3.74, .10], [3.92, .77], [4.06, 1]])
const neutralLighting = smoothTrack([[0, 0], [1.15, 0], [1.9, .63], [2.7, .63], [4, .38], [4.85, 0]])
const solarBloom = smoothTrack([[0, 0], [1.36, 0], [1.93, .68], [2.23, .65], [3.62, 0]])


function Globe({ sites, selected, onSelect, opening, onReady }: {
  sites: Site[]; selected?: Site; onSelect: (s: Site) => void; opening: boolean; onReady: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const focus = useRef<((s: Site) => void) | null>(null)
  const markers = useRef<((s: Site[]) => void) | null>(null)
  const finish = useRef<(() => void) | null>(null)
  const flare = useRef<HTMLDivElement>(null)
  const select = useRef(onSelect)
  const zoom = useRef<((factor: number) => void) | null>(null)
  const overview = useRef<(() => void) | null>(null)
  const selectedSite = useRef(selected)
  selectedSite.current = selected
  select.current = onSelect
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }) }
    catch { setUnavailable(true); onReady(); return }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7))
    renderer.domElement.setAttribute('aria-hidden', 'true')
    el.append(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, .01, 60)
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enabled = false
    controls.enablePan = false
    controls.enableZoom = true
    controls.minDistance = 1.0001
    controls.maxDistance = 8
    controls.enableDamping = false
    controls.rotateSpeed = .65
    controls.autoRotateSpeed = -.20
    const ambient = new THREE.AmbientLight(0xaac8ff, .85)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffecd4, 2.5)
    sun.position.set(2, 3, 4)
    scene.add(sun)
    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load(import.meta.env.BASE_URL + 'earth.jpg')
    const waterMask = textureLoader.load(import.meta.env.BASE_URL + 'earth-water-mask.jpg')
    const normalMap = textureLoader.load(import.meta.env.BASE_URL + 'earth-normal.jpg')
    texture.colorSpace = THREE.SRGBColorSpace
    const geometry = new THREE.SphereGeometry(1, 160, 112)
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      normalMap,
      normalScale: new THREE.Vector2(),
      roughness: 1
    })
    const daybreak = { value: 0 }
    const warmSun = new THREE.Color(0xffecd4)
    const neutralSun = new THREE.Color(0xf2f6ff)
    const surface = { value: 0 }
    const blueAmbient = new THREE.Color(0xaac8ff)
    const neutralAmbient = new THREE.Color(0xe1e5eb)
    const atlasSun = new THREE.Color(0xfffaf3)
    function setSurface(amount: number) {
      surface.value = amount
      material.normalScale.setScalar(.42 * amount)
      ambient.color.copy(blueAmbient).lerp(neutralAmbient, amount)
      ambient.intensity += .90 * amount
      sun.color.lerp(atlasSun, amount)
    }
    material.onBeforeCompile = shader => {
      shader.uniforms.daybreak = daybreak
      shader.uniforms.surface = surface
      shader.uniforms.waterMask = { value: waterMask }
      shader.fragmentShader = 'uniform float daybreak;\nuniform float surface;\nuniform sampler2D waterMask;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float terrainLight = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(terrainLight), 0.78 * daybreak);
        float ocean = smoothstep(0.34, 0.75, texture2D(waterMask, vMapUv).r);
        vec3 landColor = max(mix(vec3(terrainLight), diffuseColor.rgb, 1.70), vec3(0.0)) * 1.24;
        vec3 oceanColor = diffuseColor.rgb * vec3(0.60, 1.30, 1.90) + vec3(0.0015, 0.0160, 0.0500);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(landColor, oceanColor, ocean), surface);`
      ).replace(
        '#include <opaque_fragment>',
        `// Broad ocean glint in view space. The water mask keeps land matte.
        vec3 glintDirection = normalize(vec3(-0.43, 0.27, 0.86));
        float alignment = max(dot(nonPerturbedNormal, glintDirection), 0.0);
        float oceanGlint = 0.16 * pow(alignment, 64.0) + 0.026 * pow(alignment, 17.0);
        outgoingLight += vec3(0.79, 0.88, 1.0) * oceanGlint * ocean * surface;
        #include <opaque_fragment>`
      )
    }
    const earth = new THREE.Mesh(geometry, material)
    scene.add(earth)
    const satellite = satelliteLayer(scene, camera, renderer)
    const halo = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { strength: { value: .67 }, atlasLighting: surface },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); v=normalize(-p.xyz); n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*p;}',
      fragmentShader: `
        uniform float strength;
        uniform float atlasLighting;
        varying vec3 n;
        varying vec3 v;
        void main() {
          vec3 normal = normalize(n);
          float depth = abs(dot(normal, normalize(v)));
          float fade = smoothstep(0.0, 0.18, depth) * exp(-5.5 * depth);
          float original = 0.21 + 0.79 * smoothstep(-0.5, 0.7, -normal.x + 0.24 * normal.y);
          float upperLeft = smoothstep(-0.12, 0.94, dot(normal.xy, vec2(-0.76, 0.65)));
          vec3 color = mix(vec3(0.75, 0.82, 1.0), vec3(0.91, 0.94, 1.0), atlasLighting);
          gl_FragColor = vec4(color, fade * strength * mix(original, 1.8 * upperLeft, atlasLighting));
        }
      `
    })
    const atmosphere = new THREE.Mesh(geometry, halo)
    atmosphere.scale.setScalar(1.028)
    scene.add(atmosphere)
    const rimMaterial = halo.clone()
    rimMaterial.side = THREE.FrontSide
    rimMaterial.uniforms.dusk = { value: 0 }
    rimMaterial.uniforms.daybreak = daybreak
    rimMaterial.uniforms.atlasLighting = surface
    rimMaterial.fragmentShader = `
      uniform float strength;
      uniform float dusk;
      uniform float atlasLighting;
      uniform float daybreak;
      varying vec3 n;
      varying vec3 v;
      void main() {
        vec3 normal = normalize(n);
        float edge = pow(1.0 - max(dot(normal, normalize(v)), 0.0), mix(4.5, 2.75, daybreak));
        float lit = smoothstep(-0.45, 0.68, -normal.x + normal.y * 0.40);
        float leftRim = smoothstep(0.05, 0.91, -normal.x);
        float whiteRim = pow(1.0 - max(dot(normal, normalize(v)), 0.0), 3.8) * leftRim;
        float cinematicRim = mix(edge * lit * strength * (1.0 + 0.32 * daybreak), 0.96 * whiteRim, dusk);
        float upperLeft = smoothstep(-0.16, 0.96, dot(normal.xy, vec2(-0.76, 0.65)));
        float atlasRim = pow(1.0 - max(dot(normal, normalize(v)), 0.0), 6.5) * upperLeft * 0.63;
        gl_FragColor = vec4(0.93, 0.94, 1.0, mix(cinematicRim, atlasRim, atlasLighting));
      }
    `
    const rim = new THREE.Mesh(geometry, rimMaterial)
    rim.scale.setScalar(1.0006)
    rimMaterial.uniforms.strength.value = .22
    scene.add(rim)
    const pinGeo = new THREE.PlaneGeometry(1, 1)
    const pinMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: { reveal: { value: 1 }, highlight: { value: 0 } },
      vertexShader: `
        varying vec2 markerUv;
        void main() {
          markerUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float reveal;
        uniform float highlight;
        varying vec2 markerUv;
        void main() {
          float radius = length(markerUv - 0.5);
          float ring = smoothstep(0.195, 0.22, radius) * (1.0 - smoothstep(0.275, 0.305, radius));
          float spread = (radius - 0.255) / 0.094;
          float glow = exp(-spread * spread) * 0.30;
          float edge = 1.0 - smoothstep(0.39, 0.49, radius);
          float alpha = max(ring, glow) * edge * reveal;
          if (alpha < 0.01) discard;
          vec3 color = mix(vec3(0.28, 0.46, 0.86), vec3(0.70, 0.82, 1.0), ring);
          gl_FragColor = vec4(mix(color, vec3(1.0, 0.68, 0.27), highlight), alpha);
        }
      `
    })
    const selectedPinMat = pinMat.clone()
    selectedPinMat.uniforms.highlight.value = 1
    const pins = new THREE.Group()
    scene.add(pins)
    markers.current = entries => {
      pins.clear()
      for (const site of entries) {
        const pin = new THREE.Mesh(pinGeo, site.id === selectedSite.current?.id ? selectedPinMat : pinMat)
        pin.position.copy(location(site, 1.006))
        pin.renderOrder = site.id === selectedSite.current?.id ? 4 : 3
        pin.userData.site = site
        pins.add(pin)
      }
    }
    let movement: gsap.core.Tween | undefined
    let zoomed = false
    focus.current = site => {
      zoomed = true
      controls.autoRotate = false
      movement?.kill()
      for (const pin of pins.children) {
        (pin as THREE.Mesh).material = pin.userData.site.id === site.id ? selectedPinMat : pinMat
        pin.renderOrder = pin.userData.site.id === site.id ? 4 : 3
      }
      const from = camera.position.clone().normalize()
      const to = location(site, 1).normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(from, to)
      const q = new THREE.Quaternion()
      const progress = { value: 0 }
      const distance = camera.position.length()
      movement = gsap.to(progress, { value: 1, duration: reduced ? 0 : .7, onUpdate: () => {
        q.identity().slerp(rotation, progress.value)
        camera.position.copy(from).applyQuaternion(q).multiplyScalar(THREE.MathUtils.lerp(distance, 1.8, progress.value))
      } })
    }
    zoom.current = factor => {
      zoomed = true
      movement?.kill()
      controls.autoRotate = false
      camera.position.setLength(THREE.MathUtils.clamp(camera.position.length() * factor, controls.minDistance, controls.maxDistance))
      controls.update()
    }
    overview.current = () => {
      movement?.kill()
      controls.autoRotate = false
      zoomed = false
      fitInteractiveGlobe()
      controls.update()
    }
    const canvas = renderer.domElement
    const pointer = new THREE.Vector2()
    const ray = new THREE.Raycaster()
    let origin: [number, number] | undefined
    const down = (e: PointerEvent) => {
      if (controls.enabled) controls.autoRotate = false
      origin = [e.clientX, e.clientY]
      movement?.kill()
    }
    const interrupt = () => {
      zoomed = true
      controls.autoRotate = false
      movement?.kill()
    }
    controls.addEventListener('start', interrupt)
    const up = (e: PointerEvent) => {
      if (!controls.enabled) return
      const start = origin
      origin = undefined
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return
      const box = canvas.getBoundingClientRect()
      pointer.set((e.clientX - box.left) / box.width * 2 - 1, 1 - (e.clientY - box.top) / box.height * 2)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects(pins.children.filter(pin => pin.visible))[0]
      const surface = ray.intersectObject(earth)[0]
      if (hit && (!surface || hit.distance < surface.distance)) select.current(hit.object.userData.site)
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    function fitInteractiveGlobe() {
      if (!zoomed) {
        const radius = Math.min(.398, .43 * camera.aspect)
        camera.position.setLength(Math.hypot(1, 1 / (2 * radius * halfFov)))
      }
      camera.zoom = 1
      camera.updateProjectionMatrix()
    }

    let repaintAfterResize: (() => void) | undefined
    function resizeViewport() {
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
      if (controls.enabled) fitInteractiveGlobe()
      else camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
      repaintAfterResize?.()
    }
    resizeViewport()
    const size = new ResizeObserver(resizeViewport)
    size.observe(el)
    const intro = gsap.timeline({ paused: true })
    // Screen positions are measured on the reference at 496 × 368.
    // Radius is expressed in viewport heights so it is preserved on wider screens.
    const shot = { light: .032, shadow: -9, settle: 0, emergence: 0, dawn: 1, edgeLight: .46, streak: 1 }
    const referenceAspect = 496 / 368


    let cinematic = opening
    function drawShot() {
      const time = intro.time()
      const flash = solarFlash(time)
      const occultation = solarOcclusion(time)
      const fit = THREE.MathUtils.smoothstep(time, 4, INTRO_END)
      const radius = Math.min(orbitRadius(time), THREE.MathUtils.lerp(orbitRadius(time), .44 * camera.aspect, fit))
      const distance = Math.hypot(1, 1 / (2 * radius * halfFov))
      const longitude = 110 + THREE.MathUtils.radToDeg(orbitAngle(time))
      camera.position.copy(location({ lat: orbitLatitude(time), lon: longitude }, distance))
      pinMat.uniforms.reveal.value = markerReveal(time)
      camera.lookAt(0, 0, 0)
      camera.zoom = 1
      camera.updateProjectionMatrix()
      camera.projectionMatrix.elements[8] = -2 * (orbitX(time) - .5) * referenceAspect / camera.aspect
      camera.projectionMatrix.elements[9] = 2 * (orbitY(time) - .5)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      daybreak.value = neutralLighting(time)
      sun.color.copy(warmSun).lerp(neutralSun, daybreak.value)
      ambient.intensity = shot.light * (1 - .55 * shot.dawn) + .08 * occultation * (1 - shot.settle)
      sun.position.set(-9, 4.5, shot.shadow).applyQuaternion(camera.quaternion)
      setSurface(surfaceReveal(time))
      atmosphere.scale.setScalar(THREE.MathUtils.lerp(1.028, 1.017, surface.value))
      sun.intensity = THREE.MathUtils.lerp((1.1 + 1.7 * flash) * (1 - .74 * shot.dawn), 2.1, shot.settle)
      halo.uniforms.strength.value = THREE.MathUtils.lerp((.24 + .52 * flash) * (.15 + .85 * shot.emergence), .67, shot.settle)
      rimMaterial.uniforms.strength.value = THREE.MathUtils.lerp((.09 + 1.30 * flash) * (.51 + .49 * shot.emergence), .22, shot.settle)
      rimMaterial.uniforms.dusk.value = occultation * (1 - shot.settle)
      if (flare.current) {
        const discOpacity = THREE.MathUtils.clamp((flash - .3) * 1.6, 0, 1) * shot.emergence * (1 - occultation)
        el.style.setProperty('--solar-x', (50 + (solarX(time) - .5) * 100 * referenceAspect / camera.aspect) + '%')
        el.style.setProperty('--solar-y', solarY(time) * 100 + '%')
        el.style.setProperty('--solar-disc-opacity', String(discOpacity * flash))
        el.style.setProperty('--orbital-haze', String(occultation * (1 - shot.settle)))
        flare.current.style.setProperty('--streak', String(shot.streak))
        flare.current.style.setProperty('--daybreak', String(solarBloom(time)))
        flare.current.style.setProperty('--flare', String(flash))
        flare.current.style.setProperty('--disc', String(discOpacity))
        flare.current.style.setProperty('--afterglow', String(occultation))
        flare.current.style.setProperty('--limb-glow', String((1 - shot.emergence) * flash))
        flare.current.style.setProperty('--edge-light', String(shot.edgeLight))
      }
    }
    function updatePins() {
      for (const pin of pins.children) {
        const facing = camera.position.dot(pin.position)
        pin.visible = facing > 1.01 && pinMat.uniforms.reveal.value > 0
        if (!pin.visible) continue
        pin.quaternion.copy(camera.quaternion)
        const limbScale = THREE.MathUtils.smoothstep(facing, 1.01, 1.14)
        pin.scale.setScalar(camera.position.distanceTo(pin.position) * .03 * limbScale * (pin.userData.site.id === selectedSite.current?.id ? 2 : 1))
      }
    }

    function prepareInteractiveView() {
      intro.pause(INTRO_END, true)
      drawShot()
      cinematic = false
      controls.enabled = true
      controls.autoRotate = !reduced
      fitInteractiveGlobe()
      pinMat.uniforms.reveal.value = 1
      controls.update()
      updatePins()
      renderer.render(scene, camera)
    }
    finish.current = () => {
      if (!cinematic) return
      prepareInteractiveView()
      onReady()
    }
    intro.to(shot, { emergence: .12, dawn: .91, edgeLight: .72, shadow: -9, duration: .5, ease: 'sine.inOut' }, 0)
      .to(shot, { emergence: .46, dawn: .55, edgeLight: 1, shadow: -9, duration: .5, ease: 'sine.inOut' }, .5)
      .to(shot, { emergence: 1, dawn: 0, edgeLight: 0, shadow: -5.4, duration: .5, ease: 'sine.inOut' }, 1)
      .to(shot, { streak: .30, duration: .25, ease: 'sine.inOut' }, 1)
      .to(shot, { streak: .62, duration: .25, ease: 'sine.out' }, 1.25)
      .to(shot, { streak: 1, duration: .35, ease: 'sine.inOut' }, 1.5)
      .to(shot, { light: .16, duration: .5, ease: 'none' }, 1.5)
      .to(shot, { shadow: -8, duration: .78, ease: 'sine.inOut' }, 3.3)
      .to(shot, { light: .65, settle: 1, duration: .85, ease: 'sine.out' }, 4)
      .to(el, {'--handoff-progress': 1, duration: .9, ease: 'sine.inOut'}, INTRO_END - .9)
      .to(el.querySelector('.imagery-credit'), {autoAlpha: opening ? 0 : 1, duration: .25, ease: 'sine.out'}, INTRO_END - .4)
      .call(() => finish.current?.(), [], INTRO_END)
    if (cinematic) {
      controls.enabled = false
      drawShot()
      intro.play()
    } else {
      prepareInteractiveView()
    }
    let frame = 0
    let previousFrame = performance.now()
    const paint = () => {
      satellite.update(cinematic ? THREE.MathUtils.smoothstep(intro.time(), 4.4, INTRO_END) : 1, sun, ambient.intensity)
      updatePins()
      renderer.render(scene, camera)
    }
    // Resizing clears the WebGL buffer; repaint before the browser composites it.
    repaintAfterResize = () => {
      if (cinematic) drawShot()
      paint()
    }
    const render = () => {
      const now = performance.now()
      const delta = Math.min((now - previousFrame) / 1000, .05)
      previousFrame = now
      if (cinematic) drawShot()
      controls.update(delta)
      paint()
      frame = requestAnimationFrame(render)
    }
    render()
    return () => {
      cancelAnimationFrame(frame)
      intro.kill()
      finish.current = null
      focus.current = null
      markers.current = null
      zoom.current = null
      overview.current = null
      movement?.kill()
      size.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      controls.removeEventListener('start', interrupt)
      controls.dispose()
      for (const asset of [geometry, material, texture, waterMask, normalMap, halo, rimMaterial, pinGeo, pinMat, selectedPinMat]) asset.dispose()
      satellite.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [])
  useEffect(() => { markers.current?.(sites) }, [sites])
  useEffect(() => { if (selected) focus.current?.(selected) }, [selected])
  useLayoutEffect(() => { if (!opening) finish.current?.() }, [opening])
  return <div className="globe" ref={host}>
    {unavailable && <div className="globe-fallback" />}
    {!opening && !unavailable && <div className="globe-tools" aria-label="Controles del globo">
      <button onClick={() => zoom.current?.(.8)} aria-label="Acercar">+</button>
      <button onClick={() => zoom.current?.(1.25)} aria-label="Alejar">−</button>
      <button onClick={() => overview.current?.()}>Vista global</button>
      {selected && <button onClick={() => focus.current?.(selected)}>Volver al lugar</button>}
    </div>}
    {!unavailable && <a key={opening ? "intro-credit" : "map-credit"} className="imagery-credit" href="https://maps.eox.at/" target="_blank" rel="noreferrer">Sentinel-2 2016 · EOX · Copernicus · CC BY 4.0</a>}
    {unavailable && <p className="map-unavailable" role="status">No se pudo cargar el globo. Puedes consultar los lugares y sus datos en la lista.</p>}
    {opening && <>
      <div className="orbital-haze" />
      <div className="solar-disc" />
      <div className="solar-flare" ref={flare}><div className="solar-afterglow" /><div className="solar-limb-light" /><div className="solar-daybreak" /></div>
    </>}
  </div>
}

function ComparisonChart({ data, reference }: { data: Result; reference: string }) {
  const samples = [
    { label: 'Tierra', value: data.earthValue, color: 'earth' },
    { label: reference, value: data.referenceValue, color: 'reference' }
  ]
  const low = Math.min(0, ...samples.map(sample => sample.value))
  const high = Math.max(0, ...samples.map(sample => sample.value))
  const span = high - low || 1
  const zero = (0 - low) / span * 100

  return <div className="console-series">
    {samples.map(sample => {
      const position = (sample.value - low) / span * 100
      return <div className="console-bar-row" key={sample.color}>
        <span>{sample.label}</span>
        <div className="console-bar-track" aria-hidden="true">
          <i className="console-zero" style={{ left: zero + '%' }} />
          <i className={'console-bar ' + sample.color} style={{
            left: Math.min(position, zero) + '%',
            width: Math.abs(position - zero) + '%'
          }} />
        </div>
        <strong>{number(sample.value)} {data.unit}</strong>
      </div>
    })}
  </div>
}

function ComparisonControls({ site, choices, choice, loading, choiceError, analysis, onCompare, onChoice, onRetryChoices }: {
  site?: Site; choices: Comparison[]; choice?: Comparison; loading: boolean; choiceError: string;
  analysis?: Analysis; onCompare: () => void;
  onChoice: (id: string) => void; onRetryChoices: () => void
}) {
  const reference = choice?.reference ?? 'Referencia'
  const references = [...new Set(choices.map(c => c.reference))]
  const guide = choice && variableGuide(choice)
  const progress = analysis?.status === 'pending' || analysis?.status === 'running'
  return <section className="comparison-controls" aria-label="Configurar comparación">
    {loading && <p role="status">Buscando las comparaciones de este lugar…</p>}
    {choiceError && <div role="alert"><p>{choiceError}</p><button className="console-retry" onClick={onRetryChoices}>Reintentar comparaciones</button></div>}
    {site && !loading && !choiceError && !choices.length && <p role="status">Todavía no hay comparaciones para este lugar. Prueba con otro.</p>}
    {choice && guide && <>
      <label htmlFor="reference">2. Elige una región de la Luna o Marte</label>
      <select id="reference" value={reference} onChange={event => {
        const options = choices.filter(c => c.reference === event.target.value)
        onChoice((options.find(c => c.variable === choice.variable) ?? options[0]).id)
      }}>
        {references.map(ref => <option key={ref}>{ref}</option>)}
      </select>
      <fieldset className="variable-picker">
        <legend>3. ¿Qué quieres comparar?</legend>
        <div className="variable-options">
          {choices.filter(c => c.reference === reference).map(c => <label className="variable-option" key={c.id}>
            <input type="radio" name="variable" value={c.id} checked={choice.id === c.id} onChange={() => onChoice(c.id)} />
            <span><strong>{variableGuide(c).name}</strong><small>{c.variable}</small></span>
          </label>)}
        </div>
      </fieldset>
      <button className="action" onClick={onCompare} disabled={progress}>{progress ? 'Consultando datos…' : 'Ver comparación'}</button>
    </>}
  </section>
}

function ConsoleReadouts({ site, choice, analysis, data, error }: {
  site?: Site; choice?: Comparison; analysis?: Analysis; data?: Result; error: string
}) {
  const reference = choice?.reference ?? 'Referencia'
  const guide = choice && variableGuide(choice)
  const progress = analysis?.status === 'pending' || analysis?.status === 'running'
  const unavailable = analysis?.status === 'insufficient_data' || analysis?.status === 'failed'
  const outcome = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!data) return
    outcome.current?.focus({ preventScroll: true })
    outcome.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'instant' : 'smooth' })
  }, [data])
  return <section id="comparacion" className="console-readouts" aria-label="Comparación del terreno">
    <div className="console-metrics" aria-label="Mediciones del lugar">
      {choice && guide && <div className="console-metric">
        <span className="console-label">Variable</span><strong>{guide.name}</strong><small>{choice.variable}</small>
      </div>}
      {data && [
        { label: 'Tierra', value: data.earthValue },
        { label: 'Referencia', value: data.referenceValue },
        { label: 'Diferencia', value: data.difference }
      ].map(metric => <div className="console-metric" key={metric.label}>
        <span className="console-label">{metric.label}</span><strong>{number(metric.value)} {data.unit}</strong>
        <i className="console-metric-line" aria-hidden="true" />
      </div>)}
      {site && <div className="console-minimap">
        <span className="console-label">Ubicación</span>
        <div className="console-map-preview" aria-hidden="true">
          <i style={{ left: (site.lon + 180) / 360 * 100 + '%', top: (90 - site.lat) / 180 * 100 + '%' }} />
        </div>
        <small>{coordinates(site)}</small>
      </div>}
    </div>
    <div className="console-chart">
      <h2>Comparación del relieve</h2>
      {guide && <div className="variable-guide">
        {guide.description && <p>{guide.description}</p>}
        <p className="variable-legend"><strong>Cómo leerla:</strong> {guide.legend}</p>
      </div>}
      {!site && <p className="console-chart-empty">Elige un lugar de la lista o un punto del globo para empezar.</p>}
      {site && !data && !analysis && !error && <p className="console-chart-empty">Elige la región y una variable en el panel lateral. Pulsa «Ver comparación» para consultar sus mediciones.</p>}
      {progress && <p role="status">Estamos consultando las mediciones.</p>}
      {error && <p role="alert">{error} Puedes volver a intentarlo desde el panel lateral.</p>}
      {unavailable && <p role="status">{analysis.message ?? 'Aún no hay mediciones suficientes para comparar este terreno.'}</p>}
    {data && guide && <div className="comparison-result" aria-live="polite" ref={outcome} tabIndex={-1}>
      <h3>{guide.name}: Tierra frente a {reference}</h3>
      <ComparisonChart data={data} reference={reference} />
      <div className="chart-legend" aria-label="Leyenda del gráfico">
        <span><i className="earth-swatch" aria-hidden="true" /> Lugar terrestre</span>
        <span><i className="reference-swatch" aria-hidden="true" /> Mediana de la región de referencia</span>
      </div>
      <p className="difference">{data.difference === 0
        ? 'Los dos valores coinciden en esta medida.'
        : `El lugar terrestre tiene ${number(Math.abs(data.difference))} ${data.unit} ${data.difference > 0 ? 'más' : 'menos'} ${guide.difference} que la referencia.`}</p>
      <p className="comparison-caution">Un valor parecido en una medida no significa que los lugares sean iguales ni que el sitio sea apto para una misión.</p>
      {data.earthContext && <EarthContextPanel context={data.earthContext} />}
      <details className="console-evidence"><summary>Escala y método de comparación</summary><p>{data.scale}</p></details>
      <details className="console-evidence"><summary>Contexto ambiental y límites</summary><p>{data.limitation}</p></details>
      <details className="console-evidence">
        <summary>Fuentes de datos</summary>
        <ul>{data.sources.filter(source => /^https?:\/\//i.test(source.url)).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
      </details>
    </div>}
    </div>
  </section>
}

function App() {
  const [sites, setSites] = useState<Site[]>([])
  const [site, setSite] = useState<Site>()
  const [choices, setChoices] = useState<Comparison[]>([])
  const [choiceId, setChoiceId] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [choiceAttempt, setChoiceAttempt] = useState(0)
  const [choiceError, setChoiceError] = useState('')
  const [loadingChoices, setLoadingChoices] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis>()
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const map = useRef<HTMLDivElement>(null)
  const [showIntro, setShowIntro] = useState(!reduced)
  const choice = choices.find(c => c.id === choiceId)

  useEffect(() => {
    const controller = new AbortController()
    setLoadingCatalog(true)
    setCatalogError('')
    request<Site[]>('/sites', { signal: controller.signal }).then(setSites).catch(e => {
      if (!controller.signal.aborted) setCatalogError('No se pudo cargar la lista de lugares. ' + e.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingCatalog(false)
    })
    return () => controller.abort()
  }, [catalogAttempt])

  useEffect(() => {
    if (!site) return
    const controller = new AbortController()
    setLoadingChoices(true)
    setChoiceError('')
    const options = request<Comparison[]>('/sites/' + encodeURIComponent(site.id) + '/comparisons', { signal: controller.signal })
    options.then(values => {
      if (controller.signal.aborted) return
      setChoices(values)
      setChoiceId(values[0]?.id ?? '')
    }).catch(e => {
      if (!controller.signal.aborted) setChoiceError(e.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingChoices(false)
    })
    return () => controller.abort()
  }, [site?.id, choiceAttempt])

  function pick(next: Site) {
    setSite({ ...next })
    map.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'instant' : 'smooth' })
    if (site?.id === next.id) return
    pending.current?.abort()
    setAnalysis(undefined)
    setError('')
    setChoices([])
    setChoiceId('')
    setChoiceError('')
    setLoadingChoices(true)
  }

  function selectComparison(id: string) {
    pending.current?.abort()
    setChoiceId(id)
    setAnalysis(undefined)
    setError('')
  }

  async function analyze() {
    if (!site || !choice) return
    pending.current?.abort()
    setError('')
    setAnalysis({ id: '', status: 'pending' })
    const controller = new AbortController()
    pending.current = controller
    const signal = controller.signal
    try {
      let response = await request<Analysis>('/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ siteId: site.id, comparisonId: choice.id })
      })
      while (!signal.aborted) {
        setAnalysis(response)
        if (response.status !== 'pending' && response.status !== 'running') break
        await new Promise(resolve => setTimeout(resolve, 1300))
        if (signal.aborted) break
        response = await request<Analysis>('/analyses/' + encodeURIComponent(response.id), { signal })
      }
    } catch (e) {
      if (!signal.aborted) {
        setAnalysis(undefined)
        setError(e instanceof Error ? e.message : 'No se pudo obtener el análisis.')
      }
    }
  }

  const data = analysis?.status === 'completed' ? analysis.result : undefined
  return <>
    <main>
      <section className={showIntro ? 'explore stars opening' : 'explore stars'} id="explorar">
        <Globe sites={sites} selected={site} onSelect={pick} opening={showIntro} onReady={() => setShowIntro(false)} />
        {!showIntro && <div className="console-frame" aria-hidden="true" />}
        <div className="map-stage" ref={map} role="region" aria-label="Ubicación en el globo">
          {!showIntro && <>
            <div className="map-heading">
              <span className="console-label">TZUMY / ATLAS TERRESTRE</span>
              <strong>{site ? siteName(site) : 'Encuentra un lugar para comparar'}</strong>
              <p>{site ? coordinates(site) : 'Arrastra para girar · selecciona un punto para acercarte'}</p>
            </div>
            <div className="map-legend" aria-label="Leyenda del mapa">
              <span><i className="earth-swatch" aria-hidden="true" /> Lugar del catálogo</span>
              <span><i className="selected-swatch" aria-hidden="true" /> Tu selección</span>
              <small>Detalle satelital progresivo al acercarse.</small>
            </div>
          </>}
        </div>
        {showIntro && <button className="skip-orbit" onClick={() => setShowIntro(false)}>Saltar introducción</button>}
        <div className="atlas-grid" inert={showIntro}>
          <aside className="panel" aria-label="Lugares terrestres">
            <p className="eyebrow">TZUMY · ATLAS</p>
            <h1>Análogos terrestres</h1>
            <p>Explora lugares de la Tierra y compara su relieve con regiones de la Luna o Marte.</p>
            <SearchActivity />
            <h2>1. Elige un lugar</h2>
            {loadingCatalog && <p role="status">Cargando lugares…</p>}
            {catalogError && <div role="alert"><p>{catalogError}</p><button className="console-retry" onClick={() => setCatalogAttempt(n => n + 1)}>Reintentar catálogo</button></div>}
            {!loadingCatalog && !sites.length && !catalogError && <p>No hay lugares disponibles todavía.</p>}
            <div className="site-list" aria-label="Catálogo de sitios">
              {[
                { name: 'Sitios registrados', candidate: false },
                { name: 'Candidatos detectados', candidate: true }
              ].map(group => {
                const entries = sites.filter(entry => entry.id.startsWith('T~') === group.candidate)
                return entries.length > 0 && <div className="site-group" key={group.name}>
                  <h3>{group.name} <span>({entries.length})</span></h3>
                  {entries.map(entry => <button className="site-button" key={entry.id} aria-pressed={site?.id === entry.id} onClick={() => pick(entry)}><span>{siteName(entry)}</span><span aria-hidden="true">↗</span></button>)}
                </div>
              })}
            </div>
            {site && <div className="site-detail">
              <h3>{siteName(site)}</h3>
              <p className="coordinates">{coordinates(site)}</p>
              <p>{site.coverage}</p>
              <a href="#comparacion" className="compare-link">Comparar este lugar ↓</a>
            </div>}
            <ComparisonControls site={site} choices={choices} choice={choice} loading={loadingChoices} choiceError={choiceError}
              analysis={analysis} onCompare={analyze} onChoice={selectComparison} onRetryChoices={() => setChoiceAttempt(n => n + 1)} />
            <details className="catalog-legend"><summary>¿Qué significa «candidato»?</summary>
              <p>«3/3» indica que las tres medidas de relieve están dentro del rango de la referencia, no un 100 % de similitud. Es una preselección para investigar, no un análogo confirmado ni un sitio aprobado por NASA.</p>
              <p>Los sitios registrados también incluyen referencias y controles; estar en la lista no implica validación.</p>
            </details>
          </aside>
        </div>
        {!showIntro && <ConsoleReadouts site={site} choice={choice} analysis={analysis} data={data} error={error} />}
      </section>
    </main>
  </>
}
createRoot(document.getElementById('root')!).render(<App />)
