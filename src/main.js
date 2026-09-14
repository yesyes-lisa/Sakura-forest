import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { Water } from 'three/addons/objects/Water.js'
import { TextureLoader } from 'three'
// 全局变量
let treeInstances = [];
let grassInstances = [];
let waterPlane = null;
let waterOverlay = null;
let snowGround = null;
// 替换废弃 THREE.Timer，使用官方Clock
const clock = new THREE.Clock();
// 基础容器
const app = document.getElementById('app')
const width = window.innerWidth
const height = window.innerHeight
// 场景、相机、渲染器
const scene = new THREE.Scene()
// ========= 雾：保持原有暖橙，浓度不变 =========
scene.fog = new THREE.FogExp2(0xffbc89, 0.0028)
const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 2000)
camera.position.set(18, 10, 28)
camera.lookAt(0, 0, 0) // 修复：看向场景中心，不再看高空
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
})
renderer.setSize(width, height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
// =========【重点修改：提高曝光，整体画面提亮，保留黄昏色调】=========
renderer.toneMappingExposure = 0.85
renderer.setClearColor(0xffbc89)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
// ========= Bloom：保持柔和光晕，稍微提高强度适配提亮后的画面 =========
const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.12, 0.08, 0.06)
bloomPass.threshold = 0.65
bloomPass.strength = 0.18
bloomPass.radius = 0.25
composer.addPass(bloomPass)
// 轨道控制器
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 8
controls.maxDistance = 100
controls.maxPolarAngle = Math.PI / 2.3
// ============================================
// 材质（完全保留，不改动）
// ============================================
const grassMat = new THREE.MeshStandardMaterial({
  color: 0x75a855,
  roughness: 1
})
const stoneMat = new THREE.MeshStandardMaterial({
  color: 0x8e8e8e,
  roughness: 0.85
})
const petalMat = new THREE.MeshStandardMaterial({
  color: 0xffc1dc,
  transparent: true,
  opacity: 0.82,
  side: THREE.DoubleSide,
  roughness: 0.32,
  metalness: 0.05,
  emissive: 0x220000,
  emissiveIntensity: 0.05
})
function createPetalGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(0.04, 0.04, 0.04, 0.16)
  shape.quadraticCurveTo(0.02, 0.24, 0, 0.32)
  shape.quadraticCurveTo(-0.02, 0.28, -0.06, 0.18)
  shape.quadraticCurveTo(-0.08, 0.08, 0, 0)
  const geo = new THREE.ShapeGeometry(shape, 12)
  geo.translate(0, -0.08, 0)
  geo.scale(0.9, 0.6, 1)
  return geo
}
const flareMat = new THREE.MeshBasicMaterial({
  color: 0xffd7b8,
  transparent: true,
  opacity: 0.03,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  depthWrite: false
})
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffc59d,
  transparent: true,
  opacity: 0.45,
  roughness: 1,
  metalness: 0
})
const cloudDarkMat = new THREE.MeshStandardMaterial({
  color: 0xff9068,
  transparent: true,
  opacity: 0.28,
  roughness: 1
})
const cloudEdgeMat = new THREE.MeshStandardMaterial({
  color: 0xffe2cd,
  transparent: true,
  opacity: 0.16,
  roughness: 1
})
// 基础几何体
const blockGeo = new THREE.BoxGeometry(1, 1, 1)
// ============================================
// ===== 光照【提亮，保留黄昏紫橙氛围，暗部不再死黑】 =====
// ============================================
// 夕阳主光：暖橙，提高强度
const sunLight = new THREE.DirectionalLight(0xffb882, 0.45)
sunLight.position.set(60, 25, -80)
sunLight.castShadow = true
sunLight.shadow.mapSize.width = 4096
sunLight.shadow.mapSize.height = 4096
sunLight.shadow.camera.near = 0.5
sunLight.shadow.camera.far = 250
sunLight.shadow.camera.left = -120
sunLight.shadow.camera.right = 120
sunLight.shadow.camera.top = 120
sunLight.shadow.camera.bottom = -120
sunLight.shadow.bias = -0.0008
sunLight.shadow.normalBias = 0.02
scene.add(sunLight)
// 环境光：淡紫，提升基础环境亮度
const ambientLight = new THREE.AmbientLight(0x8b6aab, 1.1)
scene.add(ambientLight)
// 半球光：上方紫，下方地平线橙，提升物体暗部通透感
const hemiLight = new THREE.HemisphereLight(0x704899, 0xffbc89, 0.45)
scene.add(hemiLight)
// 填充补光，进一步提亮背光面
const fillLight = new THREE.DirectionalLight(0xffb882, 0.25)
fillLight.position.set(-40, 20, 30)
scene.add(fillLight)
// ============================================
// ===== 天空球 Shader 三层渐变：顶部深紫 → 中部淡紫 → 地平线暖橙（保持不变） =====
function createSkyDome() {
  const skyGeo = new THREE.SphereGeometry(220, 32, 15)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(0x593882) }, // 顶部深紫色
      midColor:    { value: new THREE.Color(0x9978b8) }, // 中间淡紫
      horizonColor:{ value: new THREE.Color(0xffbc89) }, // 地平线暖橙黄
    },
    vertexShader: `varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 sky;
        if(h > 0.32){
          // 高空：中部淡紫 混合 顶部深紫
          sky = mix(midColor, topColor, smoothstep(0.32, 0.95, h));
        }else{
          // 低空地平线：地平线橙黄 混合 中部淡紫
          sky = mix(horizonColor, midColor, smoothstep(-0.15, 0.32, h));
        }
        gl_FragColor = vec4(sky, 1.0);
      }`
  })
  const skyDome = new THREE.Mesh(skyGeo, skyMat)
  skyDome.position.set(0, 0, 0)
  scene.add(skyDome)
}
// ============================================
const cloudGroupList = []
// ============================================
// 云层（保留原逻辑）
// ============================================
function createSkyClouds() {
  const skyRoot = new THREE.Group()
  const bigCloudPositions = [
    { x: 50, y: 35, z: -90 },
    { x: -20, y: 40, z: -100 },
    { x: 0, y: 50, z: -120 }
  ]
  bigCloudPositions.forEach(pos => {
    const cloud = buildSingleCloud(pos.x, pos.y, pos.z, 2.2)
    skyRoot.add(cloud)
  })
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2
    const distance = 60 + Math.random() * 40
    const cx = Math.cos(angle) * distance
    const cz = -70 - Math.random() * 50
    const cy = 30 + Math.random() * 25
    const cloud = buildSingleCloud(cx, cy, cz, 0.6 + Math.random() * 0.6)
    skyRoot.add(cloud)
  }
  for (let i = 0; i < 6; i++) {
    const x = -100 + Math.random() * 200
    const y = 18 + Math.random() * 8
    const z = -160 - Math.random() * 25
    const cloud = buildSingleCloud(x, y, z, 1.1 + Math.random() * 0.6)
    cloud.traverse(child => {
      if (child.isMesh) child.material.opacity *= 0.4
    })
    skyRoot.add(cloud)
  }
  scene.add(skyRoot)
}
// ===== 太阳 - 暖橙夕阳 =====
function createSunDisk() {
  const outerGlowGeo = new THREE.RingGeometry(10.5, 35, 64)
  const outerGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffbb88,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    depthWrite: false
  })
  const outerGlow = new THREE.Mesh(outerGlowGeo, outerGlowMat)
  outerGlow.position.set(60, 22, -90)
  outerGlow.rotation.x = -Math.PI / 2
  scene.add(outerGlow)
  const sunGeo = new THREE.CircleGeometry(8, 64)
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffddaa,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    depthWrite: false
  })
  const sunDisk = new THREE.Mesh(sunGeo, sunMat)
  sunDisk.position.set(60, 22, -90)
  sunDisk.rotation.x = -Math.PI / 2
  scene.add(sunDisk)
}
function buildSingleCloud(baseX, baseY, baseZ, scale) {
  const cloudGroup = new THREE.Group()
  const blockNum = 6 + Math.floor(Math.random() * 10)
  for (let i = 0; i < blockNum; i++) {
    const w = (1.5 + Math.random() * 2.2) * scale
    const h = (0.8 + Math.random() * 1.4) * scale
    const d = (1.5 + Math.random() * 2.2) * scale
    const cloudCube = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      Math.random() > 0.65 ? cloudDarkMat : cloudMat
    )
    cloudCube.position.set(
      (Math.random() - 0.5) * 7 * scale,
      (Math.random() - 0.5) * 3 * scale,
      (Math.random() - 0.5) * 7 * scale
    )
    cloudCube.castShadow = false
    cloudCube.receiveShadow = false
    cloudGroup.add(cloudCube)
  }
  const glowEdge = new THREE.Mesh(
    new THREE.BoxGeometry(9 * scale, 2 * scale, 6 * scale),
    cloudEdgeMat
  )
  glowEdge.position.set(0, 0.6 * scale, 0)
  glowEdge.castShadow = false
  glowEdge.receiveShadow = false
  cloudGroup.add(glowEdge)
  cloudGroup.position.set(baseX, baseY, baseZ)
  cloudGroup.userData = {
    baseX: baseX,
    driftSpeed: 0.002 + Math.random() * 0.004,
    driftRange: 6 + Math.random() * 10
  }
  cloudGroupList.push(cloudGroup)
  return cloudGroup
}
// ============================================
// 草地与地面（原样保留）
// ============================================
function createGround() {
  const groundGeo = new THREE.PlaneGeometry(180, 180)
  const ground = new THREE.Mesh(groundGeo, grassMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -3
  ground.receiveShadow = true
  scene.add(ground)
}
// ============================================
// 花瓣飘落（原样保留）
// ============================================
const petals = []
const groundPetals = []
function createPetal(x, y, z, isGround = false) {
  const geometry = createPetalGeometry()
  const scale = isGround ? 0.08 + Math.random() * 0.1 : 0.12 + Math.random() * 0.18
  const petal = new THREE.Mesh(geometry, petalMat)
  petal.scale.set(scale, scale * 0.75, scale)
  petal.position.set(x, y, z)
  petal.rotation.set(
    -Math.PI / 2 + (Math.random() - 0.5) * 0.2,
    Math.random() * Math.PI * 2,
    isGround ? Math.random() * Math.PI * 0.1 : Math.random() * Math.PI
  )
  petal.userData = {
    speed: isGround ? 0 : 0.02 + Math.random() * 0.04,
    rotateSpeed: isGround ? 0.001 + Math.random() * 0.004 : (Math.random() - 0.5) * 0.08,
    driftX: isGround ? (Math.random() - 0.5) * 0.005 : (Math.random() - 0.5) * 0.04,
    driftZ: isGround ? (Math.random() - 0.5) * 0.005 : (Math.random() - 0.5) * 0.04,
    bounce: Math.random() * 0.6,
    baseY: y
  }
  petal.castShadow = false
  petal.receiveShadow = false
  scene.add(petal)
  if (isGround) groundPetals.push(petal)
  else petals.push(petal)
}
function initPetals() {
  for (let i = 0; i < 180; i++) {
    createPetal(
      (Math.random() - 0.5) * 70,
      18 + Math.random() * 35,
      (Math.random() - 0.5) * 70
    )
  }
  for (let i = 0; i < 120; i++) {
    createPetal(
      (Math.random() - 0.5) * 50,
      -2.9 + Math.random() * 0.08,
      (Math.random() - 0.5) * 50,
      true
    )
  }
}
function updatePetals() {
  petals.forEach(petal => {
    petal.position.y -= petal.userData.speed
    petal.position.x += petal.userData.driftX
    petal.position.z += petal.userData.driftZ
    petal.rotation.y += petal.userData.rotateSpeed
    petal.rotation.x += petal.userData.rotateSpeed * 0.3
    petal.rotation.z += petal.userData.rotateSpeed * 0.2
    if (petal.position.y < -4) {
      petal.position.y = 24 + Math.random() * 26
      petal.position.x = (Math.random() - 0.5) * 70
      petal.position.z = (Math.random() - 0.5) * 70
      petal.rotation.set(
        -Math.PI / 2 + (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI
      )
    }
  })
  groundPetals.forEach(petal => {
    petal.position.x += petal.userData.driftX * 0.25
    petal.position.z += petal.userData.driftZ * 0.25
    petal.rotation.z += petal.userData.rotateSpeed * 0.05
  })
}
// ============================================
// 光斑（原样保留）
// ============================================
const flares = []
function createFlare() {
  const flare = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 28),
    flareMat
  )
  flare.position.set(
    (Math.random() - 0.5) * 90,
    5 + Math.random() * 55,
    (Math.random() - 0.5) * 90
  )
  flare.userData = {
    baseOpacity: 0.06 + Math.random() * 0.08,
    flickerSpeed: 0.008 + Math.random() * 0.014,
    flickerPhase: Math.random() * Math.PI * 2
  }
  scene.add(flare)
  flares.push(flare)
}
function initFlares() {
  for (let i = 0; i < 55; i++) {
    createFlare()
  }
}
function updateFlares(time) {
  flares.forEach(flare => {
    flare.material.opacity =
      Math.max(0.01, flare.userData.baseOpacity + Math.sin(time * flare.userData.flickerSpeed + flare.userData.flickerPhase) * 0.04)
    flare.rotation.y += 0.003
  })
}
// ============================================
// 🔥 加载 .gltf 樱花树模型【路径改为相对路径 ./models】
// ============================================
function loadTreeForest() {
  console.log('🔄 开始加载樱花树模型...');
  
  const treeCount = 30;
  let loadedCount = 0;
  
  for (let i = 0; i < treeCount; i++) {
    const loader = new GLTFLoader();
    
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 40;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const scale = 0.5 + Math.random() * 2.5;
    
    loader.load(
      './models/laying_under_a_tree_with_pink_leaves_and_wind/scene.gltf',
      (gltf) => {
        const model = gltf.scene;
        model.position.set(x, -3, z);
        model.scale.set(scale, scale, scale);
        model.rotation.y = Math.random() * Math.PI * 2;
        
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        scene.add(model);
        treeInstances.push(model);
        loadedCount++;
        console.log(`✅ 已加载 ${loadedCount}/${treeCount} 棵树`);
        
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
          action.loop = THREE.LoopRepeat;
          action.timeScale = 0.2 + Math.random() * 0.5;
          
          if (!window.treeMixers) window.treeMixers = [];
          window.treeMixers.push(mixer);
        }
        
        if (loadedCount === treeCount) {
          console.log(`✅ 全部 ${treeCount} 棵树加载完成！`);
        }
      },
      (xhr) => {},
      (err) => {
        console.error('❌ 树加载失败:', err);
      }
    );
  }
}
// ============================================
// 🌿 加载草地模型 - 生成草原【路径改为相对路径 ./models】
// ============================================
function loadGrassField() {
  console.log('🌿 开始加载草地模型...');
  const loader = new GLTFLoader();
  
  loader.load(
    './models/animated_grass_-_vegetation/scene.gltf',
    (gltf) => {
      console.log('✅ 草地模型加载成功！');
      const originalGrass = gltf.scene;
      const bbox = new THREE.Box3().setFromObject(originalGrass);
      const originalBaseY = bbox.min.y;
      const baseOffset = Math.abs(originalBaseY);
      
      const spread = 80;
      const candidateCount = 1400;
      let placedCount = 0;
      for (let i = 0; i < candidateCount; i++) {
        if (Math.random() > 0.6) continue;
        const x = (Math.random() * 2 - 1) * spread + (Math.random() - 0.5) * 3.5;
        const z = (Math.random() * 2 - 1) * spread + (Math.random() - 0.5) * 3.5;
        const grass = originalGrass.clone();
        const scaleXZ = 0.18 + Math.random() * 0.8;
        const scaleY = 0.6 + Math.random() * 2.0;
        grass.scale.set(scaleXZ, scaleY, scaleXZ);
        grass.rotation.set(
          (Math.random() - 0.5) * 0.6,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.6
        );
        grass.position.set(
          x,
          -2.3 + baseOffset * scaleY + (Math.random() - 0.5) * 0.25,
          z
        );
        grass.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(grass);
        grassInstances.push(grass);
        placedCount++;
      }
      console.log(`✅ 草原生成完成！共 ${placedCount} 株草 🌿`);
      if (gltf.animations && gltf.animations.length > 0) {
        console.log('🌿 草地可用动画:', gltf.animations.map(a => a.name));
        const mixers = [];
        const animCount = Math.min(grassInstances.length, 200);
        for (let i = 0; i < animCount; i++) {
          const mixer = new THREE.AnimationMixer(grassInstances[i]);
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
          action.loop = THREE.LoopRepeat;
          action.timeScale = 0.2 + Math.random() * 0.6;
          mixers.push(mixer);
        }
        window.grassMixers = mixers;
        console.log(`🌿 ${mixers.length} 株草有风吹动画`);
      }
    },
    (xhr) => {
      const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
      if (percent % 20 === 0) console.log(`🌿 草地加载中: ${percent}%`);
    },
    (err) => {
      console.error('❌ 加载草地模型失败:', err);
      console.log('💡 请检查路径: ./models/animated_grass_-_vegetation/scene.gltf');
    }
  );
}
// ============================================
// ❄️ 生成纯白雪地（原样）
// ============================================
function createSnowGround() {
  console.log('❄️ 正在生成纯白雪地...');
  
  const segments = 128;
  const snowGeo = new THREE.PlaneGeometry(175, 175, segments, segments);
  
  const positions = snowGeo.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 1];
    const dist = Math.sqrt(x * x + z * z);
    const wave1 = Math.sin(x * 0.04 + z * 0.03) * 0.5;
    const wave2 = Math.cos(x * 0.06 - z * 0.05) * 0.3;
    const wave3 = Math.sin(dist * 0.03) * 0.4;
    const edgeFade = Math.max(0, 1 - dist / 90);
    positions[i + 2] = wave1 + wave2 + wave3 * 0.5 + edgeFade * 0.15;
  }
  snowGeo.computeVertexNormals();
  
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x4488cc,
    emissiveIntensity: 0.015,
    roughness: 0.4,
    metalness: 0.0,
    side: THREE.DoubleSide,
    flatShading: false,
    envMapIntensity: 0.1,
  });
  
  const snow = new THREE.Mesh(snowGeo, snowMat);
  snow.rotation.x = -Math.PI / 2;
  snow.position.set(0, -3, 0);
  snow.receiveShadow = true;
  snow.castShadow = false;
  snow.renderOrder = 1;
  scene.add(snow);
  
  console.log('❄️ 纯白雪地生成完成！');
}
// ============================================
// ⛄ 生成雪人（原样）
// ============================================
function createSnowmen() {
  console.log('⛄ 正在生成雪人...');
  
  const snowmanMat = new THREE.MeshStandardMaterial({
    color: 0xf0f4ff,
    roughness: 0.6,
    metalness: 0.0,
    emissive: 0x4488cc,
    emissiveIntensity: 0.01,
  });
  
  const snowmanMatDark = new THREE.MeshStandardMaterial({
    color: 0xe8ecf5,
    roughness: 0.7,
    metalness: 0.0,
  });
  
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x222233,
    roughness: 0.3,
    metalness: 0.1,
  });
  
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0xff6633,
    roughness: 0.8,
  });
  
  const scarfMat = new THREE.MeshStandardMaterial({
    color: 0xcc2233,
    roughness: 0.9,
  });
  
  // 雪人位置（分布在两岸雪地上）
  const snowmanPositions = [
    { x: -20, z: 8, scale: 2.8 },
    { x: -32, z: -12, scale: 1.0 },
    { x: 22, z: -15, scale: 3.7 },
    { x: 35, z: 10, scale: 1.9 },
    { x: -15, z: -25, scale: 2.6 },
    { x: 28, z: -28, scale: 3.8 },
    { x: -38, z: 22, scale: 4.7 },
    { x: 15, z: 30, scale: 1.9 },
  ];
  
  snowmanPositions.forEach((pos) => {
    const group = new THREE.Group();
    const s = pos.scale;
    
    // 身体（下球）
    const bodyGeo = new THREE.SphereGeometry(0.8 * s, 24, 24);
    const body = new THREE.Mesh(bodyGeo, snowmanMat);
    body.position.y = 0.7 * s;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // 身体（上球）
    const torsoGeo = new THREE.SphereGeometry(0.55 * s, 24, 24);
    const torso = new THREE.Mesh(torsoGeo, snowmanMatDark);
    torso.position.y = 1.5 * s;
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);
    
    // 头部
    const headGeo = new THREE.SphereGeometry(0.4 * s, 24, 24);
    const head = new THREE.Mesh(headGeo, snowmanMat);
    head.position.y = 2.2 * s;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    
    // 眼睛（左）
    const eyeGeo = new THREE.SphereGeometry(0.05 * s, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15 * s, 2.3 * s, 0.35 * s);
    group.add(eyeL);
    
    // 眼睛（右）
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.15 * s, 2.3 * s, 0.35 * s);
    group.add(eyeR);
    
    // 鼻子（胡萝卜）
    const noseGeo = new THREE.ConeGeometry(0.04 * s, 0.2 * s, 8);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 2.2 * s, 0.4 * s);
    nose.rotation.x = 0.3;
    group.add(nose);
    
    // 围巾
    const scarfGeo = new THREE.TorusGeometry(0.4 * s, 0.06 * s, 8, 16);
    const scarf = new THREE.Mesh(scarfGeo, scarfMat);
    scarf.position.set(0, 1.75 * s, 0);
    scarf.rotation.x = Math.PI / 2;
    scarf.scale.set(1, 1, 0.6);
    scarf.castShadow = true;
    group.add(scarf);
    
    // 围巾飘带左
    const scarfEndGeo = new THREE.BoxGeometry(0.08 * s, 0.12 * s, 0.25 * s);
    const scarfEnd = new THREE.Mesh(scarfEndGeo, scarfMat);
    scarfEnd.position.set(0.35 * s, 1.65 * s, 0);
    scarfEnd.rotation.z = -0.2;
    group.add(scarfEnd);
    
    // 围巾飘带右
    const scarfEnd2 = scarfEnd.clone();
    scarfEnd2.position.set(-0.35 * s, 1.65 * s, 0);
    scarfEnd2.rotation.z = 0.2;
    group.add(scarfEnd2);
    
    // 帽子
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.7 });
    const hatGeo = new THREE.CylinderGeometry(0.35 * s, 0.4 * s, 0.12 * s, 12);
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.set(0, 2.45 * s, 0);
    hat.castShadow = true;
    group.add(hat);
    
    const hatTopGeo = new THREE.CylinderGeometry(0.2 * s, 0.22 * s, 0.2 * s, 12);
    const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
    hatTop.position.set(0, 2.6 * s, 0);
    hatTop.castShadow = true;
    group.add(hatTop);
    
    // 按钮（装饰）
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.5 });
    const btnGeo = new THREE.SphereGeometry(0.04 * s, 8, 8);
    const btn1 = new THREE.Mesh(btnGeo, btnMat);
    btn1.position.set(0, 1.2 * s, 0.78 * s);
    group.add(btn1);
    
    const btn2 = new THREE.Mesh(btnGeo, btnMat);
    btn2.position.set(0, 0.9 * s, 0.78 * s);
    group.add(btn2);
    
    // 位置
    group.position.set(pos.x, -3, pos.z);
    // 随机旋转
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
  });
  
  console.log(`⛄ ${snowmanPositions.length} 个雪人已添加！`);
}
// ============================================
// 创建水面（优化倒影和反光，路径修改为相对路径 ./textures）
// ============================================
function createPool() {
  const size = 180;
  const poolGeo = new THREE.PlaneGeometry(size, size, 128, 128);
  const texLoader = new TextureLoader();
  
  let waterNormals = null;
  try {
    waterNormals = texLoader.load('./textures/waternormals.jpg');
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  } catch (e) {
    console.warn('⚠️ 未找到 waternormals 贴图：使用简化水面');
  }
  
  waterPlane = new Water(poolGeo, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: waterNormals,
    alpha: 0.85,
    sunDirection: sunLight.position.clone().normalize(),
    sunColor: 0xffe8d6,
    waterColor: 0x3a7bb5,
    distortionScale: 1.8,
    fog: !!scene.fog
  });
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.set(0, -2.9, 0);
  waterPlane.renderOrder = 0;
  scene.add(waterPlane);
  const loader = new GLTFLoader();
  const path = './models/animated_ocean_scene_tutorial_example_1/scene.gltf';
  console.log('💧 加载水面覆盖模型:', path);
  loader.load(
    path,
    (gltf) => {
      const waterModel = gltf.scene;
      waterModel.name = 'poolWaterModel';
      waterModel.traverse(child => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = true;
          child.renderOrder = 1;
          if (child.material) {
            child.material.side = THREE.DoubleSide;
            child.material.transparent = true;
            child.material.opacity = child.material.opacity ?? 0.6;
            child.material.roughness = 0.1;
            child.material.metalness = 0.3;
            child.material.envMapIntensity = 0.8;
          }
        }
      });
      waterModel.position.set(0, 0, 0);
      waterModel.rotation.set(0, 0, 0);
      waterModel.scale.set(1, 1, 1);
      const bbox = new THREE.Box3().setFromObject(waterModel);
      const sizeVec = new THREE.Vector3();
      bbox.getSize(sizeVec);
      if (sizeVec.y > Math.max(sizeVec.x, sizeVec.z) * 2) {
        waterModel.rotation.x = -Math.PI / 2;
        bbox.setFromObject(waterModel);
        bbox.getSize(sizeVec);
      }
      const target = 180;
      const scaleX = sizeVec.x > 0 ? target / sizeVec.x : 1;
      const scaleZ = sizeVec.z > 0 ? target / sizeVec.z : 1;
      const uniformScale = Math.max(scaleX, scaleZ);
      waterModel.scale.setScalar(uniformScale);
      bbox.setFromObject(waterModel);
      bbox.getSize(sizeVec);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      waterModel.position.x -= center.x;
      waterModel.position.z -= center.z;
      bbox.setFromObject(waterModel);
      const topY = bbox.max.y;
      waterModel.position.y += -3 - topY;
      waterModel.position.y += 0.02;
      scene.add(waterModel);
      waterOverlay = waterModel;
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(waterModel);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        action.timeScale = 0.6;
        if (!window.waterMixers) window.waterMixers = [];
        window.waterMixers.push(mixer);
      }
      console.log('✅ 场景水面覆盖模型已加载（带倒影和反光）');
    },
    (xhr) => {
      if (xhr.total) {
        console.log('💧 水面加载进度:', Math.round((xhr.loaded / xhr.total) * 100) + '%');
      }
    },
    (err) => {
      console.error('❌ 加载水面模型失败:', err);
    }
  );
}
// ============================================
// 初始化场景
// ============================================
console.log('🏗️ 开始构建场景...');
createSkyDome()
createSkyClouds()
createSunDisk()
loadTreeForest()
loadGrassField()
// createGround() // 注释掉，避免草地平面和雪地重叠冲突
createPool()
initPetals()
initFlares()
createSnowGround()
createSnowmen()
console.log('✅ 场景构建完成');
// ============================================
// 窗口自适应
// ============================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  composer.setSize(window.innerWidth, window.innerHeight)
})
// ============================================
// 渲染循环
// ============================================
let time = 0
function tick() {
  requestAnimationFrame(tick)
  time += 1
  const delta = clock.getDelta();
  controls.update()
  updatePetals()
  updateFlares(time)
  cloudGroupList.forEach(cloud => {
    cloud.position.x = cloud.userData.baseX + Math.sin(time * cloud.userData.driftSpeed) * cloud.userData.driftRange
  })
  // 🌳 更新树的动画
  if (window.treeMixers) {
    window.treeMixers.forEach(mixer => {
      mixer.update(delta);
    });
  }
  // 🌿 更新草地动画
  if (window.grassMixers) {
    window.grassMixers.forEach(mixer => {
      mixer.update(delta);
    });
  }
  // 🌊 更新水面动画
  if (window.waterMixers) {
    window.waterMixers.forEach(mixer => mixer.update(delta));
  }
  // 更新 Water 平面的时间以驱动波动
  if (waterPlane && waterPlane.material && waterPlane.material.uniforms && waterPlane.material.uniforms.time) {
    waterPlane.material.uniforms.time.value += delta
  }
  composer.render()
}
tick()
console.log('🎮 应用启动成功！');
console.log('📁 树模型路径: ./models/laying_under_a_tree_with_pink_leaves_and_wind/scene.gltf');
console.log('📁 草地模型路径: ./models/animated_grass_-_vegetation/scene.gltf');
console.log('✅ 包含: 粉色树林、草原、雪地、雪人、水面倒影、花瓣、光斑、云层');
