const pagesBase = '/lazydoooog/';
export default ({ command }) => ({
  base: pagesBase,
  plugins: command === 'build' ? [{
    name: 'github-pages-public-paths',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0];
      if (!cleanId.includes('/src/') || !/\.(?:js|json)$/.test(cleanId) || !code.includes('/assets/')) return null;
      return code.replaceAll('/assets/', `${pagesBase}assets/`);
    },
  }] : [],
  // Pre-bundle the lazy Hero's addons before its first request can invalidate the dependency graph.
  optimizeDeps: {
    include: [
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/geometries/RoundedBoxGeometry.js',
    ],
  },
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      input: { main: 'index.html', studio: 'studio.html', prototype: 'prototype.html', v3: 'v3.html' },
    },
  },
});
