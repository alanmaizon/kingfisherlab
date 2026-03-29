import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import roadLayout from '../road_layout.json';
import './styles.css';

const viewport = document.getElementById('viewport');
const personaStateEl = document.getElementById('persona-state');
const arenaStatusEl = document.getElementById('arena-status');

const CAMERA_DISTANCE = 10.5;
const CAMERA_HEIGHT = 2.6;
const PERSONA_FLOOR_OFFSET = 1.16;
const PERSONA_RADIUS = 0.95;
const BOUNDARY_PUSH_MARGIN = 0.12;
const BOUNDARY_RAY_COUNT = 12;
const STATION_COUNT = 14;
const WALK_SPEED = 24.8;
const CROUCH_SPEED = 3.2;
const JUMP_SPEED = 7.8;
const GRAVITY = 18.5;
const MOUSE_LOOK_SPEED = 0.0021;
const TOUCH_LOOK_SPEED = 0.012;
const XR_SETTINGS = Object.freeze({
  referenceSpace: 'local-floor',
  locomotionMode: 'smooth-move',
  teleportEnabled: false,
  standingEyeHeight: 1.7,
  metersPerUnit: 1,
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8efde);
scene.fog = new THREE.Fog(0xdde6d4, 90, 320);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 560);
camera.position.set(0, 5, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType(XR_SETTINGS.referenceSpace);
viewport.appendChild(renderer.domElement);

const skyDome = createSkyDome();
scene.add(skyDome);

const hemiLight = new THREE.HemisphereLight(0xf6f1da, 0x5b735c, 1.7);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff1cb, 2.2);
sun.position.set(28, 42, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
scene.add(sun);
scene.add(sun.target);

const bounceLight = new THREE.PointLight(0xe8f6eb, 0.35, 50);
bounceLight.position.set(0, 5, 0);
scene.add(bounceLight);

const environmentAnchor = new THREE.Group();
scene.add(environmentAnchor);

const controls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  crouch: false,
  jumpQueued: false,
};

const cameraState = {
  yaw: Math.PI,
  pitch: 0.38,
  touchPointerId: null,
  lastTouchX: 0,
  lastTouchY: 0,
};

const player = createPersona();
scene.add(player.root);

const world = {
  environmentReady: false,
  usingFallback: false,
  stationGroup: null,
  xr: {
    ...XR_SETTINGS,
  },
};
scene.userData.xr = world.xr;

const timer = new THREE.Timer();
timer.connect(document);
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMove = new THREE.Vector3();
const tmpCameraOffset = new THREE.Vector3();
const tmpCameraTarget = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const spherical = new THREE.Spherical();
const roadData = createRoadRuntimeData();
const roadBoundary = createRoadBoundarySystem();
scene.add(roadBoundary.group);

function setArenaStatus(text) {
  arenaStatusEl.textContent = text;
}

function setPersonaState(text) {
  personaStateEl.textContent = text;
}

function createSkyDome() {
  const geometry = new THREE.SphereGeometry(220, 32, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0xcfe2b6) },
      horizonColor: { value: new THREE.Color(0xf6ead0) },
      bottomColor: { value: new THREE.Color(0xecf5ef) },
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
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y * 0.5 + 0.5;
        vec3 color = mix(bottomColor, horizonColor, smoothstep(0.0, 0.45, h));
        color = mix(color, topColor, smoothstep(0.55, 1.0, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function createPersona() {
  const root = new THREE.Group();
  root.position.set(0, 0, 0);

  const visual = new THREE.Group();
  root.add(visual);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 40),
    new THREE.MeshBasicMaterial({ color: 0x1e2319, transparent: true, opacity: 0.14 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  root.add(shadow);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8d3b4, roughness: 0.72, metalness: 0.05 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x315d5b, roughness: 0.58, metalness: 0.08 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd6774f, roughness: 0.42, metalness: 0.12 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xf4e5a2,
    emissive: 0xc89c2c,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.18,
  });

  const pelvis = makeBox(1.08, 0.55, 0.72, suitMat);
  pelvis.position.y = 1.08;
  visual.add(pelvis);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 1.36;
  visual.add(torsoPivot);

  const torso = makeBox(1.45, 1.56, 0.88, suitMat);
  torso.position.y = 0.84;
  torso.castShadow = true;
  torsoPivot.add(torso);

  const chestBand = makeBox(1.18, 0.24, 0.16, trimMat);
  chestBand.position.set(0, 0.92, 0.46);
  torsoPivot.add(chestBand);

  const neck = makeBox(0.34, 0.22, 0.3, bodyMat);
  neck.position.y = 1.66;
  torsoPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.66;
  torsoPivot.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 20), bodyMat);
  head.position.y = 0.48;
  head.castShadow = true;
  headPivot.add(head);

  const visor = makeBox(0.7, 0.2, 0.08, visorMat);
  visor.position.set(0, 0.48, 0.42);
  headPivot.add(visor);

  const backpack = makeBox(0.62, 0.96, 0.28, trimMat);
  backpack.position.set(0, 0.78, -0.56);
  torsoPivot.add(backpack);

  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.92, 1.26, 0);
  torsoPivot.add(leftShoulder);
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(-0.92, 1.26, 0);
  torsoPivot.add(rightShoulder);

  const leftElbow = new THREE.Group();
  const rightElbow = new THREE.Group();

  buildArm(leftShoulder, leftElbow, suitMat, trimMat, 1);
  buildArm(rightShoulder, rightElbow, suitMat, trimMat, -1);

  const leftHip = new THREE.Group();
  leftHip.position.set(0.38, 1.02, 0.05);
  visual.add(leftHip);
  const rightHip = new THREE.Group();
  rightHip.position.set(-0.38, 1.02, 0.05);
  visual.add(rightHip);

  const leftKnee = new THREE.Group();
  const rightKnee = new THREE.Group();
  buildLeg(leftHip, leftKnee, suitMat, trimMat);
  buildLeg(rightHip, rightKnee, suitMat, trimMat);

  return {
    root,
    visual,
    shadow,
    torsoPivot,
    headPivot,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    height: 0,
    velocityY: 0,
    onGround: true,
    crouchAlpha: 0,
    walkPhase: 0,
    facing: Math.PI,
    landingPulse: 0,
    bob: 0,
  };
}

function buildArm(shoulder, elbow, suitMat, trimMat, direction) {
  const upper = makeBox(0.34, 0.98, 0.34, suitMat);
  upper.position.y = -0.49;
  shoulder.add(upper);

  elbow.position.y = -0.96;
  shoulder.add(elbow);

  const forearm = makeBox(0.28, 0.92, 0.28, trimMat);
  forearm.position.y = -0.46;
  elbow.add(forearm);

  const hand = makeBox(0.24, 0.24, 0.24, new THREE.MeshStandardMaterial({ color: 0xefdbc2, roughness: 0.76 }));
  hand.position.y = -0.93;
  elbow.add(hand);

  shoulder.rotation.z = direction * 0.06;
}

