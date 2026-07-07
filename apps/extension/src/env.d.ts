interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly WXT_ALLOW_INSECURE_API?: string;
  readonly WXT_PUBLIC_PARTY_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
