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

        // Touch properties
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.touchThreshold = 30; // minimum pixels for a swipe

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Touch events
        window.addEventListener('touchstart', (e) => this.onTouchStart(e), {passive: false});
        window.addEventListener('touchmove', (e) => this.onTouchMove(e), {passive: false});
        window.addEventListener('touchend', (e) => this.onTouchEnd(e), {passive: false});
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

    onTouchStart(e) {
        this.touchStartX = e.changedTouches[0].screenX;
        this.touchStartY = e.changedTouches[0].screenY;
    }

    onTouchMove(e) {
        // Prevent default scrolling on canvas/game area, but allow UI interaction
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('#ui-layer > div:not(#pause-screen)')) {
            // Prevent default behavior to stop scrolling
            if (e.cancelable) {
                e.preventDefault();
            }
        }
    }

    onTouchEnd(e) {
        this.touchEndX = e.changedTouches[0].screenX;
        this.touchEndY = e.changedTouches[0].screenY;
        this.handleSwipe();
    }

    handleSwipe() {
        const diffX = this.touchEndX - this.touchStartX;
        const diffY = this.touchEndY - this.touchStartY;

        // If swipe is too small, ignore it
        if (Math.abs(diffX) < this.touchThreshold && Math.abs(diffY) < this.touchThreshold) {
            return;
        }

        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Horizontal swipe
            if (diffX > 0) {
                // Right swipe
                if (!this.keys.right) this.actions.moveRight = true;
                this.keys.right = true;
                setTimeout(() => this.keys.right = false, 150); // Simulate key release
            } else {
                // Left swipe
                if (!this.keys.left) this.actions.moveLeft = true;
                this.keys.left = true;
                setTimeout(() => this.keys.left = false, 150);
            }
        } else {
            // Vertical swipe
            if (diffY > 0) {
                // Down swipe (Slide)
                if (!this.keys.down) this.actions.slide = true;
                this.keys.down = true;
                setTimeout(() => this.keys.down = false, 150);
            } else {
                // Up swipe (Jump)
                if (!this.keys.up) this.actions.jump = true;
                this.keys.up = true;
                setTimeout(() => this.keys.up = false, 150);
            }
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