function buildLeg(hip, knee, suitMat, trimMat) {
  const upper = makeBox(0.46, 1.12, 0.46, suitMat);
  upper.position.y = -0.56;
  hip.add(upper);

  knee.position.y = -1.06;
  hip.add(knee);

  const lower = makeBox(0.38, 1.02, 0.38, trimMat);
  lower.position.y = -0.51;
  knee.add(lower);

  const foot = makeBox(0.44, 0.18, 0.78, trimMat);
  foot.position.set(0, -1.03, 0.2);
  knee.add(foot);
}

function makeBox(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeSphere(radius, material, widthSegments = 18, heightSegments = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCylinder(radiusTop, radiusBottom, height, material, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function polylineLength(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += points[index].distanceTo(points[index + 1]);
  }
  return total;
}

function getRoadBounds(points, margin = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
    width: maxX - minX + margin * 2,
    depth: maxZ - minZ + margin * 2,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return new THREE.Vector3(
    0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    0,
    0.5 * (
      (2 * p1.z) +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
    )
  );
}

function sampleOpenCatmullRom(controlPoints, samplesPerSegment = 18) {
  const points = [];

  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const p0 = controlPoints[Math.max(index - 1, 0)];
    const p1 = controlPoints[index];
    const p2 = controlPoints[index + 1];
    const p3 = controlPoints[Math.min(index + 2, controlPoints.length - 1)];

    for (let step = 0; step < samplesPerSegment; step += 1) {
      points.push(catmullRomPoint(p0, p1, p2, p3, step / samplesPerSegment));
    }
  }

  points.push(controlPoints.at(-1).clone());
  return points;
}

function resampleOpenPolyline(points, targetCount) {
  if (points.length < 2) return points.slice();

  const lengths = [];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = points[index].distanceTo(points[index + 1]);
    lengths.push(length);
    totalLength += length;
  }

  if (totalLength === 0) return points.slice();

  const out = [];
  const step = totalLength / Math.max(targetCount - 1, 1);
  let segmentIndex = 0;
  let segmentStart = 0;

  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const targetDistance = Math.min(totalLength, targetIndex * step);

    while (segmentIndex < lengths.length - 1) {
      const length = lengths[segmentIndex];
      if (segmentStart + length >= targetDistance || length === 0) break;
      segmentStart += length;
      segmentIndex += 1;
    }

    const a = points[segmentIndex];
    const b = points[Math.min(segmentIndex + 1, points.length - 1)];
    const length = lengths[segmentIndex];

    if (length === 0) {
      out.push(a.clone());
    } else {
      out.push(a.clone().lerp(b, (targetDistance - segmentStart) / length));
    }
  }

  return out;
}

