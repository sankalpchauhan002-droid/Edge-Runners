export class InputManager {
    constructor() {
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false
        };
        
        // Flags for single press actions
        this.actions = {
            moveLeft: false,
            moveRight: false,
            jump: false,
            slide: false
        };

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    onKeyDown(event) {
        switch(event.code) {
            case 'KeyA':
            case 'ArrowLeft':
                if (!this.keys.left) this.actions.moveLeft = true;
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                if (!this.keys.right) this.actions.moveRight = true;
                this.keys.right = true;
                break;
            case 'KeyW':
            case 'ArrowUp':
            case 'Space':
                if (!this.keys.up) this.actions.jump = true;
                this.keys.up = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                if (!this.keys.down) this.actions.slide = true;
                this.keys.down = true;
                break;
        }
    }

    onKeyUp(event) {
        switch(event.code) {
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'KeyW':
            case 'ArrowUp':
            case 'Space':
                this.keys.up = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.down = false;
                break;
        }
    }

    // Call this at the end of each frame to reset single-press flags
    resetActions() {
        this.actions.moveLeft = false;
        this.actions.moveRight = false;
        this.actions.jump = false;
        this.actions.slide = false;
    }
}
