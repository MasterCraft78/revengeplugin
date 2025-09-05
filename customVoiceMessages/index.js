/**
 * CustomVoiceMessages (Hybrid Build)
 *
 * This version is a hybrid, combining the stable patching method from the working
 * 'catbox.moe' plugin with the real waveform generation logic. This should
 * finally fix the startup crash and allow the plugin to be enabled.
 *
 * Original Authors: Dziurwa, シグマ siguma
 * Rebuilt By: Gemini
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    // --- 1. Import necessary modules, similar to catbox.moe ---
    const { React, ReactNative } = common;
    const { findByProps } = metro;
    const { before } = patcher;
    const { Forms } = components;
    const { getAssetIDByName } = assets;
    const { showToast } = ui.toasts;

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
            // Fallback to a default waveform if something goes wrong
            return { waveform: "AEtWPyUaGA4OEAcA", duration: 60.0 };
        }
    }

    // --- 3. The Stable Patching Method (Learned from catbox.moe) ---
    function applyPatch() {
        // Find the fundamental 'CloudUpload' module, which we know exists.
        const CloudUploadModule = findByProps("CloudUpload")?.CloudUpload;
        if (!CloudUploadModule) {
            console.error("[CVM] Could not find CloudUpload module. Cannot apply patch.");
            showToast("CVM Error: Could not find Upload module.", getAssetIDByName("Small"));
            return;
        }

        // Save the original function we are about to modify.
        const originalFunction = CloudUploadModule.prototype.reactNativeCompressAndExtractData;

        // Overwrite the original function with our new, modified version.
        CloudUploadModule.prototype.reactNativeCompressAndExtractData = async function(...args) {
            // 'this' refers to the upload instance
            const uploadInstance = this;
            const fileType = uploadInstance?.mimeType ?? "";
            const shouldIntercept = storage.sendAsVM && fileType.startsWith("audio");

            // If it's not an audio file we care about, just run the original Discord code.
            if (!shouldIntercept) {
                return originalFunction.apply(this, args);
            }
            
            showToast("🎵 Converting to Voice Message...", getAssetIDByName("music"));

            try {
                // Generate our real waveform and duration from the audio file.
                const { waveform, duration } = await generateRealWaveform(uploadInstance);

                // Modify the upload instance to trick Discord into thinking it's a voice message.
                uploadInstance.mimeType = "audio/ogg";
                uploadInstance.waveform = waveform;
                uploadInstance.durationSecs = duration;
                
                // This is a crucial step from the original CVM source.
                // We set flags to 8192 to mark it as a voice message.
                // This is done on the parent upload object, not just our instance.
                const uploader = findByProps("uploadLocalFiles")
                if(uploader?.upload) uploader.upload.flags = 8192;


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
    
    // --- 5. Plugin Lifecycle ---
    let unpatch;
    
    plugin.onLoad = () => {
        try {
            storage.sendAsVM ??= true;
            unpatch = applyPatch();
        } catch (e) {
            console.error("[CVM] Failed to load plugin:", e);
        }
    };
    
    plugin.onUnload = () => {
        unpatch?.();
    };
    
    plugin.settings = SettingsComponent;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