function createRoadRuntimeData() {
  const controlPoints = roadLayout.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const smoothPath = sampleOpenCatmullRom(controlPoints, 24);
  const sampleCount = Math.max(320, Math.ceil(polylineLength(smoothPath) * 0.55));
  const centerline = resampleOpenPolyline(smoothPath, sampleCount);
  const segmentLengths = [];
  let totalLength = 0;

  for (let index = 0; index < centerline.length - 1; index += 1) {
    const length = centerline[index].distanceTo(centerline[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }

  return {
    centerline,
    totalLength,
    segmentLengths,
    roadWidth: roadLayout.roadWidth ?? 8.4,
    wallOffset: roadLayout.wallOffset ?? 5.45,
    playHalfWidth: roadLayout.playHalfWidth ?? 5.0,
    spawnDistance: roadLayout.spawnDistance ?? 6.0,
    stationOffset: roadLayout.stationOffset ?? 7.4,
    stationStartPadding: roadLayout.stationStartPadding ?? 56,
    stationEndPadding: roadLayout.stationEndPadding ?? 48,
    bounds: getRoadBounds(centerline, 56),
  };
}

function sampleRoadAtDistance(distance) {
  const clampedDistance = THREE.MathUtils.clamp(distance, 0, roadData.totalLength);
  let walked = 0;

  for (let index = 0; index < roadData.segmentLengths.length; index += 1) {
    const length = roadData.segmentLengths[index];
    if (walked + length >= clampedDistance || index === roadData.segmentLengths.length - 1) {
      const localT = length === 0 ? 0 : (clampedDistance - walked) / length;
      const a = roadData.centerline[index];
      const b = roadData.centerline[index + 1];
      const position = a.clone().lerp(b, localT);
      const tangent = b.clone().sub(a).setY(0).normalize();
      return {
        position,
        tangent,
        facing: Math.atan2(tangent.x, tangent.z),
      };
    }
    walked += length;
  }

  const last = roadData.centerline.at(-1).clone();
  const prev = roadData.centerline.at(-2).clone();
  const tangent = last.clone().sub(prev).setY(0).normalize();
  return { position: last, tangent, facing: Math.atan2(tangent.x, tangent.z) };
}

class StationBuilder {
  constructor() {
    this.materials = {
      shrine: new THREE.MeshStandardMaterial({ color: 0xd8d0c5, roughness: 0.88, metalness: 0.0 }),
      shrineTrim: new THREE.MeshStandardMaterial({ color: 0xbbab92, roughness: 0.7, metalness: 0.02 }),
      checkpointGlow: new THREE.MeshStandardMaterial({
        color: 0xf4db8d,
        emissive: 0xb87c1d,
        emissiveIntensity: 0.55,
        roughness: 0.24,
        metalness: 0.04,
        transparent: true,
        opacity: 0.22,
      }),
      wood: new THREE.MeshStandardMaterial({ color: 0x7c5635, roughness: 0.82, metalness: 0.02 }),
      earth: new THREE.MeshStandardMaterial({ color: 0x8a735a, roughness: 0.95, metalness: 0.0 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x9c988f, roughness: 0.96, metalness: 0.0 }),
      pilgrim: new THREE.MeshStandardMaterial({ color: 0x315d5b, roughness: 0.6, metalness: 0.04 }),
      mother: new THREE.MeshStandardMaterial({ color: 0x7b90a7, roughness: 0.68, metalness: 0.02 }),
      helper: new THREE.MeshStandardMaterial({ color: 0xb06a45, roughness: 0.6, metalness: 0.03 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xe6dac7, roughness: 0.74, metalness: 0.0 }),
      soldier: new THREE.MeshStandardMaterial({ color: 0x4d5766, roughness: 0.56, metalness: 0.1 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xe8d3b4, roughness: 0.78, metalness: 0.0 }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xf0c86a,
        emissive: 0x8f6920,
        emissiveIntensity: 0.45,
        roughness: 0.26,
        metalness: 0.18,
      }),
      accent: new THREE.MeshStandardMaterial({ color: 0xd6774f, roughness: 0.45, metalness: 0.08 }),
    };
  }

  place(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  }

  buildStation(index, placement) {
    const station = new THREE.Group();
    station.name = `ProceduralStation_${String(index + 1).padStart(2, '0')}`;
    station.position.copy(placement.anchor);
    station.rotation.y = placement.facing;
    station.add(this.buildCheckpointGate(index + 1));
    station.add(this.buildShrineWing(index, -1));
    station.add(this.buildShrineWing(index, 1));

    return station;
  }

  populateStationScene(index, group) {
    switch (index) {
      case 0:
        this.buildCondemned(group);
        break;
      case 1:
        this.buildTakesCross(group);
        break;
      case 2:
        this.buildFirstFall(group);
        break;
      case 3:
        this.buildMeetsMother(group);
        break;
      case 4:
        this.buildSimonHelps(group);
        break;
      case 5:
        this.buildVeronica(group);
        break;
      case 6:
        this.buildSecondFall(group);
        break;
      case 7:
        this.buildWomenOfJerusalem(group);
        break;
      case 8:
        this.buildThirdFall(group);
        break;
      case 9:
        this.buildStripped(group);
        break;
      case 10:
        this.buildNailed(group);
        break;
      case 11:
        this.buildCrucifixion(group);
        break;
      case 12:
        this.buildTakenDown(group);
        break;
      case 13:
        this.buildTomb(group);
        break;
      default:
        break;
    }
  }

  buildCheckpointGate(number) {
    const gate = new THREE.Group();
    const laneWidth = roadData.wallOffset * 2 + 0.55;
    const pillarOffset = roadData.wallOffset + 0.2;
    const beamWidth = laneWidth + 0.8;

    const threshold = this.place(makeBox(beamWidth, 0.09, 0.62, this.materials.shrineTrim), 0, 0.05, 0);
    const glowBand = this.place(makeBox(laneWidth, 2.75, 0.18, this.materials.checkpointGlow), 0, 1.38, 0);
    const beam = this.place(makeBox(beamWidth, 0.34, 0.44, this.materials.shrineTrim), 0, 3.08, 0);
    const plaque = this.place(makeBox(1.3, 0.24, 0.14, this.materials.gold), 0, 3.08, 0.18);
    const seal = this.place(makeCylinder(0.14, 0.14, 0.18, this.materials.accent, 10), 0, 3.4, 0, Math.PI * 0.5);
    gate.add(threshold, glowBand, beam, plaque, seal);

    for (const sideSign of [-1, 1]) {
      const pillar = this.place(makeBox(0.5, 2.95, 0.56, this.materials.shrine), sideSign * pillarOffset, 1.48, 0);
      const plinth = this.place(makeBox(0.72, 0.36, 0.76, this.materials.stone), sideSign * pillarOffset, 0.18, 0);
      const lantern = this.place(makeSphere(0.13, this.materials.gold, 10, 8), sideSign * pillarOffset, 3.12, 0);
      gate.add(pillar, plinth, lantern);
    }

    return gate;
  }

  buildShrineWing(index, sideSign) {
    const wing = new THREE.Group();
    const shrineOffset = roadData.wallOffset + 0.42;
    wing.position.set(sideSign * shrineOffset, 0, 0);
    wing.rotation.y = sideSign < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    wing.scale.setScalar(0.34);

    wing.add(this.buildShrine(index + 1));

    const scene = new THREE.Group();
    scene.position.set(0, 0.12, -0.92);
    scene.scale.setScalar(0.86);
    wing.add(scene);
    this.populateStationScene(index, scene);

    return wing;
  }

  buildShrine(number) {
    const shrine = new THREE.Group();
    const floor = this.place(makeBox(5.6, 0.22, 4.5, this.materials.shrine), 0, 0.11, -0.45);
    const backWall = this.place(makeBox(5.0, 3.1, 0.28, this.materials.shrine), 0, 1.55, -2.15);
    const leftWall = this.place(makeBox(0.28, 2.3, 2.5, this.materials.shrine), -2.38, 1.15, -0.95);
    const rightWall = this.place(makeBox(0.28, 2.3, 2.5, this.materials.shrine), 2.38, 1.15, -0.95);
    const lintel = this.place(makeBox(5.0, 0.32, 0.36, this.materials.shrineTrim), 0, 2.78, -2.05);
    const plaque = this.place(makeBox(1.4, 0.2, 0.1, this.materials.gold), 0, 2.22, -1.98);
    const marker = this.place(makeCylinder(0.08, 0.08, 0.16, this.materials.accent, 10), 0, 2.55, -1.86);

    shrine.add(floor, backWall, leftWall, rightWall, lintel, plaque, marker);

    const studStart = -1.5 + (number % 2 === 0 ? 0.18 : 0);
    for (let index = 0; index < 4; index += 1) {
      const stud = this.place(makeSphere(0.08, this.materials.shrineTrim, 10, 8), studStart + index, 0.24, 1.38);
      shrine.add(stud);
    }

    return shrine;
  }

  createFigure({
    scale = 1,
    torsoMat = this.materials.pilgrim,
    limbMat = torsoMat,
    headMat = this.materials.skin,
    accentMat = this.materials.accent,
    leanX = 0,
    leanZ = 0,
    leftArmX = 0,
    rightArmX = 0,
    leftArmZ = 0.16,
    rightArmZ = -0.16,
    leftLegX = 0,
    rightLegX = 0,
    crouch = 0,
    prone = false,
    halo = false,
  } = {}) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.rotation.x = leanX;
    body.rotation.z = leanZ;
    group.add(body);

    const pelvis = this.place(makeBox(0.42 * scale, 0.24 * scale, 0.3 * scale, limbMat), 0, 0.62 * scale, 0);
    const torso = this.place(makeBox(0.64 * scale, 0.86 * scale, 0.34 * scale, torsoMat), 0, 1.14 * scale - crouch * 0.18 * scale, 0);
    const sash = this.place(makeBox(0.48 * scale, 0.12 * scale, 0.08 * scale, accentMat), 0, 1.18 * scale - crouch * 0.12 * scale, 0.22 * scale);
    const head = this.place(makeSphere(0.22 * scale, headMat, 14, 10), 0, 1.82 * scale - crouch * 0.16 * scale, 0.02 * scale);
    body.add(pelvis, torso, sash, head);

    if (halo) {
      const ring = this.place(makeCylinder(0.18 * scale, 0.18 * scale, 0.05 * scale, this.materials.gold, 14), 0, 1.96 * scale, -0.02 * scale, Math.PI * 0.5);
      body.add(ring);
    }

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(0.44 * scale, 1.22 * scale - crouch * 0.08 * scale, 0);
    leftArmPivot.rotation.set(leftArmX, 0, leftArmZ);
    const leftArm = this.place(makeBox(0.18 * scale, 0.76 * scale, 0.18 * scale, limbMat), 0, -0.38 * scale, 0);
    leftArmPivot.add(leftArm);
    body.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(-0.44 * scale, 1.22 * scale - crouch * 0.08 * scale, 0);
    rightArmPivot.rotation.set(rightArmX, 0, rightArmZ);
    const rightArm = this.place(makeBox(0.18 * scale, 0.76 * scale, 0.18 * scale, limbMat), 0, -0.38 * scale, 0);
    rightArmPivot.add(rightArm);
    body.add(rightArmPivot);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(0.15 * scale, 0.5 * scale, 0);
    leftLegPivot.rotation.x = leftLegX;
    const leftLeg = this.place(makeBox(0.2 * scale, 0.86 * scale, 0.2 * scale, limbMat), 0, -0.43 * scale, 0);
    const leftFoot = this.place(makeBox(0.24 * scale, 0.1 * scale, 0.34 * scale, accentMat), 0, -0.84 * scale, 0.08 * scale);
    leftLegPivot.add(leftLeg, leftFoot);
    body.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(-0.15 * scale, 0.5 * scale, 0);
    rightLegPivot.rotation.x = rightLegX;
    const rightLeg = this.place(makeBox(0.2 * scale, 0.86 * scale, 0.2 * scale, limbMat), 0, -0.43 * scale, 0);
    const rightFoot = this.place(makeBox(0.24 * scale, 0.1 * scale, 0.34 * scale, accentMat), 0, -0.84 * scale, 0.08 * scale);
    rightLegPivot.add(rightLeg, rightFoot);
    body.add(rightLegPivot);

    if (prone) {
      group.rotation.x = Math.PI * 0.5;
      group.position.y = 0.18 * scale;
    }

    return group;
  }

  createCross({ height = 2.8, beamWidth = 1.5, beamHeightRatio = 0.68, tShape = false } = {}) {
    const cross = new THREE.Group();
    const stem = this.place(makeBox(0.22, height, 0.22, this.materials.wood), 0, height * 0.5, 0);
    const beamY = height * (tShape ? 0.82 : beamHeightRatio);
    const beam = this.place(makeBox(beamWidth, 0.18, 0.24, this.materials.wood), 0, beamY, 0);
    cross.add(stem, beam);
    return cross;
  }

  createArch(width = 3.0, height = 2.4) {
    const arch = new THREE.Group();
    arch.add(this.place(makeCylinder(0.12, 0.12, height, this.materials.shrineTrim, 10), -width * 0.33, height * 0.5, 0));
    arch.add(this.place(makeCylinder(0.12, 0.12, height, this.materials.shrineTrim, 10), width * 0.33, height * 0.5, 0));
    arch.add(this.place(makeBox(width, 0.24, 0.28, this.materials.shrineTrim), 0, height, 0));
    return arch;
  }

  buildCondemned(group) {
    group.add(this.place(makeBox(2.8, 0.46, 1.7, this.materials.stone), 0, 0.24, -0.82));
    const arch = this.createArch(3.1, 2.2);
    arch.position.set(0, 0.46, -0.98);
    group.add(arch);
    const figure = this.createFigure({ halo: true, rightArmX: -0.4, leftArmX: -0.1 });
    figure.position.set(0, 0, 0.92);
    group.add(figure);
  }

  buildTakesCross(group) {
    const figure = this.createFigure({ halo: true, leanZ: -0.18, leftArmX: -0.85, rightArmX: -0.55, leftLegX: 0.24, rightLegX: -0.18 });
    figure.position.set(-0.35, 0, 0.52);
    group.add(figure);

    const cross = this.createCross({ height: 3.0, beamWidth: 1.7, tShape: true });
    cross.position.set(0.62, 0, 0.08);
    cross.rotation.z = -0.48;
    group.add(cross);
  }

  buildFirstFall(group) {
    const cross = this.createCross({ height: 2.7, beamWidth: 1.5, tShape: true });
    cross.position.set(0.25, 0.1, 0.25);
    cross.rotation.z = -1.0;
    group.add(cross);

    const figure = this.createFigure({ halo: true, prone: true, leftArmX: -0.22, rightArmX: 0.22 });
    figure.position.set(-0.2, 0.02, 0.48);
    figure.rotation.z = 0.18;
    group.add(figure);
  }

  buildMeetsMother(group) {
    const christ = this.createFigure({ halo: true, leanZ: -0.08, rightArmX: -0.35, leftArmX: -0.12 });
    christ.position.set(-0.72, 0, 0.42);
    christ.rotation.y = 0.45;
    group.add(christ);

    const mother = this.createFigure({
      torsoMat: this.materials.mother,
      limbMat: this.materials.mother,
      accentMat: this.materials.cloth,
      halo: true,
      leftArmX: -0.18,
      rightArmX: -0.22,
    });
    mother.position.set(0.76, 0, 0.28);
    mother.rotation.y = -0.5;
    group.add(mother);
  }

  buildSimonHelps(group) {
    const cross = this.createCross({ height: 2.8, beamWidth: 1.6 });
    cross.position.set(0.18, 0, -0.18);
    cross.rotation.z = -0.24;
    group.add(cross);

    const christ = this.createFigure({ halo: true, leanZ: -0.16, leftArmX: -0.74, rightArmX: -0.44 });
    christ.position.set(-0.68, 0, 0.38);
    group.add(christ);

    const simon = this.createFigure({
      torsoMat: this.materials.helper,
      limbMat: this.materials.helper,
      accentMat: this.materials.cloth,
      leftArmX: -0.82,
      rightArmX: -0.4,
      leftLegX: -0.12,
      rightLegX: 0.2,
    });
    simon.position.set(0.72, 0, 0.14);
    group.add(simon);
  }

  buildVeronica(group) {
    const pilgrim = this.createFigure({ halo: true, leanZ: -0.08, leftArmX: -0.24, rightArmX: -0.3 });
    pilgrim.position.set(0.72, 0, 0.34);
    pilgrim.rotation.y = -0.35;
    group.add(pilgrim);

    const veronica = this.createFigure({
      torsoMat: this.materials.cloth,
      limbMat: this.materials.mother,
      accentMat: this.materials.gold,
      leftArmX: -1.0,
      rightArmX: -0.95,
    });
    veronica.position.set(-0.82, 0, 0.36);
    veronica.rotation.y = 0.32;
    group.add(veronica);

    group.add(this.place(makeBox(0.8, 0.8, 0.12, this.materials.cloth), -0.08, 1.24, 0.12));
    group.add(this.place(makeSphere(0.12, this.materials.gold, 10, 8), -0.08, 1.25, 0.2));
  }

  buildSecondFall(group) {
    group.add(this.place(makeCylinder(0.72, 0.96, 0.42, this.materials.earth, 10), 0.22, 0.21, 0.05));
    const figure = this.createFigure({ halo: true, prone: true });
    figure.position.set(0.08, 0.34, 0.16);
    figure.rotation.z = -0.42;
    group.add(figure);

    const cross = this.createCross({ height: 2.4, beamWidth: 1.35 });
    cross.position.set(-0.86, 0, -0.18);
    cross.rotation.z = 0.7;
    group.add(cross);
  }

  buildWomenOfJerusalem(group) {
    const main = this.createFigure({ halo: true, rightArmX: -0.55, leftArmX: -0.35 });
    main.position.set(0, 0, 0.72);
    main.rotation.y = Math.PI;
    group.add(main);

    const crowdOffsets = [
      [-0.9, -0.18],
      [0, -0.42],
      [0.9, -0.18],
    ];
    for (const [x, z] of crowdOffsets) {
      const person = this.createFigure({
        scale: 0.8,
        torsoMat: this.materials.cloth,
        limbMat: this.materials.mother,
        accentMat: this.materials.gold,
        leftArmX: -0.15,
        rightArmX: -0.18,
      });
      person.position.set(x, 0, z);
      group.add(person);
    }
  }

  buildThirdFall(group) {
    const figure = this.createFigure({ halo: true, prone: true });
    figure.position.set(0, 0.02, 0.28);
    figure.rotation.z = -0.02;
    group.add(figure);
    group.add(this.place(makeBox(1.9, 0.18, 0.32, this.materials.wood), 1.15, 0.12, -0.18, 0, 0, -0.12));
    group.add(this.place(makeBox(0.24, 2.1, 0.24, this.materials.wood), 1.7, 0.96, -0.18, 0, 0, 0.28));
  }

  buildStripped(group) {
    const central = this.createFigure({
      torsoMat: this.materials.cloth,
      limbMat: this.materials.cloth,
      accentMat: this.materials.gold,
      halo: true,
      leftArmX: -0.65,
      rightArmX: -0.65,
    });
    central.position.set(0, 0, 0.3);
    group.add(central);

    const leftSoldier = this.createFigure({
      torsoMat: this.materials.soldier,
      limbMat: this.materials.soldier,
      accentMat: this.materials.gold,
      leftArmX: -0.1,
      rightArmX: -0.55,
    });
    leftSoldier.position.set(-1.2, 0, 0.12);
    leftSoldier.rotation.y = 0.36;
    group.add(leftSoldier);
    group.add(this.place(makeCylinder(0.04, 0.04, 1.8, this.materials.wood, 8), -1.55, 0.92, 0.2));

    const rightSoldier = this.createFigure({
      torsoMat: this.materials.soldier,
      limbMat: this.materials.soldier,
      accentMat: this.materials.gold,
      leftArmX: -0.55,
      rightArmX: -0.1,
    });
    rightSoldier.position.set(1.2, 0, 0.12);
    rightSoldier.rotation.y = -0.36;
    group.add(rightSoldier);
    group.add(this.place(makeCylinder(0.04, 0.04, 1.8, this.materials.wood, 8), 1.55, 0.92, 0.2));
  }

  buildNailed(group) {
    const cross = this.createCross({ height: 3.2, beamWidth: 1.9 });
    cross.position.set(0, 0.1, -0.12);
    cross.rotation.x = Math.PI * 0.5;
    group.add(cross);

    const figure = this.createFigure({
      halo: true,
      prone: true,
      leftArmZ: 0,
      rightArmZ: 0,
      leftArmX: -1.5,
      rightArmX: -1.5,
    });
    figure.position.set(0, 0.24, -0.12);
    figure.scale.set(1, 1, 0.92);
    group.add(figure);

    group.add(this.place(makeSphere(0.08, this.materials.gold, 10, 8), 0.66, 0.32, -0.12));
    group.add(this.place(makeSphere(0.08, this.materials.gold, 10, 8), -0.66, 0.32, -0.12));
    group.add(this.place(makeSphere(0.08, this.materials.gold, 10, 8), 0, 0.12, 1.16));
  }

  buildCrucifixion(group) {
    const left = this.createCross({ height: 2.5, beamWidth: 1.2 });
    left.position.set(-1.45, 0, -0.62);
    group.add(left);

    const center = this.createCross({ height: 3.4, beamWidth: 1.7 });
    center.position.set(0, 0, -0.92);
    group.add(center);

    const right = this.createCross({ height: 2.5, beamWidth: 1.2 });
    right.position.set(1.45, 0, -0.62);
    group.add(right);

    group.add(this.place(makeBox(4.6, 0.32, 1.1, this.materials.earth), 0, 0.16, 1.05));
  }

  buildTakenDown(group) {
    const tiltedCross = this.createCross({ height: 2.8, beamWidth: 1.3 });
    tiltedCross.position.set(1.16, 0, -0.8);
    tiltedCross.rotation.z = 0.58;
    group.add(tiltedCross);

    const body = this.createFigure({ prone: true });
    body.position.set(0.02, 0.38, 0.12);
    body.rotation.z = -0.22;
    group.add(body);

    const mother = this.createFigure({
      torsoMat: this.materials.mother,
      limbMat: this.materials.mother,
      accentMat: this.materials.cloth,
      halo: true,
      leftArmX: -0.48,
      rightArmX: -0.72,
    });
    mother.position.set(-0.92, 0, 0.34);
    mother.rotation.y = 0.44;
    group.add(mother);

    const helper = this.createFigure({
      torsoMat: this.materials.helper,
      limbMat: this.materials.helper,
      accentMat: this.materials.gold,
      leftArmX: -0.56,
      rightArmX: -0.28,
    });
    helper.position.set(0.86, 0, 0.18);
    helper.rotation.y = -0.3;
    group.add(helper);
  }

  buildTomb(group) {
    group.add(this.place(makeBox(3.8, 2.2, 2.2, this.materials.stone), 0, 1.1, -0.92));
    group.add(this.place(makeBox(2.4, 1.6, 2.0, this.materials.shrine), 0, 1.24, -0.28));
    group.add(this.place(makeBox(2.1, 0.28, 1.0, this.materials.shrineTrim), 0, 0.18, 0.82));
    group.add(this.place(makeSphere(0.52, this.materials.stone, 14, 10), 1.52, 0.52, 0.56));
  }
}

