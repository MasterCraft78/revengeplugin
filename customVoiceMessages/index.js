(function(f, s, c, a, o, l, _, v, h, p) {
    "use strict";

    function w(e) {
        e?.mimeType?.startsWith("audio") && (e.mimeType = "audio/ogg", e.waveform = "AEtWPyUaGA4OEAcA", e.durationSecs = 60)
    }

    function P() {
        const e = [],
            t = function(n) {
                try {
                    const u = s.findByProps(n),
                        r = c.before(n, u, function(A) {
                            const i = A[0];
                            if (!a.storage.sendAsVM || i.flags === 8192) return;
                            const m = i.items?.[0] ?? i;
                            m?.mimeType?.startsWith("audio") && (w(m), i.flags = 8192)
                        });
                    e.push(r)
                } catch {}
            };
        return t("uploadLocalFiles"), t("CloudUpload"),
            function() {
                return e.forEach(function(n) {
                    return n()
                })
            }
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

