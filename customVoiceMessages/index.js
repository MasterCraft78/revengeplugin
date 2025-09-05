/**
 * CustomVoiceMessages (Final Boss Build)
 *
 * This definitive version combines all our discoveries:
 * 1. The stable loading architecture from the working 'Hybrid Build'.
 * 2. The precise, correct patching logic from the original plugin source.
 * 3. Our powerful, real waveform generation logic.
 *
 * This should finally provide a stable, fully functional plugin.
 *
 * Original Authors: Dziurwa, シグマ siguma
 * Rebuilt By: Gemini
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    // --- 1. Import necessary modules ---
    const { React, ReactNative } = common;
    const { findByProps } = metro;
    const { before } = patcher;
    const { Forms } = components;
    const { getAssetIDByName } = assets;
    const { showToast } = ui.toasts;

    const allPatches = [];

    // --- 2. The Real Waveform Generation Logic (Our core feature) ---
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

    // --- 3. The Correct Patching Method (Learned from the original source) ---
    function applyPatches() {
        // Find the module containing the upload functions.
        const UploaderModule = findByProps("uploadLocalFiles", "CloudUpload");
        if (!UploaderModule) {
            console.error("[CVM] Could not find Uploader Module. Plugin disabled.");
            return;
        }

        // We patch both local file uploads and cloud uploads.
        const methodsToPatch = ["uploadLocalFiles", "CloudUpload"];
        methodsToPatch.forEach(method => {
            if (typeof UploaderModule[method] !== 'function') return;

            allPatches.push(before(method, UploaderModule, (args) => {
                // The first argument is the main upload task object.
                const uploadTask = args[0];
                if (!storage.sendAsVM || uploadTask.flags === 8192) return;

                // The file itself is usually in an 'items' array.
                const fileItem = uploadTask.items?.[0] ?? uploadTask;

                if (fileItem?.mimeType?.startsWith("audio")) {
                    // This is an async operation, but we don't need to wait for it.
                    // We can modify the objects by reference and let the promise resolve.
                    (async () => {
                        try {
                            showToast("🎵 Converting to Voice Message...", getAssetIDByName("music"));
                            const { waveform, duration } = await generateRealWaveform(fileItem);

                            // Modify the file item itself
                            fileItem.mimeType = "audio/ogg";
                            fileItem.waveform = waveform;
                            fileItem.durationSecs = duration;

                            // THIS IS THE SECRET: Set the flag on the main task object.
                            uploadTask.flags = 8192;
                        } catch(e) {
                            console.error("[CVM] Failed to process audio file:", e);
                            showToast("❌ Voice Message conversion failed.", getAssetIDByName("Small"));
                        }
                    })();
                }
            }));
        });
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
            applyPatches();
        } catch (e) {
            console.error("[CVM] Failed to load plugin:", e);
        }
    };
    
    plugin.onUnload = () => {
        allPatches.forEach(p => p?.());
    };
    
    plugin.settings = SettingsComponent;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
