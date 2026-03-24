/// <reference types="vite/client" />

declare module "*.geo.json" {
  const value: GeoJSON.FeatureCollection;
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
