import { callSlackApi } from "eve/channels/slack";
import { createSendblueAdapter } from "chat-adapter-sendblue";
import { getPhoneLinkForAppUser } from "./phone-links";
import { getSlackLinkForAppUser } from "./slack-links";

export interface HumanNotificationAttempt {
  channel: "web" | "slack" | "imessage";
  status: "available" | "sent" | "skipped" | "failed";
  detail?: string;
}

function appOrigin() {
  return (process.env.BETTER_AUTH_URL || process.env.NUXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/u, "");
}

export async function notifyHumanAssignment(input: {
  userId: string;
  processId: string;
  assignmentId: string;
  prompt: string;
}): Promise<HumanNotificationAttempt[]> {
  const processUrl = `${appOrigin()}/processes/${input.processId}`;
  return notifyHuman({
    userId: input.userId,
    webUrl: processUrl,
    message: [
      "You have an institutional assignment or checkpoint waiting.",
      input.prompt,
      `Open the process: ${processUrl}`,
    ].join("\n\n"),
  });
}

export async function notifyIntakeFailure(input: {
  userId: string;
  intakeId: string;
  reason: string;
}): Promise<HumanNotificationAttempt[]> {
  const webUrl = `${appOrigin()}/processes?intake=${encodeURIComponent(input.intakeId)}`;
  return notifyHuman({
    userId: input.userId,
    webUrl,
    message: [
      "An institutional intake could not be analyzed automatically and was escalated.",
      input.reason,
      `Review failed intakes: ${webUrl}`,
    ].join("\n\n"),
  });
}

async function notifyHuman(input: { userId: string; webUrl: string; message: string }): Promise<HumanNotificationAttempt[]> {
  const attempts: HumanNotificationAttempt[] = [
    { channel: "web", status: "available", detail: input.webUrl },
  ];

  const [slackLink, phoneLink] = await Promise.all([
    getSlackLinkForAppUser(input.userId),
    getPhoneLinkForAppUser(input.userId),
  ]);

  if (slackLink) attempts.push(await notifySlack(slackLink.slackUserId, input.message));
  else attempts.push({ channel: "slack", status: "skipped", detail: "No linked Slack account" });

  if (phoneLink) attempts.push(await notifyIMessage(phoneLink.phoneNumber, input.message));
  else attempts.push({ channel: "imessage", status: "skipped", detail: "No linked phone number" });

  return attempts;
}

async function notifySlack(userId: string, message: string): Promise<HumanNotificationAttempt> {
  try {
    const opened = await callSlackApi({
      botToken: undefined,
      operation: "conversations.open",
      body: { users: userId },
    });
    const channel = (opened as { channel?: { id?: string } }).channel?.id;
    if (!opened.ok || !channel) {
      return { channel: "slack", status: "failed", detail: opened.error || "Could not open direct message" };
    }
    const posted = await callSlackApi({
      botToken: undefined,
      operation: "chat.postMessage",
      body: { channel, text: message },
    });
    return posted.ok
      ? { channel: "slack", status: "sent" }
      : { channel: "slack", status: "failed", detail: posted.error || "Slack rejected the message" };
  } catch (error) {
    return { channel: "slack", status: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function notifyIMessage(contactNumber: string, message: string): Promise<HumanNotificationAttempt> {
  const fromNumber = process.env.SENDBLUE_FROM_NUMBER?.trim();
  if (!fromNumber || !process.env.SENDBLUE_API_KEY || !process.env.SENDBLUE_API_SECRET) {
    return { channel: "imessage", status: "skipped", detail: "Sendblue is not configured" };
  }
  try {
    const adapter = createSendblueAdapter();
    const threadId = adapter.encodeThreadId({ fromNumber, contactNumber });
    await adapter.postMessage(threadId, { markdown: message });
    return { channel: "imessage", status: "sent" };
  } catch (error) {
    return { channel: "imessage", status: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}
