/**
 * Fabric API Skill for OpenClaw
 *
 * Generic wrapper for Microsoft Fabric REST API calls.
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

module.exports = {
  fabric_api_call: async ({ method, path, body }) => {
    if (!method) return JSON.stringify({ error: "method is required (GET, POST, PUT, PATCH, DELETE)" });
    if (!path) return JSON.stringify({ error: "path is required (e.g. /workspaces/{id}/items)" });

    const token = await getAccessToken();
    const upperMethod = method.toUpperCase();

    const options = {
      method: upperMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (body && ["POST", "PUT", "PATCH"].includes(upperMethod)) {
      options.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(
      `https://api.fabric.microsoft.com/v1${path}`,
      options
    );

    let data = null;
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const result = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      data,
    };

    if (!response.ok) {
      const status = response.status;
      let hint = "";
      if (status === 401) hint = "Token rejected — try the request again or check Azure credentials.";
      else if (status === 403) hint = "Access denied — Service Principal may lack workspace permissions.";
      else if (status === 404) hint = "Resource not found — verify the path and IDs.";
      else if (status === 429) hint = "Rate limited — wait a moment before retrying.";
      result.hint = hint;
    }

    return JSON.stringify(result, null, 2);
  },
};
