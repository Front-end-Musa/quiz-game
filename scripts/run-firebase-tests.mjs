import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Verify the operator seed and its repeatability against emulators before Rules tests reset data.
for (let attempt = 0; attempt < 2; attempt++) {
  const seed = spawnSync(process.execPath, ['scripts/seed-firestore.mjs', '--emulator', '--host-email=host@example.com'], { stdio: 'inherit' });
  if (seed.status !== 0) process.exit(seed.status ?? 1);
}
await build({ entryPoints: ['tests/firebase.integration.ts'], outfile: '.firebase/tests/integration.mjs',
  bundle: true, platform: 'node', format: 'esm', packages: 'external', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'emulator-environment', setup(builder) {
    builder.onResolve({ filter: /environments\/environment$/ }, () => ({ path: resolve('src/environments/environment.emulator.ts') }));
  } }],
});
const result = spawnSync(process.execPath, ['--test', '.firebase/tests/integration.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
