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

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope: "https://analysis.windows.net/powerbi/api/.default",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Token error: ${response.status}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function apiRequest(method, path) {
  const token = await getAccessToken();
  const response = await fetch(`https://api.fabric.microsoft.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

module.exports = {
  get_workspace_info: async () => {
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    const result = await apiRequest("GET", `/workspaces/${workspaceId}`);
    return JSON.stringify(result, null, 2);
  },

  list_workspace_items: async ({ item_type } = {}) => {
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    let path = `/workspaces/${workspaceId}/items`;
    if (item_type) {
      path += `?type=${item_type}`;
    }
    const result = await apiRequest("GET", path);
    return JSON.stringify(result.value || result, null, 2);
  },

  get_report_pages: async ({ report_id }) => {
    const workspaceId = process.env.POWERBI_WORKSPACE_ID;
    // Use Power BI REST API for report pages
    const token = await getAccessToken();
    const response = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/reports/${report_id}/pages`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return JSON.stringify(data.value, null, 2);
  },
};
