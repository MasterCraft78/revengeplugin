(function(f, s, c, a, o, l, _, v, h, p) {
    "use strict";

    // --- UTILITIES & CORE LOGIC ---

    // This is our audio analysis function from before. It takes a file,
    // processes it, and returns the real waveform and duration.
    async function generateWaveformData(file) {
        try {
            const audioContext = new(window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const durationSecs = Math.round(audioBuffer.duration);

            const rawData = audioBuffer.getChannelData(0);
            const samples = 128; // Number of bars for the waveform
            const blockSize = Math.floor(rawData.length / samples);
            const filteredData = [];
            for (let i = 0; i < samples; i++) {
                let blockStart = blockSize * i;
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(rawData[blockStart + j]);
                }
                filteredData.push(sum / blockSize);
            }

            const multiplier = Math.pow(Math.max(...filteredData), -1);
            const normalizedData = filteredData.map(n => Math.min(255, Math.floor((n * multiplier) * 255)));
            const waveformBytes = new Uint8Array(normalizedData);
            const binString = Array.from(waveformBytes, byte => String.fromCodePoint(byte)).join("");
            const waveform = btoa(binString);

            return {
                waveform,
                durationSecs
            };
        } catch (err) {
            console.error("Failed to process audio file:", err);
            // Use a toast to show the user something went wrong
            s.findByProps("showToast")?.showToast?.("Failed to process audio file. It may be corrupted.", l.getAssetIDByName("Small"));
            return null;
        }
    }

    // --- MODULES (finding Discord's internal code) ---
    const Toasts = s.findByProps("showToast");
    const {
        pickSingle
    } = s.findByProps("pickSingle");
    const {
        uploadLocalFiles
    } = s.findByProps("uploadLocalFiles");
    const ChannelStore = s.findByProps("getChannel", "hasChannel");
    const ChatInput = s.findByName("ChatInput");


    // --- NEW CUSTOM UPLOAD BUTTON COMPONENT ---
    function CustomVoiceUploadButton() {
        const onPress = async () => {
            try {
                // 1. Open the native file picker
                const result = await pickSingle({
                    type: "audio/*"
                });
                if (!result) return;

                const file = {
                    uri: result.uri,
                    name: result.name,
                    type: result.type,
                    size: result.size,
                };

                // 2. Show a "processing" toast to the user
                Toasts.showToast("Processing audio...", l.getAssetIDByName("toast_image_processing"));

                // 3. Generate the real waveform and duration
                const audioData = await generateWaveformData(file);
                if (!audioData) return; // Error was already handled inside

                // 4. Get the current channel ID
                const channelId = ChannelStore.getChannelId();
                if (!channelId) return;

                // 5. Prepare and send the file using Discord's uploader
                uploadLocalFiles({
                    channelId: channelId,
                    uploads: [{
                        file: file,
                        isRemix: false,
                        showLargeMessageDialog: true,
                    }, ],
                    // This is where we inject our processed data
                    draftType: 0,
                    flags: 8192, // The flag that makes it a "voice message"
                    waveform: audioData.waveform,
                    durationSecs: audioData.durationSecs,
                });

            } catch (err) {
                if (err.message.includes("cancelled")) {
                    return; // User cancelled file picking, do nothing.
                }
                console.error("Custom voice upload failed:", err);
                Toasts.showToast("Failed to upload file.", l.getAssetIDByName("Small"));
            }
        };

        // This is the actual button component that gets added to the chat bar
        return o.React.createElement(o.ReactNative.TouchableOpacity, {
            onPress: onPress,
            style: {
                paddingHorizontal: 10,
                justifyContent: "center"
            },
            children: [o.React.createElement(o.ReactNative.Image, {
                source: l.getAssetIDByName("ic_mic_24px"),
                style: {
                    width: 24,
                    height: 24,
                    tintColor: v.semanticColors.INTERACTIVE_NORMAL
                }
            })]
        });
    }

    // --- PATCH TO ADD THE BUTTON ---
    function AddButtonPatch() {
        // We find the ChatInput component and add our button next to the existing ones.
        return c.after("render", ChatInput.prototype, (_, res) => {
            const actionButtons = _.findInReactTree(res, r => r.key === "action-buttons");
            if (actionButtons?.props?.children) {
                actionButtons.props.children.unshift(o.React.createElement(CustomVoiceUploadButton));
            }
            return res;
        });
    }


    // --- Old functions for viewing existing messages as voice notes (can stay) ---
    function V() {
        return c.before("actionHandler", o.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("LOAD_MESSAGES_SUCCESS").find(function(e) {
            return e.name === "MessageStore"
        }), function(e) {
            a.storage.allAsVM && e[0].messages.forEach(function(t) {
                t.flags != 8192 && t.attachments.forEach(function(n) {
                    n.content_type?.startsWith?.("audio") && (t.flags |= 8192, n.waveform = "AEtWPyUaGA4OEAcA", n.duration_secs = 60)
                })
            })
        })
    }

    function b() {
        return c.before("actionHandler", o.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_CREATE").find(function(e) {
            return e.name === "MessageStore"
        }), function(e) {
            if (!a.storage.allAsVM || e[0].message.flags == 8192) return;
            let t = e[0].message;
            t?.attachments?.[0]?.content_type?.startsWith("audio") && (t.flags |= 8192, t.attachments.forEach(function(n) {
                n.waveform = "AEtWPyUaGA4OEAcA", n.duration_secs = 60
            }))
        })
    }

    function C() {
        return c.before("actionHandler", o.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_UPDATE").find(function(e) {
            return e.name === "MessageStore"
        }), function(e) {
            if (!a.storage.allAsVM || e[0].message.flags == 8192) return;
            let t = e[0].message;
            t?.attachments?.[0]?.content_type?.startsWith("audio") && (t.flags |= 8192, t.attachments.forEach(function(n) {
                n.waveform = "AEtWPyUaGA4OEAcA", n.duration_secs = 60
            }))
        })
    }
    const {
        FormRow: E
    } = h.Forms, d = s.findByProps("ActionSheetRow")?.ActionSheetRow;

    function y({
        label: e,
        icon: t,
        onPress: n
    }) {
        const u = o.stylesheet.createThemedStyleSheet({
            iconComponent: {
                width: 24,
                height: 24,
                tintColor: v.semanticColors.INTERACTIVE_NORMAL
            }
        });
        return d ? o.React.createElement(d, {
            label: e,
            icon: o.React.createElement(d.Icon, {
                source: t,
                IconComponent: function() {
                    return o.React.createElement(o.ReactNative.Image, {
                        resizeMode: "cover",
                        style: u.iconComponent,
                        source: t
                    })
                }
            }),
            onPress: function() {
                return n?.()
            }
        }) : o.React.createElement(E, {
            label: e,
            leading: o.React.createElement(E.Icon, {
                source: t
            }),
            onPress: function() {
                return n?.()
            }
        })
    }
    const I = s.findByProps("openLazy", "hideActionSheet");

    function B() {
        return c.before("openLazy", I, function(e) {
            const [t, n, u] = e, r = u?.message;
            n !== "MessageLongPressActionSheet" || !r || t.then(function(A) {
                const i = c.after("default", A, function(m, M) {
                    o.React.useEffect(function() {
                        return function() {
                            i()
                        }
                    }, []);
                    const g = _.findInReactTree(M, function(O) {
                        return O?.[0]?.type?.name === "ButtonRow"
                    });
                    if (!g) return M;
                    r.hasFlag(8192) && (g.splice(5, 0, o.React.createElement(y, {
                        label: "Download Voice Message",
                        icon: l.getAssetIDByName("ic_download_24px"),
                        onPress: async function() {
                            await s.findByProps("downloadMediaAsset").downloadMediaAsset(r.attachments[0].url, 0), s.findByProps("hideActionSheet").hideActionSheet()
                        }
                    })), g.splice(6, 0, o.React.createElement(y, {
                        label: "Copy Voice Message URL",
                        icon: l.getAssetIDByName("copy"),
                        onPress: async function() {
                            o.clipboard.setString(r.attachments[0].url), s.findByProps("hideActionSheet").hideActionSheet()
                        }
                    })))
                })
            })
        })
    }
    const {
        FormDivider: D,
        FormIcon: S,
        FormSwitchRow: R
    } = h.Forms;

    function F() {
        return p.useProxy(a.storage), o.React.createElement(o.ReactNative.ScrollView, null, o.React.createElement(R, {
            label: "Send audio files as Voice Message",
            leading: o.React.createElement(S, {
                source: l.getAssetIDByName("voice_bar_mute_off")
            }),
            onValueChange: function(e) {
                return a.storage.sendAsVM = e
            },
            value: a.storage.sendAsVM
        }), o.React.createElement(D, null), o.React.createElement(R, {
            label: "Show every audio file as a Voice Message",
            leading: o.React.createElement(S, {
                source: l.getAssetIDByName("ic_stage_music")
            }),
            onValueChange: function(e) {
                return a.storage.allAsVM = e
            },
            value: a.storage.allAsVM
        }))
    }
    a.storage.sendAsVM ??= !0, a.storage.allAsVM ??= !1;

    // --- PLUGIN STARTUP AND SHUTDOWN ---
    const U = [AddButtonPatch(), b(), V(), C(), B()],
        H = function() {
            U.forEach(function(e) {
                return e()
            })
        };
    return f.onUnload = H, f.settings = F, f
})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);


