import { emptyUsage } from "../../types.js";
import { CODE_RISK_FOR_COMPREHENSION, CODE_RISK_FOR_RATING } from "../../code-risk.js";
/**
 * Rater instructions. Deliberately narrow: the rater judges DIFFICULTY, not
 * correctness, and must answer in one token-cheap line we can parse. It is asked
 * about the reading model's own capacity, not about the file in the abstract — a
 * 2000-line generated barrel file is long but trivial; a 60-line lock-free queue
 * is not.
 */
const RATE_SYSTEM = [
    "You judge how hard a source file is to REASON ABOUT correctly — not how long it is.",
    "Consider: control-flow and concurrency subtlety, implicit invariants, non-obvious coupling",
    "to other modules, dense generics/metaprogramming, and how badly a wrong edit here would break things.",
    "",
    CODE_RISK_FOR_RATING,
    "",
    "Answer with EXACTLY one line, no prose, no fences, in this form:",
    "RATING: <low|medium|high> | WHY: <at most 15 words>",
].join("\n");
/**
 * Comprehension instructions for the escalation model. It must NOT restate the
 * file (the caller keeps the raw bytes) — it contributes the understanding the
 * weaker model would have missed, in a form that is directly actionable for a
 * subsequent edit.
 */
const COMPREHEND_SYSTEM = [
    "You are the stronger model in a two-stage read. A weaker model has the raw file already,",
    "so do NOT summarize or restate the code. Contribute ONLY what it is likely to get wrong:",
    "the invariants that must hold, the non-obvious control flow and coupling, the parts that look",
    "safe to change but are not, and the specific traps for the stated task.",
    "",
    CODE_RISK_FOR_COMPREHENSION,
    "",
    "Name only the ones that are REAL in this file — a file with no async and no callers does not need",
    "paragraphs about await and blast radius. Where you cannot see something the reader needs (a caller in",
    "another file, the installed version of a library), say so explicitly and name what they should check.",
    "Be concrete and cite line numbers. No fences, no preamble.",
].join("\n");
/**
 * How much room B gets to narrate, by how hard the file turned out to be.
 *
 * A flat cap was the wrong instrument. The whole reason this call happens is that
 * stage 1 judged the file beyond the reading model — so the file that most needs
 * explaining was being held to the same budget as the borderline one, and the
 * analysis that came back for a genuinely hard file was truncated exactly where it
 * got interesting. Length follows difficulty: `high` gets room to walk the file,
 * `medium` stays terse because terse is usually enough there.
 */
const NARRATION_BUDGET = {
    low: "Use terse bullets, at most 150 words.",
    medium: "Use terse bullets, at most 250 words.",
    high: "Take the room you need — up to about 700 words. This file was rated hard, so walk the reader through " +
        "the parts that make it hard: the invariants, the order things must happen in, and what breaks if they " +
        "do not. Prefer complete explanations over brevity here; a truncated analysis of a hard file is worse " +
        "than none, because it reads as if the file were simple.",
};
/**
 * Reasoning effort for the escalation call, by rating.
 *
 * `effort`, not a token ceiling. `authoring.ts` learned this the expensive way
 * (see `AUTHORING_BUDGET`): `reasoningMaxTokens` becomes `reasoning.max_tokens`,
 * which is a CEILING and near-meaningless for OpenAI-family models, so the call
 * silently ran at the provider default. This module was still doing exactly that
 * — escalating to a stronger model and then asking it to think no harder than the
 * orchestrator does. The escalation is the whole point of the spend; the effort
 * has to match what stage 1 said the file costs.
 */
const COMPREHEND_EFFORT = {
    low: "low",
    medium: "medium",
    high: "high",
};
/**
 * Comprehension carried from `read` to the `write`/`edit` that follows it.
 *
 * Keyed by the path as the tool received it. Deliberately process-local and
 * unbounded-but-tiny: one entry per file a run escalated on, holding a few
 * hundred words each, discarded when the process ends.
 *
 * The reason it exists: `read` escalates to a stronger model precisely because the
 * file is beyond the orchestrator, and then hands that model's analysis back into
 * the ORCHESTRATOR's context. When the orchestrator later calls `write`/`edit`,
 * the authoring model is given the task and the file but not that analysis — so
 * the understanding reaches the author, if at all, as the weaker model's summary
 * of it. This closes the loop directly: B explains the file, and B authors it.
 *
 * Superseded on re-read, so a file that changed under us gets the fresh analysis
 * rather than a stale one.
 */
const comprehensionByPath = new Map();
export function rememberComprehension(path, value) {
    comprehensionByPath.set(path, value);
}
export function recallComprehension(path) {
    return comprehensionByPath.get(path);
}
/** Drop a path's analysis once the file has been rewritten — it describes the old bytes. */
export function forgetComprehension(path) {
    comprehensionByPath.delete(path);
}
/** Test seam. */
export function clearComprehensionMemory() {
    comprehensionByPath.clear();
}
/**
 * Stage 1: rate the file's reasoning difficulty. Never throws — a rater failure
 * degrades to `"low"` (no escalation, today's plain-read behavior) rather than
 * failing the read, because a read that dies takes the whole step with it. This
 * is the opposite of the authoring contract, where an empty result IS an error:
 * authoring failure would write wrong bytes, while rating failure only forgoes
 * an optimization.
 */
