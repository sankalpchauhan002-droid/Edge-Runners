import * as THREE from 'three';
import { Player } from './Player.js?v=7';
import { TrackManager } from './TrackManager.js?v=5';
import { InputManager } from './InputManager.js';
import { SoundManager } from './SoundManager.js?v=7';

class ParticleManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.coinGeo = new THREE.SphereGeometry(0.05, 8, 8);
        this.coinMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
        
        // AAA Sparks Geometry: 1.0 height cylinder so we can stretch it along its velocity vector
        this.sparkGeo = new THREE.CylinderGeometry(0.004, 0.004, 1.0, 4);
    }
    
    spawnCoinBurst(position) {
        for(let i=0; i<15; i++) {
            const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
            mesh.position.copy(position);
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                Math.random() * 8 + 2,
                (Math.random() - 0.5) * 8
            );
            this.scene.add(mesh);
            this.particles.push({ mesh, velocity, life: 1.0 });
        }
    }
    
    spawnSkateSparks(position, isSlide, charId) {
        const sparkCount = isSlide ? 8 : 3;
        
        // Choose colors based on character outfit for AAA matching look
        const startColor = (charId === 'char2') ? new THREE.Color(0xffaa44) : new THREE.Color(0x00ffff);
        const endColor = (charId === 'char2') ? new THREE.Color(0xff0033) : new THREE.Color(0x0055ff);
        
        for(let i = 0; i < sparkCount; i++) {
            const mat = new THREE.MeshBasicMaterial({ 
                color: startColor.clone(),
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(this.sparkGeo, mat);
            
            // Spawn near skates/ground
            mesh.position.copy(position);
            mesh.position.y += 0.01;
            mesh.position.x += (Math.random() - 0.5) * 0.25;
            mesh.position.z += (Math.random() - 0.5) * 0.1;
            
            // High velocity flying backwards (+Z) and slightly upwards
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * (isSlide ? 5 : 1.5),
                Math.random() * (isSlide ? 3 : 1) + 0.3,
                Math.random() * (isSlide ? 5 : 3) + 4.0 // Fly backwards towards camera
            );
            
            this.scene.add(mesh);
            
            const maxLife = 0.15 + Math.random() * 0.2;
            this.particles.push({ 
                mesh, 
                velocity, 
                life: maxLife, 
                maxLife, 
                startColor, 
                endColor, 
                isSpark: true 
            });
        }
    }
    
    spawnExplosion(position) {
        // A huge burst of red/orange glowing cubes for vehicle destruction
        const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff4400,
            emissive: 0xff2200,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 1.0
        });

        for(let i = 0; i < 40; i++) {
            const mesh = new THREE.Mesh(geo, mat.clone());
            mesh.position.copy(position);
            // High velocity scatter
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                Math.random() * 15 + 5,
                (Math.random() - 0.5) * 20
            );
            
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            
            this.scene.add(mesh);
            this.particles.push({ 
                mesh, 
                velocity, 
                life: 1.0,
                isExplosion: true,
                rotSpeed: new THREE.Vector3(Math.random()*15, Math.random()*15, Math.random()*15)
            });
        }
    }
    
    update(deltaTime) {
        for(let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.life -= deltaTime * (p.isSpark ? 4.0 : 2.0); // Sparks fade faster
            if(p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            } else {
                p.mesh.position.addScaledVector(p.velocity, deltaTime);
                p.velocity.y -= (p.isSpark ? 9.8 : 15) * deltaTime; // Gravity
                
                if (p.isSpark) {
                    const progress = p.life / p.maxLife; // 1.0 -> 0.0
                    
                    // Fading and Color shift (Hot to Cold color transition)
                    p.mesh.material.color.lerpColors(p.endColor, p.startColor, progress);
                    p.mesh.material.opacity = progress;
                    
                    // Dynamic AAA Stretch based on velocity speed
                    const speed = p.velocity.length();
                    p.mesh.scale.set(1.0, speed * 0.04 * progress, 1.0);
                    
                    // Align orientation along the velocity vector
                    const dir = p.velocity.clone().normalize();
                    p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                } else {
                    if (p.rotSpeed) {
                        p.mesh.rotation.x += deltaTime * p.rotSpeed.x;
                        p.mesh.rotation.y += deltaTime * p.rotSpeed.y;
                        p.mesh.rotation.z += deltaTime * p.rotSpeed.z;
                    } else {
                        p.mesh.rotation.x += deltaTime * 10;
                    }
                    
                    if (p.isExplosion) {
                        p.mesh.material.opacity = p.life;
                    }
                    
                    p.mesh.scale.setScalar(p.life);
                }
            }
        }
    }
}