let stationBuilder = null;

function getStationBuilder() {
  if (!stationBuilder) {
    stationBuilder = new StationBuilder();
  }
  return stationBuilder;
}

function createStationPlacements() {
  const placements = [];
  const startPadding = Math.min(roadData.stationStartPadding, roadData.totalLength * 0.22);
  const endPadding = Math.min(roadData.stationEndPadding, roadData.totalLength * 0.18);
  const usableLength = Math.max(140, roadData.totalLength - startPadding - endPadding);

  for (let index = 0; index < STATION_COUNT; index += 1) {
    const distance = startPadding + usableLength * ((index + 0.5) / STATION_COUNT);
    const sample = sampleRoadAtDistance(distance);

    placements.push({
      index,
      anchor: sample.position.clone(),
      roadPoint: sample.position,
      tangent: sample.tangent,
      normal: new THREE.Vector3(-sample.tangent.z, 0, sample.tangent.x),
      facing: sample.facing,
    });
  }

  return placements;
}

function createProceduralStations() {
  const stations = new THREE.Group();
  stations.name = 'ProceduralStations';
  const builder = getStationBuilder();

  for (const placement of createStationPlacements()) {
    stations.add(builder.buildStation(placement.index, placement));
  }

  return stations;
}

function mountProceduralStations(parent) {
  if (world.stationGroup) return;
  world.stationGroup = createProceduralStations();
  parent.add(world.stationGroup);
}

