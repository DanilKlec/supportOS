import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Read-only audit: stdout is deterministic JSON, including type imports and re-exports.
const root = process.cwd();
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const files = execFileSync("rg", [
	"--files", "--hidden", "-g", "!node_modules", "-g", "!.git", "-g", "!dist",
	"-g", "!.agents", "-g", "!.codex", "-g", "!supabase/.temp",
], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).map(file => file.replaceAll("\\", "/")).sort();
const fileSet = new Set(files);
const sourceFiles = files.filter(file => /\.[cm]?[jt]sx?$/.test(file));
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const routeConfig = JSON.parse(fs.readFileSync(path.join(root, "tsr.config.json"), "utf8"));
const routesDirectory = relative(path.resolve(root, routeConfig.routesDirectory ?? "src/routes"));
const generatedRouteTree = relative(path.resolve(root, routeConfig.generatedRouteTree ?? "src/routeTree.gen.ts"));
const routeProtected = file => file.startsWith(`${routesDirectory}/`) || file === generatedRouteTree;
const isTest = file => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)(__tests__|tests)\//.test(file);
const sourceKind = file => isTest(file) ? "test" : file.startsWith("scripts/") || /\.config\.[cm]?[jt]s$/.test(file) ? "tooling" : "production";

function resolve(specifier, importer) {
	const result = new Set();
	const resolved = ts.resolveModuleName(specifier, path.join(root, importer), options, ts.sys).resolvedModule;
	if (resolved) {
		const file = relative(resolved.resolvedFileName);
		if (fileSet.has(file)) result.add(file);
	}
	// TS can resolve a JS import to .d.ts: also retain its actual runtime implementation.
	const base = specifier.startsWith("@/") || specifier.startsWith("#/")
		? path.join(root, "src", specifier.slice(2))
		: specifier.startsWith(".") ? path.resolve(root, path.dirname(importer), specifier) : undefined;
	if (base) {
		for (const extension of ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", "/index.ts", "/index.tsx", "/index.js"]) {
			const file = relative(`${base}${extension}`);
			if (fileSet.has(file)) { result.add(file); break; }
		}
	}
	return [...result].sort();
}

