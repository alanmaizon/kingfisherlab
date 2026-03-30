import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import './styles.css';

const viewport = document.getElementById('viewport');
const flightStateEl = document.getElementById('flight-state');
const DEFAULT_CRUISE_SPEED = 14;
const LANDSCAPE_SIZE = 240;
const LANDSCAPE_SEGMENTS = 144;
const BIRD_GROUND_OFFSET = 0.2;
const PLANT_SCALE_MULTIPLIER = 9;
const PLANT_CLEARING_RADIUS = 22;
const GROUND_SPAWN = { x: 20, z: 18 };
const TAKEOFF_CLEARANCE_ALTITUDE = 2.2;
const TAKEOFF_ENTRY_SPEED = 11;
const LANDING_TRIGGER_ALTITUDE = 1.6;
const TAKEOFF_TRANSITION_SECONDS = 0.9;
const LANDING_TRANSITION_SECONDS = 0.7;
const MODEL_YAW_OFFSET = 0;
const KINGFISHER_MODEL_URL = new URL('../bird/source/bird_animations (2).fbx', import.meta.url).href;
const KINGFISHER_TEXTURE_URL = new URL('../bird/textures/body_Base_color_alpha.png', import.meta.url).href;
const GRASS_BASE_TEXTURE_URL = new URL('../grass/textures/T_Grass_Base_D.png', import.meta.url).href;
const GRASS_NORMAL_TEXTURE_URL = new URL('../grass/textures/T_Grass_Base_N.png', import.meta.url).href;
const REEDS_BASE_TEXTURE_URL = new URL('../grass/textures/T_Grass_Reeds_D.png', import.meta.url).href;
const REEDS_NORMAL_TEXTURE_URL = new URL('../grass/textures/T_Grass_Reeds_N.png', import.meta.url).href;
const FBX_TEXTURE_REDIRECTS = {
  'body_Base_color_alpha.png': KINGFISHER_TEXTURE_URL,
  'T_Grass_Base_D.png': GRASS_BASE_TEXTURE_URL,
  'T_Grass_Base_N.png': GRASS_NORMAL_TEXTURE_URL,
  'T_Grass_Reeds_D.png': REEDS_BASE_TEXTURE_URL,
  'T_Grass_Reeds_N.png': REEDS_NORMAL_TEXTURE_URL,
};
const GRASS_PLANT_LIBRARY = [
  { url: new URL('../grass/source/plants/SM_Grass01.fbx', import.meta.url).href, profile: 'grass', count: 48, size: [0.8, 1.35] },
  { url: new URL('../grass/source/plants/SM_Grass02.fbx', import.meta.url).href, profile: 'grass', count: 44, size: [0.8, 1.25] },
  { url: new URL('../grass/source/plants/SM_Grass03.fbx', import.meta.url).href, profile: 'grass', count: 40, size: [0.9, 1.55] },
  { url: new URL('../grass/source/plants/SM_Grass_Dry01.fbx', import.meta.url).href, profile: 'dry', count: 26, size: [0.85, 1.25] },
  { url: new URL('../grass/source/plants/SM_Grass_Dry02.fbx', import.meta.url).href, profile: 'dry', count: 22, size: [0.8, 1.15] },
  { url: new URL('../grass/source/plants/SM_Grass_Flowers01.fbx', import.meta.url).href, profile: 'flowers', count: 18, size: [0.8, 1.2] },
  { url: new URL('../grass/source/plants/SM_Grass_Flowers02.fbx', import.meta.url).href, profile: 'flowers', count: 18, size: [0.75, 1.15] },
  { url: new URL('../grass/source/plants/SM_Grass_Flowers03.fbx', import.meta.url).href, profile: 'flowers', count: 16, size: [0.8, 1.2] },
  { url: new URL('../grass/source/plants/SM_Grass_Reeds01.fbx', import.meta.url).href, profile: 'reeds', count: 18, size: [1.1, 1.85] },
];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd4bc, 60, 320);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 10, 22);

const hemiLight = new THREE.HemisphereLight(0xfff0c8, 0x5c7a61, 1.8);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffe4ab, 2.4);
sun.position.set(28, 46, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 180;
scene.add(sun);
scene.add(sun.target);

const fillLight = new THREE.PointLight(0xe4f6ff, 0.4, 120);
fillLight.position.set(0, 18, 0);
scene.add(fillLight);

scene.add(createSkyDome());
const world = createLandscapeWorld();
scene.add(world);

const controls = {
  accelerate: false,
  brake: false,
  turnLeft: false,
  turnRight: false,
  flapHeld: false,
  dive: false,
};

const bird = createFlightRig();
scene.add(bird.root);
const clock = new THREE.Clock(false);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyW' || event.code === 'ArrowUp') controls.accelerate = true;
  if (event.code === 'KeyS' || event.code === 'ArrowDown') controls.brake = true;
  if (event.code === 'KeyA' || event.code === 'ArrowLeft') controls.turnLeft = true;
  if (event.code === 'KeyD' || event.code === 'ArrowRight') controls.turnRight = true;
  if (event.code === 'Space') {
    controls.flapHeld = true;
    event.preventDefault();
  }
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
    controls.dive = true;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyW' || event.code === 'ArrowUp') controls.accelerate = false;
  if (event.code === 'KeyS' || event.code === 'ArrowDown') controls.brake = false;
  if (event.code === 'KeyA' || event.code === 'ArrowLeft') controls.turnLeft = false;
  if (event.code === 'KeyD' || event.code === 'ArrowRight') controls.turnRight = false;
  if (event.code === 'Space') controls.flapHeld = false;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
    controls.dive = false;
  }
});

