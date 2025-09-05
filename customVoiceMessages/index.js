/**
 * Module Inspector
 *
 * A diagnostic tool to safely inspect the modules of a modded Discord client.
 * This plugin is designed to be un-crashable and is used for gathering
 * information to build other, more complex plugins.
 *
 * Built by Gemini to solve a complex debugging problem.
 */
(function(plugin, metro, patcher, self, common, assets, utils, ui, components, storage) {
    "use strict";

    const { React, ReactNative } = common;
    const { findByProps, findByStoreName, findAll } = metro;
    const { Forms } = components;

    // A safe way to get properties from an object, handling potential errors.
    const getKeys = (obj) => {
        if (!obj) return "Module is null or undefined";
        try {
            return Object.keys(obj).join(", ");
        } catch (e) {
            return `Error getting keys: ${e.message}`;
        }
    };

    // --- The Main Inspector UI ---
    const InspectorComponent = () => {
        const [results, setResults] = React.useState("Press a button to begin inspection...");

        const inspectModule = (title, finder) => {
            let output = `--- ${title} ---\n`;
            try {
                const module = finder();
                if (module) {
                    output += `Module Found!\n`;
                    output += `Properties: ${getKeys(module)}\n`;
                    // For modules with prototypes (like CloudUpload)
                    if (module.prototype) {
                        output += `Prototype Properties: ${getKeys(module.prototype)}\n`;
                    }
                } else {
                    output += `Module NOT Found.\n`;
                }
            } catch (e) {
                output += `An error occurred during inspection: ${e.message}\n`;
            }
            output += "\n";
            setResults(prev => prev + output);
        };
        
        const reset = () => {
            setResults("Press a button to begin inspection...\n");
        };

        const copyToClipboard = () => {
            common.clipboard.setString(results);
            ui.toasts.showToast("Results copied to clipboard!");
        };

        return React.createElement(ReactNative.View, { style: { flex: 1, backgroundColor: "#2f3136", padding: 10 } },
            React.createElement(ReactNative.Text, { style: { color: "white", fontSize: 18, fontWeight: "bold", marginBottom: 10 } }, "Module Inspector"),
            React.createElement(ReactNative.ScrollView, { style: { flex: 1, marginBottom: 10 } },
                React.createElement(Forms.FormRow, { 
                    label: "1. Inspect Core Uploader",
                    subLabel: "Looks for the main 'upload' function.",
                    onPress: () => inspectModule("Core Uploader (findByProps('upload'))", () => findByProps("upload"))
                }),
                React.createElement(Forms.FormRow, { 
                    label: "2. Inspect File Uploader",
                    subLabel: "Looks for 'uploadLocalFiles'.",
                    onPress: () => inspectModule("File Uploader (findByProps('uploadLocalFiles'))", () => findByProps("uploadLocalFiles", "CloudUpload"))
                }),
                React.createElement(Forms.FormRow, { 
                    label: "3. Inspect CloudUpload Module",
                    subLabel: "Looks for the 'CloudUpload' class.",
                    onPress: () => inspectModule("CloudUpload Module (findByProps('CloudUpload'))", () => findByProps("CloudUpload"))
                }),
            ),
            React.createElement(ReactNative.Text, { style: { color: "#b9bbbe", fontSize: 14, marginBottom: 5 } }, "Results:"),
            React.createElement(ReactNative.ScrollView, { style: { backgroundColor: "#202225", padding: 10, borderRadius: 5, flex: 2 } },
                React.createElement(ReactNative.Text, { selectable: true, style: { color: "white", fontFamily: "monospace" } }, results)
            ),
             React.createElement(ReactNative.View, { style: { flexDirection: "row", justifyContent: "space-around", marginTop: 10 } },
                React.createElement(Forms.FormButton, { title: "Copy Results", onPress: copyToClipboard, style: { flex: 1, marginRight: 5 } }),
                React.createElement(Forms.FormButton, { title: "Clear", onPress: reset, style: { flex: 1, marginLeft: 5 }, color: "red" })
            )
        );
    };

    // --- Plugin Lifecycle (designed to be un-crashable) ---
    plugin.onLoad = () => {};
    plugin.onUnload = () => {};
    plugin.settings = InspectorComponent;

})({}, vendetta.metro, vendetta.patcher, vendetta.plugin, vendetta.metro.common, vendetta.ui.assets, vendetta.utils, vendetta.ui, vendetta.ui.components, vendetta.storage);
