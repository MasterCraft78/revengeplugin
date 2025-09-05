import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

// Generate a real waveform from audio data
async function generateWaveform(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        const rawData = decoded.getChannelData(0);
        const blockSize = Math.floor(rawData.length / 100); // 100 bars
        const peaks = [];

        for (let i = 0; i < 100; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[i * blockSize + j]);
            }
            peaks.push(sum / blockSize);
        }

        // Convert to base64 string
        const waveformBytes = Uint8Array.from(
            peaks.map(p => Math.min(255, Math.floor(p * 255)))
        );
        const waveformBase64 = btoa(
            String.fromCharCode(...waveformBytes)
        );

        return { waveform: waveformBase64, duration: decoded.duration };
    } catch (e) {
        console.error("Waveform generation failed:", e);
        // This is the problematic fallback. We will remove it.
        // return { waveform: "AEtWPyUaGA4OEAcA", duration: 60.0 };
    }
}

async function transform(item) {
    if (!item?.mimeType?.startsWith("audio")) return;

    const result = await generateWaveform(item.file);
    // Add a check to ensure a result was returned
    if (!result) return; 

    item.mimeType = "audio/ogg";
    item.waveform = result.waveform;
    item.durationSecs = result.duration;
}

export default () => {
    const unpatches = [];

    const patch = (method) => {
        try {
            const module = findByProps(method);
            const unpatch = before(method, module, async (args) => {
                const upload = args[0];
                if (!storage.sendAsVM || upload.flags === 8192) return;

                const item = upload.items?.[0] ?? upload;
                if (item?.mimeType?.startsWith("audio")) {
                    await transform(item);
                    upload.flags = 8192;
                }
            });

            unpatches.push(unpatch);
        } catch (e) {
            console.error("Patch failed:", e);
        }
    };

    patch("uploadLocalFiles");
    patch("CloudUpload");

    return () => unpatches.forEach((u) => u());
};
    return () => unpatches.forEach((u) => u());
};