window.addEventListener('blur', () => {
  Object.keys(controls).forEach((key) => {
    controls[key] = false;
  });
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function createSkyDome() {
  const geometry = new THREE.SphereGeometry(300, 32, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x86b0d0) },
      middleColor: { value: new THREE.Color(0xe7dbad) },
      bottomColor: { value: new THREE.Color(0xdce9d4) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 middleColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y * 0.5 + 0.5;
        vec3 color = mix(bottomColor, middleColor, smoothstep(0.0, 0.42, h));
        color = mix(color, topColor, smoothstep(0.52, 1.0, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function sampleLandscapeHeight(x, z) {
  const rolling = Math.sin(x * 0.032) * 1.2 + Math.cos(z * 0.028) * 0.95;
  const broadFold = Math.sin((x + z) * 0.018) * 1.6 + Math.cos((x - z) * 0.013) * 1.1;
  const distantRise =
    Math.exp(-((x + 56) ** 2 + (z + 42) ** 2) / 3200) * 4.2 +
    Math.exp(-((x - 68) ** 2 + (z - 28) ** 2) / 4100) * 3.1;
  const aroundSpawn = Math.hypot(x - GROUND_SPAWN.x, z - GROUND_SPAWN.z);
  const clearingBlend = 1 - THREE.MathUtils.smoothstep(aroundSpawn, 7, 18);
  return THREE.MathUtils.lerp(rolling + broadFold + distantRise, 0.15, clearingBlend);
}

function getBirdGroundHeight(x, z) {
  return sampleLandscapeHeight(x, z) + BIRD_GROUND_OFFSET;
}

function applyLandscapeVertexColors(geometry) {
  const lowColor = new THREE.Color(0x726640);
  const midColor = new THREE.Color(0x768743);
  const highColor = new THREE.Color(0x93a95d);
  const soilColor = new THREE.Color(0x8f7440);
  const blendedA = new THREE.Color();
  const blendedB = new THREE.Color();
  const finalColor = new THREE.Color();
  const colors = [];
  const position = geometry.attributes.position;
  const normals = geometry.attributes.normal;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const heightBlend = THREE.MathUtils.smoothstep(y, -0.6, 6.4);
    const flatBlend = THREE.MathUtils.smoothstep(normals.getY(index), 0.72, 0.98);
    const noise = 0.5 + 0.5 * Math.sin(x * 0.045 + z * 0.018) * Math.cos(z * 0.037 - x * 0.021);
    const soilBlend = THREE.MathUtils.smoothstep(noise, 0.78, 0.98) * (1 - flatBlend * 0.55);

    blendedA.lerpColors(lowColor, midColor, heightBlend);
    blendedB.lerpColors(midColor, highColor, flatBlend);
    finalColor.lerpColors(blendedA, blendedB, 0.55);
    finalColor.lerp(soilColor, soilBlend);
    colors.push(finalColor.r, finalColor.g, finalColor.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function createLandscapeTerrain() {
  const geometry = new THREE.PlaneGeometry(LANDSCAPE_SIZE, LANDSCAPE_SIZE, LANDSCAPE_SEGMENTS, LANDSCAPE_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, sampleLandscapeHeight(x, z));
  }
  geometry.computeVertexNormals();
  applyLandscapeVertexColors(geometry);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.99,
    metalness: 0.0,
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  return terrain;
}

function createLandscapeWorld() {
  const world = new THREE.Group();
  world.add(createLandscapeTerrain());

  const clearing = new THREE.Mesh(
    new THREE.CircleGeometry(10, 40),
    new THREE.MeshStandardMaterial({
      color: 0x8f7251,
      roughness: 0.97,
      metalness: 0.0,
    })
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.set(GROUND_SPAWN.x, sampleLandscapeHeight(GROUND_SPAWN.x, GROUND_SPAWN.z) + 0.04, GROUND_SPAWN.z);
  clearing.receiveShadow = true;
  world.add(clearing);

  return world;
}

function randomFromSeed(seed) {
  const value = Math.sin(seed * 127.1) * 43758.5453123;
  return value - Math.floor(value);
}

function createFbxLoadingManager() {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const normalizedUrl = url.replace(/\\/g, '/');
    const filename = normalizedUrl.slice(normalizedUrl.lastIndexOf('/') + 1);
    return FBX_TEXTURE_REDIRECTS[filename] ?? url;
  });
  return manager;
}

function createFoliageMaterial({ colorMap, normalMap, color = 0xffffff }) {
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
  normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    color,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.5,
    roughness: 0.96,
    metalness: 0.0,
  });
  material.alphaToCoverage = true;
  material.forceSinglePass = true;
  material.shadowSide = THREE.DoubleSide;
  return material;
}

function extractPreferredPlantLod(model) {
  let preferredMesh = null;

  model.traverse((child) => {
    if (!child.isMesh) return;
    const name = child.name.toLowerCase();
    if (name.includes('lod0')) {
      preferredMesh = child;
      return;
    }
    if (!preferredMesh) preferredMesh = child;
  });

  if (!preferredMesh) return model;

  const template = new THREE.Group();
  template.add(preferredMesh.clone(true));
  return template;
}

function normalizePlantTemplate(model, targetHeight, material) {
  const orientedPlant = extractPreferredPlantLod(model);
  orientedPlant.rotation.x = -Math.PI * 0.5;
  const template = new THREE.Group();
  template.add(orientedPlant);

  template.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = material;
    child.renderOrder = 1;
  });

  let box = new THREE.Box3().setFromObject(template);
  const size = box.getSize(new THREE.Vector3());
  const scale = (targetHeight * PLANT_SCALE_MULTIPLIER) / Math.max(size.y, 0.001);

  template.scale.setScalar(scale);
  box = new THREE.Box3().setFromObject(template);
  const center = box.getCenter(new THREE.Vector3());
  template.position.x -= center.x;
  template.position.z -= center.z;
  template.position.y -= box.min.y;
  return template;
}

function createPlantScatterPosition(seed, { keepLow = false } = {}) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const x = (randomFromSeed(seed * 13 + attempt * 17) - 0.5) * LANDSCAPE_SIZE * 0.82;
    const z = (randomFromSeed(seed * 19 + attempt * 29) - 0.5) * LANDSCAPE_SIZE * 0.82;
    if (Math.hypot(x - GROUND_SPAWN.x, z - GROUND_SPAWN.z) < PLANT_CLEARING_RADIUS) continue;

    const y = sampleLandscapeHeight(x, z);
    if (keepLow && y > 2.4) continue;
    return { x, y, z };
  }

  return { x: 0, y: sampleLandscapeHeight(0, 0), z: 0 };
}

