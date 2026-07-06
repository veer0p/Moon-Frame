import { useCallback, useRef, useState } from 'react';

/**
 * Google Meet-style noise suppression using Web Audio API.
 * 
 * Pipeline: Mic → AnalyserNode (noise gate) → BiquadFilter (high-pass) 
 *         → DynamicsCompressor → BiquadFilter (low-pass) → GainNode → Output
 * 
 * This removes:
 * - Background hum/buzz (high-pass cuts below 80Hz)
 * - High-frequency hiss (low-pass cuts above 14kHz)  
 * - Keyboard clicks & sudden impulse noise (compressor tames transients)
 * - Ambient room noise when not speaking (noise gate)
 */

const NOISE_GATE_THRESHOLD = -50; // dB — below this, audio is gated (silence)
const NOISE_GATE_ATTACK = 0.01;   // seconds — how fast gate opens
const NOISE_GATE_RELEASE = 0.15;  // seconds — how fast gate closes (smooth tail)
const HIGH_PASS_FREQ = 80;        // Hz — removes low-frequency rumble
const LOW_PASS_FREQ = 14000;      // Hz — removes high-frequency hiss
const COMPRESSOR_THRESHOLD = -24; // dB
const COMPRESSOR_KNEE = 30;
const COMPRESSOR_RATIO = 12;
const COMPRESSOR_ATTACK = 0.003;
const COMPRESSOR_RELEASE = 0.25;

export function useNoiseSuppression() {
    const [isEnabled, setIsEnabled] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const audioContextRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const gainNodeRef = useRef(null);
    const analyserRef = useRef(null);
    const noiseGateIntervalRef = useRef(null);
    const processedStreamRef = useRef(null);
    const originalStreamRef = useRef(null);

    /**
     * Process a MediaStream through the noise suppression pipeline.
     * Returns a new processed MediaStream.
     */
    const processStream = useCallback(async (inputStream) => {
        // Clean up any previous processing
        cleanup();

        originalStreamRef.current = inputStream;

        // First, apply browser-level noise suppression constraints
        const audioTrack = inputStream.getAudioTracks()[0];
        if (audioTrack) {
            try {
                await audioTrack.applyConstraints({
                    noiseSuppression: true,
                    echoCancellation: true,
                    autoGainControl: true,
                });
            } catch (e) {
                console.warn('useNoiseSuppression: Browser constraints not fully supported:', e);
            }
        }

        try {
            const ctx = new AudioContext({ sampleRate: 48000 });
            audioContextRef.current = ctx;

            // Source from the input stream
            const source = ctx.createMediaStreamSource(inputStream);
            sourceNodeRef.current = source;

            // 1. High-pass filter — removes low-frequency rumble (fans, AC, traffic)
            const highPass = ctx.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.value = HIGH_PASS_FREQ;
            highPass.Q.value = 0.7;

            // 2. Dynamics compressor — tames sudden loud noises (keyboard clicks, bumps)
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = COMPRESSOR_THRESHOLD;
            compressor.knee.value = COMPRESSOR_KNEE;
            compressor.ratio.value = COMPRESSOR_RATIO;
            compressor.attack.value = COMPRESSOR_ATTACK;
            compressor.release.value = COMPRESSOR_RELEASE;

            // 3. Low-pass filter — removes high-frequency hiss/static
            const lowPass = ctx.createBiquadFilter();
            lowPass.type = 'lowpass';
            lowPass.frequency.value = LOW_PASS_FREQ;
            lowPass.Q.value = 0.7;

            // 4. Analyser + Gain node = software noise gate
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            const gainNode = ctx.createGain();
            gainNode.gain.value = 1.0;
            gainNodeRef.current = gainNode;

            // Connect the pipeline
            source.connect(highPass);
            highPass.connect(compressor);
            compressor.connect(lowPass);
            lowPass.connect(analyser);
            analyser.connect(gainNode);

            // Create output destination
            const destination = ctx.createMediaStreamDestination();
            gainNode.connect(destination);

            // Noise gate loop — checks volume level and gates silence
            const dataArray = new Float32Array(analyser.fftSize);
            let currentGain = 1.0;
            let targetGain = 1.0;

            noiseGateIntervalRef.current = setInterval(() => {
                if (!isEnabled) {
                    // When disabled, pass audio through at full volume
                    if (gainNode.gain.value !== 1.0) {
                        gainNode.gain.setTargetAtTime(1.0, ctx.currentTime, 0.01);
                    }
                    return;
                }

                analyser.getFloatTimeDomainData(dataArray);

                // Calculate RMS volume
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sum / dataArray.length);
                const db = 20 * Math.log10(Math.max(rms, 1e-10));

                // Noise gate logic with hysteresis
                if (db > NOISE_GATE_THRESHOLD) {
                    targetGain = 1.0; // Open gate
                } else if (db < NOISE_GATE_THRESHOLD - 6) {
                    targetGain = 0.0; // Close gate (with 6dB hysteresis)
                }

                // Smooth transitions
                if (targetGain !== currentGain) {
                    const timeConstant = targetGain > currentGain 
                        ? NOISE_GATE_ATTACK 
                        : NOISE_GATE_RELEASE;
                    gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, timeConstant);
                    currentGain = targetGain;
                }
            }, 20); // ~50Hz check rate

            // Merge the processed audio with any video tracks from original
            const processedTracks = [
                ...destination.stream.getAudioTracks(),
                ...inputStream.getVideoTracks()
            ];
            const processedStream = new MediaStream(processedTracks);
            processedStreamRef.current = processedStream;

            setIsProcessing(true);
            console.log('useNoiseSuppression: Pipeline active');

            return processedStream;

        } catch (err) {
            console.error('useNoiseSuppression: Failed to create pipeline:', err);
            return inputStream; // Fallback to original
        }
    }, [isEnabled]);

    /**
     * Clean up all audio processing nodes
     */
    const cleanup = useCallback(() => {
        if (noiseGateIntervalRef.current) {
            clearInterval(noiseGateIntervalRef.current);
            noiseGateIntervalRef.current = null;
        }
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.disconnect(); } catch (e) {}
            sourceNodeRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close(); } catch (e) {}
            audioContextRef.current = null;
        }
        processedStreamRef.current = null;
        setIsProcessing(false);
    }, []);

    /**
     * Toggle noise suppression on/off
     */
    const toggle = useCallback(() => {
        setIsEnabled(prev => !prev);
    }, []);

    return {
        isEnabled,
        setIsEnabled,
        isProcessing,
        processStream,
        cleanup,
        toggle
    };
}
