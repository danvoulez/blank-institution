import type { ProcessRecord } from "./types/process";

// The Metabolism role runs on the smallest model in the institution, and that
// model is served with its context split across slots — 2048 tokens on the
// current hardware. The scan it reads from can carry hundreds of full process
// records, so the prompt has to be projected and budgeted rather than
// serialized whole.

export interface ProcessDigest {
  /** Full id: the model has to name it back to act on it. */
  id: string;
  status: ProcessRecord["status"];
  /** Minutes since anything moved. Staleness is what liveness reacts to. */
  idle: number;
  /** Minutes until the deadline; negative once it is past. */
  due: number;
  deadline: ProcessRecord["deadline"]["class"];
  /** Who currently owes work, as a role or "human". */
  owed: string;
}

export interface DigestBudget {
  /** Context window the provider actually advertises for this model. */
  contextWindowTokens: number;
  /** Held back for the model's own reply. */
  reserveForOutputTokens: number;
  /** Tokens the surrounding instructions already cost. */
  overheadTokens: number;
  /** Hard cap regardless of what fits, so one huge scan cannot dominate. */
  maxRecords: number;
}

export interface DigestResult {
  records: ProcessDigest[];
  /** Records that matched the scan but did not fit the budget. */
  omitted: number;
  estimatedTokens: number;
  /** False when not even one record fits: skip the model call entirely. */
  fits: boolean;
}

// Rough on purpose. A tokenizer would be exact but would tie prompt budgeting
// to whichever model is serving today, and the budget only needs to be right
// enough to stay under a ceiling that already reserves room for the reply.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function minutesBetween(from: number, to: number) {
  return Math.round((to - from) / 60_000);
}

function owedBy(process: ProcessRecord) {
  const responsible = process.currentResponsible;
  return responsible.kind === "human" ? "human" : responsible.role;
}

export function toDigest(process: ProcessRecord, now: number): ProcessDigest {
  return {
    id: process.id,
    status: process.status,
    idle: minutesBetween(process.updatedAt, now),
    due: minutesBetween(now, process.deadline.dueAt),
    deadline: process.deadline.class,
    owed: owedBy(process),
  };
}

// Most urgent first, so truncation drops the least urgent rather than an
// arbitrary tail: blocked before anything else, then whatever is closest to
// (or furthest past) its deadline, then the most stale.
function urgency(left: ProcessDigest, right: ProcessDigest) {
  if (left.status !== right.status) {
    if (left.status === "blocked") return -1;
    if (right.status === "blocked") return 1;
  }
  if (left.due !== right.due) return left.due - right.due;
  return right.idle - left.idle;
}

export function buildDigest(
  processes: readonly ProcessRecord[],
  budget: DigestBudget,
  now = Date.now(),
): DigestResult {
  const ranked = processes.map(process => toDigest(process, now)).sort(urgency);
  const available = budget.contextWindowTokens - budget.reserveForOutputTokens - budget.overheadTokens;

  const records: ProcessDigest[] = [];
  let estimatedTokens = estimateTokens("[]");

  for (const record of ranked) {
    if (records.length >= budget.maxRecords) break;
    const next = estimateTokens(JSON.stringify([...records, record]));
    if (next > available) break;
    records.push(record);
    estimatedTokens = next;
  }

  return {
    records,
    omitted: ranked.length - records.length,
    estimatedTokens,
    fits: records.length > 0,
  };
}