async function loadGrassPlants(worldGroup) {
  const manager = createFbxLoadingManager();
  const loader = new FBXLoader(manager);
  const textureLoader = new THREE.TextureLoader();

  try {
    const [grassBase, grassNormal, reedsBase, reedsNormal, ...plantModels] = await Promise.all([
      textureLoader.loadAsync(GRASS_BASE_TEXTURE_URL),
      textureLoader.loadAsync(GRASS_NORMAL_TEXTURE_URL),
      textureLoader.loadAsync(REEDS_BASE_TEXTURE_URL),
      textureLoader.loadAsync(REEDS_NORMAL_TEXTURE_URL),
      ...GRASS_PLANT_LIBRARY.map((entry) => loader.loadAsync(entry.url)),
    ]);

    const grassMaterial = createFoliageMaterial({ colorMap: grassBase, normalMap: grassNormal, color: 0xe4f1d3 });
    const dryMaterial = createFoliageMaterial({ colorMap: grassBase, normalMap: grassNormal, color: 0xd8c89b });
    const flowerMaterial = createFoliageMaterial({ colorMap: grassBase, normalMap: grassNormal, color: 0xf1ead8 });
    const reedsMaterial = createFoliageMaterial({ colorMap: reedsBase, normalMap: reedsNormal, color: 0xe2e4c0 });

    const templateGroup = new THREE.Group();

    plantModels.forEach((model, index) => {
      const config = GRASS_PLANT_LIBRARY[index];
      const material = config.profile === 'reeds'
        ? reedsMaterial
        : config.profile === 'flowers'
          ? flowerMaterial
          : config.profile === 'dry'
            ? dryMaterial
            : grassMaterial;
      const averageHeight = (config.size[0] + config.size[1]) * 0.5;
      const template = normalizePlantTemplate(model, averageHeight, material);

      for (let cloneIndex = 0; cloneIndex < config.count; cloneIndex += 1) {
        const position = createPlantScatterPosition(index * 100 + cloneIndex + 1, {
          keepLow: config.profile === 'reeds',
        });
        const clone = template.clone(true);
        const scaleJitter = THREE.MathUtils.lerp(config.size[0] / averageHeight, config.size[1] / averageHeight, randomFromSeed(index * 1000 + cloneIndex * 7 + 3));
        clone.scale.multiplyScalar(scaleJitter);
        clone.position.set(position.x, position.y - 0.02, position.z);
        clone.rotation.y = randomFromSeed(index * 1000 + cloneIndex * 11 + 7) * Math.PI * 2;
        templateGroup.add(clone);
      }
    });

    worldGroup.add(templateGroup);
  } catch (error) {
    console.error('Failed to load grass plants:', error);
  }
}