function createRoadBoundarySystem() {
  const group = new THREE.Group();
  group.name = 'RoadBoundaryColliders';
  const fallbackWalls = [];
  const capMeshes = [];
  const raycaster = new THREE.Raycaster();
  const rayDirections = [];

  for (let i = 0; i < BOUNDARY_RAY_COUNT; i += 1) {
    const angle = (i / BOUNDARY_RAY_COUNT) * Math.PI * 2;
    rayDirections.push(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)));
  }

  const colliderMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const thickness = 0.7;
  const height = 2.4;

  for (let index = 0; index < roadData.centerline.length - 1; index += 1) {
    const a = roadData.centerline[index];
    const b = roadData.centerline[index + 1];
    const segment = b.clone().sub(a);
    const length = segment.length();
    if (length <= 0.001) continue;

    const tangent = segment.clone().normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const angle = Math.atan2(tangent.x, tangent.z);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(length + 1.4, height, thickness),
        colliderMaterial
      );
      wall.position.set(
        midpoint.x + normal.x * side * (roadData.wallOffset + thickness * 0.5),
        height * 0.5,
        midpoint.z + normal.z * side * (roadData.wallOffset + thickness * 0.5)
      );
      wall.rotation.y = angle;
      wall.visible = false;
      group.add(wall);
      fallbackWalls.push(wall);
    }
  }

  const addCap = (sampleIndex, flip = 0) => {
    const anchor = roadData.centerline[sampleIndex];
    const nextIndex = THREE.MathUtils.clamp(sampleIndex + (flip ? -1 : 1), 0, roadData.centerline.length - 1);
    const tangent = roadData.centerline[nextIndex].clone().sub(anchor).normalize();
    const angle = Math.atan2(tangent.x, tangent.z);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, height, roadData.wallOffset * 2.3),
      colliderMaterial
    );
    cap.position.set(anchor.x, height * 0.5, anchor.z);
    cap.rotation.y = angle;
    cap.visible = false;
    group.add(cap);
    capMeshes.push(cap);
  };

  addCap(0, 0);
  addCap(roadData.centerline.length - 1, 1);

  group.updateMatrixWorld(true);

  return {
    group,
    wallMeshes: [...fallbackWalls, ...capMeshes],
    fallbackWalls,
    capMeshes,
    raycaster,
    rayDirections,
    lastSafePos: new THREE.Vector3(),
    lastSafeFacing: Math.PI,
    hasSafePos: false,
  };
}

