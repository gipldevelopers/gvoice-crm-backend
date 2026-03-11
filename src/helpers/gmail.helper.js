const { google } = require("googleapis");

const getGmailClient = (auth) => {
  return google.gmail({ version: "v1", auth });
};

const getHeaderValue = (headers = [], name) => {
  const header = headers.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
};

const decodeBase64Url = (value = "") => {
  if (!value) return "";
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
};

const extractBodyContent = (payload) => {
  if (!payload) return { html: "", text: "" };

  const walk = (part) => {
    if (!part) return { html: "", text: "" };

    if (part.mimeType === "text/html" && part.body?.data) {
      return { html: decodeBase64Url(part.body.data), text: "" };
    }

    if (part.mimeType === "text/plain" && part.body?.data) {
      return { html: "", text: decodeBase64Url(part.body.data) };
    }

    const parts = part.parts || [];
    let bestHtml = "";
    let bestText = "";

    for (const child of parts) {
      const result = walk(child);
      if (!bestHtml && result.html) bestHtml = result.html;
      if (!bestText && result.text) bestText = result.text;
      if (bestHtml && bestText) break;
    }

    return { html: bestHtml, text: bestText };
  };

  return walk(payload);
};

const mapFullMessage = (message = {}) => {
  const headers = message.payload?.headers || [];
  const body = extractBodyContent(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet || "",
    subject: getHeaderValue(headers, "Subject"),
    from: getHeaderValue(headers, "From"),
    to: getHeaderValue(headers, "To"),
    cc: getHeaderValue(headers, "Cc"),
    date: getHeaderValue(headers, "Date"),
    htmlBody: body.html || "",
    textBody: body.text || "",
  };
};

const listMessages = async (auth, options = {}) => {
  const { maxResults = null, labelIds = [], pageToken = null, paginated = false } = options;
  const gmail = getGmailClient(auth);
  const messageRefs = [];
  let nextToken = pageToken;

  if (paginated) {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: maxResults || 10,
      pageToken: pageToken || undefined,
      ...(labelIds.length ? { labelIds } : {}),
    });
    messageRefs.push(...(listResponse.data.messages || []));
    nextToken = listResponse.data.nextPageToken || null;

    if (!messageRefs.length) {
      return { messages: [], nextPageToken: nextToken };
    }

    const messages = await Promise.all(
      messageRefs.map(async (messageRef) => {
        const detailResponse = await gmail.users.messages.get({
          userId: "me",
          id: messageRef.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });

        const headers = detailResponse.data.payload?.headers || [];
        return {
          id: detailResponse.data.id,
          threadId: detailResponse.data.threadId,
          snippet: detailResponse.data.snippet || "",
          from: getHeaderValue(headers, "From"),
          to: getHeaderValue(headers, "To"),
          subject: getHeaderValue(headers, "Subject"),
          date: getHeaderValue(headers, "Date"),
        };
      })
    );

    return { messages, nextPageToken: nextToken };
  }

  do {
    const requestMax = maxResults
      ? Math.min(100, Math.max(1, maxResults - messageRefs.length))
      : 100;

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: requestMax,
      pageToken: nextToken || undefined,
      ...(labelIds.length ? { labelIds } : {}),
    });

    messageRefs.push(...(listResponse.data.messages || []));
    nextToken = listResponse.data.nextPageToken || null;

    if (maxResults && messageRefs.length >= maxResults) {
      break;
    }
  } while (nextToken);

  if (!messageRefs.length) return { messages: [], nextPageToken: null };

  const messages = await Promise.all(
    messageRefs.map(async (messageRef) => {
      const detailResponse = await gmail.users.messages.get({
        userId: "me",
        id: messageRef.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = detailResponse.data.payload?.headers || [];
      return {
        id: detailResponse.data.id,
        threadId: detailResponse.data.threadId,
        snippet: detailResponse.data.snippet || "",
        from: getHeaderValue(headers, "From"),
        to: getHeaderValue(headers, "To"),
        subject: getHeaderValue(headers, "Subject"),
        date: getHeaderValue(headers, "Date"),
      };
    })
  );

  return { messages, nextPageToken: null };
};

const sendEmail = async (auth, to, subject, message) => {
  const gmail = getGmailClient(auth);
  const rawEmail = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message}`
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: rawEmail,
    },
  });

  return response.data;
};

const getMessageWithThread = async (auth, messageId) => {
  const gmail = getGmailClient(auth);

  const messageResponse = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = messageResponse.data;
  const threadResponse = await gmail.users.threads.get({
    userId: "me",
    id: message.threadId,
    format: "full",
  });

  const threadMessages = (threadResponse.data.messages || []).map(mapFullMessage);
  const currentMessage = mapFullMessage(message);

  return {
    message: currentMessage,
    thread: threadMessages,
  };
};

module.exports = {
  getGmailClient,
  listMessages,
  sendEmail,
  getMessageWithThread,
};
