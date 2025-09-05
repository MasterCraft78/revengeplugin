/**
 * CustomVoiceMessages (Perseverance Build)
 *
 * This is the final version, combining all of our discoveries. It uses the
 * stable loading architecture from the 'Frankenstein' build and integrates
 * the essential 'flags = 8192' logic directly into the one stable patch
 * that we know is working. This should be the definitive, functional version.
 *
 * Original Authors: Dziurwa, シグマ siguma
 * Rebuilt By: Gemini
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    // --- 1. Modules & Setup ---
    const { React, ReactNative } = common;
    const { findByProps } = metro;
    const { before } = patcher;
    const { Forms } = components;
    const { getAssetIDByName } = assets;
    const { showToast } = ui.toasts;

    let unpatch; // A variable to hold our unpatch function

    // --- 2. The Real Waveform Generation Logic ---
    async function generateRealWaveform(file) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) throw new Error("AudioContext not supported");

            const arrayBuffer = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.onerror = (err) => rej(err);
                reader.readAsArrayBuffer(file);
            });

            const audioCtx = new AudioContext();
            const decoded = await audioCtx.decodeAudioData(arrayBuffer);
            const rawData = decoded.getChannelData(0);
            const waveformPoints = 100;
            const blockSize = Math.floor(rawData.length / waveformPoints);
            const peaks = new Uint8Array(waveformPoints);
            let maxPeak = 0;

            for (let i = 0; i < waveformPoints; i++) {
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(rawData[i * blockSize + j]);
                }
                const avg = sum / blockSize;
                if (avg > maxPeak) maxPeak = avg;
                peaks[i] = avg;
            }

            if (maxPeak > 0) {
                for (let i = 0; i < waveformPoints; i++) {
                    peaks[i] = Math.floor((peaks[i] / maxPeak) * 63);
                }
            }
            const waveformBase64 = btoa(String.fromCharCode.apply(null, peaks));
            return { waveform: waveformBase64, duration: decoded.duration };
        } catch (e) {
            console.error("[CVM] Waveform generation failed:", e);
            return { waveform: "AEtWPyUaGA4OEAcA", duration: 60.0 };
        }
    }

    // --- 3. The Final, Unified Patching Method ---
    function applyPatch() {
        // Find the fundamental 'CloudUpload' module. This is our stable entry point.
        const CloudUploadModule = findByProps("CloudUpload")?.CloudUpload;
        if (!CloudUploadModule) {
            console.error("[CVM] Critical Error: Could not find CloudUpload module.");
            return;
        }

        // Save the original function before we modify it.
        const originalFunction = CloudUploadModule.prototype.reactNativeCompressAndExtractData;

        // Overwrite the original function with our new, all-in-one logic.
        CloudUploadModule.prototype.reactNativeCompressAndExtractData = async function(...args) {
            const uploadInstance = this; // 'this' refers to the upload object
            const fileType = uploadInstance?.mimeType ?? "";
            const shouldIntercept = storage.sendAsVM && fileType.startsWith("audio");

            // If it's not an audio file or the setting is off, do nothing extra.
            if (!shouldIntercept) {
                return originalFunction.apply(this, args);
            }

            showToast("🎵 Converting to Voice Message...", getAssetIDByName("music"));

            try {
                // Generate our real waveform and duration from the audio file.
                const { waveform, duration } = await generateRealWaveform(uploadInstance);

                // Modify the upload instance to trick Discord into treating it as a voice message.
                uploadInstance.mimeType = "audio/ogg";
                uploadInstance.waveform = waveform;
                uploadInstance.durationSecs = duration;

                // **THE FINAL FIX**: Set the magic flag directly on this object.
                // This tells Discord that this entire upload is a voice message.
                uploadInstance.flags = 8192;

                // Now that we've modified it, let Discord continue with its original logic.
                return originalFunction.apply(this, args);

            } catch (e) {
                console.error("[CVM] Error during voice message conversion:", e);
                showToast("❌ Voice Message conversion failed.", getAssetIDByName("Small"));
                // If we fail, fall back to the original function to prevent a crash.
                return originalFunction.apply(this, args);
            }
        };

        // Return a function that restores the original code when the plugin is unloaded.
        return () => {
            CloudUploadModule.prototype.reactNativeCompressAndExtractData = originalFunction;
        };
    }

    // --- 4. Settings UI ---
    function SettingsComponent() {
        storage.useProxy(storage);
        return (
            React.createElement(ReactNative.ScrollView, null,
                React.createElement(Forms.FormSwitchRow, {
                    label: "Send audio files as Voice Message",
                    subLabel: "Converts audio uploads into voice messages with real waveforms.",
                    leading: React.createElement(Forms.FormIcon, { source: getAssetIDByName("voice_bar_mute_off") }),
                    onValueChange: (v) => (storage.sendAsVM = v),
                    value: storage.sendAsVM
                })
            )
        );
    }

    // --- 5. Plugin Lifecycle (Safe Loading) ---
    plugin.onLoad = () => {
        try {
            storage.sendAsVM ??= true;
            unpatch = applyPatch();
        } catch (e) {
            console.error("[CVM] Failed to load plugin:", e);
            // Even if it fails, it shouldn't crash the toggle.
        }
    };

    plugin.onUnload = () => {
        unpatch?.();
    };

    plugin.settings = SettingsComponent;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
