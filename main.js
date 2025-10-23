let scene, camera, renderer;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let isJumping = false, isCrouching = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let mouseSensitivity = 0.001;
let yaw = 0, pitch = 0, maxPitch = Math.PI / 4;

const standingHeight = 4;
const crouchHeight = 2.6;
const jumpHeight = 1.4;
const jumpDuration = 1.6;

init();
animate();

function init() {
  // Scene and sky
  scene = new THREE.Scene();
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x87ceeb) },
      bottomColor: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      void main() {
        float h = normalize(vPosition).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
      }
    `
  });
  const skyGeometry = new THREE.SphereGeometry(100, 32, 32);
  const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(skyDome);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, standingHeight, 10);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('container').appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.AmbientLight(0x404040, 2));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(0, 1, 1).normalize();
  scene.add(directionalLight);

  // 3D Text
  const fontLoader = new THREE.FontLoader();
  fontLoader.load('nada.json', (font) => {
    const textGeometry = new THREE.TextGeometry('Umbrella', {
      font: font,
      size: 1,
      height: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 5
    });
    textGeometry.center();

    const textMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      metalness: 0.4,
      roughness: 0.3
    });

    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.set(0, 3, 0);
    scene.add(textMesh);
  });

  // Controls
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('click', () => document.body.requestPointerLock());
  document.addEventListener('pointerlockchange', onPointerLockChange);

  window.addEventListener('resize', onWindowResize);

  const audio = document.getElementById('guidedAudio');
  if (audio) {
    audio.play().catch(() => {
      const resumeAudio = () => {
        audio.play();
        document.removeEventListener('click', resumeAudio);
      };
      document.addEventListener('click', resumeAudio);
    });
  }
}

// Movement controls
function onKeyDown(e) {
  switch (e.code) {
    case 'KeyW': moveForward = true; break;
    case 'KeyS': moveBackward = true; break;
    case 'KeyA': moveLeft = true; break;
    case 'KeyD': moveRight = true; break;
    case 'Space': if (!isJumping && !isCrouching) { isJumping = true; jumpTime = 0; } break;
    case 'ControlLeft': isCrouching = true; break;
  }
}
function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': moveForward = false; break;
    case 'KeyS': moveBackward = false; break;
    case 'KeyA': moveLeft = false; break;
    case 'KeyD': moveRight = false; break;
    case 'ControlLeft': isCrouching = false; break;
  }
}

function onPointerLockChange() {
  if (document.pointerLockElement === document.body)
    document.addEventListener('mousemove', onMouseMove);
  else
    document.removeEventListener('mousemove', onMouseMove);
}

function onMouseMove(event) {
  const movementX = event.movementX || 0;
  const movementY = event.movementY || 0;
  yaw -= movementX * mouseSensitivity;
  pitch -= movementY * mouseSensitivity;
  pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  camera.rotation.set(pitch, yaw, 0);
}

function animate() {
  requestAnimationFrame(animate);
  direction.set(0, 0, 0);

  if (moveForward) direction.z -= 1;
  if (moveBackward) direction.z += 1;
  if (moveLeft) direction.x -= 1;
  if (moveRight) direction.x += 1;

  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  if (direction.length() > 0) direction.normalize();

  velocity.x = direction.x * 0.1;
  velocity.z = direction.z * 0.1;

  camera.position.x += velocity.x;
  camera.position.z += velocity.z;

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}