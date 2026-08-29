import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export class Player {
    constructor(scene, soundManager) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.skatesModel = null;
        this.skateWheels = []; // To animate wheels
        
        // Lane positioning
        this.lane = 0; // -1: Left, 0: Center, 1: Right
        this.laneWidth = 0.8;
        
        // Physics / Movement
        this.targetX = 0;
        this.posY = 0;
        this.velocityY = 0;
        this.gravity = -12;
        this.jumpVelocity = 5;
        this.speed = 10;
        this.laneSwitchSpeed = 8;
        
        // State
        this.state = 'idle'; // idle, running, jumping, sliding, stumble
        
        this.boundingBox = new THREE.Box3();
        
        // Setup Models
        this.models = {};
    }

    async loadModel() {
        try {
            const loader = new GLTFLoader();
            const fbxLoader = new FBXLoader();
            
            const updateProgress = (xhr) => {
                if (xhr.lengthComputable) {
                    const percent = Math.round((xhr.loaded / xhr.total) * 100);
                    const loadingEl = document.getElementById('loading');
                    if (loadingEl) {
                        loadingEl.innerHTML = `<h1>Loading Assets...</h1><p style="font-size:24px; color:#00ffff; text-shadow: 0 0 10px #00ffff; font-family:'Orbitron', sans-serif;">Downloading model... ${percent}%</p><p style="font-size:12px; color:#aaa; margin-top:20px;">Downloading ~80MB of 3D models over the tunnel, this may take a minute...</p>`;
                    }
                }
            };

            const loadGLTF = (url) => {
                return new Promise((resolve, reject) => {
                    loader.load(url, resolve, updateProgress, reject);
                });
            };

            const loadFBX = (url) => {
                return new Promise((resolve, reject) => {
                    fbxLoader.load(url, resolve, updateProgress, reject);
                });
            };

            const gltf1 = await loadGLTF('./assets/anime-girl-character/source/AnimeCharacter.glb');
            const gltf2 = await loadGLTF('./assets/rigged-anime-male-character-1/source/rigged.glb');
            const gltf3 = await loadGLTF('./assets/robot/source/RobotExpressive.glb');
            const gltf4 = await loadGLTF('./assets/soldier/source/Soldier.glb');
            const skatesFbx = await loadFBX('./assets/classic-roller-skates/source/classic_roller_skates_01.fbx');
            
            this.models['char1'] = gltf1;
            this.models['char2'] = gltf2;
            this.models['char3'] = gltf3;
            this.models['char4'] = gltf4;
            this.skatesModel = skatesFbx;
            
            // Normalize skates model and find wheels
            // Reduced scale based on user feedback
            this.skatesModel.scale.set(0.004, 0.004, 0.004);
            this.skatesModel.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    // Boost materials for premium look
                    if (child.material) {
                        child.material.metalness = 0.6;
                        child.material.roughness = 0.2;
                    }
                    if (child.name.toLowerCase().includes('wheel')) {
                        this.skateWheels.push(child);
                    }
                }
            });
            
            this.root = new THREE.Group();
            this.scene.add(this.root);
            
            return Promise.resolve();
        } catch (error) {
            console.error("Error loading character models:", error);
            return Promise.reject(error);
        }
    }

    selectCharacter(charId) {
        this.charId = charId;
        
        if (this.model) {
            this.root.remove(this.model);
        }
        
        const gltf = this.models[charId];
        this.model = gltf.scene;
        
        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        if (charId === 'char1') {
            // Anime Girl (original settings)
            this.model.rotation.set(0, 0, 0); 
            this.model.scale.set(0.3, 0.3, 0.3);
            this.model.position.set(0, 0.285, 0); // Origin is at waist
        } else {
            // Boy, Robot, Soldier
            // Boy (char2) and Soldier (char4) need Math.PI to face forward.
            // Robot (char3) naturally faces forward at 0 rotation.
            if (charId === 'char3') {
                this.model.rotation.set(0, 0, 0); 
            } else {
                this.model.rotation.set(0, Math.PI, 0); 
            }
            
            // Reset scale to measure true dimensions
            this.model.scale.set(1, 1, 1);
            this.model.updateMatrixWorld(true);
            let bbox = new THREE.Box3().setFromObject(this.model);
            const rawHeight = bbox.max.y - bbox.min.y;
            
            // Target height of 0.55 units
            const targetHeight = 0.55;
            const scale = targetHeight / rawHeight;
            this.model.scale.set(scale, scale, scale);
            
            // Align the model's feet to Y = 0 automatically
            this.model.position.set(0, 0, 0);
            this.model.updateMatrixWorld(true);
            bbox.setFromObject(this.model);
            this.model.position.y = -bbox.min.y;
        }
        
        this.root.add(this.model);
        
        // Discover bones for procedural animation
        this.bones = {};
        this.baseRotations = {};
        this.model.traverse((child) => {
            if (child.isBone || child.type === 'Bone') {
                const name = child.name;
                let key = null;
                if (name.includes('LeftUpLeg')) key = 'leftThigh';
                else if (name.includes('LeftLeg') && !name.includes('UpLeg')) key = 'leftCalf';
                else if (name.includes('RightUpLeg')) key = 'rightThigh';
                else if (name.includes('RightLeg') && !name.includes('UpLeg')) key = 'rightCalf';
                else if (name.includes('LeftArm') && !name.includes('ForeArm')) key = 'leftArm';
                else if (name.includes('LeftForeArm')) key = 'leftForeArm';
                else if (name.includes('RightArm') && !name.includes('ForeArm')) key = 'rightArm';
                else if (name.includes('RightForeArm')) key = 'rightForeArm';
                else if (name.includes('LeftFoot')) key = 'leftFoot';
                else if (name.includes('RightFoot')) key = 'rightFoot';
                else if (name.includes('Spine') && !name.includes('Spine1') && !name.includes('Spine2')) key = 'spine';
                else if (name.includes('Spine1')) key = 'spine1';
                else if (name.includes('Spine2')) key = 'spine2';
                
                if (key) {
                    this.bones[key] = child;
                    this.baseRotations[key] = child.rotation.clone();
                }
            }
        });
        
        this.attachSkates();
        
        // Reset animations
        this.mixer = new THREE.AnimationMixer(this.model);
        this.animations = {};
        this.currentAction = null;
        
        // DEBUG: show bone count on score UI
        const scoreEl = document.getElementById('score');
        if (scoreEl) {
            scoreEl.innerText = "Bones: " + Object.keys(this.bones).length;
        }
        
        if (gltf.animations && gltf.animations.length > 0) {
            gltf.animations.forEach((clip) => {
                this.animations[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
            });
        }
        
        // Animation State Machine Mapping
        const findAnim = (keywords) => {
            return Object.keys(this.animations).find(name => keywords.some(k => name.includes(k)));
        };
        
        // If char3 or char4, try to use their actual running animations. 
        // For char1/char2, stick to idle so procedural skates animation can take over.
        let runAnim = findAnim(['idle', 'stand', 'wait']) || Object.keys(this.animations)[0];
        if (this.charId === 'char3' || this.charId === 'char4') {
            runAnim = findAnim(['run', 'walk']) || runAnim;
        }
        
        this.animMap = {
            'run': runAnim,
            'jump': findAnim(['jump', 'leap', 'air']),
            'slide': findAnim(['slide', 'duck', 'crouch', 'roll']),
            'stumble': findAnim(['stumble', 'die', 'hit', 'fall', 'death'])
        };
        
        if (this.animMap['run']) {
            this.playAnimation(this.animMap['run']);
        }
    }
    
    attachSkates() {
        if (!this.skatesModel) return;
        
        // Remove previous skates if any
        if (this.skatesInstance) {
            this.root.remove(this.skatesInstance);
        }
        if (this.leftSkateInstance) this.bones?.leftFoot?.remove(this.leftSkateInstance);
        if (this.rightSkateInstance) this.bones?.rightFoot?.remove(this.rightSkateInstance);
        
        this.skateWheels = []; // Reset wheels array
        
        if (this.charId === 'char3') {
            return; // No skates for robot (no foot bones mapped)
        }
        
        // If we have foot bones (Rigged Boy), attach split skates
        if (this.bones && this.bones.leftFoot && this.bones.rightFoot) {
            this.leftSkateInstance = this.skatesModel.clone();
            this.rightSkateInstance = this.skatesModel.clone();
            
            // Ensure matrices are updated so localToWorld works
            this.leftSkateInstance.updateMatrixWorld(true);
            this.rightSkateInstance.updateMatrixWorld(true);
            
            const setupSkateClone = (skateGroup, isLeft) => {
                skateGroup.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            child.material = child.material.clone();
                            if (this.charId === 'char2') {
                                if (child.name.toLowerCase().includes('wheel')) {
                                    child.material.color.setHex(0xffffff); 
                                } else {
                                    child.material.color.setHex(0xe81e55); 
                                    if (child.material.emissive) child.material.emissive.setHex(0x330011);
                                }
                            }
                        }
                        if (child.name.toLowerCase().includes('wheel')) {
                            this.skateWheels.push(child);
                        }
                        
                        // Hide the opposite skate's meshes
                        child.geometry.computeBoundingBox();
                        const center = new THREE.Vector3();
                        child.geometry.boundingBox.getCenter(center);
                        child.localToWorld(center);
                        
                        // Assuming center.x > 0 is one side and center.x < 0 is the other.
                        // (You may need to swap these if left/right are reversed)
                        if (isLeft && center.x < 0) {
                            child.visible = false;
                        } else if (!isLeft && center.x > 0) {
                            child.visible = false;
                        }
                    }
                });
            };
            
            setupSkateClone(this.leftSkateInstance, true);
            setupSkateClone(this.rightSkateInstance, false);
            
            // The skatesModel is already scaled to 0.004 in loadModel!
            // When we cloned it, the clones ALSO have scale 0.004.
            // But if we attach it to a bone, the bone inherits the character's global scale.
            // If the character is scaled down, the skates will be doubly scaled down!
            // Wait, Max (char2) is scaled via this.model.scale.set(scale, scale, scale).
            // Let's reset the skate clone scale to 1 to avoid double scaling, or adjust as needed.
            this.leftSkateInstance.scale.set(1, 1, 1);
            this.rightSkateInstance.scale.set(1, 1, 1);
            
            // Typical Mixamo foot offset adjustments to align skates with feet
            // Center the visible geometry of each skate to origin
            const centerSkate = (skateGroup) => {
                const box = new THREE.Box3();
                skateGroup.updateMatrixWorld(true);
                skateGroup.traverse(child => {
                    if (child.isMesh && child.visible) {
                        child.geometry.computeBoundingBox();
                        const childBox = child.geometry.boundingBox.clone();
                        childBox.applyMatrix4(child.matrixWorld);
                        box.union(childBox);
                    }
                });
                const center = new THREE.Vector3();
                if (!box.isEmpty()) {
                    box.getCenter(center);
                    skateGroup.worldToLocal(center);
                    // Shift all children to center
                    skateGroup.traverse(child => {
                        if (child.isMesh && child.visible) {
                            child.position.sub(center);
                        }
                    });
                }
            };
            
            centerSkate(this.leftSkateInstance);
            centerSkate(this.rightSkateInstance);
            
            this.leftSkateInstance.position.set(0, 0, 0); 
            this.rightSkateInstance.position.set(0, 0, 0);
            
            this.bones.leftFoot.add(this.leftSkateInstance);
            this.bones.rightFoot.add(this.rightSkateInstance);
            
        } else {
            // Un-rigged fallback (Anime Girl) - attach single instance to root
            this.skatesInstance = this.skatesModel.clone();
            this.skatesInstance.position.set(0, 0.02, 0);
            
            this.skatesInstance.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.name.toLowerCase().includes('wheel')) {
                        this.skateWheels.push(child);
                    }
                }
            });
            
            this.root.add(this.skatesInstance);
        }
    }

    playAnimation(name) {
        if (!this.mixer) return;
        
        const action = this.animations[name];
        if (!action) return;
        
        if (this.currentAction !== action) {
            if (this.currentAction) {
                this.currentAction.fadeOut(0.2);
            }
            action.reset().fadeIn(0.2).play();
            this.currentAction = action;
        }
    }

    reset() {
        this.state = 'idle';
        this.lane = 0;
        this.targetX = 0;
        this.posY = 0;
        this.velocityY = 0;
        this.speed = 10;
        
        if (this.root) {
            this.root.position.set(0, 0, 0);
            this.root.rotation.set(0, 0, 0);
        }
        
        if (this.animMap['run']) {
            this.playAnimation(this.animMap['run']);
        }
    }

    playStumble() {
        this.state = 'stumble';
        const stumbleAnim = this.animMap['stumble'];
        if (stumbleAnim) {
            this.playAnimation(stumbleAnim);
            // Don't loop the stumble animation
            this.currentAction.setLoop(THREE.LoopOnce);
            this.currentAction.clampWhenFinished = true;
        } else {
            // Fallback: tilt character if not procedurally animated
            if (this.root && (!this.bones || Object.keys(this.bones).length === 0 || this.charId === 'char3' || this.charId === 'char4')) {
                this.root.rotation.x = -Math.PI / 2;
                this.root.position.y = 0.5;
            }
        }
    }

    update(deltaTime, inputManager) {
        if (!this.root) return;
        
        // Position the skates very slightly in front of the character's root center
        if (this.skatesInstance) {
            this.skatesInstance.position.x = (this.charId === 'char2') ? 0.0 : 0.01;
            this.skatesInstance.position.z = (this.charId === 'char2') ? 0.02 : 0;
        }
        
        // Animate Skate Wheels
        if (this.skateWheels && this.skateWheels.length > 0 && this.state !== 'stumble') {
            const spinSpeed = this.speed * deltaTime * 2.0;
            // Assuming local X or Z axis spins the wheel. We'll rotate X.
            this.skateWheels.forEach(wheel => wheel.rotation.x += spinSpeed);
        }
        
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        // --- Procedural Animation ---
        let useProcedural = false;
        if (this.bones && Object.keys(this.bones).length > 0 && this.state !== 'idle' && this.charId !== 'char3') {
            // For char4 (Soldier), only use procedural math for states where he lacks a built-in animation (like jump/slide)
            if (this.charId === 'char4') {
                const hasAnim = this.animMap[this.state === 'jumping' ? 'jump' : (this.state === 'sliding' ? 'slide' : (this.state === 'stumble' ? 'stumble' : 'run'))];
                if (!hasAnim) useProcedural = true;
            } else {
                useProcedural = true; // Max always uses procedural for everything
            }
        }
        
        if (useProcedural) {
            this.animTime = (this.animTime || 0) + deltaTime * (this.speed * 0.8);
            
            // Reset to base rotations first to avoid compounding
            for (const [key, bone] of Object.entries(this.bones)) {
                if (this.baseRotations[key]) {
                    bone.rotation.copy(this.baseRotations[key]);
                }
            }

            if (this.state === 'running') {
                // Running motion (arms and legs swing)
                const swing = Math.sin(this.animTime);
                const swing2 = Math.cos(this.animTime);
                
                if (this.bones.leftThigh) this.bones.leftThigh.rotation.x += swing * 0.8;
                if (this.bones.rightThigh) this.bones.rightThigh.rotation.x -= swing * 0.8;
                
                if (this.bones.leftCalf) this.bones.leftCalf.rotation.x += Math.abs(swing2) * 0.8;
                if (this.bones.rightCalf) this.bones.rightCalf.rotation.x += Math.abs(swing2) * 0.8;
                
                if (this.bones.leftArm) this.bones.leftArm.rotation.x -= swing * 0.6;
                if (this.bones.rightArm) this.bones.rightArm.rotation.x += swing * 0.6;
                if (this.bones.leftForeArm) this.bones.leftForeArm.rotation.x -= 0.3; // slightly bent arms
                if (this.bones.rightForeArm) this.bones.rightForeArm.rotation.x -= 0.3;
                
                if (this.bones.spine) this.bones.spine.rotation.x += 0.2; // lean forward slightly
            } 
            else if (this.state === 'jumping') {
                // Jumping motion (legs tucked)
                if (this.bones.leftThigh) this.bones.leftThigh.rotation.x -= 0.8;
                if (this.bones.rightThigh) this.bones.rightThigh.rotation.x -= 0.8;
                if (this.bones.leftCalf) this.bones.leftCalf.rotation.x += 1.2;
                if (this.bones.rightCalf) this.bones.rightCalf.rotation.x += 1.2;
                
                if (this.bones.leftArm) this.bones.leftArm.rotation.x -= 1.5; // Arms up
                if (this.bones.rightArm) this.bones.rightArm.rotation.x -= 1.5;
            }
            else if (this.state === 'sliding') {
                // Sliding motion (character leans back dramatically, one leg forward)
                if (this.bones.spine) this.bones.spine.rotation.x -= 1.0;
                if (this.bones.leftThigh) this.bones.leftThigh.rotation.x -= 1.2; // Leg up
                if (this.bones.rightThigh) this.bones.rightThigh.rotation.x += 0.4; // Leg back
                if (this.bones.leftArm) this.bones.leftArm.rotation.x -= 1.5;
                if (this.bones.rightArm) this.bones.rightArm.rotation.x -= 1.5;
            }
            else if (this.state === 'stumble') {
                // Stumble motion
                if (this.bones.spine) this.bones.spine.rotation.x += 1.5;
                if (this.bones.leftArm) this.bones.leftArm.rotation.z += 1.5;
                if (this.bones.rightArm) this.bones.rightArm.rotation.z -= 1.5;
            }
        }

        if (this.state === 'stumble') {
            return; // Don't process input if dead
        }

        // Handle Lane Switching
        if (inputManager.actions.moveLeft && this.lane > -1) {
            this.lane--;
        } else if (inputManager.actions.moveRight && this.lane < 1) {
            this.lane++;
        }
        
        // Because the camera faces positive Z, Positive X is actually to the LEFT.
        // We invert the lane multiplication so Left (lane -1) results in Positive X (+3).
        this.targetX = -this.lane * this.laneWidth;
        
        // Smoothly move to target X
        this.root.position.x = THREE.MathUtils.lerp(this.root.position.x, this.targetX, 10 * deltaTime);

        // Handle Jump
        if (inputManager.actions.jump && this.state !== 'jumping') {
            this.state = 'jumping';
            this.velocityY = this.jumpVelocity;
            this.root.rotation.x = 0; // Stand up immediately if jumping out of a slide
            
            if (this.soundManager) this.soundManager.playJump();
            
            if (this.animMap['jump']) this.playAnimation(this.animMap['jump']);
        }
        
        // Handle Slide
        if (inputManager.actions.slide && this.state !== 'sliding') {
            this.state = 'sliding';
            this.slideTimer = 0.6; // slide for 0.6 seconds
            
            if (this.soundManager) this.soundManager.playSlide();
            
            // If mid-air, instantly slam to the ground
            this.posY = 0; 
            this.velocityY = 0;
            
            // visually slide with face upwards side (-Math.PI / 2) only if not procedurally animated
            if (!this.bones || Object.keys(this.bones).length === 0 || this.charId === 'char3' || this.charId === 'char4') {
                // Only tilt if they don't have an actual slide animation
                if (!this.animMap['slide']) {
                    this.root.rotation.x = -Math.PI / 2; 
                }
            }
            
            if (this.animMap['slide']) this.playAnimation(this.animMap['slide']);
        }

        // Apply Gravity / Vertical Movement
        if (this.state === 'jumping') {
            this.velocityY += this.gravity * deltaTime;
            this.posY += this.velocityY * deltaTime;
            
            if (this.posY <= 0) {
                this.posY = 0;
                this.velocityY = 0;
                this.state = 'running';
                
                if (this.animMap['run']) this.playAnimation(this.animMap['run']);
            }
        } else if (this.state === 'sliding') {
            this.slideTimer -= deltaTime;
            if (this.slideTimer <= 0) {
                this.state = 'running';
                this.root.rotation.x = 0; // stand back up
                if (this.animMap['run']) this.playAnimation(this.animMap['run']);
            }
        }
        
        this.root.position.y = this.posY;
        this.root.updateMatrixWorld(true);
        
        // Use a fixed logical bounding box instead of the fluctuating animated mesh bounds
        const px = this.root.position.x;
        const py = this.root.position.y;
        const pz = this.root.position.z;
        
        const width = 0.4;  // slightly thinner than lane
        const depth = 0.2;  
        let height = 0.55;  // slightly shorter than actual head

        if (this.state === 'sliding') {
            height = 0.25; // low profile for sliding under booms
        }

        this.boundingBox.set(
            new THREE.Vector3(px - width/2, py, pz - depth/2),
            new THREE.Vector3(px + width/2, py + height, pz + depth/2)
        );
        
        // Reset single-press actions
        inputManager.resetActions();
    }
}
