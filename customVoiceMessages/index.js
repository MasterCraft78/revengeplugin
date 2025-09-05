/**
 * CustomVoiceMessages - A Vendetta Plugin
 *
 * This version has been completely rebuilt from the official source code
 * to ensure maximum compatibility and stability. It includes extensive
 * error-checking to prevent crashes on load.
 *
 * Original Authors: Dziurwa, シグマ siguma
 * Rebuilt By: Gemini
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    const {
        React,
        ReactNative,
        stylesheet,
        clipboard,
        FluxDispatcher
    } = common;
    const {
        findByProps
    } = metro;
    const {
        before,
        after
    } = patcher;
    const {
        findInReactTree
    } = utils;
    const {
        semanticColors
    } = ui;
    const {
        Forms
    } = components;
    const {
        getAssetIDByName
    } = assets;

    const allPatches = [];

    // --- 1. UI Components (from CoolRow.tsx) ---
    function CoolRow({
        label,
        icon,
        onPress
    }) {
        const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
        const styles = stylesheet.createThemedStyleSheet({
            iconComponent: {
                width: 24,
                height: 24,
                tintColor: semanticColors.INTERACTIVE_NORMAL,
            },
        });

        return ActionSheetRow ? (
            React.createElement(ActionSheetRow, {
                label: label,
                icon: React.createElement(ActionSheetRow.Icon, {
                    source: icon,
                    IconComponent: () => React.createElement(ReactNative.Image, {
                        resizeMode: "cover",
                        style: styles.iconComponent,
                        source: icon,
                    }),
                }),
                onPress: () => onPress?.(),
            })
        ) : (
            React.createElement(Forms.FormRow, {
                label: label,
                leading: React.createElement(Forms.FormRow.Icon, {
                    source: icon
                }),
                onPress: () => onPress?.(),
            })
        );
    }

    // --- 2. Patches ---

    // From voiceMessages.ts
    function patchUploader() {
        async function generateWaveform(file) {
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
                const blockSize = Math.floor(rawData.length / 100);
                const peaks = new Uint8Array(100);
                let maxPeak = 0;

                for (let i = 0; i < 100; i++) {
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++) {
                        sum += Math.abs(rawData[i * blockSize + j]);
                    }
                    const avg = sum / blockSize;
                    peaks[i] = avg;
                    if (avg > maxPeak) maxPeak = avg;
                }

                if (maxPeak > 0) {
                    for (let i = 0; i < 100; i++) {
                        peaks[i] = Math.floor((peaks[i] / maxPeak) * 63);
                    }
                }

                const waveformBase64 = btoa(String.fromCharCode.apply(null, peaks));
                return {
                    waveform: waveformBase64,
                    duration: decoded.duration
                };
            } catch (e) {
                console.error("[CustomVoiceMessages] Waveform generation failed:", e);
                return {
                    waveform: "AEtWPyUaGA4OEAcA",
                    duration: 60.0
                };
            }
        }

        const patchMethod = (method) => {
            const uploadModule = findByProps(method);
            if (!uploadModule) {
                console.error(`[CustomVoiceMessages] Could not find ${method} module to patch.`);
                return;
            }
            allPatches.push(before(method, uploadModule, async (args) => {
                const upload = args[0];
                if (!storage.sendAsVM || upload.flags === 8192) return;

                const item = upload.items?.[0] ?? upload;
                if (item?.file && item?.mimeType?.startsWith("audio")) {
                    const result = await generateWaveform(item.file);
                    item.mimeType = "audio/ogg";
                    item.waveform = result.waveform;
                    item.durationSecs = result.duration;
                    upload.flags = 8192;
                }
            }));
        };

        patchMethod("uploadLocalFiles");
        patchMethod("CloudUpload");
    }

    // From messagePatches.ts
    function patchMessageStore() {
        const patchAction = (actionName, handler) => {
            try {
                const actionHandler = FluxDispatcher._actionHandlers._computeOrderedActionHandlers(actionName).find(i => i.name === "MessageStore");
                if (!actionHandler) {
                    console.error(`[CustomVoiceMessages] Could not find MessageStore handler for ${actionName}.`);
                    return;
                }
                allPatches.push(before("actionHandler", actionHandler, handler));
            } catch (e) {
                console.error(`[CustomVoiceMessages] Failed to patch ${actionName}:`, e);
            }
        };

        patchAction("LOAD_MESSAGES_SUCCESS", (args) => {
            if (!storage.allAsVM) return;
            args[0].messages.forEach(msg => {
                if (msg.flags === 8192) return;
                msg.attachments.forEach(att => {
                    if (att.content_type?.startsWith?.("audio")) {
                        msg.flags |= 8192;
                        att.waveform = "AEtWPyUaGA4OEAcA";
                        att.duration_secs = 60;
                    }
                });
            });
        });

        patchAction("MESSAGE_CREATE", (args) => {
            if (!storage.allAsVM) return;
            const message = args[0].message;
            if (message.flags === 8192) return;
            if (message?.attachments?.[0]?.content_type?.startsWith("audio")) {
                message.flags |= 8192;
                message.attachments.forEach(x => {
                    x.waveform = "AEtWPyUaGA4OEAcA";
                    x.duration_secs = 60
                });
            }
        });

        patchAction("MESSAGE_UPDATE", (args) => {
            if (!storage.allAsVM) return;
            const message = args[0].message;
            if (message.flags === 8192) return;
            if (message?.attachments?.[0]?.content_type?.startsWith("audio")) {
                message.flags |= 8192;
                message.attachments.forEach(x => {
                    x.waveform = "AEtWPyUaGA4OEAcA";
                    x.duration_secs = 60
                });
            }
        });
    }

    // From download.tsx
    function patchActionSheet() {
        const ActionSheet = findByProps("openLazy", "hideActionSheet");
        if (!ActionSheet) {
            console.error("[CustomVoiceMessages] Could not find ActionSheet module.");
            return;
        }

        allPatches.push(before("openLazy", ActionSheet, (ctx) => {
            const [component, args, actionMessage] = ctx;
            const message = actionMessage?.message;
            if (args !== "MessageLongPressActionSheet" || !message) return;

            component.then(instance => {
                const unpatch = after("default", instance, (_, res) => {
                    React.useEffect(() => () => unpatch(), []);
                    const buttons = findInReactTree(res, (x) => x?.[0]?.type?.name === "ButtonRow");
                    if (!buttons || !message.hasFlag(8192)) return;

                    const downloadUtil = findByProps("downloadMediaAsset");
                    
                    buttons.splice(5, 0,
                        React.createElement(CoolRow, {
                            label: "Download Voice Message",
                            icon: getAssetIDByName("ic_download_24px"),
                            onPress: () => {
                                downloadUtil.downloadMediaAsset(message.attachments[0].url, 0);
                                ActionSheet.hideActionSheet();
                            }
                        })
                    );
                    buttons.splice(6, 0,
                        React.createElement(CoolRow, {
                            label: "Copy Voice Message URL",
                            icon: getAssetIDByName("copy"),
                            onPress: () => {
                                clipboard.setString(message.attachments[0].url);
                                ActionSheet.hideActionSheet();
                            }
                        })
                    );
                });
            });
        }));
    }

    // --- 3. Settings UI (from settings.tsx) ---
    function SettingsComponent() {
        storage.useProxy(storage);
        const {
            FormDivider,
            FormIcon,
            FormSwitchRow
        } = Forms;

        return (
            React.createElement(ReactNative.ScrollView, null,
                React.createElement(FormSwitchRow, {
                    label: "Send audio files as Voice Message",
                    leading: React.createElement(FormIcon, {
                        source: getAssetIDByName("voice_bar_mute_off")
                    }),
                    onValueChange: (v) => (storage.sendAsVM = v),
                    value: storage.sendAsVM
                }),
                React.createElement(FormDivider, null),
                React.createElement(FormSwitchRow, {
                    label: "Show every audio file as a Voice Message",
                    leading: React.createElement(FormIcon, {
                        source: getAssetIDByName("ic_stage_music")
                    }),
                    onValueChange: (v) => (storage.allAsVM = v),
                    value: storage.allAsVM
                })
            )
        );
    }

    // --- 4. Plugin Lifecycle ---
    try {
        storage.sendAsVM ??= true;
        storage.allAsVM ??= false;

        patchUploader();
        patchMessageStore();
        patchActionSheet();

        plugin.onUnload = () => allPatches.forEach(p => p?.());
        plugin.settings = SettingsComponent;

    } catch (e) {
        console.error("[CustomVoiceMessages] FATAL: Plugin failed to initialize.", e);
    }

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage); patchUploader();
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
