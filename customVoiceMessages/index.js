/**
 * CustomVoiceMessages (Frankenstein Build)
 *
 * This is the final attempt, combining all our knowledge into the most resilient
 * version possible. It uses two separate patching methods, each with its own
 * safety net to prevent the plugin from crashing on load.
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

    const allPatches = [];

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

    // --- 3. The Two-Part Patching System ---

    // Part A: Modify the file item itself. (Stable 'catbox.moe' method)
    function patchFileItem() {
        const CloudUploadModule = findByProps("CloudUpload")?.CloudUpload;
        if (!CloudUploadModule) {
            console.error("[CVM] Could not find CloudUpload module for Part A.");
            return; // Exit if not found, but don't crash
        }
        const originalFunction = CloudUploadModule.prototype.reactNativeCompressAndExtractData;
        CloudUploadModule.prototype.reactNativeCompressAndExtractData = async function(...args) {
            const uploadInstance = this;
            if (storage.sendAsVM && uploadInstance?.mimeType?.startsWith("audio")) {
                const { waveform, duration } = await generateRealWaveform(uploadInstance);
                uploadInstance.mimeType = "audio/ogg";
                uploadInstance.waveform = waveform;
                uploadInstance.durationSecs = duration;
            }
            return originalFunction.apply(this, args);
        };
        // Return the unpatch function
        return () => {
            CloudUploadModule.prototype.reactNativeCompressAndExtractData = originalFunction;
        };
    }

    // Part B: Modify the main upload task. (Original CVM method)
    function patchUploadTask() {
        const UploaderModule = findByProps("uploadLocalFiles", "CloudUpload");
        if (!UploaderModule) {
            console.error("[CVM] Could not find UploaderModule for Part B.");
            return; // Exit if not found, but don't crash
        }
        const method = "uploadLocalFiles"; // Target the most common upload method
        if (typeof UploaderModule[method] !== 'function') return;

        const unpatch = before(method, UploaderModule, (args) => {
            const uploadTask = args[0];
            const fileItem = uploadTask.items?.[0] ?? uploadTask;
            if (storage.sendAsVM && fileItem?.mimeType?.startsWith("audio")) {
                showToast("🎵 Converting to Voice Message...", getAssetIDByName("music"));
                uploadTask.flags = 8192;
            }
        });
        // Return the unpatch function
        return unpatch;
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

    // --- 5. Plugin Lifecycle (with individual safety nets) ---
    plugin.onLoad = () => {
        storage.sendAsVM ??= true;

        // Safety Net for Part A
        try {
            const unpatchA = patchFileItem();
            if (unpatchA) allPatches.push(unpatchA);
        } catch (e) {
            console.error("[CVM] FAILED to apply Patch A (File Item):", e);
        }

        // Safety Net for Part B
        try {
            const unpatchB = patchUploadTask();
            if (unpatchB) allPatches.push(unpatchB);
        } catch (e) {
            console.error("[CVM] FAILED to apply Patch B (Upload Task):", e);
        }

        if (allPatches.length === 0) {
            showToast("CVM failed to load any patches.", getAssetIDByName("Small"));
        }
    };

    plugin.onUnload = () => {
        allPatches.forEach(p => p?.());
        allPatches.length = 0; // Clear the array
    };

    plugin.settings = SettingsComponent;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