function setActiveBoundaryMeshes(meshes) {
  const activeMeshes =
    meshes.length > 0 ? [...meshes, ...roadBoundary.capMeshes] : [...roadBoundary.fallbackWalls, ...roadBoundary.capMeshes];

  for (const mesh of activeMeshes) {
    mesh.updateMatrixWorld(true);
  }

  roadBoundary.wallMeshes = activeMeshes;
  roadBoundary.hasSafePos = false;
}

function extractEnvironmentObjects(root) {
  const walls = [];
  let startBand = null;

  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.name.startsWith('WallLeft_') || child.name.startsWith('WallRight_')) {
      walls.push(child);
    }
    if (child.name === 'StartGate_Band') {
      startBand = child;
    }
  });

  return { walls, startBand };
}

function constrainPlayerToWalls() {
  const pos = player.root.position;
  const origin = new THREE.Vector3(pos.x, pos.y + 1.0, pos.z);
  let collided = false;
  let totalPushX = 0;
  let totalPushZ = 0;

  for (const dir of roadBoundary.rayDirections) {
    roadBoundary.raycaster.set(origin, dir);
    roadBoundary.raycaster.far = PERSONA_RADIUS;

    const hits = roadBoundary.raycaster.intersectObjects(roadBoundary.wallMeshes, false);
    if (hits.length === 0) continue;

    const hit = hits[0];
    const penetration = PERSONA_RADIUS - hit.distance;
    if (penetration <= 0 || !hit.face) continue;

    collided = true;
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);
    normal.y = 0;
    normal.normalize();

    totalPushX += normal.x * (penetration + BOUNDARY_PUSH_MARGIN);
    totalPushZ += normal.z * (penetration + BOUNDARY_PUSH_MARGIN);
  }

  if (collided) {
    pos.x += totalPushX;
    pos.z += totalPushZ;

    const verifyOrigin = new THREE.Vector3(pos.x, pos.y + 1.0, pos.z);
    let stillInside = false;

    for (const dir of roadBoundary.rayDirections) {
      roadBoundary.raycaster.set(verifyOrigin, dir);
      roadBoundary.raycaster.far = PERSONA_RADIUS * 0.8;
      const hits = roadBoundary.raycaster.intersectObjects(roadBoundary.wallMeshes, false);
      if (hits.length > 0 && hits[0].distance < PERSONA_RADIUS * 0.5) {
        stillInside = true;
        break;
      }
    }

    if (stillInside && roadBoundary.hasSafePos) {
      pos.copy(roadBoundary.lastSafePos);
      player.facing = roadBoundary.lastSafeFacing;
    }
  } else {
    roadBoundary.lastSafePos.copy(pos);
    roadBoundary.lastSafeFacing = player.facing;
    roadBoundary.hasSafePos = true;
  }
}

function createSpawnFromMarker(marker) {
  const fallback = sampleRoadAtDistance(roadData.spawnDistance);
  const position = new THREE.Vector3();
  marker.getWorldPosition(position);

  const tangent = new THREE.Vector3(1, 0, 0);
  marker.getWorldQuaternion(tmpQuaternion);
  tangent.applyQuaternion(tmpQuaternion).setY(0);
  if (tangent.lengthSq() < 0.0001) {
    tangent.copy(fallback.tangent);
  } else {
    tangent.normalize();
    if (tangent.dot(fallback.tangent) < 0) {
      tangent.negate();
    }
  }

  position.addScaledVector(tangent, 1.6);
  position.y = 0;

  return {
    position,
    facing: Math.atan2(tangent.x, tangent.z),
  };
}

function resetPlayerToRoadStart(spawnOverride = null) {
  const spawn = spawnOverride ?? sampleRoadAtDistance(roadData.spawnDistance);
  player.root.position.set(spawn.position.x, 0, spawn.position.z);
  player.facing = spawn.facing;
  player.height = 0;
  player.velocityY = 0;
  player.crouchAlpha = 0;
  cameraState.yaw = spawn.facing + Math.PI;

  const target = spawn.position.clone();
  target.y = CAMERA_HEIGHT;
  const initialOffset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(CAMERA_DISTANCE, Math.PI / 2 - cameraState.pitch, cameraState.yaw)
  );
  camera.position.copy(target).add(initialOffset);
  camera.lookAt(target);
}

