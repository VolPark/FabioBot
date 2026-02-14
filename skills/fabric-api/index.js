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

module.exports = {
  fabric_api_call: async ({ method, path, body }) => {
    const token = await getAccessToken();

    const options = {
      method: method.toUpperCase(),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      options.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(
      `https://api.fabric.microsoft.com/v1${path}`,
      options
    );

    const text = await response.text();
    const result = {
      status: response.status,
      statusText: response.statusText,
      data: text ? JSON.parse(text) : null,
    };

    return JSON.stringify(result, null, 2);
  },
};
