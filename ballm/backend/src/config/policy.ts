/**
 * Statements delivered to the client with the remote config.
 *
 * Managed policy outranks these, so this list is the baseline for unmanaged machines. Keep it in
 * sync with ballm/managed/*.
 */
export function policies() {
  return [
    { action: "provider.use", resource: "*", effect: "deny" },
    { action: "provider.use", resource: "ballm", effect: "allow" },

    { action: "integration.connect", resource: "*", effect: "deny" },
    { action: "integration.connect", resource: "ballm", effect: "allow" },

    { action: "integration.use", resource: "*", effect: "deny" },
    { action: "integration.use", resource: "ballm*", effect: "allow" },

    { action: "mcp.use", resource: "*", effect: "deny" },
    { action: "mcp.use", resource: "ballm-*", effect: "allow" },

    { action: "websearch.use", resource: "*", effect: "deny" },

    { action: "plugin.use", resource: "*", effect: "deny" },
  ] as const
}
