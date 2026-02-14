/**
 * Email Manager Skill for OpenClaw
 *
 * Reads and sends emails via Microsoft Graph API
 * using Azure AD service principal (application permissions).
 *
 * Required Azure AD permissions (Application):
 *   - Mail.ReadWrite
 *   - Mail.Send
 */

const EMAIL_USER = process.env.EMAIL_USER || "fabio@sebit.cz";

let tokenCache = { token: null, expiresAt: 0 };

async function getGraphToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
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
    const error = await response.text();
    throw new Error(`Graph token error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function graphRequest(method, path, body) {
  const token = await getGraphToken();
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

  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph API error: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function parseRecipients(str) {
  return str
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ emailAddress: { address: email } }));
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMessage(msg) {
  const preview = msg.bodyPreview || stripHtml(msg.body?.content || "").slice(0, 200);
  return {
    id: msg.id,
    subject: msg.subject,
    from: msg.from?.emailAddress?.address || "unknown",
    date: msg.receivedDateTime,
    isRead: msg.isRead,
    preview,
    hasAttachments: msg.hasAttachments,
  };
}

module.exports = {
  read_inbox: async ({ count, unread_only } = {}) => {
    const top = Math.min(count || 10, 50);
    let filter = "";
    if (unread_only) {
      filter = "&$filter=isRead eq false";
    }

    const result = await graphRequest(
      "GET",
      `/users/${EMAIL_USER}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,hasAttachments${filter}`
    );

    const messages = (result.value || []).map(formatMessage);
    return JSON.stringify(messages, null, 2);
  },

  read_email: async ({ message_id }) => {
    const msg = await graphRequest(
      "GET",
      `/users/${EMAIL_USER}/messages/${message_id}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,body,hasAttachments`
    );

    const formatted = {
      id: msg.id,
      subject: msg.subject,
      from: msg.from?.emailAddress?.address,
      to: (msg.toRecipients || []).map((r) => r.emailAddress.address),
      cc: (msg.ccRecipients || []).map((r) => r.emailAddress.address),
      date: msg.receivedDateTime,
      body: stripHtml(msg.body?.content || ""),
      bodyHtml: msg.body?.content,
      hasAttachments: msg.hasAttachments,
    };

    // Mark as read
    await graphRequest("PATCH", `/users/${EMAIL_USER}/messages/${message_id}`, {
      isRead: true,
    }).catch(() => {});

    return JSON.stringify(formatted, null, 2);
  },

  send_email: async ({ to, subject, body, cc }) => {
    const message = {
      message: {
        subject,
        body: {
          contentType: body.includes("<") ? "HTML" : "Text",
          content: body,
        },
        toRecipients: parseRecipients(to),
      },
      saveToSentItems: true,
    };

    if (cc) {
      message.message.ccRecipients = parseRecipients(cc);
    }

    await graphRequest("POST", `/users/${EMAIL_USER}/sendMail`, message);

    return JSON.stringify({
      status: "sent",
      to,
      subject,
      cc: cc || null,
    });
  },

  reply_to_email: async ({ message_id, body, reply_all }) => {
    const endpoint = reply_all ? "replyAll" : "reply";

    await graphRequest(
      "POST",
      `/users/${EMAIL_USER}/messages/${message_id}/${endpoint}`,
      {
        comment: body,
      }
    );

    return JSON.stringify({
      status: "replied",
      message_id,
      reply_all: !!reply_all,
    });
  },

  search_emails: async ({ query, count }) => {
    const top = Math.min(count || 10, 50);

    const result = await graphRequest(
      "GET",
      `/users/${EMAIL_USER}/messages?$search="${encodeURIComponent(query)}"&$top=${top}&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,hasAttachments`
    );

    const messages = (result.value || []).map(formatMessage);
    return JSON.stringify(messages, null, 2);
  },
};
