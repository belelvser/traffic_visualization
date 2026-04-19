const THREE_URLS = [
  'https://esm.sh/three@0.162.0',
  'https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js',
  'https://unpkg.com/three@0.162.0/build/three.module.js?module',
];

const ORBIT_CONTROLS_URLS = [
  'https://esm.sh/three@0.162.0/examples/jsm/controls/OrbitControls',
  'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/controls/OrbitControls.js?module',
  'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js?module',
];

const TOPOJSON_URLS = [
  'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm',
  'https://esm.sh/topojson-client@3',
];

async function importFromCandidates(urls, moduleLabel) {
  for (const url of urls) {
    try {
      return await import(url);
    } catch (error) {
      console.warn(`Failed to load ${moduleLabel} from ${url}`, error);
    }
  }

  throw new Error(`Could not load ${moduleLabel} from any CDN`);
}

function showBootError(message) {
  const errorEl = document.createElement('div');
  errorEl.style.position = 'fixed';
  errorEl.style.left = '50%';
  errorEl.style.top = '50%';
  errorEl.style.transform = 'translate(-50%, -50%)';
  errorEl.style.zIndex = '9999';
  errorEl.style.maxWidth = '640px';
  errorEl.style.padding = '16px 18px';
  errorEl.style.border = '1px solid rgba(255, 110, 110, 0.45)';
  errorEl.style.borderRadius = '12px';
  errorEl.style.background = 'rgba(26, 2, 2, 0.92)';
  errorEl.style.color = '#ffdede';
  errorEl.style.font = '500 14px/1.45 Inter, Arial, sans-serif';
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
}

async function bootstrap() {
  try {
    const THREE = await importFromCandidates(THREE_URLS, 'three');
    const controlsModule = await importFromCandidates(ORBIT_CONTROLS_URLS, 'OrbitControls');
    const topojsonModule = await importFromCandidates(TOPOJSON_URLS, 'topojson-client');

    const { OrbitControls } = controlsModule;
    const { mesh, feature } = topojsonModule;

    startApp(THREE, OrbitControls, mesh, feature);
  } catch (error) {
    console.error('Traffic globe bootstrap failed:', error);
    showBootError('Could not initialize 3D scene. Check browser console. If module-load errors appear, allow access to jsdelivr/unpkg/esm.sh and refresh.');
  }
}

bootstrap();

function startApp(THREE, OrbitControls, mesh, feature) {

const container = document.getElementById('globe');
const tooltip = document.getElementById('tooltip');
const totalPacketsEl = document.getElementById('totalPackets');
const suspiciousPacketsEl = document.getElementById('suspiciousPackets');
const visiblePointsEl = document.getElementById('visiblePoints');
const toggleRotationBtn = document.getElementById('toggleRotation');
const toggleSuspiciousBtn = document.getElementById('toggleSuspicious');

if (!container || !tooltip || !totalPacketsEl || !suspiciousPacketsEl || !visiblePointsEl || !toggleRotationBtn || !toggleSuspiciousBtn) {
  showBootError('Required DOM elements are missing. Check index.html markup.');
  throw new Error('Required DOM elements are missing');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02070d);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 28;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
scene.add(ambientLight);

const rimLight = new THREE.DirectionalLight(0x9edcff, 1.1);
rimLight.position.set(8, 5, 10);
scene.add(rimLight);

const hemisphereLight = new THREE.HemisphereLight(0x8ed7ff, 0x021117, 0.72);
scene.add(hemisphereLight);

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globeRadius = 5;

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(globeRadius, 96, 96),
  new THREE.MeshStandardMaterial({
    color: 0x061427,
    emissive: 0x02060c,
    emissiveIntensity: 0.3,
    roughness: 0.9,
    metalness: 0.05,
  })
);
globeGroup.add(globe);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(globeRadius + 0.18, 96, 96),
  new THREE.MeshBasicMaterial({
    color: 0x4cc8ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
  })
);
globeGroup.add(atmosphere);

