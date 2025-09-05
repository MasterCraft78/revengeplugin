// --- Imports ---
import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { React, ReactNative as RN, stylesheet, FluxDispatcher, clipboard } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findInReactTree } from "@vendetta/utils";
import { semanticColors } from "@vendetta/ui";
import { showToast } from "@vendetta/ui/toasts";

// --- Modern UI Components (from the working plugin) ---
const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableSwitchRow } = findByProps("TableSwitchRow", "TableRowGroup");
const ActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
const { FormRow } = findByProps("FormRow"); // Fallback for CoolRow

// --- State and Utilities ---

// Generates a real waveform from audio data to make it look authentic
async function generateWaveform(file: any): Promise<{ waveform: string, duration: number }> {
    try {
        // The file object from the uploader is not a standard File object.
        // We assume it has a `uri` property that points to the local file.
        const response = await fetch(file.uri);
        const arrayBuffer = await response.arrayBuffer();

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        const rawData = decoded.getChannelData(0);
        const blockSize = Math.floor(rawData.length / 100); // 100 bars for the waveform
        const peaks = [];

        for (let i = 0; i < 100; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[i * blockSize + j]);
            }
            peaks.push(sum / blockSize);
        }

        // Convert peak data to a Base64 string that Discord understands
        const waveformBytes = new Uint8Array(peaks.map(p => Math.min(255, Math.floor(p * 255 * 1.5))));
        const waveformBase64 = btoa(String.fromCharCode.apply(null, waveformBytes));

        return { waveform: waveformBase64, duration: decoded.duration };
    } catch (e) {
        console.error("[VoiceMessages] Waveform generation failed:", e);
        showToast("Couldn't generate waveform, using fallback.");
        // Fallback dummy waveform if generation fails
        return { waveform: "AEtWPyUaGA4OEAcA", duration: 60.0 };
    }
}

// --- Components ---

// A nice-looking row for the action sheet (long-press menu)
const CoolRow = ({ label, icon, onPress }: { label: string; icon: number; onPress?: () => void; }) => {
    const styles = stylesheet.createThemedStyleSheet({
        iconComponent: {
            width: 24,
            height: 24,
            tintColor: semanticColors.INTERACTIVE_NORMAL,
        },
    });

    return ActionSheetRow ? (
        <ActionSheetRow
            label={label}
            icon={
                <ActionSheetRow.Icon
                    source={icon}
                    IconComponent={() => <RN.Image resizeMode="cover" style={styles.iconComponent} source={icon} />}
                />
            }
            onPress={onPress}
        />
    ) : (
        <FormRow
            label={label}
            leading={<FormRow.Icon source={icon} />}
            onPress={onPress}
        />
    );
};

// --- Patches ---

// This is the new, modern way to patch the uploader
function patchUploader() {
    const CloudUpload = findByProps("CloudUpload")?.CloudUpload;
    if (!CloudUpload?.prototype?.reactNativeCompressAndExtractData) {
        console.error("[VoiceMessages] Could not find the method to patch the uploader!");
        showToast("❌ VoiceMessages failed to patch the uploader.", getAssetIDByName("Small"));
        return () => {};
    }
    const originalUpload = CloudUpload.prototype.reactNativeCompressAndExtractData;

    CloudUpload.prototype.reactNativeCompressAndExtractData = async function (...args) {
        // 'this' refers to the file being uploaded
        if (storage.sendAsVM && this?.mimeType?.startsWith("audio")) {
            try {
                // Modify the file object before it gets uploaded
                const result = await generateWaveform(this);
                this.mimeType = "audio/ogg"; // Discord expects ogg for voice messages
                this.waveform = result.waveform;
                this.durationSecs = result.duration;
            } catch (e) {
                console.error("[VoiceMessages] Failed to transform audio file:", e);
            }
        }
        // Let the original Discord function run with our modified file object
        return originalUpload.apply(this, args);
    };

    return () => { // Return the unpatch function
        CloudUpload.prototype.reactNativeCompressAndExtractData = originalUpload;
    };
}

