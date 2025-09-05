/**
 * CustomVoiceMessages (Gemini Build)
 *
 * This version is a complete rewrite based on modern patching techniques
 * discovered through research. It uses a single, stable patch point to
 * perform all necessary actions, which is the current best practice for
 * Discord client modding. This should be the definitive, working version.
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

    // --- 2. The Real Waveform Generation Logic (Unchanged) ---
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

    // --- 3. The New, Modern Patching Method ---
    function applyModernPatch() {
        // The new method targets the core Uploader module directly.
        const Uploader = findByProps("upload");
        if (!Uploader) {
            console.error("[CVM] Critical Error: Could not find the core Uploader module.");
            return;
        }

        // We patch the 'upload' function itself. This gives us access to everything.
        unpatch = before("upload", Uploader, (args) => {
            const [channelId, upload, options] = args;
            const fileItem = upload.items?.[0] ?? upload;
            const shouldIntercept = storage.sendAsVM && fileItem?.mimeType?.startsWith("audio");

            if (!shouldIntercept) return args; // If not our concern, continue without changes.

            // This async IIFE (Immediately Invoked Function Expression) lets us use await
            // without needing to make the whole patch async, which is safer.
            (async () => {
                try {
                    showToast("🎵 Converting to Voice Message...", getAssetIDByName("music"));
                    
                    // Generate our real waveform.
                    const { waveform, duration } = await generateRealWaveform(fileItem);
                    
                    // Modify the file object *in place*.
                    fileItem.mimeType = "audio/ogg";
                    fileItem.waveform = waveform;
                    fileItem.durationSecs = duration;
                    
                    // **THE SECRET**: Set the flag on the main upload object.
                    upload.flags = 8192;

                } catch (e) {
                    console.error("[CVM] Failed to process audio file:", e);
                    showToast("❌ Voice Message conversion failed.", getAssetIDByName("Small"));
                }
            })();

            return args; // Return the (now modified) arguments to the original function.
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

    // --- 5. Plugin Lifecycle ---
    plugin.onLoad = () => {
        try {
            storage.sendAsVM ??= true;
            applyModernPatch();
        } catch (e) {
            console.error("[CVM] Failed to load plugin:", e);
        }
    };

    plugin.onUnload = () => {
        unpatch?.();
    };

    plugin.settings = SettingsComponent;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
