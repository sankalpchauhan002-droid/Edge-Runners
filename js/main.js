import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Game } from './Game.js?v=25';

let game;

function init() {
    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    // Setup camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 5, -10); // Will be updated by camera follow logic
    
    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone mapping for better bloom response
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // Post-Processing (Premium look for RTX GPUs)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Bloom (Resolution, strength, radius, threshold)
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.strength = 0.6; // Subtle glowing sunlight and neon
    bloomPass.radius = 0.5;
    bloomPass.threshold = 0.5;
    composer.addPass(bloomPass);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2); // Brighter light for bloom
    dirLight.position.set(-10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    // High res shadow map
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Initialize Game
    game = new Game(scene, camera, renderer, composer);
    
    // UI Controls Setup
    const btnPause = document.getElementById('btn-pause');
    const btnMusic = document.getElementById('btn-music');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    
    // Guide Modal Setup
    const btnGuide = document.getElementById('btn-guide');
    const guideModal = document.getElementById('guide-modal');
    const btnCloseGuide = document.getElementById('close-guide');
    const btnHowToPlay = document.getElementById('btn-howtoplay');
    const howToPlayModal = document.getElementById('howtoplay-modal');
    const btnCloseHowToPlay = document.getElementById('close-howtoplay');

    if (btnGuide && guideModal && btnCloseGuide) {
        btnGuide.addEventListener('click', () => {
            guideModal.style.display = 'flex';
            renderGuideModels();
        });
        btnCloseGuide.addEventListener('click', () => {
            guideModal.style.display = 'none';
        });
    }

    if (btnHowToPlay && howToPlayModal && btnCloseHowToPlay) {
        btnHowToPlay.addEventListener('click', () => {
            howToPlayModal.style.display = 'flex';
        });
        btnCloseHowToPlay.addEventListener('click', () => {
            howToPlayModal.style.display = 'none';
        });
    }

    // Global UI Renderer to avoid Too Many WebGL Contexts crash on Mobile
    const sharedUIRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    // Render Character Previews for Start Screen
    let charButtonsRendered = false;
    const renderCharButtons = () => {
        if (charButtonsRendered) return;
        if (!game || !game.player || !game.player.models || !game.player.models['char1']) {
            requestAnimationFrame(renderCharButtons);
            return;
        }
        
        charButtonsRendered = true;
        const canvases = document.querySelectorAll('.char-canvas');
        canvases.forEach(canvas => {
            const dpr = window.devicePixelRatio || 1;
            canvas.style.width = '120px';
            canvas.style.height = '160px';
            canvas.width = 120 * dpr;
            canvas.height = 160 * dpr;
            const ctx = canvas.getContext('2d');
            
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, 120/160, 0.1, 100);
            // Center the camera at y=0 so we don't cut off the feet or head
            camera.position.set(0, 0, 4.0); 
            
            const light = new THREE.DirectionalLight(0xffffff, 2.5);
            light.position.set(1, 2, 2);
            scene.add(light);
            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            
            const type = canvas.dataset.model; 
            let modelGroup = new THREE.Group();
            
            const gltf = game.player.models[type];
            if (gltf && gltf.scene) {
                // Use SkeletonUtils to perfectly clone SkinnedMeshes without bone corruption
                const clone = SkeletonUtils.clone(gltf.scene);
                
                // 1) Measure the ORIGINAL model bounds (just in case the clone has stray bounds)
                const original = gltf.scene;
                const oldScale = original.scale.clone();
                const oldPos = original.position.clone();
                
                original.scale.set(1, 1, 1);
                original.position.set(0, 0, 0);
                original.updateMatrixWorld(true);
                
                let bbox = new THREE.Box3().setFromObject(original);
                let rawHeight = bbox.max.y - bbox.min.y;
                let nativeMinY = bbox.min.y;
                
                // Restore original scene state so game doesn't break
                original.scale.copy(oldScale);
                original.position.copy(oldPos);
                original.updateMatrixWorld(true);
                
                if (rawHeight === 0 || !isFinite(rawHeight) || rawHeight > 1000) rawHeight = 1.8;
                
                // 2) Scale the clone so everyone is EXACTLY 3.2 units tall (150% visual size)
                let targetHeight = 3.2;
                let scale = targetHeight / rawHeight;
                clone.scale.set(scale, scale, scale);
                
                // Position feet at the bottom of the camera view (-1.6)
                clone.position.y = -(nativeMinY * scale) - 1.6; 
                
                // 3) Fix Orientation (Max and Soldier load backwards natively)
                if (type === 'char2' || type === 'char4') {
                    clone.rotation.y = Math.PI;
                } else {
                    clone.rotation.y = 0;
                }
                
                modelGroup.add(clone);
                
                // 4) Re-enable animations for EVERYONE now that cloning is perfect!
                if (gltf.animations && gltf.animations.length > 0) {
                    modelGroup.userData.mixer = new THREE.AnimationMixer(clone);
                    let idleClip = gltf.animations.find(a => a.name.toLowerCase().includes('idle'));
                    if (!idleClip) idleClip = gltf.animations[0];
                    if (idleClip) {
                        modelGroup.userData.mixer.clipAction(idleClip).play();
                    }
                }
            }
            
            scene.add(modelGroup);
            
            const clock = new THREE.Clock();
            const animateChar = () => {
                requestAnimationFrame(animateChar);
                const delta = clock.getDelta();
                if (modelGroup.userData.mixer) {
                    modelGroup.userData.mixer.update(delta);
                }
                // User requested front-facing and non-rotating
                sharedUIRenderer.setSize(120, 160, false);
                sharedUIRenderer.setPixelRatio(window.devicePixelRatio || 1);
                sharedUIRenderer.render(scene, camera);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(sharedUIRenderer.domElement, 0, 0, canvas.width, canvas.height);
            };
            animateChar();
        });
    };
    renderCharButtons();

    // Render 3D Previews for Guide
    const renderGuideModels = () => {
        const canvases = document.querySelectorAll('.guide-canvas');
        canvases.forEach(canvas => {
            if(canvas.dataset.rendered) return; // Only init once
            canvas.dataset.rendered = "true";
            
            const dpr = window.devicePixelRatio || 1;
            canvas.style.width = '60px';
            canvas.style.height = '60px';
            canvas.width = 60 * dpr;
            canvas.height = 60 * dpr;
            const ctx = canvas.getContext('2d');
            
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
            camera.position.set(0, 0, 1.2);
            
            const light = new THREE.DirectionalLight(0xffffff, 2);
            light.position.set(1, 1, 1);
            scene.add(light);
            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            
            let model = new THREE.Group();
            const type = canvas.dataset.model;
            
            const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff, metalness: 0.2, roughness: 0.1, transmission: 0.9, thickness: 0.5, clearcoat: 1.0, transparent: true, opacity: 0.8
            });

            if (type === 'invincible') {
                const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x888800, metalness: 0.8, roughness: 0.2 }));
                const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), glassMat);
                model.add(core, shell);
            } else if (type === 'static') {
                const core = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 16, 32), new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x004488, metalness: 0.9, roughness: 0.1 }));
                const core2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 16, 32), new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x008888, metalness: 0.9, roughness: 0.1 }));
                core2.rotation.x = Math.PI / 2;
                model.add(core, core2);
            } else if (type === 'action') {
                const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x008800, metalness: 0.7, roughness: 0.2 }));
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 16, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 }));
                ring.rotation.x = Math.PI / 2;
                model.add(core, ring);
            } else if (type === 'rage') {
                const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, metalness: 0.5, roughness: 0.3, wireframe: false }));
                const spikeGeo = new THREE.ConeGeometry(0.05, 0.4, 4);
                const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff5555, emissive: 0xaa0000, metalness: 1.0 });
                for (let i = 0; i < 6; i++) {
                    const spike = new THREE.Mesh(spikeGeo, spikeMat);
                    if (i===0) spike.position.y = 0.2;
                    if (i===1) { spike.position.y = -0.2; spike.rotation.x = Math.PI; }
                    if (i===2) { spike.position.x = 0.2; spike.rotation.z = -Math.PI/2; }
                    if (i===3) { spike.position.x = -0.2; spike.rotation.z = Math.PI/2; }
                    if (i===4) { spike.position.z = 0.2; spike.rotation.x = Math.PI/2; }
                    if (i===5) { spike.position.z = -0.2; spike.rotation.x = -Math.PI/2; }
                    model.add(spike);
                }
                model.add(core);
            } else if (type === 'cone') {
                const geoCone = new THREE.ConeGeometry(0.1, 0.25, 16);
                const m1 = new THREE.Mesh(geoCone, new THREE.MeshStandardMaterial({ color: 0xff6600 }));
                m1.position.set(-0.2, -0.1, 0);
                const m2 = new THREE.Mesh(geoCone, new THREE.MeshStandardMaterial({ color: 0xff6600 }));
                m2.position.set(0.2, -0.1, 0.1);
                model.add(m1, m2);
            } else if (type === 'barricade') {
                const matOrange = new THREE.MeshStandardMaterial({ color: 0xff6600 });
                const matWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
                const geoBoard = new THREE.BoxGeometry(1.4, 0.1, 0.05);
                const mBoard = new THREE.Mesh(geoBoard, matOrange);
                mBoard.position.set(0, 0.05, 0);
                const geoLeg = new THREE.BoxGeometry(0.05, 0.2, 0.1);
                const mLeg1 = new THREE.Mesh(geoLeg, matWhite);
                mLeg1.position.set(-0.3, 0, 0);
                const mLeg2 = new THREE.Mesh(geoLeg, matWhite);
                mLeg2.position.set(0.3, 0, 0);
                model.add(mBoard, mLeg1, mLeg2);
                model.scale.set(0.6, 0.6, 0.6); // Scale down to fit camera
            } else if (type === 'scaffold') {
                const matMetal = new THREE.MeshStandardMaterial({ color: 0x777777 });
                const matWood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
                const laneWidth = 1.5;
                const geoPole = new THREE.BoxGeometry(0.05, 0.6, 0.05);
                const mPole1 = new THREE.Mesh(geoPole, matMetal);
                mPole1.position.set(-laneWidth/2 + 0.05, 0, 0);
                const mPole2 = new THREE.Mesh(geoPole, matMetal);
                mPole2.position.set(laneWidth/2 - 0.05, 0, 0);
                const geoBeam = new THREE.BoxGeometry(laneWidth, 0.1, 0.1);
                const mBeam = new THREE.Mesh(geoBeam, matWood);
                mBeam.position.set(0, 0.15, 0);
                model.add(mPole1, mPole2, mBeam);
                model.scale.set(0.5, 0.5, 0.5);
                model.position.y = -0.1;
            } else if (type === 'boom') {
                const laneWidth = 1.5;
                const matRed = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
                const matWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
                const geoBase = new THREE.BoxGeometry(0.15, 0.3, 0.15);
                const mBase = new THREE.Mesh(geoBase, matRed);
                mBase.position.set(-laneWidth/2 + 0.1, -0.15, 0);
                const geoArm = new THREE.BoxGeometry(laneWidth - 0.1, 0.05, 0.05);
                const mArm = new THREE.Mesh(geoArm, matWhite);
                mArm.position.set(0.1, 0.1, 0);
                mArm.rotation.z = Math.PI / 12;
                model.add(mBase, mArm);
                model.scale.set(0.6, 0.6, 0.6);
            } else if (type === 'vehicle') {
                if (game && game.trackManager && game.trackManager.vehicleModels && game.trackManager.vehicleModels['police']) {
                    const vModel = game.trackManager.vehicleModels['police'].clone();
                    let tempBbox = new THREE.Box3().setFromObject(vModel);
                    let tempSize = tempBbox.getSize(new THREE.Vector3());
                    if (tempSize.x > tempSize.z) {
                        vModel.rotation.y = Math.PI / 2;
                        vModel.updateMatrixWorld(true);
                        tempBbox.setFromObject(vModel);
                        tempBbox.getSize(tempSize);
                    }
                    const tempCenter = tempBbox.getCenter(new THREE.Vector3());
                    vModel.position.set(-tempCenter.x, -tempBbox.min.y, -tempCenter.z);
                    const scale = (1.5 - 0.05) / tempSize.x;
                    vModel.scale.set(scale, scale, scale);
                    model.add(vModel);
                } else {
                    const mBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1.4), new THREE.MeshStandardMaterial({ color: 0x2222ff }));
                    mBox.position.set(0, 0.3, 0);
                    model.add(mBox);
                }
                model.scale.set(0.4, 0.4, 0.4);
                model.position.y = -0.2;
            } else if (type === 'coin') {
                const geoCoin = new THREE.SphereGeometry(0.05, 8, 8);
                const matCoin = new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true });
                // Make it slightly more premium for the guide (wireframe + solid)
                const mCoin = new THREE.Mesh(geoCoin, new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2, emissive: 0x443300 }));
                mCoin.scale.set(10, 10, 10);
                model.add(mCoin);
            }
            
            scene.add(model);
            
            const animateIcon = () => {
                requestAnimationFrame(animateIcon);
                // Obstacles look better rotating slowly
                if (['cone', 'barricade', 'scaffold', 'boom', 'vehicle'].includes(type)) {
                    model.rotation.y += 0.01;
                } else if (type === 'coin') {
                    model.rotation.y += 0.04; // Fast spin for coin
                } else {
                    model.rotation.y += 0.02;
                    model.rotation.x += 0.01;
                }
                sharedUIRenderer.setSize(60, 60, false);
                sharedUIRenderer.setPixelRatio(window.devicePixelRatio || 1);
                sharedUIRenderer.render(scene, camera);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(sharedUIRenderer.domElement, 0, 0, canvas.width, canvas.height);
            };
            animateIcon();
        });
    };

    let isMusicMuted = true;
    let musicStarted = false;

    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            const docEl = document.documentElement;
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (docEl.requestFullscreen) {
                    docEl.requestFullscreen().catch(e => console.warn(e));
                } else if (docEl.webkitRequestFullscreen) {
                    docEl.webkitRequestFullscreen().catch(e => console.warn(e));
                } else if (docEl.msRequestFullscreen) {
                    docEl.msRequestFullscreen().catch(e => console.warn(e));
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        });
    }
    
    btnPause.addEventListener('click', () => {
        if (!game) return;
        const isPaused = game.togglePause();
        btnPause.innerText = isPaused ? "▶ Resume" : "⏸ Pause";
        
        const pauseScreen = document.getElementById('pause-screen');
        if (isPaused) {
            pauseScreen.style.display = 'flex';
            document.getElementById('pause-score').innerText = Math.floor(game.score);
            document.getElementById('pause-coins').innerText = game.coinsCollected;
            document.getElementById('pause-speed').innerText = game.speed.toFixed(1) + 'x';
        } else {
            pauseScreen.style.display = 'none';
        }
        
        // Sync music with game state
        if (window.ytPlayer) {
            if (isPaused && typeof window.ytPlayer.pauseVideo === 'function') {
                window.ytPlayer.pauseVideo();
            } else if (!isPaused && typeof window.ytPlayer.playVideo === 'function') {
                window.ytPlayer.playVideo();
                musicStarted = true;
            }
        }
    });
    
    btnMusic.addEventListener('click', () => {
        if (window.ytPlayer && typeof window.ytPlayer.unMute === 'function') {
            if (!musicStarted) {
                window.ytPlayer.playVideo();
                musicStarted = true;
            }
            if (isMusicMuted) {
                window.ytPlayer.unMute();
                window.ytPlayer.setVolume(50);
                isMusicMuted = false;
                btnMusic.innerText = "🔇 Mute";
            } else {
                window.ytPlayer.mute();
                isMusicMuted = true;
                btnMusic.innerText = "🔊 Unmute";
            }
        }
    });
    
    const btnExit = document.getElementById('btn-exit');
    if (btnExit) {
        btnExit.addEventListener('click', () => {
            if (game) {
                // Unpause if paused before exiting so game state is clean
                if (game.isPaused) {
                    btnPause.click(); // This will unpause and hide the pause screen
                }
                game.returnToMenu();
            }
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            let closedModal = false;
            if (guideModal && guideModal.style.display === 'flex') {
                guideModal.style.display = 'none';
                closedModal = true;
            }
            if (howToPlayModal && howToPlayModal.style.display === 'flex') {
                howToPlayModal.style.display = 'none';
                closedModal = true;
            }
            if (closedModal) return; // Don't pause game if we just closed a modal
        }
        
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
            if (game && game.hasStarted && !game.isGameOver) {
                btnPause.click();
            }
        }
    });

    // Start music stream silently on first interaction (required by browsers)
    const startMusicHandler = () => {
        if (!musicStarted && window.ytPlayer && typeof window.ytPlayer.playVideo === 'function') {
            musicStarted = true;
            if (!game || !game.isPaused) {
                window.ytPlayer.playVideo();
            }
            document.removeEventListener('click', startMusicHandler);
        }
    };
    document.addEventListener('click', startMusicHandler);
    
    // Handle Window Resize
    window.addEventListener('resize', onWindowResize);
    
    // Start Game Loop
    game.start();
}

function onWindowResize() {
    const camera = game.camera;
    const renderer = game.renderer;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (game.composer) {
        game.composer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Ensure the DOM is fully loaded before init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
