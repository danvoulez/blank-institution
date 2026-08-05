import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, schema } from "@nuxthub/db";
import type { H3Event } from "h3";

function salt() {
  const value = process.env.PROCESS_API_TOKEN_SALT?.trim();
  if (!value) throw createError({ statusCode: 503, statusMessage: "PROCESS_API_TOKEN_SALT is not configured" });
  return value;
}

function hashToken(token: string) {
  return createHash("sha256").update(`${salt()}:${token}`).digest("hex");
}

export async function createProcessApiToken(userId: string, name: string) {
  const secret = randomBytes(32).toString("base64url");
  const token = `evi_${secret}`;
  const id = crypto.randomUUID();
  await db.insert(schema.processApiTokens).values({
    id,
    userId,
    name,
    tokenPrefix: token.slice(0, 12),
    tokenHash: hashToken(token),
  });
  return { id, name, token, tokenPrefix: token.slice(0, 12), createdAt: Date.now() };
}

export async function listProcessApiTokens(userId: string) {
  const rows = await db.select({
    id: schema.processApiTokens.id,
    name: schema.processApiTokens.name,
    tokenPrefix: schema.processApiTokens.tokenPrefix,
    createdAt: schema.processApiTokens.createdAt,
    lastUsedAt: schema.processApiTokens.lastUsedAt,
    revokedAt: schema.processApiTokens.revokedAt,
  }).from(schema.processApiTokens).where(eq(schema.processApiTokens.userId, userId)).orderBy(desc(schema.processApiTokens.createdAt));
  return rows.map(row => ({
    ...row,
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastUsedAt?.getTime(),
    revokedAt: row.revokedAt?.getTime(),
  }));
}

export async function revokeProcessApiToken(userId: string, id: string) {
  const result = await db.update(schema.processApiTokens).set({ revokedAt: new Date() }).where(and(
    eq(schema.processApiTokens.userId, userId),
    eq(schema.processApiTokens.id, id),
    isNull(schema.processApiTokens.revokedAt),
  ));
  return result.rowsAffected > 0;
}

export async function authenticateProcessApiToken(event: H3Event): Promise<string> {
  const authorization = getRequestHeader(event, "authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("evi_")) throw createError({ statusCode: 401, statusMessage: "Invalid process API token" });
  const candidate = Buffer.from(hashToken(token));

  const rows = await db.select().from(schema.processApiTokens).where(and(
    eq(schema.processApiTokens.tokenPrefix, token.slice(0, 12)),
    isNull(schema.processApiTokens.revokedAt),
  ));
  const matched = rows.find((row) => {
    const expected = Buffer.from(row.tokenHash);
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  });
  if (!matched) throw createError({ statusCode: 401, statusMessage: "Invalid process API token" });

  await db.update(schema.processApiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.processApiTokens.id, matched.id));
  return matched.userId;
}
