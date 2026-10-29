# Browser CAD dependencies

The application remains AGPL-3.0. The static build bundles these unmodified npm distributions, pinned by `package-lock.json`:

* `replicad` 1.2.0, MIT. [Source and build instructions](https://github.com/sgenoud/replicad). Its license is copied to `lib/cad/LICENSE-replicad` in the website.
* `replicad-opencascadejs` 1.1.0, LGPL-2.1-only. [Corresponding source/build package](https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs), [npm distribution](https://www.npmjs.com/package/replicad-opencascadejs/v/1.1.0). Its license is copied to `lib/cad/LICENSE-replicad-opencascadejs`.

The loader and WebAssembly are separate, replaceable files under `lib/cad/`. Rebuild with `npm ci && npm run build`; to use a modified kernel, replace the package/build inputs and rebuild. The repository contains the integration source and lockfile. The existing Manifold, Three.js and JSZip notices remain in the original README and `lib/`.
