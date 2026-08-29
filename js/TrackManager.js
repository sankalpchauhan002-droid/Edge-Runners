import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class TrackManager {
    constructor(scene) {
        this.scene = scene;
        this.chunkLength = 20; // Default, will be updated by model
        this.activeChunks = 10; // Moderate amount for GLB
        this.laneWidth = 0.8; // Strict tighter lane bounds
        
        // Pools
        this.chunks = [];
        this.obstacles = [];
        this.coins = [];
        this.powerups = [];
        this.cityModel = null;
        this.isStaticActive = false;
        
        // Materials
        this.barrierMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
        this.overheadMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
        this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
        this.powerupMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, metalness: 0.5, roughness: 0.2, emissive: 0x008888 });
    }

    async loadModel() {
        const loader = new GLTFLoader();
        
        const loadGLTF = (path) => new Promise((resolve, reject) => {
            loader.load(path, resolve, undefined, reject);
        });

        try {
            // Load all models concurrently
            const [cityGltf, policeGltf, raceGltf, sportsGltf] = await Promise.all([
                loadGLTF('./assets/beautiful-city/source/Untitled.glb'),
                loadGLTF('./assets/PoliceCar.glb'),
                loadGLTF('./assets/RaceCar.glb'),
                loadGLTF('./assets/SportsCar.glb')
            ]);

            this.vehicleModels = {
                police: policeGltf.scene,
                race: raceGltf.scene,
                sports: sportsGltf.scene
            };

            const model = cityGltf.scene;
            
            // Group to manage rotation and offsets
            const wrapper = new THREE.Group();
            wrapper.add(model);
            
            let bbox = new THREE.Box3().setFromObject(wrapper);
            let size = bbox.getSize(new THREE.Vector3());
            
            // If the street is wider than it is long, rotate it 90 degrees
            if (size.x > size.z) {
                model.rotation.y = Math.PI / 2;
                model.updateMatrixWorld();
                bbox.setFromObject(wrapper);
                bbox.getSize(size);
            }
            
            // We scale up the city so the road itself is wide enough to fit our lanes.
            // Assuming buildings take up a lot of the width, we make the total width much larger.
            const scale = 25 / size.x; 
            wrapper.scale.set(scale, scale, scale);
            wrapper.updateMatrixWorld();
            
            bbox.setFromObject(wrapper);
            bbox.getSize(size);
            
            const center = bbox.getCenter(new THREE.Vector3());
            
            // We subtract -4.0 to shift the city to the negative X direction (right on screen), placing the character on the road.
            const OFFSET_X = -center.x - 4.0;
            
            // Position wrapper temporarily to raycast at world X=0 (where player runs)
            wrapper.position.set(OFFSET_X, 0, 0);
            wrapper.updateMatrixWorld(true);
            
            // Use Raycaster to find the exact height of the road surface at the center lane
            const raycaster = new THREE.Raycaster();
            // Shoot a ray from high up down to the origin
            raycaster.set(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -1, 0));
            
            const intersects = raycaster.intersectObject(wrapper, true);
            
            let OFFSET_Y = -bbox.min.y; // fallback
            if (intersects.length > 0) {
                OFFSET_Y = -intersects[0].point.y;
            }
            
            // The bounding box often includes invisible boundaries or overhanging streetlights
            // that make size.z larger than the physical road. We subtract a small amount
            // to force the chunks to overlap slightly and close the gap.
            const OFFSET_Z = 0;
            this.chunkLength = size.z - 1.5; 
            
            // Set final position with calculated OFFSET_Y
            wrapper.position.set(OFFSET_X, OFFSET_Y, OFFSET_Z);
            
            wrapper.traverse(child => {
                if (child.isMesh) {
                    child.receiveShadow = true;
                    child.castShadow = true;
                }
            });
            
            const masterChunk = new THREE.Group();
            masterChunk.add(wrapper);
            this.cityModel = masterChunk; // Use masterChunk as the base chunk
            
            this.initPools();
            return Promise.resolve();
        } catch (error) {
            console.error("Error loading GLB models:", error);
            return Promise.reject(error);
        }
    }

    initPools() {
        // Create a continuous dark ground plane beneath the city to completely hide any blue sky gaps
        const groundGeo = new THREE.PlaneGeometry(100, 1000);
        const groundMat = new THREE.MeshBasicMaterial({ color: 0x222222 }); // Dark asphalt color
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05; // Just below the road surface
        this.scene.add(ground);

        // Init track chunks
        for (let i = 0; i < this.activeChunks; i++) {
            this.spawnChunk(i * this.chunkLength, i);
        }
        
        // Init obstacles pool
        const types = ['cone', 'barricade', 'scaffold', 'boom', 'vehicle_police', 'vehicle_race', 'vehicle_sports'];
        for (let i = 0; i < 30; i++) {
            const type = types[i % types.length];
            this.obstacles.push(this.createObstacle(type));
        }
        
        // Init coins pool (e.g. 50 coins)
        for (let i = 0; i < 50; i++) {
            this.coins.push(this.createCoin());
        }

        // Init powerups pool
        for (let i = 0; i < 10; i++) {
            this.powerups.push(this.createPowerup());
        }
        
        this.reset(); // Positions items initially
    }

    createPowerup() {
        const group = new THREE.Group();
        group.position.y = 0.5;
        group.userData = { active: false, boundingBox: new THREE.Box3(), type: '' };
        group.visible = false;
        
        // Base materials for premium look
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.2,
            roughness: 0.1,
            transmission: 0.9,
            thickness: 0.5,
            clearcoat: 1.0,
            transparent: true,
            opacity: 0.8
        });
        
        // Invincible (Yellow) - Shield / Dodecahedron inside glass sphere
        const invGroup = new THREE.Group();
        const invCore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x888800, metalness: 0.8, roughness: 0.2 }));
        const invShell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), glassMat);
        invGroup.add(invCore, invShell);
        invGroup.name = 'INVINCIBLE';
        invGroup.visible = false;
        
        // Static (Blue) - Time Dilation / Double Torus
        const statGroup = new THREE.Group();
        const statCore = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 16, 32), new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x004488, metalness: 0.9, roughness: 0.1 }));
        const statCore2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 16, 32), new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x008888, metalness: 0.9, roughness: 0.1 }));
        statCore2.rotation.x = Math.PI / 2;
        statGroup.add(statCore, statCore2);
        statGroup.name = 'STATIC';
        statGroup.visible = false;
        
        // Action (Green) - Gravity / Upwards Arrow or Diamond
        const actGroup = new THREE.Group();
        const actCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x008800, metalness: 0.7, roughness: 0.2 }));
        const actRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 16, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 }));
        actRing.rotation.x = Math.PI / 2;
        actGroup.add(actCore, actRing);
        actGroup.name = 'ACTION';
        actGroup.visible = false;
        
        // Rage (Red) - Obliteration / Spiked Sphere
        const rageGroup = new THREE.Group();
        const rageCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, metalness: 0.5, roughness: 0.3, wireframe: false }));
        // Add spikes
        const rageSpike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xff5555, emissive: 0xaa0000, metalness: 1.0 }));
        for (let i = 0; i < 6; i++) {
            const spike = rageSpike.clone();
            if (i===0) spike.position.y = 0.2;
            if (i===1) { spike.position.y = -0.2; spike.rotation.x = Math.PI; }
            if (i===2) { spike.position.x = 0.2; spike.rotation.z = -Math.PI/2; }
            if (i===3) { spike.position.x = -0.2; spike.rotation.z = Math.PI/2; }
            if (i===4) { spike.position.z = 0.2; spike.rotation.x = Math.PI/2; }
            if (i===5) { spike.position.z = -0.2; spike.rotation.x = -Math.PI/2; }
            rageGroup.add(spike);
        }
        rageGroup.add(rageCore);
        rageGroup.name = 'RAGE';
        rageGroup.visible = false;
        
        group.add(invGroup, statGroup, actGroup, rageGroup);
        this.scene.add(group);
        return group;
    }

    createObstacle(type) {
        const group = new THREE.Group();
        let collisionMesh = null;
        
        // Ensure materials exist
        if (!this.matOrange) {
            this.matOrange = new THREE.MeshStandardMaterial({ color: 0xff6600 });
            this.matWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
            this.matWood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
            this.matMetal = new THREE.MeshStandardMaterial({ color: 0x777777 });
            this.matGreen = new THREE.MeshStandardMaterial({ color: 0x228b22 });
            this.matDark = new THREE.MeshStandardMaterial({ color: 0x222222 });
            this.matRed = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
        }

        if (type === 'cone') {
            const geoCone = new THREE.ConeGeometry(0.1, 0.25, 16);
            const m1 = new THREE.Mesh(geoCone, this.matOrange);
            m1.position.set(-0.2, 0.125, 0);
            const m2 = new THREE.Mesh(geoCone, this.matOrange);
            m2.position.set(0.2, 0.125, 0.1);
            group.add(m1, m2);
            
        } else if (type === 'barricade') {
            const geoBoard = new THREE.BoxGeometry(this.laneWidth - 0.1, 0.1, 0.05);
            const mBoard = new THREE.Mesh(geoBoard, this.matOrange);
            mBoard.position.set(0, 0.15, 0);
            const geoLeg = new THREE.BoxGeometry(0.05, 0.2, 0.1);
            const mLeg1 = new THREE.Mesh(geoLeg, this.matWhite);
            mLeg1.position.set(-0.3, 0.1, 0);
            const mLeg2 = new THREE.Mesh(geoLeg, this.matWhite);
            mLeg2.position.set(0.3, 0.1, 0);
            group.add(mBoard, mLeg1, mLeg2);
            collisionMesh = mBoard; // Player hits the board
            
        } else if (type === 'scaffold') {
            const geoPole = new THREE.BoxGeometry(0.05, 0.6, 0.05);
            const mPole1 = new THREE.Mesh(geoPole, this.matMetal);
            mPole1.position.set(-this.laneWidth/2 + 0.05, 0.3, 0);
            const mPole2 = new THREE.Mesh(geoPole, this.matMetal);
            mPole2.position.set(this.laneWidth/2 - 0.05, 0.3, 0);
            const geoBeam = new THREE.BoxGeometry(this.laneWidth, 0.1, 0.1);
            const mBeam = new THREE.Mesh(geoBeam, this.matWood);
            // Player standing is 0.57 tall. Sliding waist is at 0.285. 
            mBeam.position.set(0, 0.45, 0); // Safe clearance for sliding
            group.add(mPole1, mPole2, mBeam);
            collisionMesh = mBeam; // ONLY beam has collision, so player can slide under
            
        } else if (type === 'boom') {
            const geoBase = new THREE.BoxGeometry(0.15, 0.3, 0.15);
            const mBase = new THREE.Mesh(geoBase, this.matRed);
            mBase.position.set(-this.laneWidth/2 + 0.1, 0.15, 0);
            const geoArm = new THREE.BoxGeometry(this.laneWidth - 0.1, 0.05, 0.05);
            const mArm = new THREE.Mesh(geoArm, this.matWhite);
            mArm.position.set(0.1, 0.4, 0); // Safe clearance for sliding
            mArm.rotation.z = Math.PI / 12; // angled slightly up
            group.add(mBase, mArm);
            collisionMesh = mArm; // Slide under arm
            
        } else if (type.startsWith('vehicle_')) {
            const vType = type.split('_')[1]; // police, race, sports
            if (this.vehicleModels && this.vehicleModels[vType]) {
                const vModel = this.vehicleModels[vType].clone();
                
                let tempBbox = new THREE.Box3().setFromObject(vModel);
                let tempSize = tempBbox.getSize(new THREE.Vector3());
                
                // If width is greater than depth, car is facing sideways. Rotate it.
                if (tempSize.x > tempSize.z) {
                    vModel.rotation.y = Math.PI / 2;
                    vModel.updateMatrixWorld(true);
                }
                
                // Recalculate bounding box after potential rotation
                tempBbox.setFromObject(vModel);
                tempBbox.getSize(tempSize);
                const tempCenter = tempBbox.getCenter(new THREE.Vector3());
                
                // Shift the geometry so it is PERFECTLY centered on X/Z and resting on Y=0
                // This prevents the car from bleeding into adjacent lanes
                // Since vModel is a group of meshes, we wrap it in an inner group to offset it
                const offsetGroup = new THREE.Group();
                offsetGroup.add(vModel);
                
                // Move vModel in the opposite direction of its center offset
                vModel.position.set(-tempCenter.x, -tempBbox.min.y, -tempCenter.z);
                
                // Wrap in outer group for scaling
                const vWrapper = new THREE.Group();
                vWrapper.add(offsetGroup);
                
                // Scale width to fit in lane (0.75 units to leave tiny gap)
                const targetWidth = this.laneWidth - 0.05;
                const scale = targetWidth / tempSize.x;
                vWrapper.scale.set(scale, scale, scale);
                vWrapper.updateMatrixWorld(true);
                
                // Create invisible solid collision box that forces jump/slide failure
                // We artificially increase the collision box height to 3.0 so the player CANNOT jump over it
                const scaledX = tempSize.x * scale;
                const scaledZ = tempSize.z * scale;
                const geoBox = new THREE.BoxGeometry(scaledX, 3.0, scaledZ);
                collisionMesh = new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({visible: false}));
                
                // Position collision mesh so its bottom rests exactly at Y=0, and X/Z are perfectly centered
                collisionMesh.position.set(0, 1.5, 0);
                
                group.add(vWrapper, collisionMesh);
                
                // Enable shadows for vehicle and collect wheels
                const wheels = [];
                vWrapper.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.name.toLowerCase().includes('wheel') || child.name.toLowerCase().includes('tire')) {
                            wheels.push(child);
                        }
                    }
                });
                
                group.userData.isVehicle = true;
                group.userData.velocity = 6 + Math.random() * 6; // 6 to 12 units/sec speed
                group.userData.wheels = wheels;
            }
        }

        group.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        group.visible = false;
        
        // Preserve any existing userData (like vehicle metadata) while adding base obstacle properties
        group.userData = Object.assign(group.userData || {}, { 
            type: type, 
            active: false, 
            boundingBox: new THREE.Box3(), 
            collisionMesh: collisionMesh 
        });
        
        this.scene.add(group);
        return group;
    }

    createCoin() {
        const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
        const mesh = new THREE.Mesh(geo, this.coinMat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.2; // lowered from 0.5 to match scaled character
        mesh.castShadow = true;
        mesh.userData = { active: false, boundingBox: new THREE.Box3() };
        mesh.visible = false;
        
        this.scene.add(mesh);
        return mesh;
    }

    spawnChunk(zPos, index) {
        if (this.cityModel) {
            const mesh = this.cityModel.clone();
            // Assuming origin is at the center of the Z axis of the model
            mesh.position.z = zPos;
            this.scene.add(mesh);
            this.chunks.push(mesh);
        }
    }

    reset() {
        // Reset chunks
        for (let i = 0; i < this.chunks.length; i++) {
            this.chunks[i].position.z = i * this.chunkLength;
        }
        
        // Deactivate all obstacles and coins
        this.obstacles.forEach(o => { o.visible = false; o.userData.active = false; });
        this.coins.forEach(c => { c.visible = false; c.userData.active = false; });
        this.powerups.forEach(p => { p.visible = false; p.userData.active = false; });
        
        // Populate initial chunks
        for (let i = 5; i < this.chunks.length; i++) {
            this.populateChunk(this.chunks[i].position.z);
        }
    }

    populateChunk(zPos) {
        // Random chance to spawn obstacle or coins in a lane
        const lanes = [-1, 0, 1];
        
        // Spawn 1 obstacle 100% of the time, and a second one 25% of the time (1.25 average = 125%)
        const numObstacles = Math.random() < 0.25 ? 2 : 1;
        
        let obstacleLane = null;
        let obstacleType = null;
        
        // Get all inactive obstacles
        let inactiveObstacles = this.obstacles.filter(o => !o.userData.active);
        
        // Maybe spawn an obstacle
        for (let i = 0; i < numObstacles; i++) {
            if (inactiveObstacles.length > 0) {
                const randIndex = Math.floor(Math.random() * inactiveObstacles.length);
                const obstacle = inactiveObstacles.splice(randIndex, 1)[0];
                
                obstacleType = obstacle.userData.type;
                const isVehicle = obstacleType.startsWith('vehicle_');
                
                let safeLanes = [-1, 0, 1];
                
                // Prevent vehicles from crashing into static obstacles and vice versa
                this.obstacles.forEach(activeObs => {
                    if (activeObs.userData.active && activeObs !== obstacle) {
                        const lane = Math.round(activeObs.position.x / this.laneWidth);
                        
                        // If we are spawning a vehicle, we cannot spawn in ANY lane with an existing obstacle
                        // If we are spawning a static obstacle, we cannot spawn in a lane with an oncoming vehicle
                        if (isVehicle || activeObs.userData.isVehicle) {
                            safeLanes = safeLanes.filter(l => l !== lane);
                        }
                    }
                });
                
                if (safeLanes.length > 0) {
                    obstacleLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
                    const targetX = obstacleLane * this.laneWidth;
                    
                    // Stagger Z position if there's a second obstacle
                    obstacle.position.z = zPos + (i * 10);
                    obstacle.position.x = targetX;
                    obstacle.userData.active = true;
                    obstacle.visible = true;
                    
                    // Assign random velocity to vehicles when they spawn
                    if (isVehicle) {
                        if (this.isStaticActive) {
                            obstacle.userData.velocity = 0;
                        } else {
                            obstacle.userData.velocity = 6 + Math.random() * 6;
                        }
                    }
                } else {
                    // No safe lane available, abort obstacle spawn
                    if (i === 0) obstacleLane = null;
                }
            }
        }
        
        // Maybe spawn powerup (12.5% chance per chunk, increased to 125% of original 10%)
        if (Math.random() > 0.875) {
            const lane = lanes[Math.floor(Math.random() * lanes.length)];
            if (lane !== obstacleLane) {
                const p = this.powerups.find(pItem => !pItem.userData.active);
                if (p) {
                    p.position.z = zPos - 1;
                    p.position.x = lane * this.laneWidth;
                    p.position.y = 0.5;
                    
                    // Assign random type
                    const types = ['INVINCIBLE', 'STATIC', 'ACTION', 'RAGE'];
                    const chosenType = types[Math.floor(Math.random() * types.length)];
                    p.userData.type = chosenType;
                    
                    // Show only the chosen model
                    p.children.forEach(child => {
                        child.visible = (child.name === chosenType);
                    });
                    
                    p.userData.active = true;
                    p.visible = true;
                }
            }
        }
        
        // Maybe spawn some coins
        if (Math.random() > 0.3) {
            let coinLane = lanes[Math.floor(Math.random() * lanes.length)];
            let coinY = 0.2; // Default coin height
            let canSpawnCoins = true;
            
            // If coins are trying to spawn in the same lane as the obstacle
            if (coinLane === obstacleLane) {
                if (obstacleType.startsWith('vehicle_')) {
                    // Solid blockers cannot be passed, so coins shouldn't be here.
                    // Shift coins to an adjacent available lane.
                    const availableLanes = lanes.filter(l => l !== obstacleLane);
                    coinLane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
                } else if (obstacleType === 'cone' || obstacleType === 'barricade') {
                    // Jump obstacles: place coins high up to reward jumping
                    coinY = 0.9;
                } else if (obstacleType === 'scaffold' || obstacleType === 'boom') {
                    // Slide obstacles: place coins very low to reward sliding
                    coinY = 0.15;
                }
            }
            
            if (canSpawnCoins) {
                const targetX = coinLane * this.laneWidth;
                for (let i = 0; i < 3; i++) {
                    const coin = this.coins.find(c => !c.userData.active);
                    if (coin) {
                        coin.position.z = zPos - i * 2;
                        coin.position.x = targetX;
                        coin.position.y = coinY; // Apply dynamic height
                        coin.userData.active = true;
                        coin.visible = true;
                    }
                }
            }
        }
    }

    update(deltaTime, speed) {
        const moveDist = speed * deltaTime;
        
        // Move Chunks (if they exist)
        if (this.cityModel) {
            for (let i = 0; i < this.chunks.length; i++) {
                this.chunks[i].position.z -= moveDist;
                
                // If chunk passed behind camera, recycle it to the front
                if (this.chunks[i].position.z < -this.chunkLength) {
                    let maxZ = -Infinity;
                    for (let j = 0; j < this.chunks.length; j++) {
                        if (this.chunks[j].position.z > maxZ) {
                            maxZ = this.chunks[j].position.z;
                        }
                    }
                    this.chunks[i].position.z = maxZ + this.chunkLength;
                    
                    // Populate new chunk
                    this.populateChunk(this.chunks[i].position.z);
                }
            }
        }
        
        // Move Obstacles
        for (let o of this.obstacles) {
            if (o.userData.active) {
                // Base movement matching world speed
                o.position.z -= moveDist;
                
                // Extra movement for vehicles driving towards player
                if (o.userData.isVehicle) {
                    const velocity = o.userData.velocity || 0;
                    const bonusMove = velocity * deltaTime;
                    o.position.z -= bonusMove; // Move towards camera (negative Z)? Wait, player is at Z=0. Obstacles spawn at positive Z?
                    // Let's check where they spawn.
                    
                    if (o.userData.wheels) {
                        o.userData.wheels.forEach(w => w.rotation.x += (velocity / 0.3) * deltaTime);
                    }
                }
                
                o.updateMatrixWorld(true);
                o.userData.boundingBox.setFromObject(o.userData.collisionMesh || o);
                
                // If obstacle passed behind camera
                if (o.position.z < -this.chunkLength) {
                    o.visible = false;
                    o.userData.active = false;
                }
            }
        }
        
        // Move Coins
        for (let c of this.coins) {
            if (c.userData.active) {
                c.position.z -= moveDist;
                c.rotation.z += 5 * deltaTime; // spin
                c.updateMatrixWorld(true);
                c.userData.boundingBox.setFromObject(c);
                
                if (c.position.z < -this.chunkLength) {
                    c.visible = false;
                    c.userData.active = false;
                }
            }
        }
        
        // Move Powerups
        for (let p of this.powerups) {
            if (p.userData.active) {
                p.position.z -= moveDist;
                p.rotation.y += 3 * deltaTime; // base spin
                
                // Animate inner premium components
                p.children.forEach(child => {
                    if (child.visible) {
                        if (child.name === 'STATIC') {
                            child.children[0].rotation.y += 2 * deltaTime;
                            child.children[1].rotation.x += 4 * deltaTime;
                        } else if (child.name === 'ACTION') {
                            child.children[1].rotation.y += 3 * deltaTime;
                        } else if (child.name === 'RAGE') {
                            child.rotation.x += 2 * deltaTime;
                            child.rotation.z += 1 * deltaTime;
                        } else if (child.name === 'INVINCIBLE') {
                            child.children[0].rotation.z += 2 * deltaTime;
                            child.children[0].rotation.x += 1 * deltaTime;
                        }
                    }
                });
                
                p.updateMatrixWorld(true);
                p.userData.boundingBox.setFromObject(p);
                
                if (p.position.z < -this.chunkLength) {
                    p.visible = false;
                    p.userData.active = false;
                }
            }
        }
    }
}