export class Game {
    constructor(scene, camera, renderer, composer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.composer = composer;
        this.clock = new THREE.Clock();
        this.particleManager = new ParticleManager(scene);
        this.shakeTime = 0;
        
        // Game State
        this.isRunning = false;
        this.isGameOver = false;
        this.score = 0;
        this.highScore = 0;
        this.coinsCollected = 0;
        this.speed = 10;
        this.activePowerup = null;
        this.powerupTimer = 0;
        this.powerupMaxTime = 0;

        // UI Elements
        this.uiScore = document.getElementById('score');
        this.uiHighScore = document.getElementById('highscore');
        this.uiCoins = document.getElementById('coins');
        this.uiGameOver = document.getElementById('game-over');
        this.uiFinalScore = document.getElementById('final-score');
        this.uiLoading = document.getElementById('loading');
        this.uiStartScreen = document.getElementById('start-screen');
        this.uiPowerupContainer = document.getElementById('powerup-container');
        this.uiPowerupName = document.getElementById('powerup-name');
        this.uiPowerupDesc = document.getElementById('powerup-desc');
        this.uiPowerupBar = document.getElementById('powerup-bar');
        this.uiPowerupQueue = document.getElementById('powerup-queue');
        this.uiStoreContainer = document.getElementById('store-container');
        
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
        document.getElementById('char1-btn').addEventListener('click', () => {
            this.player.selectCharacter('char1');
            this.startGameplay();
        });
        document.getElementById('char2-btn').addEventListener('click', () => {
            this.player.selectCharacter('char2');
            this.startGameplay();
        });
        document.getElementById('char3-btn').addEventListener('click', () => {
            this.player.selectCharacter('char3');
            this.startGameplay();
        });
        document.getElementById('char4-btn').addEventListener('click', () => {
            this.player.selectCharacter('char4');
            this.startGameplay();
        });

        document.getElementById('btn-buy-magnet')?.addEventListener('click', () => this.buyItem('magnet', 30));
        document.getElementById('btn-buy-tranq')?.addEventListener('click', () => this.buyItem('tranq', 80));
        document.getElementById('btn-buy-rocket')?.addEventListener('click', () => this.buyItem('rocket', 20));
        
        // Direct keyboard event listeners for store hotkeys to bypass InputManager sync issues
        window.addEventListener('keydown', (e) => {
            if (!this.isRunning || this.isGameOver) return;
            
            // Only trigger once per press
            if (e.repeat) return;
            
            if (e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1') {
                this.buyItem('magnet', 30);
            } else if (e.code === 'Digit2' || e.code === 'Numpad2' || e.key === '2') {
                this.buyItem('tranq', 80);
            } else if (e.code === 'Digit3' || e.code === 'Numpad3' || e.key === '3') {
                this.buyItem('rocket', 20);
            }
        });
        
        // Premium UI interactive hover preview
        document.getElementById('char1-btn').addEventListener('mouseenter', () => {
            if (!this.hasStarted && this.player.model !== this.player.models['char1'].scene) {
                this.player.selectCharacter('char1');
            }
        });
        document.getElementById('char2-btn').addEventListener('mouseenter', () => {
            if (!this.hasStarted && this.player.model !== this.player.models['char2'].scene) {
                this.player.selectCharacter('char2');
            }
        });
        document.getElementById('char3-btn').addEventListener('mouseenter', () => {
            if (!this.hasStarted && this.player.model !== this.player.models['char3'].scene) {
                this.player.selectCharacter('char3');
            }
        });
        document.getElementById('char4-btn').addEventListener('mouseenter', () => {
            if (!this.hasStarted && this.player.model !== this.player.models['char4'].scene) {
                this.player.selectCharacter('char4');
            }
        });

        // Managers
        this.inputManager = new InputManager();
        this.trackManager = new TrackManager(this.scene);
        this.soundManager = new SoundManager();
        this.player = new Player(this.scene, this.soundManager);
        
        // Load Assets
        this.loadAssets();
    }

