import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Game } from './Game.js?v=20';

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

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
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
