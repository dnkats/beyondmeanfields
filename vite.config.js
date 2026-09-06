import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.BASE_PATH || '/',   // the Pages workflow builds with BASE_PATH=/beyondmeanfields/
  optimizeDeps: { include: ['three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/loaders/DRACOLoader.js', 'three/addons/loaders/FBXLoader.js', 'three/addons/loaders/HDRLoader.js', 'three/addons/utils/SkeletonUtils.js',
    'three/addons/postprocessing/EffectComposer.js', 'three/addons/postprocessing/RenderPass.js', 'three/addons/postprocessing/GTAOPass.js', 'three/addons/postprocessing/UnrealBloomPass.js',
    'three/addons/postprocessing/OutputPass.js', 'three/addons/postprocessing/SMAAPass.js'] },
  server: { port: 5173 },
});