    async loadAssets() {
        try {
            await Promise.all([
                this.player.loadModel(),
                this.trackManager.loadModel()
            ]);
            
            // Pre-load char1 so the cinematic camera has something to orbit!
            this.player.selectCharacter('char1');
            
            this.uiLoading.style.display = 'none';
            this.uiStartScreen.style.display = 'flex';
            this.isRunning = false; // We start game on button click
            this.hasStarted = false;
            this.animate();
        } catch (error) {
            console.error("Failed to load assets:", error);
            this.uiLoading.innerHTML = "<h1>Error loading assets!</h1><p style='font-size:12px;text-align:left;color:red;'>" + (error.stack || error.toString()) + "</p>";
        }
    }

    start() {
        // Called by main.js after initialization
    }

    startGameplay() {
        this.uiStartScreen.style.display = 'none';
        
        // Show HUD
        document.getElementById('controls-container').style.display = 'flex';
        document.getElementById('score-container').style.display = 'flex';
        
        this.hasStarted = true;
        this.isRunning = true;
        this.isGameOver = false;
        
        // Ensure unmuted text if music hasn't started yet
        const btnMusic = document.getElementById('btn-music');
        if (btnMusic && btnMusic.innerText.toUpperCase().includes('UNMUTE')) {
            btnMusic.click();
        }
        
        this.reset();
    }

    reset() {
        this.score = 0;
        this.coinsCollected = 0;
        this.speed = 10;
        this.uiScore.innerText = '0';
        this.uiCoins.innerText = '0';
        this.isGameOver = false;
        this.isRunning = true;
        this.isPaused = false;
        
        this.uiGameOver.style.display = 'none';
        
        // Show HUD again (was hidden on game over)
        document.getElementById('controls-container').style.display = 'flex';
        document.getElementById('score-container').style.display = 'flex';
        if (this.uiStoreContainer) this.uiStoreContainer.style.display = 'flex';
        
        this.powerupQueue = [];
        this.activeMissiles = [];
        this.magnetTimer = 0;
        if (this.updatePowerupQueueUI) this.updatePowerupQueueUI();
        if (this.clearPowerup) this.clearPowerup(); // Initialize powerup state
        
        this.player.reset();
        this.trackManager.reset();
        
        // Restart music from the very beginning
        if (window.ytPlayer && typeof window.ytPlayer.seekTo === 'function') {
            window.ytPlayer.seekTo(0);
            // If we're restarting and the game was unmuted, play it
            const btnMusic = document.getElementById('btn-music');
            if (btnMusic && !btnMusic.innerText.toUpperCase().includes('UNMUTE')) {
                window.ytPlayer.playVideo();
            }
        }
    }

    restart() {
        this.reset();
    }

    showGameOver() {
        this.isGameOver = true;
        this.isRunning = false;
        
        // Hide HUD
        document.getElementById('controls-container').style.display = 'none';
        document.getElementById('score-container').style.display = 'none';
        if (this.uiStoreContainer) this.uiStoreContainer.style.display = 'none';
        if (this.uiPowerupContainer) this.uiPowerupContainer.style.display = 'none';
        
        this.uiGameOver.style.display = 'flex';
        document.getElementById('final-score').innerText = Math.floor(this.score);
        this.player.playStumble();
        
        // Stop music
        if (window.ytPlayer && typeof window.ytPlayer.pauseVideo === 'function') {
            window.ytPlayer.pauseVideo();
        }
    }

    gameOver() {
        if (this.isGameOver) return;
        this.showGameOver();
    }

    buyItem(item, cost) {
        if (this.coinsCollected >= cost) {
            this.coinsCollected -= cost;
            this.uiCoins.innerText = this.coinsCollected;
            
            if (item === 'magnet') {
                this.magnetTimer = 10.0;
            } else if (item === 'tranq') {
                this.speed *= 0.8;
                if (this.speed < 10) this.speed = 10;
            } else if (item === 'rocket') {
                this.fireRocket();
            }
        } else {
            // Visual feedback for not enough coins
            this.uiCoins.style.color = '#ff0000';
            setTimeout(() => {
                if(this.uiCoins) this.uiCoins.style.color = '';
            }, 300);
        }
    }

