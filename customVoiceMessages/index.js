(function(f, s, c, a, o, l, _, v, h, p) {
    "use strict";

    // --- Core Audio Processing Logic ---
    // This function analyzes the audio file to generate the waveform and get the duration.
    async function generateWaveformData(file) {
        try {
            // We need a proper File object, not just a URI. This reconstructs it.
            const response = await fetch(file.uri);
            const blob = await response.blob();
            const properFile = new File([blob], file.name, {
                type: blob.type
            });

            const audioContext = new(window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await properFile.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const durationSecs = Math.round(audioBuffer.duration);

            const rawData = audioBuffer.getChannelData(0);
            const samples = 128;
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
            s.findByProps("showToast")?.showToast?.("Failed to process audio file.", l.getAssetIDByName("Small"));
            return null;
        }
    }

    // --- NEW: Patch the function that sends messages ---
    // This is safer because it runs *after* the UI preview has been handled.
    function PatchSendMessage() {
        const MessageActions = s.findByProps("sendMessage", "receiveMessage");
        return c.instead("sendMessage", MessageActions, async (args, originalFunc) => {
            // Check if user has the setting enabled
            if (!a.storage.sendAsVM) return originalFunc.apply(this, args);

            const channelId = args[0];
            const message = args[1];

            // Find the first audio attachment that hasn't been processed yet.
            const attachment = message?.attachments?.find(att => att.mimeType?.startsWith("audio"));

            if (attachment) {
                s.findByProps("showToast")?.showToast?.("Preparing voice message...", l.getAssetIDByName("toast_image_processing"));
                
                // Analyze the audio file to get the real data
                const audioData = await generateWaveformData(attachment);
                
                if (audioData) {
                    // This is the object that will be sent over the network.
                    // We modify it right before it goes out.
                    const finalMessage = {
                        content: message.content,
                        channelId: channelId,
                        isVoiceMessage: true, // Tell the uploader this is a voice message
                        voiceMessageMetadata: {
                            waveform: audioData.waveform,
                            durationSecs: audioData.durationSecs,
                        }
                    };
                    // Use the specific uploader for voice messages.
                    return s.findByProps("sendVoiceMessage")?.sendVoiceMessage(finalMessage, [attachment]);
                }
            }
            
            // If it's not an audio file or processing failed, send it as a normal message.
            return originalFunc.apply(this, args);
        });
    }


    // --- Original functions for viewing existing messages (unchanged) ---
    function V() {
        return c.before("actionHandler", o.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("LOAD_MESSAGES_SUCCESS").find(e => e.name === "MessageStore"), e => {
            if (a.storage.allAsVM) e[0].messages.forEach(t => {
                if (t.flags != 8192) t.attachments.forEach(n => {
                    if (n.content_type?.startsWith?.("audio")) {
                        t.flags |= 8192;
                        n.waveform = "AEtWPyUaGA4OEAcA";
                        n.duration_secs = 60;
                    }
                });
            });
        });
    }

    function b() {
        return c.before("actionHandler", o.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_CREATE").find(e => e.name === "MessageStore"), e => {
            if (!a.storage.allAsVM || e[0].message.flags == 8192) return;
            let t = e[0].message;
            if (t?.attachments?.[0]?.content_type?.startsWith("audio")) {
                t.flags |= 8192;
                t.attachments.forEach(n => {
                    n.waveform = "AEtWPyUaGA4OEAcA";
                    n.duration_secs = 60;
                });
            }
        });
    }

    function C() {
        return c.before("actionHandler", o.FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_UPDATE").find(e => e.name === "MessageStore"), e => {
            if (!a.storage.allAsVM || e[0].message.flags == 8192) return;
            let t = e[0].message;
            if (t?.attachments?.[0]?.content_type?.startsWith("audio")) {
                t.flags |= 8192;
                t.attachments.forEach(n => {
                    n.waveform = "AEtWPyUaGA4OEAcA";
                    n.duration_secs = 60;
                });
            }
        });
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
        return d ? React.createElement(d, {
            label: e,
            icon: React.createElement(d.Icon, {
                source: t,
                IconComponent: () => React.createElement(o.ReactNative.Image, {
                    resizeMode: "cover",
                    style: u.iconComponent,
                    source: t
                })
            }),
            onPress: () => n?.()
        }) : React.createElement(E, {
            label: e,
            leading: React.createElement(E.Icon, {
                source: t
            }),
            onPress: () => n?.()
        });
    }
    const I = s.findByProps("openLazy", "hideActionSheet");

    function B() {
        return c.before("openLazy", I, (e) => {
            const [t, n, u] = e, r = u?.message;
            if (n !== "MessageLongPressActionSheet" || !r) return;
            t.then(A => {
                const i = c.after("default", A, (m, M) => {
                    o.React.useEffect(() => () => i(), []);
                    const g = _.findInReactTree(M, O => O?.[0]?.type?.name === "ButtonRow");
                    if (!g) return M;
                    if (r.hasFlag(8192)) {
                        g.splice(5, 0, React.createElement(y, {
                            label: "Download Voice Message",
                            icon: l.getAssetIDByName("ic_download_24px"),
                            onPress: async () => {
                                await s.findByProps("downloadMediaAsset").downloadMediaAsset(r.attachments[0].url, 0);
                                s.findByProps("hideActionSheet").hideActionSheet();
                            }
                        }));
                        g.splice(6, 0, React.createElement(y, {
                            label: "Copy Voice Message URL",
                            icon: l.getAssetIDByName("copy"),
                            onPress: async () => {
                                o.clipboard.setString(r.attachments[0].url);
                                s.findByProps("hideActionSheet").hideActionSheet();
                            }
                        }));
                    }
                });
            });
        });
    }
    const {
        FormDivider: D,
        FormIcon: S,
        FormSwitchRow: R
    } = h.Forms;

    function F() {
        p.useProxy(a.storage);
        return React.createElement(o.ReactNative.ScrollView, null, React.createElement(R, {
            label: "Send audio files as Voice Message",
            leading: React.createElement(S, {
                source: l.getAssetIDByName("voice_bar_mute_off")
            }),
            onValueChange: e => a.storage.sendAsVM = e,
            value: a.storage.sendAsVM
        }), React.createElement(D, null), React.createElement(R, {
            label: "Show every audio file as a Voice Message",
            leading: React.createElement(S, {
                source: l.getAssetIDByName("ic_stage_music")
            }),
            onValueChange: e => a.storage.allAsVM = e,
            value: a.storage.allAsVM
        }));
    }
    a.storage.sendAsVM ??= true;
    a.storage.allAsVM ??= false;

    // --- Plugin Start/Stop ---
    const U = [PatchSendMessage(), b(), V(), C(), B()];
    const H = () => U.forEach(e => e?.());
    
    return f.onUnload = H, f.settings = F, f;
})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);


