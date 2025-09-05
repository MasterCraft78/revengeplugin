/**
 * CustomVoiceMessages - A Vendetta Plugin
 *
 * Original Author: Unknown
 * Fixed By: Gemini (Robust Version)
 *
 * This plugin allows sending audio files as if they were native voice messages
 * and optionally displays all audio files as voice messages.
 *
 * ROBUST VERSION:
 * - Added extensive error checking to prevent the plugin from crashing on load.
 * - Checks for the existence of modules and functions before patching.
 * - Wraps audio processing in a try/catch block to handle decoding errors gracefully.
 * - Simplified waveform generation for broader compatibility.
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    // --- Core Audio Processing ---
    const getAudioMetadata = (file) => {
        // Check for Web Audio API support
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.error("[CustomVoiceMessages] Web Audio API not supported in this environment.");
            return Promise.reject("AudioContext not supported.");
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const arrayBuffer = event.target.result;
                if (!arrayBuffer) return reject("Failed to read file.");

                try {
                    const audioContext = new AudioContext();
                    const buffer = await audioContext.decodeAudioData(arrayBuffer);

                    const duration = buffer.duration;
                    const channelData = buffer.getChannelData(0);
                    const waveformPoints = 100;
                    const samples = new Uint8Array(waveformPoints);
                    const blockSize = Math.floor(channelData.length / waveformPoints);
                    let maxAmp = 0;

                    // Simplified amplitude calculation
                    const amps = [];
                    for (let i = 0; i < waveformPoints; i++) {
                        const start = i * blockSize;
                        let sum = 0;
                        for (let j = 0; j < blockSize; j++) {
                            sum += Math.abs(channelData[start + j]);
                        }
                        const amp = sum / blockSize;
                        amps.push(amp);
                        if (amp > maxAmp) maxAmp = amp;
                    }

                    // Normalize to 6-bit (0-63)
                    if (maxAmp > 0) {
                        for (let i = 0; i < waveformPoints; i++) {
                            samples[i] = Math.floor((amps[i] / maxAmp) * 63);
                        }
                    }

                    const waveform = btoa(String.fromCharCode.apply(null, samples));
                    resolve({
                        duration: Math.round(duration),
                        waveform
                    });
                } catch (err) {
                    console.error("[CustomVoiceMessages] Error decoding audio data:", err);
                    reject(err);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    };

    // --- Patching Logic ---
    const patches = [];

    // Patches the file upload process
    function patchUploader() {
        const uploadModule = metro.findByProps("uploadLocalFiles", "CloudUpload");
        if (!uploadModule) {
            console.error("[CustomVoiceMessages] Could not find upload module.");
            return;
        }

        const patchInstead = (funcName) => {
            try {
                patches.push(patcher.instead(funcName, uploadModule, async (args, originalFunc) => {
                    const uploadData = args[0];
                    if (!self.storage.sendAsVM || uploadData.flags === 8192) {
                        return originalFunc.apply(this, args);
                    }

                    const item = uploadData.items?.[0] ?? uploadData;
                    if (item?.file && item?.mimeType?.startsWith("audio")) {
                        try {
                            const {
                                duration,
                                waveform
                            } = await getAudioMetadata(item.file);
                            item.durationSecs = duration;
                            item.waveform = waveform;
                            item.mimeType = "audio/ogg";
                            uploadData.flags = 8192;
                        } catch (err) {
                            console.error("[CustomVoiceMessages] Failed to process audio, sending as regular file.", err);
                        }
                    }
                    return originalFunc.apply(this, args);
                }));
            } catch (e) {
                console.error(`[CustomVoiceMessages] Failed to patch ${funcName}:`, e);
            }
        };

        patchInstead("uploadLocalFiles");
        patchInstead("CloudUpload");
    }

    // Patches message store actions to show existing audio as VMs
    function patchMessageStore(action, name) {
        try {
            const handler = common.FluxDispatcher._actionHandlers._computeOrderedActionHandlers(action).find(e => e.name === name);
            if (!handler) return;

            patches.push(patcher.before("actionHandler", handler, (args) => {
                if (!self.storage.allAsVM) return;
                const message = (args[0].messages || [args[0].message])[0];
                if (!message || message.flags === 8192) return;

                const messages = args[0].messages || [args[0].message];
                messages.forEach(msg => {
                    if (msg?.attachments?.[0]?.content_type?.startsWith("audio")) {
                        msg.flags |= 8192;
                        msg.attachments.forEach(att => {
                            att.waveform = "AEtWPyUaGA4OEAcA"; // Static waveform for performance
                            att.duration_secs = 60;
                        });
                    }
                });
            }));
        } catch (e) {
            console.error(`[CustomVoiceMessages] Failed to patch ${action}:`, e);
        }
    }

    // Patches the long-press action sheet for messages
    function patchActionSheet() {
        const ActionSheet = metro.findByProps("openLazy", "hideActionSheet");
        if (!ActionSheet) return;

        patches.push(patcher.before("openLazy", ActionSheet, (args) => {
            const [component, sheetName, props] = args;
            if (sheetName !== "MessageLongPressActionSheet" || !props?.message) return;

            component.then(instance => {
                const unpatch = patcher.after("default", instance, (_, res) => {
                    common.React.useEffect(() => () => unpatch(), []);
                    const buttonRow = utils.findInReactTree(res, r => r?.[0]?.type?.name === "ButtonRow");
                    const message = props.message;
                    if (!buttonRow || !message.hasFlag(8192)) return;

                    const ActionButton = metro.findByDisplayName("ActionSheetRow") ?? components.Forms.FormRow;
                    const Icon = ActionButton.Icon ?? components.Forms.FormRow.Icon;

                    const downloadButton = common.React.createElement(ActionButton, {
                        label: "Download Voice Message",
                        icon: common.React.createElement(Icon, {
                            source: assets.getAssetIDByName("ic_download_24px")
                        }),
                        onPress: () => {
                            metro.findByProps("downloadMediaAsset").downloadMediaAsset(message.attachments[0].url, 0);
                            ActionSheet.hideActionSheet();
                        }
                    });

                    const copyUrlButton = common.React.createElement(ActionButton, {
                        label: "Copy Voice Message URL",
                        icon: common.React.createElement(Icon, {
                            source: assets.getAssetIDByName("copy")
                        }),
                        onPress: () => {
                            common.clipboard.setString(message.attachments[0].url);
                            ActionSheet.hideActionSheet();
                        }
                    });

                    buttonRow.splice(5, 0, downloadButton, copyUrlButton);
                });
            });
        }));
    }

    // --- Settings Component ---
    const {
        FormDivider,
        FormIcon,
        FormSwitchRow
    } = components.Forms;

    function Settings() {
        storage.useProxy(self.storage);
        return common.React.createElement(common.ReactNative.View, null,
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
                subLabel: "This uses a placeholder waveform for performance.",
                leading: common.React.createElement(FormIcon, {
                    source: assets.getAssetIDByName("ic_stage_music")
                }),
                onValueChange: v => self.storage.allAsVM = v,
                value: self.storage.allAsVM
            })
        );
    }

    // --- Plugin Lifecycle ---
    try {
        self.storage.sendAsVM ??= true;
        self.storage.allAsVM ??= false;

        patchUploader();
        patchMessageStore("LOAD_MESSAGES_SUCCESS", "MessageStore");
        patchMessageStore("MESSAGE_CREATE", "MessageStore");
        patchMessageStore("MESSAGE_UPDATE", "MessageStore");
        patchActionSheet();

        plugin.onUnload = () => patches.forEach(p => p?.());
        plugin.settings = Settings;
    } catch (err) {
        console.error("[CustomVoiceMessages] Failed to initialize plugin:", err);
        // This catch block prevents the plugin from fully crashing and showing the [X]
    }

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);                    .then(buffer => {
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
