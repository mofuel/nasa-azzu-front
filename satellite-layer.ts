import * as THREE from 'three'

// Web Mercator imagery draped over the existing sphere; retain the global texture while loading.
export function satelliteLayer(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
  const group = new THREE.Group()
  scene.add(group)
  const loader = new THREE.TextureLoader()
  const cache = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>()
  const failed = new Set<string>()
  const inFlight = new Set<string>()
  let wanted = new Set<string>()
  let queue: {key: string; z: number; x: number; y: number}[] = []
  let pending = 0
  let disposed = false
  let signature = ''
  let nextUpdate = 0
  const reveal = {value: 1}
  const sunlight = {value: new THREE.Vector3(1, 1, 1).normalize()}
  const sunPower = {value: 1}
  const ambientPower = {value: .1}

  function geometry(z: number, x: number, y: number) {
    const n = 2 ** z
    const positions: number[] = [], uv: number[] = [], indices: number[] = []
    const segments = z <= 3 ? 32 : 16
    for (let row = 0; row <= segments; row++) {
      const v = row / segments
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + v) / n)))
      for (let col = 0; col <= segments; col++) {
        const u = col / segments
        const lon = (x + u) / n * Math.PI * 2 - Math.PI
        const radius = 1.0000001 + z * .00000001
        positions.push(radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lon))
        uv.push(u, 1 - v)
        if (row < segments && col < segments) {
          const a = row * (segments + 1) + col, b = a + segments + 1
          indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
      }
    }
    const mesh = new THREE.BufferGeometry()
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    mesh.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    mesh.setIndex(indices)
    mesh.computeVertexNormals()
    mesh.computeBoundingSphere()
    return mesh
  }

  function settle() {
    if (pending || queue.length || disposed) return
    for (const [key, mesh] of cache) mesh.visible = wanted.has(key)
    for (const [key, mesh] of cache) {
      if (cache.size <= 256) break
      if (wanted.has(key)) continue
      group.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.map?.dispose()
      mesh.material.dispose()
      cache.delete(key)
    }
  }

  function pump() {
    while (!disposed && pending < 6 && queue.length) {
      const tile = queue.shift()!
      if (!wanted.has(tile.key) || cache.has(tile.key) || failed.has(tile.key) || inFlight.has(tile.key)) continue
      pending++
      inFlight.add(tile.key)
      loader.load(
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/' + tile.z + '/' + tile.y + '/' + tile.x + '.jpg',
        texture => {
          pending--
          inFlight.delete(tile.key)
          if (disposed || !wanted.has(tile.key)) { texture.dispose(); pump(); return }
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
          const material = new THREE.MeshBasicMaterial({map: texture, side: THREE.FrontSide, depthTest: false, depthWrite: false})
          material.onBeforeCompile = shader => {
            shader.uniforms.satelliteReveal = reveal
            shader.uniforms.satelliteSun = sunlight
            shader.uniforms.satelliteSunPower = sunPower
            shader.uniforms.satelliteAmbient = ambientPower
            const newline = String.fromCharCode(10)
            shader.vertexShader = 'varying vec3 satelliteNormal;' + newline + shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>' + newline + 'satelliteNormal = normalize(mat3(modelMatrix) * normal);',
            )
            shader.fragmentShader = 'varying vec3 satelliteNormal; uniform float satelliteReveal; uniform vec3 satelliteSun; uniform float satelliteSunPower; uniform float satelliteAmbient;' + newline + shader.fragmentShader.replace(
              '#include <color_fragment>',
              '#include <color_fragment>' + newline + 'float daylight = max(dot(normalize(satelliteNormal), satelliteSun), 0.0); vec3 lighting = vec3(satelliteAmbient * 0.25) + vec3(1.0, 0.96, 0.90) * daylight * satelliteSunPower; diffuseColor.rgb *= mix(lighting, vec3(1.0), satelliteReveal);',
            )
          }
          const mesh = new THREE.Mesh(geometry(tile.z, tile.x, tile.y), material)
          cache.set(tile.key, mesh)
          mesh.renderOrder = 1 + tile.z / 100
          group.add(mesh)
          pump()
          settle()
        },
        undefined,
        () => { pending--; inFlight.delete(tile.key); failed.add(tile.key); pump(); settle() },
      )
    }
    settle()
  }

  return {
    update(blend: number, sun: THREE.DirectionalLight, ambient: number) {
      reveal.value = blend
      sunlight.value.copy(sun.position).normalize()
      sunPower.value = sun.intensity
      ambientPower.value = ambient
      const near = Math.max(.000005, Math.min(.01, (camera.position.length() - 1) * .1))
      if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix() }
      group.visible = true
      if (!group.visible || performance.now() < nextUpdate) return
      nextUpdate = performance.now() + 250
      const direction = camera.position.clone().normalize()
      const lat = Math.max(-1.48, Math.min(1.48, Math.asin(direction.y)))
      const lon = Math.atan2(-direction.z, direction.x)
      const height = Math.max(.0001, camera.position.length() - 1)
      const pixels = renderer.domElement.clientHeight
      const z = THREE.MathUtils.clamp(Math.ceil(Math.log2(2 * Math.PI * Math.cos(lat) * pixels / (256 * height * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))))), 3, 14)
      const n = 2 ** z
      const cx = Math.floor((lon / (2 * Math.PI) + .5) * n)
      const cy = Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n)
      const detail = camera.position.length() < 2.5
      const key = detail ? z + '/' + cx + '/' + cy : 'global'
      if (key === signature) return
      signature = key
      wanted = new Set()
      queue = []
      // The same imagery is used for both the global view and the zoomed surface.
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const key = '3/' + x + '/' + y
        wanted.add(key)
        const existing = cache.get(key)
        if (existing) existing.visible = true
        else queue.push({key, z: 3, x, y})
      }
      const radius = Math.min(6, Math.ceil(renderer.domElement.clientWidth / pixels * 2) + 2)
      for (let dy = -radius; detail && dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const x = ((cx + dx) % n + n) % n, y = cy + dy
        if (y < 0 || y >= n) continue
        const key = z + '/' + x + '/' + y
        if (wanted.has(key)) continue
        wanted.add(key)
        const existing = cache.get(key)
        if (existing) existing.visible = true
        else queue.push({key, z, x, y})
      }
      // Fetch the center before the perimeter so the selected place sharpens first.
      queue.sort((a, b) => Math.abs(a.y - cy) + Math.abs(a.x - cx) - Math.abs(b.y - cy) - Math.abs(b.x - cx))
      pump()
    },
    dispose() {
      disposed = true
      queue = []
      scene.remove(group)
      for (const mesh of cache.values()) {
        mesh.geometry.dispose()
        mesh.material.map?.dispose()
        mesh.material.dispose()
      }
      cache.clear()
    },
  }
}