export class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        
        // Initialize on first user interaction to comply with browser policies
        const initAudio = () => {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
                this.enabled = true;
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
        };
        
        document.addEventListener('click', initAudio);
        document.addEventListener('keydown', initAudio);
        
        // Preload audio buffers for instant, zero-delay playback
        this.audioBuffers = {};
        this.loadAudioBuffer('femaleVoice', 'assets/FemaleVoice.m4a');
        this.loadAudioBuffer('maleVoice', 'assets/MaleVoice.m4a');
    }

    async loadAudioBuffer(key, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            // We can't decode it until AudioContext is created by user interaction
            // So we store the raw ArrayBuffer and decode it later, OR
            // we can create a temporary offline context just for decoding
            const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            const offlineCtx = new OfflineAudioContext(2, 44100, 44100);
            const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
            this.audioBuffers[key] = audioBuffer;
        } catch (e) {
            console.warn('Failed to preload audio buffer:', url, e);
        }
    }

    playTone(freq, type, duration, vol) {
        if (!this.enabled || !this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playJump() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playSlide() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playCoin() {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        const nowTime = performance.now();
        if (this.lastCoinTime && nowTime - this.lastCoinTime < 50) return; // Debounce fast collections
        this.lastCoinTime = nowTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        const now = this.ctx.currentTime + 0.01; // Avoid scheduling in the past
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now); // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.05); // E6
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.3);
    }

    playHit() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }
    
    playPowerup() {
        if (!this.enabled || !this.ctx) return;
        
        // A premium, glowing powerup sound (Major chord arpeggio sweeping up)
        const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.05);
            
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + i * 0.05 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.05 + 0.4);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(this.ctx.currentTime + i * 0.05);
            osc.stop(this.ctx.currentTime + i * 0.05 + 0.5);
        });
    }
    
    playDeath(gender) {
        if (!this.enabled || !this.ctx) return;
        
        if (gender === 'female' || gender === 'male') {
            const bufferKey = gender === 'female' ? 'femaleVoice' : 'maleVoice';
            const buffer = this.audioBuffers[bufferKey];
            
            if (buffer) {
                const source = this.ctx.createBufferSource();
                source.buffer = buffer;
                
                const gain = this.ctx.createGain();
                gain.gain.value = 1.0;
                
                source.connect(gain);
                gain.connect(this.ctx.destination);
                
                // Start with a slight offset (0.15s) to skip any potential silence at the very beginning of the m4a file
                source.start(0, 0.15);
            } else {
                // Fallback if not loaded yet
                const audio = new Audio(gender === 'female' ? 'assets/FemaleVoice.m4a' : 'assets/MaleVoice.m4a');
                audio.play().catch(e => console.warn('Fallback play failed:', e));
            }

        } else if (gender === 'robot') {
            // Dramatic Robot Power-Down & Short Circuit
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 1.2);
            
            // Ring modulation effect for robotic texture
            const ring = this.ctx.createOscillator();
            ring.type = 'sawtooth';
            ring.frequency.setValueAtTime(50, this.ctx.currentTime);
            ring.frequency.linearRampToValueAtTime(500, this.ctx.currentTime + 1.2);
            
            const ringGain = this.ctx.createGain();
            ringGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
            ringGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2);
            
            ring.connect(ringGain.gain);
            ring.start(); ring.stop(this.ctx.currentTime + 1.2);
            
            gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.2);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 1.2);
        }
    }
    
    playExplosion() {
        if (!this.enabled || !this.ctx) return;
        
        const bufferSize = this.ctx.sampleRate * 1.5; // 1.5 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // White noise
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        // Lowpass filter to make it sound like a deep heavy explosion, not static hiss
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 1.5);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start();
    }
}
