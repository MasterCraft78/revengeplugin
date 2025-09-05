(function (plugin, metro, patcher, vendetta, common, assets, utils, ui, components, storage) {
    "use strict";

    // --- Utility function to modify audio attachments ---
    function transformAudio(item) {
        if (item?.mimeType?.startsWith("audio")) {
            item.mimeType = "audio/ogg";
            item.waveform = "AEtWPyUaGA4OEAcA";
            item.durationSecs = 60;
        }
    }

    // --- Patch uploads (local & cloud) to mark audio as voice messages ---
    function patchUploads() {
        const unpatches = [];

        function applyPatch(name) {
            try {
                const target = metro.findByProps(name);
                const unpatch = patcher.before(name, target, (args) => {
                    const upload = args[0];
                    if (!storage.sendAsVM || upload.flags === 8192) return;

                    const item = upload.items?.[0] ?? upload;
                    if (item?.mimeType?.startsWith("audio")) {
                        transformAudio(item);
                        upload.flags = 8192;
                    }
                });
                unpatches.push(unpatch);
            } catch {}
        }

        applyPatch("uploadLocalFiles");
        applyPatch("CloudUpload");

        return () => unpatches.forEach((u) => u());
    }

    // --- Patch incoming messages (LOAD_MESSAGES_SUCCESS) ---
    function patchMessageLoad() {
        return patcher.before(
            "actionHandler",
            common.FluxDispatcher._actionHandlers
                ._computeOrderedActionHandlers("LOAD_MESSAGES_SUCCESS")
                .find((h) => h.name === "MessageStore"),
            (args) => {
                if (!storage.allAsVM) return;

                args[0].messages.forEach((msg) => {
                    if (msg.flags == 8192) return;
                    msg.attachments.forEach((att) => {
                        if (att.content_type?.startsWith?.("audio")) {
                            msg.flags |= 8192;
                            att.waveform = "AEtWPyUaGA4OEAcA";
                            att.duration_secs = 60;
                        }
                    });
                });
            }
        );
    }

    // --- Patch new messages (MESSAGE_CREATE) ---
    function patchMessageCreate() {
        return patcher.before(
            "actionHandler",
            common.FluxDispatcher._actionHandlers
                ._computeOrderedActionHandlers("MESSAGE_CREATE")
                .find((h) => h.name === "MessageStore"),
            (args) => {
                if (!storage.allAsVM || args[0].message.flags == 8192) return;

                let msg = args[0].message;
                if (msg?.attachments?.[0]?.content_type?.startsWith("audio")) {
                    msg.flags |= 8192;
                    msg.attachments.forEach((att) => {
                        att.waveform = "AEtWPyUaGA4OEAcA";
                        att.duration_secs = 60;
                    });
                }
            }
        );
    }

    // --- Patch updated messages (MESSAGE_UPDATE) ---
    function patchMessageUpdate() {
        return patcher.before(
            "actionHandler",
            common.FluxDispatcher._actionHandlers
                ._computeOrderedActionHandlers("MESSAGE_UPDATE")
                .find((h) => h.name === "MessageStore"),
            (args) => {
                if (!storage.allAsVM || args[0].message.flags == 8192) return;

                let msg = args[0].message;
                if (msg?.attachments?.[0]?.content_type?.startsWith("audio")) {
                    msg.flags |= 8192;
                    msg.attachments.forEach((att) => {
                        att.waveform = "AEtWPyUaGA4OEAcA";
                        att.duration_secs = 60;
                    });
                }
            }
        );
    }

    // --- Action sheet buttons for voice messages ---
    const { FormRow } = components.Forms;
    const ActionSheetRow = metro.findByProps("ActionSheetRow")?.ActionSheetRow;

    function ActionRow({ label, icon, onPress }) {
        const styles = common.stylesheet.createThemedStyleSheet({
            iconComponent: {
                width: 24,
                height: 24,
                tintColor: ui.semanticColors.INTERACTIVE_NORMAL,
            },
        });

        if (ActionSheetRow) {
            return React.createElement(ActionSheetRow, {
                label,
                icon: React.createElement(ActionSheetRow.Icon, {
                    source: icon,
                    IconComponent: () =>
                        React.createElement(common.ReactNative.Image, {
                            resizeMode: "cover",
                            style: styles.iconComponent,
                            source: icon,
                        }),
                }),
                onPress: () => onPress?.(),
            });
        } else {
            return React.createElement(FormRow, {
                label,
                leading: React.createElement(FormRow.Icon, { source: icon }),
                onPress: () => onPress?.(),
            });
        }
    }

    // --- Patch long press menu (add download & copy buttons) ---
    const ActionSheet = metro.findByProps("openLazy", "hideActionSheet");

    function patchActionSheet() {
        return patcher.before("openLazy", ActionSheet, (args) => {
            const [promise, name, opts] = args;
            const message = opts?.message;

            if (name !== "MessageLongPressActionSheet" || !message) return;

            promise.then((module) => {
                const unpatch = patcher.after("default", module, (res, comp) => {
                    common.React.useEffect(() => () => unpatch(), []);
                    const buttons = utils.findInReactTree(comp, (x) =>
                        x?.[0]?.type?.name === "ButtonRow"
                    );
                    if (!buttons) return comp;

                    if (message.hasFlag(8192)) {
                        // Download option
                        buttons.splice(
                            5,
                            0,
                            React.createElement(ActionRow, {
                                label: "Download Voice Message",
                                icon: assets.getAssetIDByName("ic_download_24px"),
                                onPress: async () => {
                                    await metro
                                        .findByProps("downloadMediaAsset")
                                        .downloadMediaAsset(message.attachments[0].url, 0);
                                    metro.findByProps("hideActionSheet").hideActionSheet();
                                },
                            })
                        );

                        // Copy URL option
                        buttons.splice(
                            6,
                            0,
                            React.createElement(ActionRow, {
                                label: "Copy Voice Message URL",
                                icon: assets.getAssetIDByName("copy"),
                                onPress: async () => {
                                    common.clipboard.setString(
                                        message.attachments[0].url
                                    );
                                    metro.findByProps("hideActionSheet").hideActionSheet();
                                },
                            })
                        );
                    }
                });
            });
        });
    }

    // --- Settings UI ---
    const { FormDivider, FormIcon, FormSwitchRow } = components.Forms;

    function Settings() {
        ui.useProxy(storage);

        return React.createElement(
            common.ReactNative.ScrollView,
            null,
            React.createElement(FormSwitchRow, {
                label: "Send audio files as Voice Message",
                leading: React.createElement(FormIcon, {
                    source: assets.getAssetIDByName("voice_bar_mute_off"),
                }),
                onValueChange: (v) => (storage.sendAsVM = v),
                value: storage.sendAsVM,
            }),
            React.createElement(FormDivider, null),
            React.createElement(FormSwitchRow, {
                label: "Show every audio file as a Voice Message",
                leading: React.createElement(FormIcon, {
                    source: assets.getAssetIDByName("ic_stage_music"),
                }),
                onValueChange: (v) => (storage.allAsVM = v),
                value: storage.allAsVM,
            })
        );
    }

    // --- Default storage values ---
    storage.sendAsVM ??= true;
    storage.allAsVM ??= false;

    // --- Initialize patches ---
    const patches = [
        patchUploads(),
        patchMessageCreate(),
        patchMessageLoad(),
        patchMessageUpdate(),
        patchActionSheet(),
    ];

    const onUnload = () => patches.forEach((u) => u());

    // --- Export plugin ---
    plugin.onUnload = onUnload;
    plugin.settings = Settings;

    return plugin;
})(
    {},
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
