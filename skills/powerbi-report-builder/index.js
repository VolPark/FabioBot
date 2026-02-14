/**
 * PowerBI Report Builder Skill for OpenClaw
 *
 * Creates Power BI reports from existing semantic models via Fabric REST API.
 * Uses Azure AD Service Principal authentication.
 */

const https = require("https");

// Azure AD token cache
let tokenCache = { token: null, expiresAt: 0 };

/**
 * Get Azure AD access token for Power BI API
 */
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
    const error = await response.text();
    throw new Error(`Azure AD token error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Make an authenticated request to the Fabric/Power BI REST API
 */
async function fabricApiRequest(method, path, body = null) {
  const token = await getAccessToken();
  const baseUrl = "https://api.fabric.microsoft.com/v1";

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Fabric API error: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * List all semantic models in the workspace
 */
async function listSemanticModels() {
  const workspaceId = process.env.POWERBI_WORKSPACE_ID;
  if (!workspaceId) {
    throw new Error("POWERBI_WORKSPACE_ID not configured");
  }

  const result = await fabricApiRequest(
    "GET",
    `/workspaces/${workspaceId}/semanticModels`
  );

  return result.value.map((model) => ({
    id: model.id,
    name: model.displayName,
    description: model.description || "",
  }));
}

/**
 * Get semantic model schema (tables, columns, measures, relationships)
 */
async function getSemanticModelSchema(semanticModelId) {
  const workspaceId = process.env.POWERBI_WORKSPACE_ID;

  // Get model definition via XMLA or REST API
  const definition = await fabricApiRequest(
    "POST",
    `/workspaces/${workspaceId}/semanticModels/${semanticModelId}/getDefinition`
  );

  return definition;
}

/**
 * Create a new report from a semantic model
 */
async function createReport(semanticModelId, reportName, reportDefinition) {
  const workspaceId = process.env.POWERBI_WORKSPACE_ID;

  // Build PBIR definition pointing to the semantic model
  const pbirDefinition = {
    version: "4.0",
    datasetReference: {
      byPath: null,
      byConnection: {
        connectionString: null,
        pbiServiceModelId: null,
        pbiModelVirtualServerName: "sobe_wowvirtualserver",
        pbiModelDatabaseName: semanticModelId,
        name: "EntityDataSource",
        connectionType: "pbiServiceXmlaStyleLive",
      },
    },
  };

  // Base64 encode the definitions
  const pbirPayload = Buffer.from(JSON.stringify(pbirDefinition)).toString(
    "base64"
  );
  const reportPayload = Buffer.from(reportDefinition).toString("base64");

  const platformConfig = {
    $schema:
      "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
    metadata: {
      type: "Report",
      displayName: reportName,
    },
    config: {
      version: "2.0",
      logicalId: crypto.randomUUID(),
    },
  };
  const platformPayload = Buffer.from(JSON.stringify(platformConfig)).toString(
    "base64"
  );

  const body = {
    displayName: reportName,
    description: `Auto-generated report from semantic model by FabioBot`,
    definition: {
      parts: [
        {
          path: "definition.pbir",
          payload: pbirPayload,
          payloadType: "InlineBase64",
        },
        {
          path: "report.json",
          payload: reportPayload,
          payloadType: "InlineBase64",
        },
        {
          path: ".platform",
          payload: platformPayload,
          payloadType: "InlineBase64",
        },
      ],
    },
  };

  const result = await fabricApiRequest(
    "POST",
    `/workspaces/${workspaceId}/reports`,
    body
  );

  return {
    id: result.id,
    name: result.displayName,
    webUrl: `https://app.fabric.microsoft.com/groups/${workspaceId}/reports/${result.id}`,
  };
}

/**
 * List all reports in the workspace
 */
async function listReports() {
  const workspaceId = process.env.POWERBI_WORKSPACE_ID;
  const result = await fabricApiRequest(
    "GET",
    `/workspaces/${workspaceId}/reports`
  );

  return result.value.map((report) => ({
    id: report.id,
    name: report.displayName,
    description: report.description || "",
  }));
}

// Export skill handlers
module.exports = {
  list_semantic_models: async () => {
    const models = await listSemanticModels();
    return JSON.stringify(models, null, 2);
  },

  get_semantic_model_schema: async ({ semantic_model_id }) => {
    const schema = await getSemanticModelSchema(semantic_model_id);
    return JSON.stringify(schema, null, 2);
  },

  create_report: async ({ semantic_model_id, report_name, report_definition }) => {
    const result = await createReport(
      semantic_model_id,
      report_name,
      report_definition
    );
    return JSON.stringify(result, null, 2);
  },

  list_reports: async () => {
    const reports = await listReports();
    return JSON.stringify(reports, null, 2);
  },
};