function warmBirdAnimationActions(flightRig) {
  if (!flightRig.mixer || !flightRig.clips.length) return;

  for (const clip of flightRig.clips) {
    const action = flightRig.mixer.clipAction(clip);
    action.enabled = true;
    action.reset();
    action.play();
    flightRig.mixer.update(0);
    action.stop();
  }

  flightRig.activeAction = null;
  flightRig.activeClipName = '';
  settleBirdOnGround(flightRig);
  syncBirdAnimationState(flightRig);
  flightRig.mixer.update(0);
}

function warmSceneAssets() {
  warmBirdAnimationActions(bird);
  updateCamera(0);
  updateHud();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
}

function createFlightRig() {
  const root = new THREE.Group();
  const initialGroundHeight = getBirdGroundHeight(GROUND_SPAWN.x, GROUND_SPAWN.z);
  root.position.set(GROUND_SPAWN.x, initialGroundHeight, GROUND_SPAWN.z);

  const visualPivot = new THREE.Group();
  root.add(visualPivot);

  const fallback = createFallbackBird();
  fallback.visible = true;
  visualPivot.add(fallback);

  return {
    root,
    visualPivot,
    fallback,
    model: null,
    mixer: null,
    clips: [],
    speed: 0,
    minSpeed: 7,
    maxSpeed: 28,
    yaw: Math.PI,
    pitch: 0,
    roll: 0,
    flapCooldown: 0,
    flightMode: 'grounded',
    groundHeight: initialGroundHeight,
    animationState: 'loading',
    animationSet: null,
    activeAction: null,
    activeClipName: '',
    activeActionTimeScale: 1,
    selectedIdleClipName: '',
    selectedFlyLoopName: '',
    clipCycleIndex: {
      idle: 0,
      flyStart: 0,
      flyLoop: 0,
      flyEnd: 0,
    },
    cameraTarget: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  };
}

function createFallbackBird() {
  const group = new THREE.Group();
  const featherMat = new THREE.MeshStandardMaterial({ color: 0x3880a1, roughness: 0.74 });
  const chestMat = new THREE.MeshStandardMaterial({ color: 0xf0a44c, roughness: 0.68 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0x2f2f24, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), featherMat);
  body.scale.set(1.7, 1, 0.9);
  body.castShadow = true;

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 10), chestMat);
  chest.position.set(0, -0.14, 0.6);
  chest.scale.set(1.12, 0.86, 0.8);
  chest.castShadow = true;
  group.add(body, chest);

  const wingGeometry = new THREE.BoxGeometry(2.8, 0.16, 1.1);
  const leftWing = new THREE.Mesh(wingGeometry, featherMat);
  leftWing.position.set(1.55, 0.12, 0);
  leftWing.rotation.z = -0.18;
  leftWing.castShadow = true;
  group.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.position.x *= -1;
  rightWing.rotation.z *= -1;
  group.add(rightWing);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), featherMat);
  head.position.set(0, 0.2, 1.26);
  head.castShadow = true;
  group.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 8), beakMat);
  beak.position.set(0, 0.12, 1.88);
  beak.rotation.x = Math.PI / 2;
  beak.castShadow = true;
  group.add(beak);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 1.6), featherMat);
  tail.position.set(0, -0.12, -1.46);
  tail.rotation.x = -0.22;
  tail.castShadow = true;
  group.add(tail);

  return group;
}

function buildAnimationSet(clips) {
  const animationSet = {
    idle: [],
    flyStart: [],
    flyLoop: [],
    flyEnd: [],
  };

  for (const clip of clips) {
    const name = clip.name.toLowerCase();
    if (name.includes('fly_start')) {
      animationSet.flyStart.push(clip);
    } else if (name.includes('fly_end')) {
      animationSet.flyEnd.push(clip);
    } else if (name.includes('fly')) {
      animationSet.flyLoop.push(clip);
    } else if (name.includes('idle')) {
      animationSet.idle.push(clip);
    }
  }

  animationSet.idle.sort((a, b) => a.name.localeCompare(b.name));
  animationSet.flyStart.sort((a, b) => a.name.localeCompare(b.name));
  animationSet.flyLoop.sort((a, b) => a.name.localeCompare(b.name));
  animationSet.flyEnd.sort((a, b) => a.name.localeCompare(b.name));
  return animationSet;
}

