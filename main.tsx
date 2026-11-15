import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import './style.css'

type Site = { id: string; name: string; lat: number; lon: number; coverage: string }
type Comparison = { id: string; label: string; variable: string; reference: string }
type Result = { earthValue: number; referenceValue: number; unit: string; difference: number; scale: string; limitation: string; sources: { title: string; url: string }[] }
type Analysis = { id: string; status: 'pending' | 'running' | 'completed' | 'insufficient_data' | 'failed'; result?: Result; message?: string }
const api = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '')
const localSites: Site[] = [
  { id: 'atacama', name: 'Desierto de Atacama', lat: -23.5, lon: -68.3, coverage: 'Caso ilustrativo' },
  { id: 'hawaii', name: 'Hawái', lat: 19.48, lon: -155.61, coverage: 'Sitio de referencia' },
  { id: 'mojave', name: 'Desierto de Mojave', lat: 35.03, lon: -115.48, coverage: 'Sitio de referencia' },
  { id: 'death-valley', name: 'Valle de la Muerte', lat: 36.24, lon: -116.82, coverage: 'Sitio de referencia' },
  { id: 'haughton', name: 'Cráter de Haughton', lat: 75.38, lon: -89.67, coverage: 'Sitio de referencia' },
  { id: 'iceland', name: 'Islandia', lat: 64.82, lon: -16.63, coverage: 'Sitio de referencia' },
  { id: 'antarctica', name: 'Antártida', lat: -77.6, lon: 162.9, coverage: 'Sitio de referencia' },
  { id: 'aso', name: 'Caldera de Aso', lat: 32.8849, lon: 131.085, coverage: 'Sitio exploratorio' },
  { id: 'klyuchevskoy', name: 'Volcán Kliuchevskói', lat: 56.056, lon: 160.642, coverage: 'Sitio exploratorio' },
  { id: 'ijen', name: 'Complejo volcánico de Ijen', lat: -8.058, lon: 114.242, coverage: 'Sitio exploratorio' },
  { id: 'rabaul', name: 'Caldera de Rabaul', lat: -4.2459, lon: 152.1937, coverage: 'Sitio exploratorio' },
  { id: 'ambrym', name: 'Volcán Ambrym', lat: -16.25, lon: 168.12, coverage: 'Sitio exploratorio' },
  { id: 'taupo', name: 'Caldera de Taupō', lat: -38.7811, lon: 175.893, coverage: 'Sitio exploratorio' }
]
const demoComparison = { id: 'demo', label: 'Comparación con Marte', variable: 'Material superficial', reference: 'Marte · región por definir' }
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(api + path, init)
  if (!response.ok) throw new Error('La API respondió con el código ' + response.status)
  return response.json()
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
  select.current = onSelect
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }) }
    catch { setUnavailable(true); onReady(); return }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7))
    el.append(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, .01, 60)
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enabled = false
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = false
    controls.rotateSpeed = .65
    controls.autoRotateSpeed = .20
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
      uniforms: { reveal: { value: 1 } },
      vertexShader: `
        varying vec2 markerUv;
        void main() {
          markerUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float reveal;
        varying vec2 markerUv;
        void main() {
          float radius = length(markerUv - 0.5);
          float ring = smoothstep(0.195, 0.22, radius) * (1.0 - smoothstep(0.275, 0.305, radius));
          float spread = (radius - 0.255) / 0.094;
          float glow = exp(-spread * spread) * 0.30;
          float edge = 1.0 - smoothstep(0.39, 0.49, radius);
          float alpha = max(ring, glow) * edge * reveal;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(0.28, 0.46, 0.86), vec3(0.70, 0.82, 1.0), ring), alpha);
        }
      `
    })
    const pins = new THREE.Group()
    scene.add(pins)
    markers.current = entries => {
      pins.clear()
      for (const site of entries) {
        const pin = new THREE.Mesh(pinGeo, pinMat)
        pin.position.copy(location(site, 1.006))
        pin.renderOrder = 3
        pin.userData.site = site
        pins.add(pin)
      }
    }
    let movement: gsap.core.Tween | undefined
    focus.current = site => {
      controls.autoRotate = false
      movement?.kill()
      const from = camera.position.clone().normalize()
      const to = location(site, 1).normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(from, to)
      const q = new THREE.Quaternion()
      const progress = { value: 0 }
      const distance = camera.position.length()
      movement = gsap.to(progress, { value: 1, duration: reduced ? 0 : .7, onUpdate: () => {
        q.identity().slerp(rotation, progress.value)
        camera.position.copy(from).applyQuaternion(q).multiplyScalar(distance)
      } })
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
      const radius = 1 / (2 * halfFov * Math.sqrt(camera.position.lengthSq() - 1))
      camera.zoom = Math.min(1, .44 * camera.aspect / radius)
      camera.updateProjectionMatrix()
    }

    function resizeViewport() {
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
      if (controls.enabled) fitInteractiveGlobe()
      else camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
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
        pin.scale.setScalar(camera.position.distanceTo(pin.position) * .021 * limbScale)
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
    const render = () => {
      const now = performance.now()
      const delta = Math.min((now - previousFrame) / 1000, .05)
      previousFrame = now
      if (cinematic) drawShot()
      controls.update(delta)
      updatePins()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()
    return () => {
      cancelAnimationFrame(frame)
      intro.kill()
      finish.current = null
      movement?.kill()
      size.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      controls.dispose()
      for (const asset of [geometry, material, texture, waterMask, normalMap, halo, rimMaterial, pinGeo, pinMat]) asset.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [])
  useEffect(() => { markers.current?.(sites) }, [sites])
  useEffect(() => { if (selected) focus.current?.(selected) }, [selected])
  useLayoutEffect(() => { if (!opening) finish.current?.() }, [opening])
  return <div className="globe" ref={host} aria-hidden="true">
    {unavailable && <div className="globe-fallback" />}
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
        <strong>{sample.value} {data.unit}</strong>
      </div>
    })}
  </div>
}

