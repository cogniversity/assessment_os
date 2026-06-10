/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTEXT_ROOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
