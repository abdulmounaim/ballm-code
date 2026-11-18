/**
 * User-visible product identity for the Ballm Code distribution.
 *
 * Only presentation changes here. Package names, environment variables, config/data directories,
 * server registration, and the bundled `opencode-cli` binary stay OpenCode-named on purpose so the
 * fork remains mergeable and the Ballm integration keeps working.
 */
export const Brand = {
  name: "Ballm Code",
  devName: "Ballm Code Dev",
  shortName: "Ballm",
  appID: {
    dev: "com.ballm.code.dev",
    beta: "com.ballm.code.beta",
    prod: "com.ballm.code",
  },
  protocol: "ballm",
  linuxExecutable: "ballm-code",
  website: "https://code.ballm.internal",
  docs: "https://code.ballm.internal/docs",
  support: "https://code.ballm.internal/support",
  feedback: "https://code.ballm.internal/feedback",
  legalName: "Ballm",
  copyright: "© 2026 Ballm",
  update: {
    provider: "generic",
    urls: {
      dev: "https://updates.ballm.internal/desktop/dev/",
      beta: "https://updates.ballm.internal/desktop/beta/",
      prod: "https://updates.ballm.internal/desktop/prod/",
    },
  },
  cli: {
    command: "ballm",
    installDir: ".ballm",
    bundledBinary: "opencode-cli",
  },
  attribution: {
    name: "OpenCode",
    url: "https://github.com/anomalyco/opencode",
    license: "MIT",
    notice: "Built on OpenCode, © Anomaly Innovations, Inc., MIT licensed.",
  },
} as const

export type BrandChannel = keyof typeof Brand.appID
