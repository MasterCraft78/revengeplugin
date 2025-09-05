(function(f, s, c, a, o, l, _, v, h, p) {
    "use strict";

    async function generateWaveformData(file) {
        try {
            const audioContext = new(window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await file.arrayBuffer();
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
            return null;
        }
    }

    function P() {
        const e = [],
            t = function(n) {
                try {
                    const u = s.findByProps(n);
                    const r = c.instead(n, u, async function(args, originalFunc) {
                        const uploadData = args[0];
                        if (!a.storage.sendAsVM || uploadData.flags === 8192) {
                            return originalFunc.apply(this, args);
                        }
                        const item = uploadData.items?.[0] ?? uploadData;
                        if (item?.mimeType?.startsWith("audio") && item.file) {
                            const audioData = await generateWaveformData(item.file);
                            if (audioData) {
                                item.waveform = audioData.waveform;
                                item.durationSecs = audioData.durationSecs;
                                uploadData.flags = 8192;
                                item.mimeType = "audio/ogg";
                            }
                        }
                        return originalFunc.apply(this, args);
                    });
                    e.push(r);
                } catch {}
            };
        t("uploadLocalFiles");
        t("CloudUpload");
        return function() {
            e.forEach(n => n());
        };
    }

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
        return d ? React.createElement(d, {
            label: e,
            icon: React.createElement(d.Icon, {
                source: t,
                IconComponent: function() {
                    return React.createElement(o.ReactNative.Image, {
                        resizeMode: "cover",
                        style: u.iconComponent,
                        source: t
                    })
                }
            }),
            onPress: function() {
                return n?.()
            }
        }) : React.createElement(E, {
            label: e,
            leading: React.createElement(E.Icon, {
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
        return p.useProxy(a.storage), React.createElement(o.ReactNative.ScrollView, null, React.createElement(R, {
            label: "Send audio files as Voice Message",
            leading: React.createElement(S, {
                source: l.getAssetIDByName("voice_bar_mute_off")
            }),
            onValueChange: function(e) {
                return a.storage.sendAsVM = e
            },
            value: a.storage.sendAsVM
        }), React.createElement(D, null), React.createElement(R, {
            label: "Show every audio file as a Voice Message",
            leading: React.createElement(S, {
                source: l.getAssetIDByName("ic_stage_music")
            }),
            onValueChange: function(e) {
                return a.storage.allAsVM = e
            },
            value: a.storage.allAsVM
        }))
    }
    a.storage.sendAsVM ??= !0, a.storage.allAsVM ??= !1;
    const U = [P(), b(), V(), C(), B()],
        H = function() {
            U.forEach(function(e) {
                return e()
            })
        };
    return f.onUnload = H, f.settings = F, f
})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);


                            
