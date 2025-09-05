/**
 * This plugin provides two main features for handling audio files:
 * 1. Sending audio files as if they were native voice messages.
 * 2. Displaying all audio files in chat as voice messages.
 * It also adds "Download" and "Copy URL" options to the long-press menu for voice messages.
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    const {
        React,
        FluxDispatcher,
        clipboard,
        ReactNative,
        stylesheet
    } = common;
    const {
        findInReactTree
    } = utils;
    const {
        Forms
    } = components;
    const {
        semanticColors
    } = ui;

    /**
     * Modifies an audio file object to appear as a voice message.
     * @param {object} audioFile - The file object to modify.
     */
    function processAudioFile(audioFile) {
        if (audioFile?.mimeType?.startsWith("audio")) {
            audioFile.mimeType = "audio/ogg";
            // A static waveform value to make it look like a voice message.
            audioFile.waveform = "AEtWPyUaGA4OEAcA";
            audioFile.durationSecs = 60; // A default duration.
        }
    }

    /**
     * Patches file upload functions to intercept audio files.
     * @returns {function} A function to remove the patches.
     */
    function patchUploads() {
        const patches = [];
        const createPatch = (funcName) => {
            try {
                const uploadModule = metro.findByProps(funcName);
                const unpatch = patcher.before(funcName, uploadModule, (args) => {
                    const uploadData = args[0];
                    if (!self.storage.sendAsVM || uploadData.flags === 8192) return;

                    const item = uploadData.items?.[0] ?? uploadData;
                    if (item?.mimeType?.startsWith("audio")) {
                        processAudioFile(item);
                        uploadData.flags = 8192; // Flag for voice message
                    }
                });
                patches.push(unpatch);
            } catch (e) {
                console.error(`Failed to patch ${funcName}:`, e);
            }
        };

        createPatch("uploadLocalFiles");
        createPatch("CloudUpload");

        // Return a function that can be called to undo all patches.
        return () => patches.forEach(p => p());
    }

    /**
     * Patches the action handler for when a batch of messages is loaded.
     * This makes existing audio files appear as voice messages.
     * @returns {function} A function to remove the patch.
     */
    function patchLoadMessages() {
        return patcher.before("actionHandler", FluxDispatcher._actionHandlers._computeOrderedActionHandlers("LOAD_MESSAGES_SUCCESS").find(h => h.name === "MessageStore"), (args) => {
            if (self.storage.allAsVM) {
                args[0].messages.forEach(message => {
                    if (message.flags !== 8192) {
                        message.attachments.forEach(attachment => {
                            if (attachment.content_type?.startsWith?.("audio")) {
                                message.flags |= 8192; // Add voice message flag
                                attachment.waveform = "AEtWPyUaGA4OEAcA";
                                attachment.duration_secs = 60;
                            }
                        });
                    }
                });
            }
        });
    }

    /**
     * Patches the action handler for when a new message is created.
     * @returns {function} A function to remove the patch.
     */
    function patchMessageCreate() {
        return patcher.before("actionHandler", FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_CREATE").find(h => h.name === "MessageStore"), (args) => {
            if (!self.storage.allAsVM || args[0].message.flags === 8192) return;

            let message = args[0].message;
            if (message?.attachments?.[0]?.content_type?.startsWith("audio")) {
                message.flags |= 8192;
                message.attachments.forEach(att => {
                    att.waveform = "AEtWPyUaGA4OEAcA";
                    att.duration_secs = 60;
                });
            }
        });
    }

    /**
     * Patches the action handler for when a message is updated.
     * @returns {function} A function to remove the patch.
     */
    function patchMessageUpdate() {
        return patcher.before("actionHandler", FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_UPDATE").find(h => h.name === "MessageStore"), (args) => {
            if (!self.storage.allAsVM || args[0].message.flags === 8192) return;

            let message = args[0].message;
            if (message?.attachments?.[0]?.content_type?.startsWith("audio")) {
                message.flags |= 8192;
                message.attachments.forEach(att => {
                    att.waveform = "AEtWPyUaGA4OEAcA";
                    att.duration_secs = 60;
                });
            }
        });
    }


    const ActionSheetRowModule = metro.findByProps("ActionSheetRow");
    const ActionSheetRow = ActionSheetRowModule?.ActionSheetRow;

    /**
     * A custom React component for an action sheet button.
     */
    function ActionSheetButton({ label, icon, onPress }) {
        const styles = stylesheet.createThemedStyleSheet({
            iconComponent: {
                width: 24,
                height: 24,
                tintColor: semanticColors.INTERACTIVE_NORMAL,
            },
        });

        // Use ActionSheetRow if available, otherwise fallback to FormRow
        if (ActionSheetRow) {
            return React.createElement(ActionSheetRow, {
                label: label,
                icon: React.createElement(ActionSheetRow.Icon, {
                    source: icon,
                    IconComponent: () => React.createElement(ReactNative.Image, {
                        resizeMode: "cover",
                        style: styles.iconComponent,
                        source: icon
                    })
                }),
                onPress: () => onPress?.()
            });
        }

        return React.createElement(Forms.FormRow, {
            label: label,
            leading: React.createElement(Forms.FormRow.Icon, { source: icon }),
            onPress: () => onPress?.()
        });
    }

    const ActionSheetModule = metro.findByProps("openLazy", "hideActionSheet");

    /**
     * Patches the long-press menu for messages to add custom options for voice messages.
     * @returns {function} A function to remove the patch.
     */
    function patchMessageLongPressActionSheet() {
        return patcher.before("openLazy", ActionSheetModule, (args) => {
            const [componentPromise, sheetName, props] = args;
            const message = props?.message;

            if (sheetName !== "MessageLongPressActionSheet" || !message) return;

            componentPromise.then(component => {
                const unpatch = patcher.after("default", component, (ctx, res) => {
                    // Unpatch automatically when the component unmounts
                    React.useEffect(() => () => unpatch(), []);

                    const buttonRow = findInReactTree(res, node => node?.[0]?.type?.name === "ButtonRow");
                    if (!buttonRow) return res;
                    
                    // Check if the message is a voice message (flag 8192)
                    if (message.hasFlag(8192)) {
                        const mediaModule = metro.findByProps("downloadMediaAsset");

                        // Add "Download Voice Message" button
                        buttonRow.splice(5, 0, React.createElement(ActionSheetButton, {
                            label: "Download Voice Message",
                            icon: assets.getAssetIDByName("ic_download_24px"),
                            onPress: async () => {
                                await mediaModule.downloadMediaAsset(message.attachments[0].url, 0);
                                ActionSheetModule.hideActionSheet();
                            }
                        }));

                        // Add "Copy Voice Message URL" button
                        buttonRow.splice(6, 0, React.createElement(ActionSheetButton, {
                            label: "Copy Voice Message URL",
                            icon: assets.getAssetIDByName("copy"),
                            onPress: async () => {
                                clipboard.setString(message.attachments[0].url);
                                ActionSheetModule.hideActionSheet();
                            }
                        }));
                    }
                });
            });
        });
    }

    /**
     * The settings component for this plugin.
     */
    function SettingsComponent() {
        storage.useProxy(self.storage);

        return React.createElement(ReactNative.ScrollView, null,
            React.createElement(Forms.FormSwitchRow, {
                label: "Send audio files as Voice Message",
                leading: React.createElement(Forms.FormIcon, { source: assets.getAssetIDByName("voice_bar_mute_off") }),
                onValueChange: (value) => self.storage.sendAsVM = value,
                value: self.storage.sendAsVM
            }),
            React.createElement(Forms.FormDivider, null),
            React.createElement(Forms.FormSwitchRow, {
                label: "Show every audio file as a Voice Message",
                leading: React.createElement(Forms.FormIcon, { source: assets.getAssetIDByName("ic_stage_music") }),
                onValueChange: (value) => self.storage.allAsVM = value,
                value: self.storage.allAsVM
            })
        );
    }

    // --- Plugin Initialization ---

    // Set default settings if they don't exist
    self.storage.sendAsVM ??= true;
    self.storage.allAsVM ??= false;

    // Apply all patches and store the unpatch functions
    const unpatchers = [
        patchUploads(),
        patchMessageCreate(),
        patchLoadMessages(),
        patchMessageUpdate(),
        patchMessageLongPressActionSheet(),
    ];

    // Define the cleanup function that will be called when the plugin is unloaded
    plugin.onUnload = () => unpatchers.forEach(unpatch => unpatch());

    // Register the settings component
    plugin.settings = SettingsComponent;

})(
    {}, // plugin exports
    vendetta.metro,
    vendetta.patcher,
    vendetta.plugin,
    vendetta.metro.common,
    vendetta.ui.assets,
    vendetta.utils,
    vendetta.ui,
    vendetta.ui.components,
    vendetta.storage
);