const packetsGroup = new THREE.Group();
globeGroup.add(packetsGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const FADE_DURATION_MS = 12000;
const MAX_VISIBLE_POINTS = 420;
const ACTIVE_COLOR = new THREE.Color(0xbdff00);
const PACKET_SCALE_NORMAL = 0.18;
const PACKET_SCALE_SUSPICIOUS = 0.26;
const PACKET_OPACITY_NORMAL = 0.74;
const PACKET_OPACITY_SUSPICIOUS = 0.92;
const CURSOR_STORAGE_KEY = 'traffic.packetCursor';
const META_AFTER_VALUE = 2147483647;

let totalPackets = 0;
let suspiciousPackets = 0;
let packetCursor = readStoredCursor();
let showOnlySuspicious = false;
let packetHistory = [];
let visibleEntries = [];

function readStoredCursor() {
  try {
    const raw = window.localStorage.getItem(CURSOR_STORAGE_KEY);
    if (raw === null) {
      return null;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveCursor(cursor) {
  try {
    window.localStorage.setItem(CURSOR_STORAGE_KEY, String(cursor));
  } catch (error) {
    // Ignore storage errors (private mode / disabled storage).
  }
}

function clearVisiblePackets() {
  for (const entry of visibleEntries) {
    packetsGroup.remove(entry.sprite);
    entry.sprite.material.dispose();
  }

  visibleEntries = [];
  packetHistory = [];
  suspiciousPackets = 0;
}

async function initializePacketCursor() {
  try {
    const response = await fetch(`/packets?after=${META_AFTER_VALUE}`);
    if (!response.ok) {
      throw new Error(`Cursor init failed with status ${response.status}`);
    }

    const data = await response.json();
    const serverTotalPackets = Math.max(0, Number.parseInt(data.total_packets, 10) || 0);

    totalPackets = serverTotalPackets;

    if (packetCursor === null) {
      packetCursor = serverTotalPackets;
    } else if (packetCursor > serverTotalPackets) {
      packetCursor = serverTotalPackets;
      clearVisiblePackets();
    }

    saveCursor(packetCursor);
    updateStats();
  } catch (error) {
    console.error('Packet cursor init error:', error);
    if (packetCursor === null) {
      packetCursor = 0;
      saveCursor(packetCursor);
    }
    updateStats();
  }
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(240, 255, 170, 1)');
  gradient.addColorStop(0.22, 'rgba(205, 255, 45, 0.98)');
  gradient.addColorStop(0.5, 'rgba(180, 255, 0, 0.72)');
  gradient.addColorStop(1, 'rgba(180, 255, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

const glowTexture = createGlowTexture();

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

async function fetchWorldAtlas() {
  const atlasCandidates = [
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  ];

  for (const url of atlasCandidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      return await response.json();
    } catch (error) {
      console.warn(`Could not load world atlas from ${url}`, error);
    }
  }

  throw new Error('Could not load any world atlas source');
}

function traceRingOnCanvas(ctx, ring, width, height, offsetX = 0) {
  let prevLon = null;
  let hasAnyPoint = false;

  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }

    const [lon, lat] = point;
    const x = ((lon + 180) / 360) * width + offsetX;
    const y = ((90 - lat) / 180) * height;

    if (!hasAnyPoint || (prevLon !== null && Math.abs(lon - prevLon) > 180)) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    hasAnyPoint = true;
    prevLon = lon;
  }

  if (hasAnyPoint) {
    ctx.closePath();
  }
}

function fillPolygonOnCanvas(ctx, polygon, width, height) {
  ctx.beginPath();

  for (const offsetX of [-width, 0, width]) {
    for (const ring of polygon) {
      traceRingOnCanvas(ctx, ring, width, height, offsetX);
    }
  }

  ctx.fill('evenodd');
}

function createLandWaterTexture(world) {
  const textureWidth = 2048;
  const textureHeight = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = textureWidth;
  canvas.height = textureHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.fillStyle = '#061427';
  ctx.fillRect(0, 0, textureWidth, textureHeight);
  ctx.fillStyle = '#020202';

  const geo = feature(world, world.objects.countries);
  for (const country of geo.features) {
    const geometry = country.geometry;
    if (!geometry) {
      continue;
    }

    if (geometry.type === 'Polygon') {
      fillPolygonOnCanvas(ctx, geometry.coordinates, textureWidth, textureHeight);
      continue;
    }

    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        fillPolygonOnCanvas(ctx, polygon, textureWidth, textureHeight);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

async function addCountryBorders() {
  try {
    const world = await fetchWorldAtlas();
    const globeTexture = createLandWaterTexture(world);
    if (globeTexture) {
      globe.material.map = globeTexture;
      globe.material.color.setHex(0xffffff);
      globe.material.emissive.setHex(0x02060c);
      globe.material.emissiveIntensity = 0.3;
      globe.material.needsUpdate = true;
    }

    const borders = mesh(world, world.objects.countries);

    const positions = [];

    for (const line of borders.coordinates) {
      for (let i = 1; i < line.length; i += 1) {
        const [lon1, lat1] = line[i - 1];
        const [lon2, lat2] = line[i];
        if (Math.abs(lon2 - lon1) > 180) {
          continue;
        }
        const v1 = latLonToVector3(lat1, lon1, globeRadius + 0.03);
        const v2 = latLonToVector3(lat2, lon2, globeRadius + 0.03);
        positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x8fb9d4,
      transparent: true,
      opacity: 0.82,
    });

    const lineSegments = new THREE.LineSegments(geometry, material);
    globeGroup.add(lineSegments);
  } catch (error) {
    console.warn('Could not load country borders:', error);
  }
}

function createPacketSprite(packet, receivedAt) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture,
    color: ACTIVE_COLOR,
    transparent: true,
    opacity: packet.suspicious ? PACKET_OPACITY_SUSPICIOUS : PACKET_OPACITY_NORMAL,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);
  const position = latLonToVector3(packet.latitude, packet.longitude, globeRadius + 0.18);
  sprite.position.copy(position);

  const scale = packet.suspicious ? PACKET_SCALE_SUSPICIOUS : PACKET_SCALE_NORMAL;
  sprite.scale.set(scale, scale, scale);
  sprite.userData = { packet, receivedAt };
  packetsGroup.add(sprite);

  return { sprite, packet, receivedAt };
}

function passesFilter(packet) {
  return !showOnlySuspicious || packet.suspicious === 1;
}

function addPacketsToScene(newPackets) {
  const now = performance.now();

  for (const packet of newPackets) {
    packetHistory.push({ packet, receivedAt: now });
    if (passesFilter(packet)) {
      visibleEntries.push(createPacketSprite(packet, now));
    }
  }

  trimVisibleEntries();
  updateStats();
}

function trimVisibleEntries() {
  while (visibleEntries.length > MAX_VISIBLE_POINTS) {
    const removed = visibleEntries.shift();
    packetsGroup.remove(removed.sprite);
    removed.sprite.material.dispose();
  }
}

function rebuildVisiblePackets() {
  for (const entry of visibleEntries) {
    packetsGroup.remove(entry.sprite);
    entry.sprite.material.dispose();
  }

  visibleEntries = [];

  const cutoff = performance.now() - FADE_DURATION_MS;
  packetHistory = packetHistory.filter((entry) => entry.receivedAt >= cutoff);

  for (const entry of packetHistory) {
    if (passesFilter(entry.packet)) {
      visibleEntries.push(createPacketSprite(entry.packet, entry.receivedAt));
    }
  }

  trimVisibleEntries();
  updateStats();
}

async function pollPackets() {
  if (packetCursor === null) {
    return;
  }

  try {
    const response = await fetch(`/packets?after=${packetCursor}`);
    if (!response.ok) {
      throw new Error(`Polling failed with status ${response.status}`);
    }

    const data = await response.json();
    const serverTotalPackets = Math.max(0, Number.parseInt(data.total_packets, 10) || 0);
    const newPackets = Array.isArray(data.packets) ? data.packets : [];

    if (newPackets.length > 0) {
      packetCursor += newPackets.length;
      saveCursor(packetCursor);
      totalPackets = serverTotalPackets;
      suspiciousPackets += newPackets.reduce((sum, packet) => sum + (packet.suspicious === 1 ? 1 : 0), 0);
      addPacketsToScene(newPackets);
    } else {
      totalPackets = serverTotalPackets;
      if (packetCursor > totalPackets) {
        packetCursor = totalPackets;
        saveCursor(packetCursor);
        clearVisiblePackets();
      }
      updateStats();
    }
  } catch (error) {
    console.error('Packet polling error:', error);
  }
}

function updateStats() {
  totalPacketsEl.textContent = String(totalPackets);
  suspiciousPacketsEl.textContent = String(suspiciousPackets);
  visiblePointsEl.textContent = String(visibleEntries.length);
}

function animatePackets(now) {
  const cutoff = now - FADE_DURATION_MS;
  packetHistory = packetHistory.filter((entry) => entry.receivedAt >= cutoff);

  const kept = [];

  for (const entry of visibleEntries) {
    const age = now - entry.receivedAt;
    const life = 1 - age / FADE_DURATION_MS;

    if (life <= 0) {
      packetsGroup.remove(entry.sprite);
      entry.sprite.material.dispose();
      continue;
    }

    const pulse = 0.98 + Math.sin(now * 0.006 + age * 0.002) * 0.045;
    const baseScale = entry.packet.suspicious ? PACKET_SCALE_SUSPICIOUS : PACKET_SCALE_NORMAL;
    const baseOpacity = entry.packet.suspicious ? PACKET_OPACITY_SUSPICIOUS : PACKET_OPACITY_NORMAL;
    entry.sprite.material.opacity = baseOpacity * life;
    entry.sprite.scale.setScalar(baseScale * pulse * (0.88 + life * 0.3));
    kept.push(entry);
  }

  visibleEntries = kept;
  updateStats();
}

function handlePointerMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(packetsGroup.children, false);

  if (hits.length === 0) {
    tooltip.style.display = 'none';
    return;
  }

  const packet = hits[0].object.userData.packet;
  tooltip.innerHTML = `
    <div><span class="tooltip-label">IP:</span> ${packet.ip_address}</div>
    <div><span class="tooltip-label">Lat:</span> ${packet.latitude.toFixed(4)}</div>
    <div><span class="tooltip-label">Lon:</span> ${packet.longitude.toFixed(4)}</div>
    <div><span class="tooltip-label">Timestamp:</span> ${packet.timestamp}</div>
    <div><span class="tooltip-label">Suspicious:</span> ${packet.suspicious}</div>
  `;
  tooltip.style.display = 'block';
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  controls.update();
  animatePackets(now);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerleave', () => {
  tooltip.style.display = 'none';
});

toggleRotationBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  toggleRotationBtn.textContent = controls.autoRotate ? 'Pause rotation' : 'Resume rotation';
});

toggleSuspiciousBtn.addEventListener('click', () => {
  showOnlySuspicious = !showOnlySuspicious;
  toggleSuspiciousBtn.textContent = showOnlySuspicious
    ? 'Show only suspicious: on'
    : 'Show only suspicious: off';
  rebuildVisiblePackets();
});

addCountryBorders();
initializePacketCursor().then(() => {
  pollPackets();
  setInterval(pollPackets, 700);
});
animate();
}