// Patches for making existing audio files look like voice messages
function patchMessageStore() {
    const unpatches = [];
    const MessageStore = findByProps("getMessage", "getMessages");

    // When loading old messages
    unpatches.push(before("dispatch", MessageStore, (args) => {
        if (!storage.allAsVM) return;
        const [event] = args;
        if (event.type !== "LOAD_MESSAGES_SUCCESS") return;

        event.messages.forEach(msg => {
            if (msg.attachments?.[0]?.content_type?.startsWith("audio")) {
                msg.flags |= 8192; // Add the voice message flag
                msg.attachments.forEach(a => {
                    a.waveform = "AEtWPyUaGA4OEAcA"; // Dummy waveform
                    a.duration_secs = 60;
                });
            }
        });
    }));

    // For new messages coming in
    unpatches.push(before("dispatch", MessageStore, (args) => {
        if (!storage.allAsVM) return;
        const [event] = args;
        if (event.type !== "MESSAGE_CREATE" && event.type !== "MESSAGE_UPDATE") return;

        const msg = event.message;
        if (msg?.attachments?.[0]?.content_type?.startsWith("audio")) {
            msg.flags |= 8192;
            msg.attachments.forEach(a => {
                a.waveform = "AEtWPyUaGA4OEAcA";
                a.duration_secs = 60;
            });
        }
    }));

    return () => unpatches.forEach(p => p());
}

// Adds "Download" and "Copy URL" to the long-press menu for voice messages
function patchDownloadMenu() {
    return before("openLazy", ActionSheet, (ctx) => {
        const [component, args, actionMessage] = ctx;
        if (args !== "MessageLongPressActionSheet") return;

        const message = actionMessage?.message;
        if (!message?.attachments?.[0] || !(message.flags & 8192)) return;

        component.then(instance => {
            const unpatch = after("default", instance, (_, res) => {
                React.useEffect(() => () => { unpatch() }, []);
                const buttons = findInReactTree(res, (x) => x?.[0]?.type?.name === "ButtonRow");
                if (!buttons) return;

                const attachment = message.attachments[0];
                const url = attachment.url;

                buttons.splice(5, 0,
                    <CoolRow
                        label="Download Voice Message"
                        icon={getAssetIDByName("ic_download_24px")}
                        onPress={() => {
                            findByProps("downloadMediaAsset").downloadMediaAsset(url, 0);
                            ActionSheet.hideActionSheet();
                        }}
                    />,
                    <CoolRow
                        label="Copy Voice Message URL"
                        icon={getAssetIDByName("copy")}
                        onPress={() => {
                            clipboard.setString(url);
                            showToast("Copied URL to clipboard.", getAssetIDByName("toast_copy_link"));
                            ActionSheet.hideActionSheet();
                        }}
                    />
                );
            });
        });
    });
}

// --- Plugin Definition ---

let patches: (() => void)[] = [];

export default {
    onLoad() {
        // Set default settings if they don't exist
        storage.sendAsVM ??= true;
        storage.allAsVM ??= false;

        // Apply all our patches
        patches.push(patchUploader());
        patches.push(patchMessageStore());
        patches.push(patchDownloadMenu());
    },

    onUnload() {
        // Unpatch everything when the plugin is stopped
        patches.forEach(p => p());
        patches = [];
    },

    settings: () => {
        // Re-render component when storage changes
        const [_, forceUpdate] = React.useReducer(x => ~x, 0);

        return (
            <ScrollView style={{ flex: 1 }}>
                <RN.View style={{ padding: 10 }}>
                    <TableRowGroup title="Upload Settings">
                        <TableSwitchRow
                            label="Send audio files as Voice Messages"
                            subLabel="When enabled, any audio file you upload will become a voice message."
                            value={storage.sendAsVM}
                            onValueChange={(value) => {
                                storage.sendAsVM = value;
                                forceUpdate();
                            }}
                        />
                    </TableRowGroup>
                    <TableRowGroup title="Display Settings">
                        <TableSwitchRow
                            label="Show all audio files as Voice Messages"
                            subLabel="Visually treats all audio files in chat as voice messages, even old ones."
                            value={storage.allAsVM}
                            onValueChange={(value) => {
                                storage.allAsVM = value;
                                forceUpdate();
                            }}
                        />
                    </TableRowGroup>
                </RN.View>
            </ScrollView>
        );
    }
};
                                    