export async function rateFileComplexity(input) {
    const context = {
        systemPrompt: RATE_SYSTEM,
        messages: [
            {
                role: "user",
                content: buildRateMessage(input),
                timestamp: Date.now(),
            },
        ],
    };
    try {
        const msg = await input.llm.complete(input.model, context, {
            temperature: 0,
            signal: input.signal,
            // One line of output. Unbounded reasoning here spends the whole budget
            // thinking and returns no content, which parses as `low` and silently
            // disables escalation.
            reasoningMaxTokens: 512,
        });
        const parsed = parseRating(extractText(msg.content));
        return { ...parsed, usage: msg.usage ?? emptyUsage() };
    }
    catch {
        return { rating: "low", usage: emptyUsage() };
    }
}
/**
 * Stage 2: have the stronger model produce the analysis the weaker model would
 * have missed. Never throws for the same reason as above — on failure the caller
 * still returns the raw bytes, which is exactly today's behavior.
 */
export async function comprehendFile(input) {
    const rating = input.rating ?? "high";
    const context = {
        systemPrompt: `${COMPREHEND_SYSTEM}\n${NARRATION_BUDGET[rating]}`,
        messages: [
            {
                role: "user",
                content: buildComprehendMessage(input),
                timestamp: Date.now(),
            },
        ],
    };
    try {
        const msg = await input.llm.complete(input.model, context, {
            temperature: 0,
            signal: input.signal,
            // Effort, not a ceiling — and scaled to what stage 1 said this file costs.
            // The length bound now lives in the system prompt, where it constrains the
            // ANSWER rather than the thinking that produces it.
            reasoning: COMPREHEND_EFFORT[rating],
        });
        return { analysis: extractText(msg.content).trim(), usage: msg.usage ?? emptyUsage() };
    }
    catch {
        return { analysis: "", usage: emptyUsage() };
    }
}
function buildRateMessage(input) {
    const parts = [`FILE: ${input.path}`];
    if (input.task)
        parts.push(`TASK THE READER IS WORKING ON:\n${input.task}`);
    parts.push(`CONTENTS:\n\`\`\`\n${input.content}\n\`\`\``);
    parts.push("Reply with the single RATING line only.");
    return parts.join("\n\n");
}
function buildComprehendMessage(input) {
    const parts = [`FILE: ${input.path}`];
    if (input.task)
        parts.push(`TASK:\n${input.task}`);
    if (input.why)
        parts.push(`WHY THIS FILE WAS FLAGGED AS COMPLEX:\n${input.why}`);
    parts.push(`CONTENTS:\n\`\`\`\n${input.content}\n\`\`\``);
    parts.push("Give the analysis now. No summary of the code itself.");
    return parts.join("\n\n");
}
/**
 * Parse the rater's `RATING: x | WHY: y` line. Tolerant of casing, missing WHY,
 * and surrounding chatter (we scan for the first rating word rather than
 * demanding an exact match), because a strict parse that misses means a silent
 * un-escalation. Unparseable ⇒ `"low"`, matching the never-throw contract.
 */
export function parseRating(text) {
    const rating = /\b(low|medium|high)\b/i.exec(text)?.[1]?.toLowerCase();
    const why = /WHY:\s*(.+)$/im.exec(text)?.[1]?.trim();
    return { rating: rating ?? "low", ...(why ? { why } : {}) };
}
/** Sum two optional usages into one (both stages of a staged read are billed to
 *  the caller's `ToolResult.usage`, so the run's cost accounting stays honest). */
export function mergeUsage(a, b) {
    if (!a)
        return b;
    if (!b)
        return a;
    return {
        input: a.input + b.input,
        output: a.output + b.output,
        cacheRead: a.cacheRead + b.cacheRead,
        cacheWrite: a.cacheWrite + b.cacheWrite,
        totalTokens: a.totalTokens + b.totalTokens,
        cost: {
            input: a.cost.input + b.cost.input,
            output: a.cost.output + b.cost.output,
            cacheRead: a.cost.cacheRead + b.cost.cacheRead,
            cacheWrite: a.cost.cacheWrite + b.cost.cacheWrite,
            total: a.cost.total + b.cost.total,
        },
    };
}
/** Pull the concatenated text blocks out of an assistant message's content. */
function extractText(content) {
    if (!Array.isArray(content))
        return "";
    return content
        .filter((c) => typeof c === "object" && c !== null && c.type === "text")
        .map((c) => c.text)
        .join("");
}
//# sourceMappingURL=comprehension.js.map