function playBirdClip(flightRig, clip, nextState, { loop = THREE.LoopRepeat, fade = 0.24, timeScale = 1 } = {}) {
  if (!flightRig.mixer || !clip) return;

  const action = flightRig.mixer.clipAction(clip);
  action.enabled = true;
  action.reset();
  action.clampWhenFinished = loop === THREE.LoopOnce;
  action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
  action.setEffectiveTimeScale(timeScale);
  action.setEffectiveWeight(1);

  if (flightRig.activeAction && flightRig.activeAction !== action) {
    action.crossFadeFrom(flightRig.activeAction, fade, true);
  }

  action.play();
  flightRig.activeAction = action;
  flightRig.activeClipName = clip.name;
  flightRig.activeActionTimeScale = timeScale;
  flightRig.animationState = nextState;
}

function chooseNextClipVariant(flightRig, setKey) {
  const clips = flightRig.animationSet?.[setKey] ?? [];
  if (clips.length === 0) return null;

  const index = flightRig.clipCycleIndex[setKey] % clips.length;
  flightRig.clipCycleIndex[setKey] = (flightRig.clipCycleIndex[setKey] + 1) % clips.length;
  return clips[index];
}

function getSelectedIdleClip(flightRig) {
  const clips = flightRig.animationSet?.idle ?? [];
  if (clips.length === 0) return null;
  return clips.find((clip) => clip.name === flightRig.selectedIdleClipName) ?? clips[0];
}

function chooseNextIdleClip(flightRig) {
  const clip = chooseNextClipVariant(flightRig, 'idle');
  if (clip) flightRig.selectedIdleClipName = clip.name;
  return clip;
}

function getTransitionTimeScale(clip, targetSeconds) {
  if (!clip) return 1;
  return Math.max(1, clip.duration / targetSeconds);
}

function getSelectedFlyLoopClip(flightRig) {
  const clips = flightRig.animationSet?.flyLoop ?? [];
  if (clips.length === 0) return null;
  if (clips.length === 1) return clips[0];

  return (
    clips.find((clip) => clip.name === flightRig.selectedFlyLoopName) ??
    clips.find((clip) => clip.name === flightRig.activeClipName) ??
    clips[0]
  );
}

function chooseNextFlyLoopClip(flightRig) {
  const clip = chooseNextClipVariant(flightRig, 'flyLoop');
  flightRig.selectedFlyLoopName = clip.name;
  return clip;
}

function syncBirdAnimationState(flightRig) {
  if (!flightRig.animationSet || !flightRig.mixer) return;

  const transitioning = flightRig.animationState === 'fly_start' || flightRig.animationState === 'fly_end';
  if (transitioning) return;

  if (flightRig.flightMode === 'grounded') {
    if (flightRig.animationState === 'idle') {
      const idleClip = getSelectedIdleClip(flightRig);
      if (idleClip && idleClip.name !== flightRig.activeClipName) {
        playBirdClip(flightRig, idleClip, 'idle', { timeScale: 0.9 });
      }
      return;
    }

    const idleClip = chooseNextIdleClip(flightRig);
    if (idleClip) playBirdClip(flightRig, idleClip, 'idle', { timeScale: 0.9 });
    return;
  }

  const flyClip = getSelectedFlyLoopClip(flightRig);
  if (flyClip && (flightRig.animationState !== 'fly' || flyClip.name !== flightRig.activeClipName)) {
    playBirdClip(flightRig, flyClip, 'fly', {
      timeScale: THREE.MathUtils.lerp(0.88, 1.45, flightRig.speed / flightRig.maxSpeed),
    });
  }
}

function settleBirdOnGround(flightRig) {
  flightRig.groundHeight = getBirdGroundHeight(flightRig.root.position.x, flightRig.root.position.z);
  flightRig.flightMode = 'grounded';
  flightRig.speed = 0;
  flightRig.pitch = 0;
  flightRig.roll = 0;
  flightRig.flapCooldown = 0;
  flightRig.activeActionTimeScale = 1;
  flightRig.selectedIdleClipName = '';
  flightRig.selectedFlyLoopName = '';
  flightRig.velocity.set(0, 0, 0);
  flightRig.root.position.y = flightRig.groundHeight;
  flightRig.root.quaternion.setFromEuler(new THREE.Euler(0, flightRig.yaw, 0, 'YXZ'));
}