const edges = [];
const unresolved = [];
const computedReferences = [];
const storeBarrelConsumers = [];
function add(from, specifier, kind, typeOnly = false) {
	const targets = resolve(specifier, from);
	for (const to of targets) edges.push({ from, to, kind, typeOnly, specifier, context: sourceKind(from) });
	if (!targets.length && /^(\.|@\/|#\/)/.test(specifier)) unresolved.push({ from, specifier, kind });
	return targets;
}

for (const file of sourceFiles) {
	const text = fs.readFileSync(path.join(root, file), "utf8");
	const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	function visit(node) {
		if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
			const typeOnly = node.importClause?.isTypeOnly || Boolean(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.every(item => item.isTypeOnly));
			const targets = add(file, node.moduleSpecifier.text, "import", Boolean(typeOnly));
			if (targets.includes("src/store/index.ts")) {
				const bindings = node.importClause?.namedBindings;
				storeBarrelConsumers.push({ from: file, names: bindings && ts.isNamedImports(bindings) ? bindings.elements.map(item => item.propertyName?.text ?? item.name.text) : [], unknown: !node.importClause || Boolean(node.importClause.name) || Boolean(bindings && ts.isNamespaceImport(bindings)) });
			}
		} else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
			add(file, node.moduleSpecifier.text, "reexport", node.isTypeOnly);
		} else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
			add(file, node.argument.literal.text, "import-type", true);
		} else if (ts.isCallExpression(node)) {
			const expression = node.expression.getText(ast);
			const kind = node.expression.kind === ts.SyntaxKind.ImportKeyword ? "dynamic-import" : expression === "require" ? "require" : /^(vi|jest)\.(mock|doMock|unmock|doUnmock|importActual|importMock)$/.test(expression) ? "test-reference" : undefined;
			if (kind) {
				const argument = node.arguments[0];
				if (argument && ts.isStringLiteralLike(argument)) {
					const targets = add(file, argument.text, kind);
					if (targets.includes("src/store/index.ts")) storeBarrelConsumers.push({ from: file, names: [], unknown: true });
				} else if (argument) computedReferences.push({ from: file, kind, expression: argument.getText(ast) });
			} else if (/import\.meta\.glob(?:Eager)?$/.test(expression)) {
				const argument = node.arguments[0];
				const patterns = argument && ts.isArrayLiteralExpression(argument) ? argument.elements : argument ? [argument] : [];
				for (const pattern of patterns) {
					if (!ts.isStringLiteralLike(pattern)) { computedReferences.push({ from: file, kind: "glob", expression: pattern.getText(ast) }); continue; }
					if (pattern.text.startsWith("!")) continue; // Conservative: negative patterns don't remove an edge.
					const glob = pattern.text.replace(/^[@#]\//, `${relative(path.join(root, "src"))}/`);
					const localGlob = /^(?:@\/|#\/)/.test(pattern.text) ? glob : relative(path.resolve(root, path.dirname(file), glob));
					for (const match of fs.globSync(localGlob, { cwd: root })) if (fileSet.has(match.replaceAll("\\", "/"))) edges.push({ from: file, to: match.replaceAll("\\", "/"), kind: "glob", typeOnly: false, specifier: pattern.text, context: sourceKind(file) });
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(ast);
	for (const reference of ast.referencedFiles) add(file, reference.fileName, "reference", true);
}

if (fileSet.has("index.html")) {
	const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
	for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
		const target = match[1].replace(/^\//, "");
		if (fileSet.has(target)) edges.push({ from: "index.html", to: target, kind: "entry", typeOnly: false, specifier: match[1], context: "production" });
	}
}
edges.sort((a, b) => {
	const left = JSON.stringify(a), right = JSON.stringify(b);
	return left < right ? -1 : left > right ? 1 : 0;
});
const uniqueEdges = edges.filter((edge, index) => index === 0 || JSON.stringify(edge) !== JSON.stringify(edges[index - 1]));
const nodes = [...new Set([...sourceFiles, "index.html", ...uniqueEdges.map(edge => edge.to)])].sort().map(file => ({ file, context: sourceKind(file), routeGeneration: routeProtected(file) }));
const roots = {
	production: ["index.html", ...sourceFiles.filter(file => routeProtected(file) || (file.startsWith("server/") && !isTest(file)))],
	test: sourceFiles.filter(isTest),
	tooling: sourceFiles.filter(file => sourceKind(file) === "tooling"),
};
function reachable(entryPoints) {
	const result = new Set(entryPoints);
	const pending = [...entryPoints];
	while (pending.length) {
		const from = pending.pop();
		for (const edge of uniqueEdges) if (edge.from === from && !result.has(edge.to)) { result.add(edge.to); pending.push(edge.to); }
	}
	return result;
}
const productionReachable = reachable(roots.production), testReachable = reachable(roots.test);
const candidates = [
	"src/app/router.tsx", "src/app/providers.tsx", "src/layouts/MainLayout/MainLayout.tsx",
	"src/layouts/MainLayout/Sidebar.tsx", "src/layouts/MainLayout/Workspace.tsx",
	"src/store/bind.store.ts", "src/types/bind.ts", "src/shared/lib/seed.ts",
	"src/services/ai-future.service.ts", "src/features/ai/translator/translator.service.ts",
	...files.filter(file => /^src\/entities\/.*(?:\/mock\/|\/mock\.)/.test(file)),
].filter((file, index, all) => all.indexOf(file) === index).sort();
const candidateAudit = candidates.map(file => {
	const incoming = uniqueEdges.filter(edge => edge.to === file);
	return {
		file, exists: fileSet.has(file), routeGeneration: routeProtected(file),
		productionReachable: productionReachable.has(file), testReachable: testReachable.has(file),
		productionImports: incoming.filter(edge => edge.context === "production").length,
		testImports: incoming.filter(edge => edge.context === "test").length,
		toolingImports: incoming.filter(edge => edge.context === "tooling").length,
		incoming,
		zeroImports: incoming.length === 0,
	};
});
const graph = { version: 1, roots, nodes, edges: uniqueEdges, unresolved, computedReferences, storeBarrelConsumers, candidateAudit };
const nodeIds = new Map(nodes.map((node, index) => [node.file, index]));
const compact = {
	version: 1,
	nodeFields: ["file", "context", "routeGeneration"],
	edgeFields: ["fromNodeIndex", "toNodeIndex", "kind", "typeOnly"],
	nodes: nodes.map(node => [node.file, node.context, node.routeGeneration]),
	edges: uniqueEdges.map(edge => [nodeIds.get(edge.from), nodeIds.get(edge.to), edge.kind, edge.typeOnly]),
	roots: Object.fromEntries(Object.entries(roots).map(([kind, entries]) => [kind, entries.map(file => nodeIds.get(file))])),
	unresolved,
	computedReferences,
};
const output = process.argv.includes("--compact") ? compact : process.argv.includes("--summary") ? { nodes: nodes.length, edges: uniqueEdges.length, unresolved, computedReferences, storeBarrelConsumers, candidateAudit } : graph;
process.stdout.write(JSON.stringify(output, null, process.argv.includes("--compact") ? 0 : 2) + "\n");
