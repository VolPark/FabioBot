/**
 * PowerBI Workspace Manager Skill for OpenClaw
 *
 * Provides workspace overview and management capabilities.
 */

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Missing Azure AD credentials. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in .env"
    );
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
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new Error(
        `Azure AD authentication failed (${status}). Check AZURE_CLIENT_SECRET — it may have expired.`
      );
    }
    throw new Error(`Azure AD token error (${status}). Check your Azure AD credentials in .env`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function apiRequest(method, path, retries = 2) {
  const token = await getAccessToken();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(`https://api.fabric.microsoft.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    const status = response.status;

    // Retry on transient errors
    if ((status === 429 || status >= 500) && attempt < retries) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      continue;
    }

    if (status === 403) {
      throw new Error(
        `Access denied (403) to ${path}. The Service Principal may not have workspace permissions. ` +
        "Add it as Admin/Member in the Power BI workspace settings."
      );
    }
    if (status === 404) {
      throw new Error(`Resource not found (404): ${path}. Check the workspace ID in .env`);
    }
    if (status === 429) {
      throw new Error("Rate limit exceeded (429). Wait a moment and try again.");
    }
    const error = await response.text();
    throw new Error(`API error (${status}) on ${method} ${path}: ${error.substring(0, 200)}`);
  }
}

module.exports = {
  get_workspace_info: async () => {
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    if (!workspaceId) {
      return JSON.stringify({ error: "POWERBI_WORKSPACE_ID not configured in .env" });
    }
    const result = await apiRequest("GET", `/workspaces/${workspaceId}`);
    return JSON.stringify(result, null, 2);
  },

  list_workspace_items: async ({ item_type } = {}) => {
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    if (!workspaceId) {
      return JSON.stringify({ error: "POWERBI_WORKSPACE_ID not configured in .env" });
    }
    let path = `/workspaces/${workspaceId}/items`;
    if (item_type) {
      path += `?type=${item_type}`;
    }
    const result = await apiRequest("GET", path);
    return JSON.stringify(result.value || result, null, 2);
  },

  get_report_pages: async ({ report_id }) => {
    if (!report_id) {
      return JSON.stringify({ error: "report_id is required" });
    }
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    const token = await getAccessToken();

    const response = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${report_id}/pages`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 404) {
        throw new Error(`Report not found (404). Check that the report_id '${report_id}' is correct.`);
      }
      if (status === 403) {
        throw new Error("Access denied (403). The Service Principal may not have access to this report.");
      }
      throw new Error(`Failed to get report pages (${status})`);
    }

    const data = await response.json();
    return JSON.stringify(data.value, null, 2);
  },
};
