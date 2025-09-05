/**
 * Slash Command Inspector
 *
 * A diagnostic tool that uses a slash command (/inspect) to gather information,
 * avoiding the need for a settings page UI which may be unreliable on some clients.
 * This is the definitive, non-UI method for debugging.
 *
 * Built by Gemini to solve a complex compatibility issue.
 */
(function(plugin, metro, patcher, commands, toasts, common, assets, utils, ui, storage, React, ConfirmationAlert, DCDChat) {
    "use strict";

    // --- 1. Modules & Setup ---
    const { findByProps } = metro;
    let unregister; // To hold the command unregister function

    // --- 2. The Core Inspection Logic ---
    // A safe way to get properties from an object, handling potential errors.
    const getKeys = (obj, name = "Module") => {
        if (obj === undefined || obj === null) return `- ${name}: NOT FOUND or is null/undefined.`;
        try {
            const keys = Object.keys(obj);
            let output = `- ${name} [FOUND]:\n  - Properties: ${keys.join(", ") || "[None]"}`;
            if (obj.prototype) {
                const protoKeys = Object.keys(obj.prototype);
                output += `\n  - Prototype Properties: ${protoKeys.join(", ") || "[None]"}`;
            }
            return output;
        } catch (e) {
            return `- ${name}: Error getting keys: ${e.message}`;
        }
    };

    const runInspection = () => {
        let results = "--- Module Inspection Results ---\n\n";
        
        // Test 1: Core Uploader (Modern Method)
        results += getKeys(findByProps("upload"), "Core Uploader (findByProps('upload'))") + "\n\n";
        
        // Test 2: File Uploader (Original CVM Method)
        results += getKeys(findByProps("uploadLocalFiles", "CloudUpload"), "File Uploader (findByProps('uploadLocalFiles', 'CloudUpload'))") + "\n\n";

        // Test 3: CloudUpload Class (catbox.moe Method)
        results += getKeys(findByProps("CloudUpload")?.CloudUpload, "CloudUpload Class (findByProps('CloudUpload').CloudUpload)") + "\n";

        return results;
    };


    // --- 3. The Slash Command Definition ---
    const defineCommand = () => {
        try {
            unregister = commands.registerCommand({
                name: "inspect",
                displayName: "inspect",
                description: "Inspects client modules for compatibility.",
                displayDescription: "Inspects client modules for compatibility.",
                options: [],
                applicationId: "-1", // Internal command
                inputType: 1,
                type: 1,
                execute: (args, context) => {
                    try {
                        const inspectionResults = runInspection();
                        
                        // Use the DCDChat module to send a private (ephemeral) message
                        DCDChat.createBotMessage({
                            channelId: context.channel.id,
                            content: "✅ **Module Inspector Results**\n\nHere is the data from your client. Please copy the entire content of this code block and send it back.",
                            embeds: [{
                                type: "rich",
                                description: "```ini\n" + inspectionResults + "\n```"
                            }]
                        });

                    } catch (e) {
                         DCDChat.createBotMessage({
                            channelId: context.channel.id,
                            content: `❌ **Inspector Error:**\nAn error occurred while running the inspection:\n\`\`\`\n${e.message}\n\`\`\``
                        });
                    }
                }
            });
        } catch (e) {
            console.error("[Inspector] Failed to register command:", e);
            toasts.showToast("Failed to register /inspect command.", getAssetIDByName("Small"));
        }
    };

    // --- 4. Plugin Lifecycle (No Settings) ---
    plugin.onLoad = () => {
        defineCommand();
    };

    plugin.onUnload = () => {
        unregister?.();
    };
    
    // No settings export means no cog wheel icon will be shown.
    
})(...vendetta.plugin.runtimeArgs);