function beginTakeoffTransition(flightRig) {
  if (flightRig.flightMode !== 'grounded') return;

  flightRig.flightMode = 'taking_off';
  flightRig.speed = Math.max(flightRig.speed, TAKEOFF_ENTRY_SPEED * 0.45);
  chooseNextFlyLoopClip(flightRig);

  const flyStart = chooseNextClipVariant(flightRig, 'flyStart');
  if (flyStart && flightRig.mixer) {
    playBirdClip(flightRig, flyStart, 'fly_start', {
      loop: THREE.LoopOnce,
      fade: 0.18,
      timeScale: getTransitionTimeScale(flyStart, TAKEOFF_TRANSITION_SECONDS),
    });
    return;
  }

  flightRig.flightMode = 'airborne';
  flightRig.root.position.y = Math.max(flightRig.root.position.y, flightRig.groundHeight + TAKEOFF_CLEARANCE_ALTITUDE);
  flightRig.speed = Math.max(flightRig.speed, TAKEOFF_ENTRY_SPEED);
  const flyClip = getSelectedFlyLoopClip(flightRig) ?? chooseNextFlyLoopClip(flightRig);
  if (flyClip && flightRig.mixer) {
    playBirdClip(flightRig, flyClip, 'fly', {
      timeScale: THREE.MathUtils.lerp(0.88, 1.45, flightRig.speed / flightRig.maxSpeed),
    });
  }
  syncBirdAnimationState(flightRig);
}

function beginLandingTransition(flightRig) {
  if (flightRig.flightMode !== 'airborne') return;

  flightRig.flightMode = 'landing';

  const flyEnd = chooseNextClipVariant(flightRig, 'flyEnd');
  if (flyEnd && flightRig.mixer) {
    playBirdClip(flightRig, flyEnd, 'fly_end', {
      loop: THREE.LoopOnce,
      fade: 0.18,
      timeScale: getTransitionTimeScale(flyEnd, LANDING_TRANSITION_SECONDS),
    });
    return;
  }

  settleBirdOnGround(flightRig);
  syncBirdAnimationState(flightRig);
}

function clampBirdPosition(flightRig, minHeight = flightRig.groundHeight) {
  flightRig.root.position.x = THREE.MathUtils.clamp(flightRig.root.position.x, -120, 120);
  flightRig.root.position.z = THREE.MathUtils.clamp(flightRig.root.position.z, -120, 120);
  flightRig.root.position.y = THREE.MathUtils.clamp(flightRig.root.position.y, minHeight, 52);
}

function getBirdForwardVector(flightRig) {
  return new THREE.Vector3(
    Math.sin(flightRig.yaw) * Math.cos(flightRig.pitch),
    Math.sin(flightRig.pitch),
    Math.cos(flightRig.yaw) * Math.cos(flightRig.pitch)
  ).normalize();
}

function updateBirdAnimationPlayback(flightRig, delta) {
  const speedRatio = THREE.MathUtils.clamp(flightRig.speed / flightRig.maxSpeed, 0, 1);
  const wingPulse = Math.sin(clock.elapsedTime * THREE.MathUtils.lerp(2.6, 10.5, speedRatio));

  if (flightRig.flightMode === 'grounded') {
    flightRig.visualPivot.position.y = 0.08 + wingPulse * 0.02;
    flightRig.visualPivot.rotation.x = wingPulse * 0.015;
  } else if (flightRig.flightMode === 'landing') {
    flightRig.visualPivot.position.y = 0.16 + wingPulse * 0.045;
    flightRig.visualPivot.rotation.x = wingPulse * 0.03;
  } else {
    flightRig.visualPivot.position.y = 0.2 + wingPulse * 0.08;
    flightRig.visualPivot.rotation.x = wingPulse * 0.06;
  }

  if (flightRig.mixer) {
    syncBirdAnimationState(flightRig);

    if (flightRig.activeAction) {
      const baseTimeScale =
        flightRig.animationState === 'fly'
          ? THREE.MathUtils.lerp(0.88, 1.5, speedRatio) + (controls.flapHeld ? 0.18 : 0)
          : flightRig.animationState === 'idle'
            ? 0.9
            : flightRig.activeActionTimeScale;
      flightRig.activeAction.setEffectiveTimeScale(baseTimeScale);
    }

    flightRig.mixer.update(delta);
  } else {
    flightRig.fallback.children[2].rotation.z = -0.22 - wingPulse * 0.4;
    flightRig.fallback.children[3].rotation.z = 0.22 + wingPulse * 0.4;
  }
}

