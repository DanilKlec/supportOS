import { relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

// Inspect the real production output, including transitive static imports.
// No manualChunks, extra dependencies, source maps or changes to query defaults.
const screenPattern = /src\/features\/(?:admin\/(?:AdminWorkspace|AIControlCenter|pages\/PlatformPages)|qc\/(?:QCWorkspace|QualityPages)|accounts\/AccountsPanel|bonuses\/(?:BonusToolsPage|DepositBonusesPage|deposit-bonuses\/BonusEditor)|project-emails\/ProjectEmailsPage|shared-binds\/SharedBindsPage)\.tsx(?:\?|$)/;
let report;
await build({
 logLevel: 'warn',
 build: { manifest: true },
 plugins: [{
  name: 'supportos-bundle-audit',
  writeBundle(_options, bundle) {
   const chunks = Object.values(bundle).filter(output => output.type === 'chunk');
   const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
   const initial = new Set();
   function visit(name, closure = initial) {
    if (closure.has(name)) return;
    closure.add(name);
    for (const dependency of byName.get(name)?.imports ?? []) visit(dependency, closure);
   }
   for (const chunk of chunks.filter(chunk => chunk.isEntry)) visit(chunk.fileName);
   // The home component is itself auto-split by TanStack. It still belongs to
   // first render of /, even though it is not in the entry's static closure.
   const homeRouteChunks = chunks.filter(chunk => Object.keys(chunk.modules).some(id =>
    /\/src\/routes\/index\.tsx\?tsr-split=/.test(id.replaceAll('\\','/')),
   )).map(chunk => chunk.fileName);
   const homeInitial = new Set(initial);
   for (const name of homeRouteChunks) visit(name, homeInitial);
   const moduleRows = chunks.flatMap(chunk => Object.entries(chunk.modules)
    .filter(([,info]) => info.renderedLength > 0)
    .map(([id,info]) => ({
     id: relative(process.cwd(),id).replaceAll('\\','/'),
     renderedBytes: info.renderedLength,
     chunk: chunk.fileName,
     initial: initial.has(chunk.fileName),
     homeInitial: homeInitial.has(chunk.fileName),
    })));
   const chunkRows = chunks.map(chunk => ({
    file: chunk.fileName,
    bytes: Buffer.byteLength(chunk.code),
    gzipBytes: gzipSync(chunk.code).length,
    initial: initial.has(chunk.fileName),
    homeInitial: homeInitial.has(chunk.fileName),
    imports: chunk.imports,
    dynamicImports: chunk.dynamicImports,
   })).sort((a,b) => b.bytes-a.bytes);
   report = {
    // JS entry closure only: excludes CSS and route/section dynamic imports.
    initialBytes: chunkRows.filter(chunk => chunk.initial).reduce((sum,chunk) => sum+chunk.bytes,0),
    initialGzipBytes: chunkRows.filter(chunk => chunk.initial).reduce((sum,chunk) => sum+chunk.gzipBytes,0),
    homeRouteChunks,
    homeInitialBytes: chunkRows.filter(chunk => chunk.homeInitial).reduce((sum,chunk) => sum+chunk.bytes,0),
    homeInitialGzipBytes: chunkRows.filter(chunk => chunk.homeInitial).reduce((sum,chunk) => sum+chunk.gzipBytes,0),
    chunks: chunkRows,
    screenModules: moduleRows.filter(module => screenPattern.test(module.id)),
    largestInitialModules: moduleRows.filter(module => module.initial)
     .sort((a,b) => b.renderedBytes-a.renderedBytes).slice(0,30),
   };
  },
 }],
});
console.log(JSON.stringify(report,null,2));
if (process.argv.includes('--check') && (!report.homeRouteChunks.length || report.screenModules.some(module => module.homeInitial))) {
 console.error('Home route chunk not found, or large management screens are reachable from its first-render graph.');
 process.exitCode = 1;
}
