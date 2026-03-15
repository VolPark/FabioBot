/**
 * Bot Status / Health Monitoring Skill for OpenClaw
 *
 * Checks Azure AD auth, Fabric API connectivity, and workspace status.
 * Useful for diagnosing issues from Telegram.
 */

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) {
    return { token: tokenCache.token, cached: true, expiresIn: Math.floor((tokenCache.expiresAt - now) / 1000) };
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Azure AD credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://analysis.windows.net/powerbi/api/.default",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure AD authentication failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return { token: data.access_token, cached: false, expiresIn: data.expires_in };
}

module.exports = {
  /**
   * Comprehensive health check
   */
  check_health: async () => {
    const result = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: {},
      warnings: [],
    };

    // Check 1: Environment variables
    const requiredEnv = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "POWERBI_WORKSPACE_ID"];
    const missingEnv = requiredEnv.filter((key) => !process.env[key]);
    if (missingEnv.length > 0) {
      result.status = "unhealthy";
      result.checks.environment = {
        status: "FAIL",
        message: `Missing environment variables: ${missingEnv.join(", ")}`,
      };
    } else {
      result.checks.environment = { status: "OK", message: "All required variables set" };
    }

    // Check 2: Azure AD authentication
    try {
      const start = Date.now();
      const tokenResult = await getAccessToken();
      const elapsed = Date.now() - start;
      const expiresInMin = Math.floor(tokenResult.expiresIn / 60);
      result.checks.azure_auth = {
        status: "OK",
        message: tokenResult.cached
          ? `Token valid (expires in ~${expiresInMin} min, cached)`
          : `Token acquired (${elapsed} ms, expires in ${expiresInMin} min)`,
      };
    } catch (err) {
      result.status = "unhealthy";
      result.checks.azure_auth = {
        status: "FAIL",
        message: err.message,
        hint: "Check AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in .env",
      };
    }

    // Check 3: Fabric API connectivity
    if (result.checks.azure_auth?.status === "OK") {
      try {
        const start = Date.now();
        const tokenResult = await getAccessToken();
        const workspaceId = process.env.POWERBI_WORKSPACE_ID;
        const response = await fetch(
          `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}`,
          {
            headers: { Authorization: `Bearer ${tokenResult.token}` },
          }
        );
        const elapsed = Date.now() - start;

        if (response.ok) {
          const data = await response.json();
          result.checks.fabric_api = {
            status: "OK",
            message: `Connected (${elapsed} ms) — Workspace: ${data.displayName || workspaceId}`,
          };
        } else if (response.status === 403) {
          result.status = "degraded";
          result.checks.fabric_api = {
            status: "FAIL",
            message: `Access denied (403) — Service Principal may not have workspace permissions`,
            hint: "Add the Service Principal to the Power BI workspace as Admin/Member",
          };
        } else {
          result.status = "degraded";
          result.checks.fabric_api = {
            status: "FAIL",
            message: `HTTP ${response.status} from Fabric API`,
          };
        }
      } catch (err) {
        result.status = "degraded";
        result.checks.fabric_api = {
          status: "FAIL",
          message: `Network error: ${err.message}`,
          hint: "Check internet connectivity on the Oracle VM",
        };
      }
    } else {
      result.checks.fabric_api = { status: "SKIP", message: "Skipped (Azure auth failed)" };
    }

    // Check 4: Model set
    const model = process.env.DEFAULT_MODEL || process.env.ANTHROPIC_MODEL;
    if (!model) {
      result.warnings.push("DEFAULT_MODEL not set — OpenClaw will use its default model");
    } else {
      result.checks.llm_model = { status: "OK", message: `Configured: ${model}` };
    }

    if (result.warnings.length === 0) delete result.warnings;

    return JSON.stringify(result, null, 2);
  },

  /**
   * Workspace item summary
   */
  get_workspace_summary: async () => {
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    if (!workspaceId) {
      return JSON.stringify({ error: "POWERBI_WORKSPACE_ID not configured" });
    }

    const tokenResult = await getAccessToken();
    const response = await fetch(
      `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/items`,
      { headers: { Authorization: `Bearer ${tokenResult.token}` } }
    );

    if (!response.ok) {
      const err = await response.text();
      return JSON.stringify({
        error: `Failed to list workspace items (${response.status})`,
        details: err,
      });
    }

    const data = await response.json();
    const items = data.value || [];

    const counts = {};
    for (const item of items) {
      const type = item.type || "Unknown";
      counts[type] = (counts[type] || 0) + 1;
    }

    return JSON.stringify({
      workspace_id: workspaceId,
      workspace_name: process.env.POWERBI_WORKSPACE_NAME || "N/A",
      total_items: items.length,
      by_type: counts,
      timestamp: new Date().toISOString(),
    }, null, 2);
  },

  /**
   * Bot configuration info
   */
  get_bot_info: async () => {
    const info = {
      name: "FabioBot",
      version: "1.0.0",
      runtime: "OpenClaw",
      configuration: {
        workspace_id: process.env.POWERBI_WORKSPACE_ID || "not set",
        workspace_name: process.env.POWERBI_WORKSPACE_NAME || "not set",
        llm_model: process.env.DEFAULT_MODEL || process.env.ANTHROPIC_MODEL || "default",
        azure_tenant: process.env.AZURE_TENANT_ID
          ? `${process.env.AZURE_TENANT_ID.substring(0, 8)}...`
          : "not set",
        azure_client: process.env.AZURE_CLIENT_ID
          ? `${process.env.AZURE_CLIENT_ID.substring(0, 8)}...`
          : "not set",
      },
      skills: [
        "powerbi-report-builder",
        "powerbi-workspace-manager",
        "fabric-api",
        "powerbi-news-tracker",
        "bot-status",
      ],
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(info, null, 2);
  },
};