async function loadKingfisherModel(flightRig) {
  const manager = createFbxLoadingManager();
  const loader = new FBXLoader(manager);
  const textureLoader = new THREE.TextureLoader();

  try {
    const [fbx, bodyTexture] = await Promise.all([
      loader.loadAsync(KINGFISHER_MODEL_URL),
      textureLoader.loadAsync(KINGFISHER_TEXTURE_URL),
    ]);

    bodyTexture.colorSpace = THREE.SRGBColorSpace;
    bodyTexture.needsUpdate = true;

    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 3.1 / maxDim;

    fbx.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(fbx);
    const center = scaledBox.getCenter(new THREE.Vector3());
    const min = scaledBox.min.clone();

    fbx.position.x -= center.x;
    fbx.position.y -= min.y + 0.2;
    fbx.position.z -= center.z;
    fbx.rotation.y = MODEL_YAW_OFFSET;

    fbx.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const material = new THREE.MeshStandardMaterial({
        map: bodyTexture,
        transparent: false,
        alphaTest: 0.46,
        side: THREE.DoubleSide,
        roughness: 0.82,
        metalness: 0.02,
      });
      material.alphaToCoverage = true;
      material.forceSinglePass = true;
      material.shadowSide = THREE.DoubleSide;
      child.material = material;
      child.renderOrder = 1;
    });

    flightRig.fallback.visible = false;
    flightRig.visualPivot.add(fbx);
    flightRig.model = fbx;

    if (fbx.animations.length > 0) {
      flightRig.mixer = new THREE.AnimationMixer(fbx);
      flightRig.clips = fbx.animations;
      flightRig.animationSet = buildAnimationSet(fbx.animations);
      flightRig.mixer.addEventListener('finished', (event) => {
        if (event.action !== flightRig.activeAction) return;
        if (flightRig.animationState === 'fly_start') {
          flightRig.flightMode = 'airborne';
          flightRig.groundHeight = getBirdGroundHeight(flightRig.root.position.x, flightRig.root.position.z);
          flightRig.root.position.y = Math.max(flightRig.root.position.y, flightRig.groundHeight + TAKEOFF_CLEARANCE_ALTITUDE);
          flightRig.speed = Math.max(flightRig.speed, TAKEOFF_ENTRY_SPEED);
          const flyClip = getSelectedFlyLoopClip(flightRig) ?? chooseNextFlyLoopClip(flightRig);
          if (flyClip) {
            playBirdClip(flightRig, flyClip, 'fly', {
              timeScale: THREE.MathUtils.lerp(0.88, 1.45, flightRig.speed / flightRig.maxSpeed),
            });
          }
        } else if (flightRig.animationState === 'fly_end') {
          settleBirdOnGround(flightRig);
          const idleClip = chooseNextIdleClip(flightRig);
          if (idleClip) playBirdClip(flightRig, idleClip, 'idle', { timeScale: 0.9 });
        }
      });

      settleBirdOnGround(flightRig);
      syncBirdAnimationState(flightRig);
    }

  } catch (error) {
    console.error('Failed to load kingfisher model:', error);
    setFlightState('Fallback Bird');
  }
}

function updateFlight(delta) {
  bird.groundHeight = getBirdGroundHeight(bird.root.position.x, bird.root.position.z);
  const takeoffIntent = controls.flapHeld || controls.accelerate;
  if (bird.flightMode === 'grounded' && takeoffIntent) {
    beginTakeoffTransition(bird);
  }

  const landingIntent =
    bird.flightMode === 'airborne' &&
    !takeoffIntent &&
    controls.brake &&
    bird.root.position.y <= bird.groundHeight + LANDING_TRIGGER_ALTITUDE &&
    bird.speed <= bird.minSpeed + 1.4 &&
    bird.pitch <= 0.18;
  if (landingIntent) {
    beginLandingTransition(bird);
  }

  if (bird.flightMode === 'grounded') {
    bird.speed = THREE.MathUtils.damp(bird.speed, 0, 8, delta);
    bird.pitch = THREE.MathUtils.damp(bird.pitch, 0, 8, delta);
    bird.roll = THREE.MathUtils.damp(bird.roll, 0, 8, delta);
    bird.root.position.y = bird.groundHeight;
    bird.velocity.set(0, 0, 0);
    bird.root.quaternion.setFromEuler(new THREE.Euler(bird.pitch, bird.yaw, bird.roll, 'YXZ'));
    updateBirdAnimationPlayback(bird, delta);
    return;
  }

  if (bird.flightMode === 'taking_off') {
    bird.speed = THREE.MathUtils.damp(bird.speed, TAKEOFF_ENTRY_SPEED, 4, delta);
    bird.pitch = THREE.MathUtils.damp(bird.pitch, 0.18, 4.8, delta);
    bird.roll = THREE.MathUtils.damp(bird.roll, 0, 5.4, delta);

    const forward = getBirdForwardVector(bird);
    bird.velocity.copy(forward).multiplyScalar(Math.max(3.5, bird.speed * 0.55));
    bird.root.position.addScaledVector(bird.velocity, delta);
    bird.root.position.y = THREE.MathUtils.damp(bird.root.position.y, bird.groundHeight + TAKEOFF_CLEARANCE_ALTITUDE, 3.4, delta);
    clampBirdPosition(bird, bird.groundHeight);
    bird.root.quaternion.setFromEuler(new THREE.Euler(bird.pitch, bird.yaw, bird.roll, 'YXZ'));
    updateBirdAnimationPlayback(bird, delta);
    return;
  }

  if (bird.flightMode === 'landing') {
    bird.speed = THREE.MathUtils.damp(bird.speed, 0, 4.6, delta);
    bird.pitch = THREE.MathUtils.damp(bird.pitch, -0.08, 4.8, delta);
    bird.roll = THREE.MathUtils.damp(bird.roll, 0, 6.2, delta);

    const forward = getBirdForwardVector(bird);
    bird.velocity.copy(forward).multiplyScalar(Math.max(1.2, bird.speed * 0.4));
    bird.root.position.addScaledVector(bird.velocity, delta);
    bird.root.position.y = THREE.MathUtils.damp(bird.root.position.y, bird.groundHeight, 5.2, delta);
    clampBirdPosition(bird, bird.groundHeight);
    bird.root.quaternion.setFromEuler(new THREE.Euler(bird.pitch, bird.yaw, bird.roll, 'YXZ'));
    updateBirdAnimationPlayback(bird, delta);
    return;
  }

  const turnInput = Number(controls.turnRight) - Number(controls.turnLeft);
  const speedTarget = controls.accelerate
    ? bird.maxSpeed
    : controls.brake
      ? bird.minSpeed
      : DEFAULT_CRUISE_SPEED;

  bird.speed = THREE.MathUtils.damp(bird.speed, speedTarget, 1.8, delta);
  bird.yaw -= turnInput * delta * THREE.MathUtils.lerp(1.1, 1.85, bird.speed / bird.maxSpeed);

  const climbInput = Number(controls.flapHeld) - Number(controls.dive);
  let pitchTarget = THREE.MathUtils.clamp(
    bird.pitch + climbInput * delta * 0.9,
    -0.58,
    0.52
  );

  if (controls.flapHeld && bird.flapCooldown <= 0) {
    bird.speed = Math.min(bird.maxSpeed, bird.speed + 2.8);
    pitchTarget = Math.min(0.56, pitchTarget + 0.12);
    bird.root.position.y += 0.45;
    bird.flapCooldown = 0.14;
  }

  bird.flapCooldown = Math.max(0, bird.flapCooldown - delta);
  bird.pitch = THREE.MathUtils.damp(bird.pitch, pitchTarget, 4.2, delta);
  bird.roll = THREE.MathUtils.damp(
    bird.roll,
    -turnInput * THREE.MathUtils.lerp(0.18, 0.64, bird.speed / bird.maxSpeed),
    5.4,
    delta
  );

  const forward = getBirdForwardVector(bird);
  bird.velocity.copy(forward).multiplyScalar(bird.speed);
  bird.root.position.addScaledVector(bird.velocity, delta);

  clampBirdPosition(bird, bird.groundHeight + 0.6);

  if (bird.root.position.y <= bird.groundHeight + 1.1) bird.pitch = Math.max(bird.pitch, 0.04);
  if (bird.root.position.y >= 49) bird.pitch = Math.min(bird.pitch, -0.08);

  bird.root.quaternion.setFromEuler(new THREE.Euler(bird.pitch, bird.yaw, bird.roll, 'YXZ'));
  updateBirdAnimationPlayback(bird, delta);
}