    fireRocket() {
        const playerLane = this.player.lane;
        const playerTargetX = -playerLane * this.player.laneWidth;
        
        let targetObstacle = null;
        let minZ = Infinity;
        
        for (let o of this.trackManager.obstacles) {
            if (o.userData.active && o.position.z > this.player.root.position.z) {
                if (Math.abs(o.position.x - playerTargetX) < 0.1) {
                    if (o.position.z < minZ) {
                        minZ = o.position.z;
                        targetObstacle = o;
                    }
                }
            }
        }
        
        if (targetObstacle) {
            if (this.soundManager) this.soundManager.playJump(); // Use jump sound as launch sound
            
            const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
            geo.rotateX(Math.PI / 2);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
            const mesh = new THREE.Mesh(geo, mat);
            
            const startPos = this.player.root.position.clone();
            startPos.y += 0.5;
            mesh.position.copy(startPos);
            
            this.scene.add(mesh);
            
            const distance = targetObstacle.position.z - this.player.root.position.z;
            const missileWorldSpeed = this.speed + 100; // Always faster than player speed
            const progressSpeed = missileWorldSpeed / distance;

            this.activeMissiles.push({
                mesh: mesh,
                target: targetObstacle,
                progress: 0.0,
                startPos: startPos,
                speed: Math.max(progressSpeed, 6.0) // Minimum speed
            });
        }
    }

    applyPowerup(type) {
        this.activePowerup = type;
        if (type === 'INVINCIBLE') this.powerupMaxTime = 10;
        if (type === 'STATIC') this.powerupMaxTime = 15;
        if (type === 'ACTION') this.powerupMaxTime = 10;
        if (type === 'RAGE') this.powerupMaxTime = 15;
        this.powerupTimer = this.powerupMaxTime;
        
        if (this.uiPowerupContainer) {
            this.uiPowerupContainer.style.display = 'flex';
            this.uiPowerupName.innerText = type + ' ACTIVE';
            
            let color = '#00ffff';
            let desc = '';
            
            if (type === 'INVINCIBLE') {
                color = '#ffff00';
                desc = 'PHASE SHIFT ENGAGED';
            } else if (type === 'STATIC') {
                color = '#0088ff';
                desc = 'TIME DILATION PROTOCOL';
            } else if (type === 'ACTION') {
                color = '#00ff00';
                desc = 'GRAVITY DEFIANCE BOOST';
            } else if (type === 'RAGE') {
                color = '#ff0000';
                desc = 'OBLITERATION AURA';
            }
            
            this.uiPowerupName.style.color = color;
            this.uiPowerupName.style.textShadow = `0 0 5px ${color}`;
            this.uiPowerupBar.style.backgroundColor = color;
            
            if (this.uiPowerupDesc) {
                this.uiPowerupDesc.innerText = desc;
                this.uiPowerupDesc.style.color = color;
            }
        }

        if (type === 'STATIC') {
            this.trackManager.isStaticActive = true;
            for (let o of this.trackManager.obstacles) {
                if (o.userData.active && o.userData.isVehicle) {
                    o.userData.velocity = 0;
                }
            }
        } else {
            this.trackManager.isStaticActive = false;
        }

        if (type === 'ACTION') {
            this.player.jumpVelocity = 9.5;
        } else {
            this.player.jumpVelocity = 5;
        }
    }

    clearPowerup() {
        this.activePowerup = null;
        if (this.uiPowerupContainer) {
            this.uiPowerupContainer.style.display = 'none';
        }
        if (this.trackManager.isStaticActive) {
            this.trackManager.isStaticActive = false;
            for (let o of this.trackManager.obstacles) {
                if (o.userData.active && o.userData.isVehicle) {
                    o.userData.velocity = 6 + Math.random() * 6;
                }
            }
        }
        this.player.jumpVelocity = 5;
    }

    updatePowerupQueueUI() {
        if (!this.uiPowerupQueue) return;
        this.uiPowerupQueue.innerHTML = '';
        
        for (let type of this.powerupQueue) {
            const el = document.createElement('div');
            el.style.fontSize = '0.7em';
            el.style.padding = '2px 6px';
            el.style.borderRadius = '3px';
            el.style.background = 'rgba(0,0,0,0.5)';
            el.style.fontFamily = "'Oxanium', sans-serif";
            
            let color = '#00ffff';
            if (type === 'INVINCIBLE') color = '#ffff00';
            else if (type === 'STATIC') color = '#0088ff';
            else if (type === 'ACTION') color = '#00ff00';
            else if (type === 'RAGE') color = '#ff0000';
            
            el.style.color = color;
            el.style.border = `1px solid ${color}`;
            el.innerText = type;
            this.uiPowerupQueue.appendChild(el);
        }
    }