function ConsoleReadouts({ site, choice, analysis, data, error, onRetry }: {
  site?: Site; choice?: Comparison; analysis?: Analysis; data?: Result; error: string; onRetry: () => void
}) {
  const reference = choice?.reference ?? 'Referencia'
  const metrics = [
    { label: 'Variable', value: choice?.variable ?? '—' },
    { label: 'Tierra', value: data ? data.earthValue + ' ' + data.unit : '—' },
    { label: 'Referencia', value: data ? data.referenceValue + ' ' + data.unit : '—' },
    { label: 'Diferencia', value: data ? data.difference + ' ' + data.unit : '—' }
  ]
  const progress = analysis?.status === 'pending' || analysis?.status === 'running'
  const unavailable = analysis?.status === 'insufficient_data' || analysis?.status === 'failed'
  const status = progress ? 'Consultando el análisis…'
    : unavailable ? analysis.message ?? 'El análisis no devolvió mediciones comparables.'
    : !site ? 'Selecciona un sitio en la Tierra.'
    : !choice ? 'Este sitio no tiene una comparación disponible.'
    : !api ? 'La vista previa muestra el recorrido del sitio.'
    : 'Ejecuta el análisis para ver las mediciones.'

  return <>
    <div className="console-map-label" aria-hidden="true">
      <span className="console-label">TSUMI / ATLAS TERRESTRE</span>
      {site && <strong>{site.name}</strong>}
    </div>
    <div className="console-map-key" aria-hidden="true">
      <span className="console-key-dot" /> Sitios del catálogo
    </div>
    <section className="console-readouts" aria-label="Lecturas y comparación científica">
      <div className="console-metrics">
        {metrics.map((metric, index) => <div className="console-metric" key={metric.label}>
          <span className="console-label">{metric.label}</span>
          <strong>{metric.value}</strong>
          <i className={index % 2 ? 'console-metric-line alternate' : 'console-metric-line'} aria-hidden="true" />
        </div>)}
        <div className="console-minimap">
          <span className="console-label">Ubicación</span>
          <div className="console-map-preview" aria-hidden="true">
            {site && <i style={{ left: ((site.lon + 180) / 360 * 100) + '%', top: ((90 - site.lat) / 180 * 100) + '%' }} />}
          </div>
        </div>
      </div>
      <div className="console-chart">
        <div className="console-chart-title">
          <h2>Comparación científica</h2>
          <span className="console-label">{data?.unit ?? 'Tierra / Luna o Marte'}</span>
        </div>
        {data ? <ComparisonChart data={data} reference={reference} /> : <div className="console-chart-empty">
          {error ? <><p role="alert">{error}</p><button className="console-retry" onClick={onRetry}>Reintentar</button></> : <p role="status">{status}</p>}
        </div>}
        {data && <details className="console-evidence">
          <summary>Fuentes y límites</summary>
          <p>{data.scale}</p><p>{data.limitation}</p>
          <ul>{data.sources.filter(source => /^https?:\/\//i.test(source.url)).map(source => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul>
        </details>}
      </div>
    </section>
  </>
}

function App() {
  const [sites, setSites] = useState<Site[]>(api ? [] : localSites)
  const [site, setSite] = useState<Site>()
  const [choices, setChoices] = useState<Comparison[]>([])
  const [choiceId, setChoiceId] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [choiceError, setChoiceError] = useState('')
  const [loadingChoices, setLoadingChoices] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis>()
  const [showResult, setShowResult] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const [showIntro, setShowIntro] = useState(!reduced)
  const result = useRef<HTMLElement>(null)
  const explore = useRef<HTMLElement>(null)
  const choice = choices.find(c => c.id === choiceId)

  useEffect(() => {
    if (!api) return
    const controller = new AbortController()
    request<Site[]>('/sites', { signal: controller.signal }).then(setSites).catch(e => {
      if (!controller.signal.aborted) setCatalogError(e.message)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!site) return
    const controller = new AbortController()
    const options = api ? request<Comparison[]>('/sites/' + encodeURIComponent(site.id) + '/comparisons', { signal: controller.signal }) : Promise.resolve(site.id === 'atacama' ? [demoComparison] : [])
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
  }, [site])

  useEffect(() => {
    if (!showResult || !result.current) return
    result.current.focus({ preventScroll: true })
    result.current.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' })
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.fromTo('.dust', { opacity: .9, xPercent: -20 }, { opacity: 0, xPercent: 30, duration: 1.15 })
      gsap.fromTo('.terrain', { scale: 1.15 }, { scale: 1, duration: 1.4 })
      gsap.fromTo('.haze', { xPercent: -6 }, { xPercent: 0, duration: 1.4 })
      gsap.fromTo('.foreground', { yPercent: 18, scale: 1.12 }, { yPercent: 0, scale: 1, duration: 1.3 })
      gsap.fromTo('.result-panel', { y: 25, opacity: 0 }, { y: 0, opacity: 1, delay: .35, duration: .6 })
    }, result)
    return () => ctx.revert()
  }, [showResult])

  function pick(next: Site) {
    if (site?.id === next.id) return
    pending.current?.abort()
    setShowResult(false)
    setAnalysis(undefined)
    setError('')
    setChoices([])
    setChoiceId('')
    setChoiceError('')
    setLoadingChoices(true)
    setSite(next)
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
    if (!api) {
      setShowResult(true)
      return
    }
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
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'Error consultando el análisis')
    }
  }

  function back() {
    pending.current?.abort()
    explore.current?.focus({ preventScroll: true })
    setShowResult(false)
    explore.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' })
  }

  const data = analysis?.status === 'completed' ? analysis.result : undefined
  return <>
    <main>
      <section className={showIntro ? 'explore stars opening' : 'explore stars'} id="explorar" ref={explore} tabIndex={-1}>
        <Globe sites={sites} selected={site} onSelect={pick} opening={showIntro} onReady={() => setShowIntro(false)} />
        {showIntro && <button className="skip-orbit" onClick={() => setShowIntro(false)}>Saltar introducción</button>}
        {!showIntro && <div className="console-frame" aria-hidden="true" />}
        <div className="atlas-grid" inert={showIntro}>
          <aside className="panel" aria-label="Sitios y comparaciones">
            <p className="eyebrow">SITIOS</p>
            {catalogError && <p role="alert">{catalogError}</p>}
            {api && !sites.length && !catalogError && <p>No hay sitios disponibles en el catálogo.</p>}
            <div className="site-list" aria-label="Catálogo de sitios">
              {sites.map(entry => <button className="site-button" key={entry.id} aria-pressed={site?.id === entry.id} onClick={() => pick(entry)}><span>{entry.name}</span><span aria-hidden="true">↗</span></button>)}
            </div>
            {site && <div className="site-detail">
              <p className="coordinates">{site.lat.toFixed(2)}° LAT / {site.lon.toFixed(2)}° LON</p>
              <p>{site.coverage}</p>
              {loadingChoices && <p role="status">Consultando comparaciones…</p>}
              {choiceError && <p role="alert">{choiceError}</p>}
              {!choices.length && !loadingChoices && !choiceError && <p>No hay comparaciones disponibles para este sitio.</p>}
              {!!choices.length && <>
                <label htmlFor="comparison">Comparación</label>
                <select id="comparison" value={choiceId} onChange={event => selectComparison(event.target.value)}>{choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </>}
              {choice && <><p>{choice.variable} · {choice.reference}</p><button className="action" onClick={analyze}>{api ? 'Analizar' : 'Previsualizar descenso'} <span aria-hidden="true">↗</span></button></>}
            </div>}
            {!api && <p className="mode">Prototipo local · sin datos de análisis</p>}
          </aside>
        </div>
        {!showIntro && <ConsoleReadouts site={site} choice={choice} analysis={analysis} data={data} error={error} onRetry={analyze} />}
      </section>
      {showResult && <section className="results" ref={result} tabIndex={-1}>
        <div className="terrain" aria-hidden="true" /><div className="haze" aria-hidden="true" /><div className="foreground" aria-hidden="true" /><div className="dust" aria-hidden="true" />
        <div className="result-panel panel">
          <button className="back" onClick={back}>← Volver al globo</button>
          <p className="eyebrow">{site?.name}</p>
          <h2>{choice?.label}</h2>
          <p>Vista previa del paisaje. Las mediciones y sus fuentes aparecerán al conectar el backend científico.</p>
        </div>
      </section>}
    </main>
  </>
}
createRoot(document.getElementById('root')!).render(<App />)