function updateCamera(delta) {
  const forward = getBirdForwardVector(bird);
  const desiredPosition = bird.root.position
    .clone()
    .addScaledVector(forward, -15.5)
    .add(new THREE.Vector3(0, 5.4 - bird.pitch * 3.2, 0));
  camera.position.lerp(desiredPosition, 1 - Math.exp(-2.8 * delta));

  bird.cameraTarget
    .copy(bird.root.position)
    .addScaledVector(forward, 5.5)
    .add(new THREE.Vector3(0, 2.1, 0));
  camera.lookAt(bird.cameraTarget);

  sun.target.position.copy(bird.root.position);
  sun.target.updateMatrixWorld();
  sun.position.set(bird.root.position.x + 34, bird.root.position.y + 44, bird.root.position.z + 20);
  fillLight.position.copy(bird.root.position).add(new THREE.Vector3(-6, 10, -3));
}

function setFlightState(text) {
  flightStateEl.textContent = text;
}

function updateHud() {
  let mode = 'Cruising';
  if (bird.flightMode === 'grounded') {
    mode = 'Grounded';
  } else if (bird.flightMode === 'taking_off') {
    mode = 'Taking Off';
  } else if (bird.flightMode === 'landing') {
    mode = 'Landing';
  } else {
    const climbing = controls.flapHeld && bird.pitch > 0.04;
    const gliding = !controls.flapHeld && !controls.accelerate && bird.speed < 16;
    mode = climbing ? 'Flapping' : gliding ? 'Gliding' : 'Cruising';
  }

  setFlightState(mode);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  updateFlight(delta);
  updateCamera(delta);
  updateHud();
  renderer.render(scene, camera);
}

async function initializeScene() {
  setFlightState('Loading Scene');

  await Promise.all([
    loadKingfisherModel(bird),
    loadGrassPlants(world),
  ]);

  warmSceneAssets();
  clock.start();
  clock.getDelta();
  renderer.setAnimationLoop(animate);
}

initializeScene().catch((error) => {
  console.error('Scene initialization failed:', error);
  updateHud();
  clock.start();
  clock.getDelta();
  renderer.setAnimationLoop(animate);
});
