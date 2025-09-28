/// <reference types="@react-three/fiber" />
/// <reference types="three" />

// Augment JSX intrinsic elements if needed (usually provided by @react-three/fiber types)

// Extend import.meta.env for custom build-time variables
interface ImportMetaEnv {
  readonly VITE_BUILD_TIME: string
  readonly VITE_GIT_COMMIT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export {}