function buildFallbackArena() {
  if (world.usingFallback) return;

  world.usingFallback = true;

  const fallback = new THREE.Group();

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x232425, roughness: 0.92, metalness: 0.0 });
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x66594d, roughness: 0.96, metalness: 0.0 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x999896, roughness: 0.86, metalness: 0.0 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5c7a4a, roughness: 1.0, metalness: 0.0 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(roadData.bounds.width, 0.3, roadData.bounds.depth), grassMat);
  ground.position.set(roadData.bounds.centerX, -0.15, roadData.bounds.centerZ);
  ground.receiveShadow = true;
  fallback.add(ground);

  for (let index = 0; index < roadData.centerline.length - 1; index += 1) {
    const a = roadData.centerline[index];
    const b = roadData.centerline[index + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const tangentX = dx / (length || 1);
    const tangentZ = dz / (length || 1);
    const normalX = -tangentZ;
    const normalZ = tangentX;

    const road = new THREE.Mesh(new THREE.BoxGeometry(length + 0.4, 0.14, roadData.roadWidth), roadMat);
    road.position.set(midpoint.x, 0.06, midpoint.z);
    road.rotation.y = angle;
    road.receiveShadow = true;
    fallback.add(road);

    const shoulder = new THREE.Mesh(
      new THREE.BoxGeometry(length + 0.35, 0.08, (roadData.wallOffset - roadData.roadWidth * 0.5) * 2),
      shoulderMat
    );
    shoulder.position.set(midpoint.x, 0.03, midpoint.z);
    shoulder.rotation.y = angle;
    shoulder.receiveShadow = true;
    fallback.add(shoulder);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length + 0.25, 1.6, 0.55), wallMat);
      wall.position.set(
        midpoint.x + normalX * side * (roadData.wallOffset + 0.28),
        0.8,
        midpoint.z + normalZ * side * (roadData.wallOffset + 0.28)
      );
      wall.rotation.y = angle;
      wall.castShadow = true;
      wall.receiveShadow = true;
      fallback.add(wall);
    }
  }
  mountProceduralStations(fallback);

  environmentAnchor.add(fallback);
}

function loadEnvironment() {
  const loader = new GLTFLoader();
  const environmentUrl = `${import.meta.env.BASE_URL}via_crucis_route.glb?v=3`;

  loader.load(
    environmentUrl,
    (gltf) => {
      environmentAnchor.add(gltf.scene);
      gltf.scene.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.name.startsWith('Station_')) {
          child.visible = false;
          child.castShadow = false;
          child.receiveShadow = false;
          return;
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!material || !('color' in material)) continue;

          if (child.name === 'Road') {
            material.color.set(0x5c6155);
            material.roughness = 0.96;
            material.metalness = 0.02;
          } else if (child.name.startsWith('Shoulder')) {
            material.color.set(0x8a785e);
            material.roughness = 0.98;
            material.metalness = 0.0;
          } else if (
            child.name.startsWith('WallLeft_') ||
            child.name.startsWith('WallRight_') ||
            child.name.startsWith('StartGate') ||
            child.name.startsWith('FinishGate')
          ) {
            material.color.set(0xd8d2c4);
            material.roughness = 0.84;
            material.metalness = 0.0;
          } else if (child.name.startsWith('Stripe_')) {
            material.color.set(0xf3e6bc);
            material.roughness = 0.58;
            material.metalness = 0.0;
          } else if (child.name.startsWith('Station_')) {
            if (
              child.name.includes('Halo') ||
              child.name.includes('Seal') ||
              child.name.includes('Sun') ||
              child.name.includes('FaceImprint') ||
              child.name.includes('Nail_')
            ) {
              material.color.set(0xf2cc6b);
              material.emissive.set(0x9f6d12);
              material.emissiveIntensity = 0.55;
            } else if (child.name.includes('Veil') || child.name.includes('Robe') || child.name.includes('Mary')) {
              material.color.set(0xe8dcc7);
              material.roughness = 0.82;
            } else if (child.name.includes('Stone') || child.name.includes('Mound') || child.name.includes('Chamber')) {
              material.color.set(0x8c857a);
              material.roughness = 0.92;
            } else {
              material.color.set(0x9a5b43);
              material.roughness = 0.58;
            }
          }
        }
        if (child.material && 'envMapIntensity' in child.material) {
          child.material.envMapIntensity = 0.7;
        }
      });
      mountProceduralStations(environmentAnchor);
      const environmentObjects = extractEnvironmentObjects(gltf.scene);
      setActiveBoundaryMeshes(environmentObjects.walls);
      if (environmentObjects.startBand) {
        resetPlayerToRoadStart(createSpawnFromMarker(environmentObjects.startBand));
      }
      world.environmentReady = true;
      setArenaStatus('Via Crucis road ready');
    },
    undefined,
    () => {
      buildFallbackArena();
      setActiveBoundaryMeshes([]);
      setArenaStatus('Fallback road active');
    }
  );
}

function rotateCamera(deltaX, deltaY, sensitivity) {
  cameraState.yaw -= deltaX * sensitivity;
  cameraState.pitch -= deltaY * sensitivity;
  cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch, -0.2, 0.62);
}

function damp(current, target, lambda, delta) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));
}

function dampAngle(current, target, lambda, delta) {
  const wrapped = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + wrapped * (1 - Math.exp(-lambda * delta));
}

