/**
 * CustomVoiceMessages - A Vendetta Plugin
 *
 * Original Author: Unknown
 * Fixed By: Gemini
 *
 * This plugin allows sending audio files as if they were native voice messages
 * and optionally displays all audio files as voice messages.
 *
 * FIX:
 * - Replaced the static/fake waveform and duration with real, dynamically generated
 * values by processing the audio file before upload.
 * - Used the Web Audio API to decode the audio and generate a waveform that matches
 * the audio's amplitude.
 * - Patched the upload function asynchronously to allow for audio processing time.
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    /**
     * Asynchronously generates audio metadata (duration and waveform) from a File object.
     * @param {File} file The audio file to process.
     * @returns {Promise<{duration: number, waveform: string}>} A promise that resolves with the audio's duration in seconds and a Base64 encoded waveform.
     */
    const getAudioMetadata = (file) => {
        if (!file) return Promise.reject("No file provided for audio metadata generation.");

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                const arrayBuffer = event.target.result;
                // Use a global AudioContext for performance.
                const audioContext = new(window.AudioContext || window.webkitAudioContext)();

                audioContext.decodeAudioData(arrayBuffer)
                    .then(buffer => {
                        const duration = buffer.duration;
                        const channelData = buffer.getChannelData(0); // Use the first channel
                        const waveformPoints = 100; // Generate 100 points for the waveform visual
                        const samples = new Uint8Array(waveformPoints);
                        const blockSize = Math.floor(channelData.length / waveformPoints);

                        const rmsValues = [];
                        let maxRms = 0;

                        // Calculate RMS for each block to represent amplitude
                        for (let i = 0; i < waveformPoints; i++) {
                            const start = i * blockSize;
                            const end = start + blockSize;
                            const block = channelData.slice(start, end);

                            let sum = 0;
                            for (let j = 0; j < block.length; j++) {
                                sum += block[j] * block[j];
                            }

                            const rms = Math.sqrt(sum / block.length);
                            rmsValues.push(rms);
                            if (rms > maxRms) maxRms = rms;
                        }

                        // Normalize RMS values to 6-bit (0-63) which is what Discord expects
                        if (maxRms > 0) {
                            for (let i = 0; i < waveformPoints; i++) {
                                samples[i] = Math.floor((rmsValues[i] / maxRms) * 63);
                            }
                        } else {
                            samples.fill(0); // For silent audio
                        }

                        // Base64 encode the resulting waveform data
                        const waveform = btoa(String.fromCharCode.apply(null, samples));

                        resolve({
                            duration: Math.round(duration),
                            waveform,
                        });
                    })
                    .catch(err => {
                        console.error("[CustomVoiceMessages] Error decoding audio data:", err);
                        reject(err);
                    });
            };

            reader.onerror = (error) => {
                console.error("[CustomVoiceMessages] FileReader error:", error);
                reject(error);
            };

            reader.readAsArrayBuffer(file);
        });
    };

    /**
     * Patches the file upload functions to process audio files.
     * This uses an 'instead' patch to handle the async nature of audio processing.
     */
    function patchUploader() {
        const unpatchFns = [];
        const patch = (functionName) => {
            try {
                const uploadModule = metro.findByProps(functionName);
                const unpatch = patcher.instead(functionName, uploadModule, async (args, originalFunction) => {
                    const uploadData = args[0];
                    if (!self.storage.sendAsVM || uploadData.flags === 8192) {
                        return originalFunction.apply(this, args);
                    }

                    const item = uploadData.items?.[0] ?? uploadData;
                    const audioFile = item?.file;

                    // Check if it's an audio file we need to process
                    if (audioFile && item?.mimeType?.startsWith("audio")) {
                        try {
                            // Generate the real metadata
                            const {
                                duration,
                                waveform
                            } = await getAudioMetadata(audioFile);

                            // Apply the metadata to the upload item
                            item.durationSecs = duration;
                            item.waveform = waveform;
                            item.mimeType = "audio/ogg"; // Keep for compatibility
                            uploadData.flags = 8192; // Mark as voice message
                        } catch (err) {
                            console.error("[CustomVoiceMessages] Failed to generate audio metadata, sending as a regular file.", err);
                        }
                    }

                    // Proceed with the original upload function
                    return originalFunction.apply(this, args);
                });
                unpatchFns.push(unpatch);
            } catch (err) {
                console.error(`[CustomVoiceMessages] Failed to patch ${functionName}:`, err);
            }
        };

        patch("uploadLocalFiles");
        patch("CloudUpload");

        return () => unpatchFns.forEach(p => p());
    }

    // --- The following functions handle displaying existing messages as VMs ---
    // --- They still use a placeholder waveform for performance reasons ---

    function patchMessageLoad() {
        return patcher.before("actionHandler", common.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("LOAD_MESSAGES_SUCCESS").find(e => e.name === "MessageStore"), (args) => {
            if (!self.storage.allAsVM) return;
            args[0].messages.forEach(msg => {
                if (msg.flags === 8192) return;
                msg.attachments.forEach(att => {
                    if (att.content_type?.startsWith?.("audio")) {
                        msg.flags |= 8192;
                        att.waveform = "AEtWPyUaGA4OEAcA"; // Static waveform
                        att.duration_secs = 60; // Static duration
                    }
                });
            });
        });
    }

    function patchMessageCreate() {
        return patcher.before("actionHandler", common.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_CREATE").find(e => e.name === "MessageStore"), (args) => {
            if (!self.storage.allAsVM || args[0].message.flags === 8192) return;
            const msg = args[0].message;
            if (msg?.attachments?.[0]?.content_type?.startsWith("audio")) {
                msg.flags |= 8192;
                msg.attachments.forEach(att => {
                    att.waveform = "AEtWPyUaGA4OEAcA";
                    att.duration_secs = 60;
                });
            }
        });
    }

    function patchMessageUpdate() {
        return patcher.before("actionHandler", common.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_UPDATE").find(e => e.name === "MessageStore"), (args) => {
            if (!self.storage.allAsVM || args[0].message.flags === 8192) return;
            const msg = args[0].message;
            if (msg?.attachments?.[0]?.content_type?.startsWith("audio")) {
                msg.flags |= 8192;
                msg.attachments.forEach(att => {
                    att.waveform = "AEtWPyUaGA4OEAcA";
                    att.duration_secs = 60;
                });
            }
        });
    }

    // --- UI Components for settings and actions ---

    const {
        FormRow
    } = components.Forms;
    const ActionSheetRow = metro.findByProps("ActionSheetRow")?.ActionSheetRow;

    function ActionButton({
        label,
        icon,
        onPress
    }) {
        const styles = common.stylesheet.createThemedStyleSheet({
            iconComponent: {
                width: 24,
                height: 24,
                tintColor: ui.semanticColors.INTERACTIVE_NORMAL
            }
        });
        return ActionSheetRow ? React.createElement(ActionSheetRow, {
            label: label,
            icon: React.createElement(ActionSheetRow.Icon, {
                source: icon,
                IconComponent: () => React.createElement(common.ReactNative.Image, {
                    resizeMode: "cover",
                    style: styles.iconComponent,
                    source: icon
                })
            }),
            onPress: () => onPress?.()
        }) : React.createElement(FormRow, {
            label: label,
            leading: React.createElement(FormRow.Icon, {
                source: icon
            }),
            onPress: () => onPress?.()
        });
    }

    const ActionSheet = metro.findByProps("openLazy", "hideActionSheet");

    function patchActionSheet() {
        return patcher.before("openLazy", ActionSheet, (args) => {
            const [component, sheetName, props] = args;
            const message = props?.message;
            if (sheetName !== "MessageLongPressActionSheet" || !message) return;

            component.then(instance => {
                const unpatch = patcher.after("default", instance, (_, res) => {
                    common.React.useEffect(() => () => unpatch(), []);
                    const buttonRow = utils.findInReactTree(res, r => r?.[0]?.type?.name === "ButtonRow");
                    if (!buttonRow || !message.hasFlag(8192)) return;

                    buttonRow.splice(5, 0,
                        common.React.createElement(ActionButton, {
                            label: "Download Voice Message",
                            icon: assets.getAssetIDByName("ic_download_24px"),
                            onPress: async () => {
                                await metro.findByProps("downloadMediaAsset").downloadMediaAsset(message.attachments[0].url, 0);
                                ActionSheet.hideActionSheet();
                            }
                        })
                    );
                    buttonRow.splice(6, 0,
                        common.React.createElement(ActionButton, {
                            label: "Copy Voice Message URL",
                            icon: assets.getAssetIDByName("copy"),
                            onPress: () => {
                                common.clipboard.setString(message.attachments[0].url);
                                ActionSheet.hideActionSheet();
                            }
                        })
                    );
                });
            });
        });
    }

    const {
        FormDivider,
        FormIcon,
        FormSwitchRow
    } = components.Forms;

    function Settings() {
        storage.useProxy(self.storage);
        return common.React.createElement(common.ReactNative.ScrollView, null,
            common.React.createElement(FormSwitchRow, {
                label: "Send audio files as Voice Message",
                leading: common.React.createElement(FormIcon, {
                    source: assets.getAssetIDByName("voice_bar_mute_off")
                }),
                onValueChange: v => self.storage.sendAsVM = v,
                value: self.storage.sendAsVM
            }),
            common.React.createElement(FormDivider, null),
            common.React.createElement(FormSwitchRow, {
                label: "Show every audio file as a Voice Message",
                subLabel: "This may use a placeholder waveform for performance.",
                leading: common.React.createElement(FormIcon, {
                    source: assets.getAssetIDByName("ic_stage_music")
                }),
                onValueChange: v => self.storage.allAsVM = v,
                value: self.storage.allAsVM
            })
        );
    }

    // Initialize storage with default values
    self.storage.sendAsVM ??= true;
    self.storage.allAsVM ??= false;

    const patches = [
        patchUploader(),
        patchMessageCreate(),
        patchMessageLoad(),
        patchMessageUpdate(),
        patchActionSheet()
    ];

    plugin.onUnload = () => patches.forEach(p => p());
    plugin.settings = Settings;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