    updateCamera() {
        if (this.player.root) {
            const playerPos = this.player.root.position;
            
            // Premium Cinematic Camera for Start Screen
            if (!this.hasStarted && !this.isGameOver) {
                const time = Date.now() * 0.0003; // Slow rotation
                const radius = 4.5;
                const camX = Math.sin(time) * radius;
                const camZ = playerPos.z + Math.cos(time) * radius;
                
                // Smoothly orbit around the character
                this.camera.position.lerp(new THREE.Vector3(camX, playerPos.y + 0.8, camZ), 0.1);
                this.camera.lookAt(0, playerPos.y + 0.5, playerPos.z);
                return; // Skip normal gameplay camera
            }

            if (this.isRunning && !this.isGameOver) {
                // Gameplay Camera
                // Camera trails behind and above the player
                // Lock camera X to 0 to prevent drifting into buildings
                const targetX = 0; 
                const targetY = playerPos.y + 1.2;
                const targetZ = playerPos.z - 2.5;

                // Lerp camera for smooth follow
                this.camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.1);
                
                // Look slightly upward into the horizon
                this.camera.lookAt(0, playerPos.y + 0.8, playerPos.z + 10);
                
                // Dynamic FOV for speed sensation
                const targetFov = 60 + Math.max(0, this.speed - 10) * 1.5;
                this.camera.fov += (targetFov - this.camera.fov) * 0.1;
                this.camera.updateProjectionMatrix();
                
            } else if (this.isGameOver) {
                // Game Over Camera - zoom in on stumbling player
                const targetX = playerPos.x;
                const targetY = playerPos.y + 0.5;
                const targetZ = playerPos.z - 4; // Look at them from the front
                
                this.camera.position.x += (targetX - this.camera.position.x) * 0.05;
                this.camera.position.y += (targetY - this.camera.position.y) * 0.05;
                this.camera.position.z += (targetZ - this.camera.position.z) * 0.05;
                this.camera.lookAt(playerPos.x, playerPos.y + 0.5, playerPos.z);
                
                // Camera Shake Effect
                if (this.shakeTime > 0) {
                    this.shakeTime -= 0.016; // Approx delta time
                    const intensity = this.shakeTime * 1.5;
                    this.camera.position.x += (Math.random() - 0.5) * intensity;
                    this.camera.position.y += (Math.random() - 0.5) * intensity;
                }
            }
        }
    }

    checkCollisions(deltaTime) {
        if (!this.player.root || this.isGameOver) return;
        
        const playerBox = this.player.boundingBox;
        
        // Check powerup items
        for (let p of this.trackManager.powerups) {
            if (p.userData.active && playerBox.intersectsBox(p.userData.boundingBox)) {
                if (this.soundManager) this.soundManager.playPowerup();
                p.userData.active = false;
                p.visible = false;
                this.particleManager.spawnCoinBurst(p.position);
                
                const pickupType = p.userData.type || 'INVINCIBLE';
                
                if (this.activePowerup) {
                    this.powerupQueue.push(pickupType);
                    this.updatePowerupQueueUI();
                } else {
                    this.applyPowerup(pickupType);
                }
            }
        }

        // Check obstacles
        for (let o of this.trackManager.obstacles) {
            if (o.userData.active && playerBox.intersectsBox(o.userData.boundingBox)) {
                const isVehicle = o.userData.isVehicle;
                
                if (this.activePowerup === 'INVINCIBLE') {
                    continue; // Pass through all obstacles
                }
                
                if (this.activePowerup === 'RAGE' && isVehicle) {
                    // Destroy vehicle with premium explosion
                    o.userData.active = false;
                    o.visible = false;
                    this.particleManager.spawnExplosion(o.position);
                    if (this.soundManager) this.soundManager.playExplosion();
                    this.shakeTime = 0.3; // Give a slight camera shake for impact
                    continue;
                }

                if (this.soundManager) {
                    let gender = 'male';
                    if (this.player.charId === 'char1') gender = 'female';
                    else if (this.player.charId === 'char3') gender = 'robot';
                    this.soundManager.playDeath(gender);
                }
                this.shakeTime = 0.5; // Trigger camera shake
                this.gameOver();
                return;
            }
        }
        
        // Check coins
        for (let c of this.trackManager.coins) {
            if (c.userData.active) {
                // Magnet logic
                if (this.magnetTimer > 0) {
                    const dist = c.position.distanceTo(this.player.root.position);
                    if (dist < 5.0) {
                        c.position.lerp(this.player.root.position, 10 * deltaTime);
                        c.updateMatrixWorld(true);
                        c.userData.boundingBox.setFromObject(c);
                    }
                }

                if (playerBox.intersectsBox(c.userData.boundingBox)) {
                    // Collect coin
                    if (this.soundManager) this.soundManager.playCoin();
                    c.userData.active = false;
                    c.visible = false;
                    this.score += 50; // Bonus for coin
                    this.coinsCollected++;
                    this.uiCoins.innerText = this.coinsCollected;
                    
                    // VFX
                    this.particleManager.spawnCoinBurst(c.position);
                }
            }
        }
    }

    togglePause() {
        if (!this.isGameOver && this.isRunning) {
            this.isPaused = !this.isPaused;
        }
        return this.isPaused;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const rawDeltaTime = this.clock.getDelta();
        const deltaTime = this.isPaused ? 0 : rawDeltaTime;

        if (this.isRunning && !this.isGameOver) {
            // Update Score
            this.score += deltaTime * this.speed;
            const currentScore = Math.floor(this.score);
            this.uiScore.innerText = currentScore;
            
            if (currentScore > this.highScore) {
                this.highScore = currentScore;
                if (this.uiHighScore) this.uiHighScore.innerText = this.highScore;
            }
            
            // Update Powerups
            if (this.activePowerup) {
                this.powerupTimer -= deltaTime;
                if (this.powerupTimer <= 0) {
                    this.clearPowerup();
                    if (this.powerupQueue && this.powerupQueue.length > 0) {
                        const nextPowerup = this.powerupQueue.shift();
                        this.applyPowerup(nextPowerup);
                        this.updatePowerupQueueUI();
                    }
                } else if (this.uiPowerupBar) {
                    const fillAmount = this.powerupTimer / this.powerupMaxTime;
                    this.uiPowerupBar.style.transform = `scaleX(${fillAmount})`;
                }
            }

            // Increase Speed gradually
            if (this.speed < 32) {
                this.speed += deltaTime * 0.1; // Slower acceleration over time
            }
            
            if (this.magnetTimer > 0) {
                this.magnetTimer -= deltaTime;
            }

            // Update Missiles
            if (this.activeMissiles) {
                for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
                    let m = this.activeMissiles[i];
                    m.progress += deltaTime * m.speed;
                    
                    if (m.progress >= 1.0 || !m.target.userData.active) {
                        if (m.progress >= 1.0 && m.target.userData.active) {
                            m.target.userData.active = false;
                            m.target.visible = false;
                            this.particleManager.spawnCoinBurst(m.target.position);
                            if (this.soundManager) this.soundManager.playHit();
                        }
                        this.scene.remove(m.mesh);
                        this.activeMissiles.splice(i, 1);
                    } else {
                        const targetPos = m.target.position.clone();
                        targetPos.y += 0.5;
                        m.mesh.position.lerpVectors(m.startPos, targetPos, m.progress);
                        // Add spark trail
                        if (Math.random() > 0.5) {
                            this.particleManager.spawnSkateSparks(m.mesh.position, false, 'char2');
                        }
                    }
                }
            }

            // Update managers
            this.player.update(deltaTime, this.inputManager);
            this.trackManager.update(deltaTime, this.speed);
            
            // Premium AAA Skate Sparks (rubbing against road)
            const isSliding = (this.player.state === 'sliding');
            const spawnChance = isSliding ? 0.9 : 0.45; // Increased normal run spawn chance from 0.2 to 0.45
            if (Math.random() < spawnChance) {
                this.particleManager.spawnSkateSparks(
                    this.player.root.position, 
                    isSliding, 
                    this.player.charId || 'char1'
                );
            }
            
            this.checkCollisions(deltaTime);
            this.updateCamera();
        } else if (this.isGameOver) {
            // Still update player to play stumble animation
            this.player.update(deltaTime, this.inputManager);
        } else if (!this.hasStarted) {
            // Update player idle animation and camera before game starts
            this.player.update(deltaTime, this.inputManager);
            this.updateCamera();
        }
        
        // Update Particles globally
        this.particleManager.update(deltaTime);

        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
