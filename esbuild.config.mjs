import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import copy from "esbuild-copy-static-files";

const banner =
	`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = process.argv[2] === "production";

esbuild.build({
	banner: {
		js: banner,
	},
	entryPoints: ["main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		...builtins],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	plugins: [
		copy({
			assets: [
				{ from: ['pkg/*.wasm'], to: ['./pkg'] },
				{ from: ['pkg/emoji_search_fixed.js'], to: ['./pkg'] }, // Copy your fixed JS file
				{ from: ['emoji_data_*.json'], to: ['./'] }
			]
		})
	]
}).catch(() => process.exit(1));