function updatePlayer(delta) {
  const forwardInput = Number(controls.forward) - Number(controls.backward);
  const strafeInput = Number(controls.right) - Number(controls.left);

  tmpForward.set(Math.sin(cameraState.yaw), 0, Math.cos(cameraState.yaw));
  tmpRight.set(tmpForward.z, 0, -tmpForward.x);
  tmpMove.set(0, 0, 0);
  tmpMove.addScaledVector(tmpForward, forwardInput);
  tmpMove.addScaledVector(tmpRight, strafeInput);

  if (tmpMove.lengthSq() > 1) {
    tmpMove.normalize();
  }

  const wantsCrouch = controls.crouch && player.onGround;
  const speed = world.xr.locomotionMode === 'smooth-move' ? (wantsCrouch ? CROUCH_SPEED : WALK_SPEED) : 0;

  if (tmpMove.lengthSq() > 0) {
    player.root.position.addScaledVector(tmpMove, speed * delta);
    player.facing = dampAngle(player.facing, Math.atan2(tmpMove.x, tmpMove.z), 12, delta);
  }

  constrainPlayerToWalls();

  if (controls.jumpQueued && player.onGround && !wantsCrouch) {
    player.velocityY = JUMP_SPEED;
    player.onGround = false;
    controls.jumpQueued = false;
  } else {
    controls.jumpQueued = false;
  }

  if (!player.onGround) {
    player.velocityY -= GRAVITY * delta;
    player.height += player.velocityY * delta;
    if (player.height <= 0) {
      player.height = 0;
      player.velocityY = 0;
      player.onGround = true;
      player.landingPulse = 1;
    }
  }

  player.crouchAlpha = damp(player.crouchAlpha, wantsCrouch ? 1 : 0, 9, delta);
  player.walkPhase += delta * (tmpMove.lengthSq() > 0 ? 8.2 : 2.4);
  player.landingPulse = damp(player.landingPulse, 0, 7, delta);

  const moveIntensity = tmpMove.lengthSq() > 0 ? 1 : 0;
  const walkSwing = Math.sin(player.walkPhase * 1.25) * 0.72 * moveIntensity;
  const armSwing = Math.sin(player.walkPhase * 1.25 + Math.PI) * 0.6 * moveIntensity;
  const bob = Math.sin(player.walkPhase * 2.5) * 0.08 * moveIntensity;
  const airborne = !player.onGround;

  player.root.rotation.y = player.facing;
  player.root.position.y = player.height;
  player.shadow.scale.setScalar(1 - Math.min(player.height * 0.06, 0.3));
  player.shadow.material.opacity = 0.14 - Math.min(player.height * 0.01, 0.07);

  player.visual.position.y = PERSONA_FLOOR_OFFSET + bob - player.landingPulse * 0.14;
  player.torsoPivot.position.y = 1.36 - player.crouchAlpha * 0.58;
  player.torsoPivot.rotation.x = player.crouchAlpha * 0.34 + bob * 0.05 - (airborne ? 0.12 : 0);
  player.headPivot.position.y = 1.66 - player.crouchAlpha * 0.16 + player.landingPulse * 0.06;

  if (airborne) {
    player.leftShoulder.rotation.x = -1.05;
    player.rightShoulder.rotation.x = -1.05;
    player.leftElbow.rotation.x = -0.45;
    player.rightElbow.rotation.x = -0.45;
    player.leftHip.rotation.x = 0.55;
    player.rightHip.rotation.x = 0.55;
    player.leftKnee.rotation.x = 0.92;
    player.rightKnee.rotation.x = 0.92;
  } else {
    player.leftShoulder.rotation.x = -armSwing + player.crouchAlpha * 0.3;
    player.rightShoulder.rotation.x = armSwing + player.crouchAlpha * 0.3;
    player.leftElbow.rotation.x = Math.max(0, -armSwing) * 0.4;
    player.rightElbow.rotation.x = Math.max(0, armSwing) * 0.4;

    player.leftHip.rotation.x = walkSwing - player.crouchAlpha * 0.88;
    player.rightHip.rotation.x = -walkSwing - player.crouchAlpha * 0.88;
    player.leftKnee.rotation.x = Math.max(0, -walkSwing) * 0.9 + player.crouchAlpha * 1.1;
    player.rightKnee.rotation.x = Math.max(0, walkSwing) * 0.9 + player.crouchAlpha * 1.1;
  }

  if (airborne) {
    setPersonaState('Jumping');
  } else if (player.crouchAlpha > 0.45) {
    setPersonaState('Crouching');
  } else if (moveIntensity > 0) {
    setPersonaState('Walking');
  } else {
    setPersonaState('Idle');
  }
}

function updateCamera(delta) {
  tmpCameraTarget.copy(player.root.position);
  tmpCameraTarget.y += CAMERA_HEIGHT - player.crouchAlpha * 0.3;

  spherical.radius = CAMERA_DISTANCE;
  spherical.phi = Math.PI / 2 - cameraState.pitch;
  spherical.theta = cameraState.yaw;
  tmpCameraOffset.setFromSpherical(spherical);

  const desiredPosition = tmpCameraTarget.clone().add(tmpCameraOffset);
  camera.position.lerp(desiredPosition, 1 - Math.exp(-10 * delta));
  camera.lookAt(tmpCameraTarget);

  sun.target.position.set(player.root.position.x, 0, player.root.position.z);
  sun.position.set(player.root.position.x + 28, 42, player.root.position.z + 14);
  bounceLight.position.set(player.root.position.x, 4.5, player.root.position.z);
}

function animate(time) {
  requestAnimationFrame(animate);
  timer.update(time);
  const delta = Math.min(timer.getDelta(), 0.033);

  updatePlayer(delta);
  updateCamera(delta);

  renderer.render(scene, camera);
}

function onKeyDown(event) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
  }

  switch (event.code) {
    case 'KeyW':
      controls.backward = true;
      break;
    case 'KeyS':
      controls.forward = true;
      break;
    case 'ArrowUp':
      controls.forward = true;
      break;
    case 'ArrowDown':
      controls.backward = true;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      controls.left = true;
      break;
    case 'KeyD':
    case 'ArrowRight':
      controls.right = true;
      break;
    case 'ControlLeft':
    case 'ControlRight':
      controls.crouch = true;
      break;
    case 'Space':
      controls.jumpQueued = true;
      break;
    default:
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'KeyW':
      controls.backward = false;
      break;
    case 'KeyS':
      controls.forward = false;
      break;
    case 'ArrowUp':
      controls.forward = false;
      break;
    case 'ArrowDown':
      controls.backward = false;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      controls.left = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      controls.right = false;
      break;
    case 'ControlLeft':
    case 'ControlRight':
      controls.crouch = false;
      break;
    default:
      break;
  }
}

function bindPointerControls() {
  viewport.addEventListener('click', () => {
    if (window.matchMedia('(pointer: fine)').matches) {
      viewport.requestPointerLock?.();
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === viewport) {
      rotateCamera(event.movementX, event.movementY, MOUSE_LOOK_SPEED);
    }
  });

  viewport.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.control-button')) return;
    if (event.pointerType !== 'touch') return;

    cameraState.touchPointerId = event.pointerId;
    cameraState.lastTouchX = event.clientX;
    cameraState.lastTouchY = event.clientY;
  });

  window.addEventListener('pointermove', (event) => {
    if (event.pointerId !== cameraState.touchPointerId) return;
    const deltaX = event.clientX - cameraState.lastTouchX;
    const deltaY = event.clientY - cameraState.lastTouchY;
    rotateCamera(deltaX, deltaY, TOUCH_LOOK_SPEED);
    cameraState.lastTouchX = event.clientX;
    cameraState.lastTouchY = event.clientY;
  });

  const clearTouchLook = (event) => {
    if (event.pointerId === cameraState.touchPointerId) {
      cameraState.touchPointerId = null;
    }
  };

  window.addEventListener('pointerup', clearTouchLook);
  window.addEventListener('pointercancel', clearTouchLook);
}

function bindTouchButtons() {
  document.querySelectorAll('.control-button').forEach((button) => {
    const action = button.dataset.action;

    const setHeldState = (value) => {
      if (action === 'jump') return;
      controls[action] = value;
      button.classList.toggle('is-active', value);
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (action === 'jump') {
        controls.jumpQueued = true;
        button.classList.add('is-active');
        window.setTimeout(() => button.classList.remove('is-active'), 140);
        return;
      }

      button.setPointerCapture(event.pointerId);
      setHeldState(true);
    });

    button.addEventListener('pointerup', () => setHeldState(false));
    button.addEventListener('pointercancel', () => setHeldState(false));
    button.addEventListener('pointerleave', () => setHeldState(false));
    button.addEventListener('lostpointercapture', () => setHeldState(false));
  });
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

bindPointerControls();
bindTouchButtons();
resetPlayerToRoadStart();
loadEnvironment();
animate();
