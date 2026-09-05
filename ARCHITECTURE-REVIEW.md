# AI Agent Pool incubator: architecture plan review

Reviewed: 2026-08-20
Subject: "Architecture report and technical specification: asynchronous AI Agent Pool incubator"

> **Note added afterwards.** This is a review of the original cloud architecture plan.
> What was eventually built is a much smaller thing: one local Python application, no
> cloud, no database, no queue, no A2A. The recommendations in 5.1 (Firebase), 6.1 and
> 6.2 (A2A) were therefore never carried out, and they remain in this document only so
> that the reasoning behind the decisions is preserved. The implementation is described
> in `README.md`. Section 4's artifact-centric turn and section 3's criticism, by
> contrast, fed directly into what was built.

## 1. Summary

On the infrastructure side the plan is competent and production-ready, but it solves the wrong problem first. The document spends roughly 80 % of its length on how to run a conversation between three LLM agents reliably in the background, and almost none on whether that conversation produces anything of value. The risk to the whole concept lives in the latter.

Concretely: the proposed stack (FastAPI + Celery + Redis + PostgreSQL + Cloud Run + context compaction + Redlock + circuit breaker) is roughly a 2 to 4 week build. Testing its core question, whether a debate between three models produces a better architecture document than one model with a good prompt, takes one evening and one Python script, with no database, queue or cloud.

Recommendation: build a throwaway prototype first, measure the result, and only then productionise. If the debate adds nothing, you save the entire build. If it does add something, the prototype tells you what actually needs building, and the result will differ from this plan.

**Chosen direction (updated):** the incubator is implemented as an A2A agent with no web UI of its own, with an MCP wrapper for code tools. See section 6.2. This removes the UI work entirely and gets a large part of the plan's own mechanisms (streaming, webhooks, status polling, human in the loop) ready-made from the protocol.

Below, section 3 lists the plan's real defects, section 4 proposes an architectural turn that removes the plan's most complex part altogether, and section 7 gives a staged path forward.

## 2. What the plan gets right

These are worth keeping as they are:

- **Asynchronous work queue and HTTP 202.** Exactly the right foundation. An LLM loop does not belong inside an HTTP request.
- **PostgreSQL for state and history, Redis only in a supporting role.** The right division of labour. Keeping the original unmodified log for auditing is a good principle.
- **Tenacity and exponential backoff with jitter.** The right library, the right pattern, and `retry_if_exception_type` to separate transient from permanent failures is precisely where most implementations trip up.
- **Containerisation and platform independence.** A sensible hedge, and cheap to do in this case.
- **Role differentiation (facilitator, architect, critic).** Differentiated roles are a materially better starting point than three identical agents.

## 3. Critical problems

### 3.1 Detecting consensus by substring search is broken

```python
if "[APPROVED]" in reply:
```

A model that writes "I am not marking this [APPROVED] yet, because the security section is missing" registers as an approval. The same happens if the model quotes its own instructions or describes the process. This is not an edge case, it is a typical model response.

Fix: structured output, not free text. Every provider supports this natively (OpenAI: `response_format` with a JSON schema, Gemini: `responseSchema`, Mistral: JSON mode). A schema, for example:

```json
{
  "verdict": "APPROVE | REVISE | REJECT",
  "blocking_concerns": [{"area": "...", "issue": "...", "proposed_fix": "..."}],
  "spec_patch": "...",
  "rationale": "..."
}
```

`verdict` is an enum that does not have to be guessed. On top of that: an approval is only valid if `blocking_concerns` is empty. This stops a model from approving while simultaneously listing problems, which is very common behaviour.

### 3.2 The consensus logic and its reset are unclear and fragile

The current logic resets every agent's state whenever one of them declines. In practice this means consensus only forms if all three approve consecutively within the same round. The intent is right, but the code does not say so out loud, and the `agent_states` table stores state that is in fact per-round.

Fix: model the round explicitly. Instead of, or in addition to, the `agent_states` table, add `round_number`, and define consensus as: all three hold `APPROVE` at the same `round_number`, and no new `spec_patch` was produced during that round. Without that last condition, agent 1 approves version A, agent 3 changes the specification, and the system declares consensus on a version agent 1 never saw.

### 3.3 There is no cost ceiling at all

This is the plan's most serious practical gap. The arithmetic with the current parameters:

- `max_turns = 20`, 3 agents, so up to 60 LLM calls
- compaction only triggers at 80 % of 100,000 tokens, so the input is typically 40 to 80 thousand tokens per call
- and the compaction calls themselves consume the whole history as input

Roughly, this is millions of input tokens per session. One runaway session can cost tens of euros, and a bug in the loop multiplies that with nothing to stop it.

Fix, all three:
1. A per-session budget in cents (`budget_cents`), debited on every call immediately after the response. Exceeding it halts the session in state `BUDGET_EXCEEDED`.
2. A radically smaller active context window, on the order of 15 to 30 thousand tokens, not 100,000. See section 4.
3. Cost recorded on the `session_messages` row (`input_tokens`, `output_tokens`, `cost_cents`), not a bare `token_usage INT`.

### 3.4 The pseudocode loop contradicts the document's own principle

The text says: "The system can be modelled as a state machine in which each agent turn is its own asynchronous task. This prevents the loss of the entire conversation history when a single long background process crashes."

The pseudocode does exactly the opposite: a single `while` loop running up to 60 LLM calls inside one Celery task. If the worker dies or Cloud Run recycles the instance mid-run, the session is left hanging in `IN_PROGRESS` with nothing to resume it.

Fix: one task = one agent turn. The task reads state from the database, makes one call, writes the result, and enqueues the next turn. The session is then genuinely resumable from any point, and a crashed turn can be retried without losing history. This requires:
- a per-session lock (Redis) preventing two turns from running concurrently
- an idempotency key (`session_id` + `round` + `agent_role` as unique) so a Celery retry does not duplicate a message in the database
- a watchdog (a per-minute tick, say) that picks up sessions stuck for more than N minutes

### 3.5 Celery is the wrong choice for asyncio code

The plan says "Celery or ARQ". These are not equivalent here. Celery's asyncio support is still weak, and the entire workload is pure async I/O. ARQ is natively asyncio-based and considerably simpler.

A stronger option: drop the broker entirely and use PostgreSQL as the queue (`SELECT ... FOR UPDATE SKIP LOCKED`). The volume is tens of tasks per day, not thousands per second. Redis then falls out of the stack completely, leaving two fewer components to maintain. Locking is handled by Postgres advisory locks. Recommendation: ARQ if you want a familiar queue abstraction, a Postgres queue if you want the fewest moving parts.

### 3.6 JSONB indexing is premature optimisation

The document's longest technical passage covers GIN indexes, the `jsonb_path_ops` operator class and expression indexes. The technical content is correct, but the scale is wrong: `session_messages` grows by a few dozen rows per session. Ten thousand sessions means hundreds of thousands of rows, where a plain B-tree on `(session_id, created_at)` is many times over enough. A GIN index slows writes and takes space with no measurable benefit.

Fix: keep `metadata JSONB` as a column, keep the B-tree timeline index, leave GIN and expression indexes out until profiling shows a need. Instead, promote the frequently queried fields to real columns (`round_number`, `verdict`, `model_id`, `latency_ms`, `cost_cents`), because those are queried every time.

### 3.7 Context compaction is a symptom, not a solution

An LLM-based summary of the entire history is slow, expensive and lossy, and it is performed by the same model that is one of the debaters. It is also a new point of failure in the middle of the loop. See section 4: the real fix is not to grow the context in the first place.

### 3.8 The facilitator is judge, participant and scribe at once

The OpenAI agent takes part in the debate, summarises the history, and writes the final document. Those are three roles with different interests. The summary and the synthesis will inevitably lean toward its own positions.

Fix: split synthesis into its own role with its own system prompt, and preferably its own model. It does not take part in the debate; it reads the outcome and writes the document.

### 3.9 Sycophancy and false consensus

The plan assumes the debate ends in genuine consensus. In practice LLM agents either agree with each other immediately (the most common outcome) or argue in circles forever. Three approvals on the first round is not consensus, it is politeness.

Fix, at the prompt level and in the logic:
- a minimum number of rounds before `APPROVE` is even permitted (2, say)
- the critic agent is forced to produce at least one `blocking_concern` on the early rounds, or the response is rejected and re-requested
- an approval must reference a concrete specification version (`spec_version`), not "the conversation"
- agents do not see each other's `verdict` fields before giving their own, only the substantive concerns, so approval does not spread by contagion

### 3.10 Missing fundamentals

The plan contains none of the following:
- **Authentication.** `POST /api/v1/incubator/start` is an open endpoint that burns money as LLM calls. On the public internet this is found within minutes. An API key at minimum, preferably proper authentication with a per-user quota.
- **Observability.** An LLM system needs the prompts, responses, tokens, cost and latency of every call. Langfuse or OpenTelemetry-based tracing is worth adding on day one, not retrofitting.
- **Webhook signing.** `send_webhook` with no HMAC signature, no retry and no dead letter handling.
- **Progress shown to the user.** A session takes minutes. Plain `GET status` polling is acceptable, but an SSE stream of the conversation as it develops is effectively the entire product here: watching the debate is the interesting part.
- **Secret management.** Three API keys that do not belong in a `.env` file in production.

### 3.11 Small errors in the pseudocode

- `'{"turn_number": turn}'` is a literal string; `turn` is not interpolated. It should be `json.dumps({"turn_number": turn})` or parameterised.
- `agent_states.last_processed_message_id` is defined but never used.
- The model ids (`gpt-4o`, references to Claude 3.5 Sonnet) are out of date. Models change faster than code: keep them in configuration, not in code, and record the model used on every message.
- Inside the `while turn < max_turns` loop the consensus check runs after each agent, but the reset logic runs before it, so `all(...)` can only be true on the last agent. It works, but by accident.

### 3.12 Claude is missing from the agent pool

The three models are OpenAI, Gemini and Mistral. Of these Mistral is clearly the weakest at architectural reasoning, and Claude is absent entirely, even though the document is written to be fed to Claude Code. Consider a line-up where the critic role is filled by a stronger model, because the critic is what prevents bad consensus. The role assignment should be configuration in any case, so that line-ups can be compared.

## 4. Architectural turn: artifact-centricity

This is the single most important recommendation in this report.

The plan is **transcript-centric**: the truth is the conversation history, agents read the whole history, the history grows without bound, and that is why context compaction, token budgets, two thresholds, emergency truncation and LLM-based summarisation are all needed. Half of the plan's complexity follows from this one choice.

The alternative is **artifact-centric**: the truth is the architecture document itself, and the conversation is merely the mechanism that edits it.

On each round, an agent's input is:
1. its own role prompt
2. the **current version** of the specification (one document, predictable in size, typically 2 to 5 thousand tokens)
3. the open concerns from the **previous round** and the changes made in response to them
4. a short log of previously rejected options and the reasoning, so the same ideas do not come round again

The agent's response is a `spec_patch` plus a `verdict` plus `blocking_concerns`. The facilitator applies the patch and stores the new version.

Consequences:
- the context does not grow with the rounds, it stays roughly constant, so **the entire compaction machinery can be deleted**
- cost per round is predictable, and `max_turns` becomes harmless
- synthesising the final result is trivial, because the document already exists and does not have to be reconstructed from the conversation
- versioning gives you a diff for free: you can see what each agent actually changed, which is the single best measure of whether the debate is adding value
- approval is bound to a version number, which resolves the problem in 3.2

Schema addition:

```sql
CREATE TABLE spec_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES incubator_sessions(id) ON DELETE CASCADE,
    version INT NOT NULL,
    round_number INT NOT NULL,
    author_role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, version)
);
```

The full conversation history still lives in `session_messages` for auditing and for the UI. It is simply not fed to the models.

Note: the `uuid-ossp` extension has been unnecessary since PostgreSQL 13; `gen_random_uuid()` is built in.

## 5. Infrastructure

The plan's GCP versus Hetzner comparison is careful but weighs the wrong variables. The share of carbon-free energy and 9 milliseconds of network latency within the Nordics are irrelevant in a system where every operation waits 2 to 30 seconds for a response from an LLM API in the United States. The choice of location has essentially no effect on this system's performance.

The variables that matter are cost, maintenance effort, and what already exists.

You already have a Hetzner server in Helsinki (`sis-4gb-hel1-1`, Ubuntu 24.04, 4 GB) running three PHP sites, Nginx, Certbot and a GitHub Actions deploy pipeline. Recommendation: **run this on the same machine.**

The stack's real memory footprint is on the order of 400 MB (Postgres 100 to 200 MB with a small `shared_buffers`, the API process and worker 80 to 120 MB each). The workload is almost entirely waiting on the network, so no measurable CPU load arises. On a four gigabyte machine running three light PHP sites there is room several times over. A separate instance is not justified until the metrics say otherwise.

Three things to handle so the cohabitation is safe:

1. **Memory limits, not a separate machine.** The only realistic risk is not normal memory use but a runaway process that trips the kernel OOM killer and takes down php-fpm or nginx. Set `mem_limit` in docker-compose (worker 512m, api 256m, postgres 512m) and make sure swap is enabled.
2. **Docker and UFW.** The server has no Docker, so installing it is the only genuine change to the production machine. Docker writes its own iptables NAT rules, which **bypass UFW**: if you publish a port as `5432:5432`, Postgres is open to the internet even though UFW says it is not. Bind every port as `127.0.0.1:8000:8000` and let traffic in only through the existing Nginx on its own subdomain. Alternatively skip Docker and run under systemd units against the system Postgres, which makes the problem disappear entirely.
3. **No conflict with existing data,** because the current sites use SQLite rather than Postgres.

Other infrastructure notes:

- **Cloud Run is a poor fit for this workload.** It is designed for short-lived requests, and a long-running worker either needs `--no-cpu-throttling` (at which point you pay for continuous CPU and lose the cost advantage) or suffers CPU throttling in background processing. If you do go to GCP, the right shape is Cloud Run Jobs or GKE Autopilot, not an ordinary Cloud Run service.
- **Containerisation makes this choice cheap to reverse,** which is a correct observation in the plan. Start on the hardware you have, move only if there is a reason.

### 5.1 Alternative: Firebase and Firestore (recommended)

A Firebase-based implementation is probably better for this system than a self-managed VPS stack, and it resolves several of the gaps identified in this review at no extra effort.

**What it solves:**

- **A real-time UI for free.** Firestore `onSnapshot` listeners update the browser the moment the worker writes a new agent response. This replaces the entire SSE implementation from phase 2. Watching the conversation live is this application's central experience, so the benefit is significant.
- **Authentication and isolation.** Firebase Auth plus security rules closes the gap in 3.10 in one move.
- **Cloud Tasks as the queue.** Built-in retry with exponential backoff, delayed scheduling and per-task dispatch fit the "one task = one agent turn" model (3.4) exactly. A better fit than Celery or ARQ.
- **No maintenance.** No Docker, UFW, backups, Nginx config or OS upgrades.
- **Cost.** Cloud Run scaling to zero and the Firestore free tier are cheaper than a VPS at this volume.

**What is given up:** SQL. In the artifact-centric model (section 4), however, not a single join is required. A session is a document, messages and specification versions are subcollections, and every query is of the form "fetch this session's documents in order". Firestore handles that effortlessly, and the entire JSONB indexing section of the original plan (3.6) becomes moot.

**The right shape: Cloud Run, not Firebase Functions.** Functions has Python support, but the ecosystem is distinctly Node-oriented. As a Cloud Run service in Python, FastAPI, Tenacity and the whole orchestration logic survive unchanged, and only the database and the queue change.

| Role | Implementation |
|---|---|
| Orchestration and LLM calls | Cloud Run (Python, FastAPI, Tenacity), Admin SDK |
| Queue | Cloud Tasks, one task per agent turn |
| State and history | Firestore, read directly by the client |
| UI | Firebase Hosting |
| Authentication | Firebase Auth + security rules |
| Secrets | Secret Manager |
| Region | europe-north1 (Hamina) if Firestore offers it, otherwise eur3 |

**Data model:**

```
sessions/{sessionId}
  ownerUid, status, requirements, round, budgetCents, spentCents,
  consensusVersion, createdAt, updatedAt
  agentStates: { OPENAI_LEAD: {...}, GEMINI_ARCHITECT: {...}, ... }

sessions/{sessionId}/messages/{sessionId}_{round}_{role}
  role, verdict, blockingConcerns[], content, specVersion,
  modelId, inputTokens, outputTokens, costCents, latencyMs, createdAt

sessions/{sessionId}/specVersions/{version}
  version, round, authorRole, content, changeSummary, createdAt
```

**Three pitfalls:**

1. **No LLM call may happen in the browser.** Security rules: the client reads only its own sessions, and write access belongs solely to the server via the Admin SDK. Otherwise API keys leak or anyone can start sessions on the owner's bill.
2. **Cloud Tasks retries automatically,** so writing a turn has to be idempotent. A deterministic document id `{sessionId}_{round}_{role}` turns a retry into an overwrite rather than a duplicate. This is cleaner in Firestore than in Postgres.
3. **Firestore's document limit is 1 MiB.** The specification fits easily, but an unusually long agent response can approach the limit. For overflow, store the content in Cloud Storage and leave a pointer in the document.

**Preventing concurrent turns** is handled by a Firestore transaction on the session document's `status` and `leaseUntil` fields. Redis and Redlock are not needed at all.

**Note regarding phase 0:** this choice changes the phase 0 prototype in no way. The prototype is one Python file with no database, and it happens first regardless.

## 6. Revised technology stack

Two alternative paths. The Firebase path (5.1) is recommended; the self-managed path is listed because it is cheap to reverse and because the existing server is already up.

| Component | Firebase path (recommended) | Self-managed path | Change from the original |
|---|---|---|---|
| Runtime | Cloud Run (scales to zero) | Existing Hetzner server, Docker Compose with memory limits | ordinary Cloud Run service as a long worker dropped |
| Language | Python 3.12+ | Python 3.12+ | no change |
| API | FastAPI + Pydantic | FastAPI + Pydantic | no change |
| Queue | Cloud Tasks | ARQ, or Postgres SKIP LOCKED | Celery dropped |
| Database | Firestore | PostgreSQL 16, with `spec_versions` | JSONB indexing dropped |
| Real time | Firestore listeners | SSE + Redis pubsub | new requirement |
| Locking | Firestore transaction + lease | Postgres advisory lock | Redis and Redlock dropped |
| Resilience | Tenacity | Tenacity | no change |
| Structure | one task = one agent turn | same | long while loop dropped |
| Response format | structured JSON schema per provider | same | substring search dropped |
| Observability | Langfuse or OTel + cost accounting | same | new |
| Security | Firebase Auth + security rules + Secret Manager | API key, per-user quota | new |

## 6.1 The A2A protocol: where it fits and where it does not

A2A (Agent2Agent) reached v1.0 in 2026 under Linux Foundation governance, with the backing of more than 150 organisations and a mature Python SDK (`pip install "a2a-sdk[http-server]"`). The specification therefore no longer shifts beneath the implementation, which used to be a real risk. The only question is which layer to use it at.

### Not between the three internal agents

A2A is designed for interoperability between **opaque, independently deployed agents owned by different parties**. This system's "agents" are not agents; they are three LLM API calls with different system prompts in the same process, all under the same owner. Using A2A between them would mean three HTTP services, three Agent Cards and a JSON-RPC layer so that your own code can talk to your own code. The OpenAI, Gemini and Mistral SDKs do not speak A2A, so the adapters would be written by hand regardless. Pure overhead with no interoperability benefit.

To draw the distinction: MCP connects an agent to tools and data; A2A connects agents to each other. These LLM calls are neither.

### Yes at the outer boundary

The inverse arrangement is interesting: the whole incubator is **one** A2A agent. One Agent Card whose skill is "design a software architecture from requirements", callable by any A2A client (Claude Code, Antigravity, another system). This gives open decision 4 in section 8 a third option: not a web product and not merely a personal workflow, but a callable service with no UI. Probably the shape that best fits this project's character.

### The data model is worth adopting regardless

This is an immediate benefit that costs nothing. A2A's model contains ready-made answers to three points this review leaves open:

| A2A concept | What it solves |
|---|---|
| Task lifecycle: `SUBMITTED → WORKING → INPUT_REQUIRED → COMPLETED / FAILED / CANCELED / REJECTED` | Replaces ad hoc states. `INPUT_REQUIRED` is exactly the "human in the loop" mechanism of open decision 3 in section 8 |
| Artifacts, first-class task outputs composed of Parts | The same idea as the artifact-centricity of section 4. `spec_versions` is an artifact's version history |
| Push notifications: a client-supplied webhook URL and defined authentication schemes | A designed answer to the unsigned webhooks of 3.10 |
| SSE streaming | Standardises the real-time conversation view that gets built anyway |

Practical guidance: name the states and outputs after A2A in phase 1 already. If an Agent Card is published later, the work is done. If not, nothing is wasted.

### Cheap insurance

Define the agent interface as a Python `Protocol` class, for example `async def turn(spec: str, concerns: list[Concern]) -> Verdict`. A local SDK call implements it now, and a remote A2A client can implement the same contract later. Adding an external specialist agent to the pool stays possible without paying anything for it today.

### Timing

The A2A server layer belongs to phase 2 or 3. Phase 1 adopts only the naming and the state model.

## 6.2 Chosen direction: an A2A-native service with no UI of its own

Decided direction: the incubator is implemented as an A2A agent, callable from any tool, with no web UI of its own. This is a significant simplification, and it changes two earlier recommendations.

### Clarification: A2A alone is not enough to be callable

Code tools (Claude Code, Antigravity) natively speak **MCP**, not A2A. A2A is the agent-to-agent protocol; MCP is how an agent gets tools. On top of that, A2A v1.0 does not define a mandatory well-known path for the Agent Card, so the client has to be pointed at the server in any case.

The answer is both, and it is cheap: **an A2A server as the canonical interface, with a thin MCP wrapper on top** exposing the tools `start_architecture_session` and `get_session_status`. A few dozen lines of code. The service is then callable directly from A2A clients and from code tools via MCP.

### Consequences for the earlier recommendations

1. **The web UI disappears entirely.** The calling agent renders progress in its own environment. No React, no SSE implementation of our own, no Firebase Hosting, no Firebase Auth.
2. **The Firebase recommendation (5.1) is withdrawn for this direction.** Firestore was recommended primarily for its real-time listeners. Without a browser client that advantage disappears, at which point the simplest answer is the existing Hetzner server, PostgreSQL, and the Nginx plus Certbot already running. Section 5.1 stays in the document in case a browser UI comes back into scope later.
3. **Authentication comes through A2A.** An authentication scheme declared in the Agent Card, a bearer token to begin with. Firebase Auth is unnecessary.

### Mapping the debate onto A2A v1.0

The fit is unusually clean, because A2A is designed for long-running tasks:

| A2A v1.0 | Role in the incubator |
|---|---|
| `SendStreamingMessage` | The client sends the requirements and receives a stream |
| `TaskStatusUpdateEvent` | One event per agent turn; the caller watches the debate in real time |
| `TaskArtifactUpdateEvent` | One per specification version; the document flows to the client as it develops |
| `TASK_STATE_INPUT_REQUIRED` | The incubator pauses and asks a human mid-debate |
| `CancelTask` | Killing a runaway session, the same mechanism as the budget cutoff |
| `CreateTaskPushNotificationConfig` | A webhook for clients that disconnect |
| `TASK_STATE_COMPLETED` + artifact | The final output with no separate delivery mechanism |

The plan's SSE streaming, signed webhooks, status polling and human-in-the-loop items are therefore no longer things to design. They are ready-made parts of the protocol.

### Implementation shape

`a2a-sdk` (`pip install "a2a-sdk[http-server]"`) provides an `AgentExecutor` abstract class in which you implement `execute()` and `cancel()`. The SDK returns a Starlette ASGI application that can be mounted into an existing FastAPI service, and SSE handling comes with it. In practice `execute()` contains the artifact-centric orchestration loop of section 4, and the protocol layer is the library's responsibility.

Of the transports, A2A v1.0 supports JSON-RPC, gRPC and HTTP+JSON/REST bindings. Start with JSON-RPC; it has the widest client support.

### Effort estimate

Without a UI, phases 1 and 2 shrink to about a week of evenings instead of the earlier two weeks.

## 7. Path forward

### Phase 0: validate the premise (1 to 2 evenings)

One file, `prototype.py`. No database, no queue, no container, no API. Three API keys in environment variables, a loop that runs the rounds, and output to a markdown file.

The measure of success, actually measured rather than estimated:
1. Run the same requirements document (a) through one model with a good prompt and (b) through a three-agent debate.
2. Compare the results. Does the debate's output contain concrete things a single model did not produce?
3. Look at the diffs between rounds. Does the document change substantively between rounds, or are the models quibbling over wording?
4. Compute cost and duration per session.

This phase may well end with the conclusion that the debate adds nothing. That is a valuable result, not a failure. More likely, it adds value only under certain conditions (a critic role with a strict prompt, at least 3 rounds, a concrete artifact to edit), and those conditions are precisely the knowledge needed to build the production version.

### Phase 1: minimal service (about 1 week)

Only once phase 0 has given a positive result.

- A2A server: `a2a-sdk`, `AgentExecutor`, Agent Card, JSON-RPC binding
- PostgreSQL, tables `incubator_sessions`, `session_messages`, `spec_versions`, `agent_states`
- ARQ or a Postgres queue, one task = one turn
- the artifact-centric loop per section 4
- structured `verdict`, round-bound consensus
- Tenacity around every LLM call
- a per-session budget in cents, hard cutoff
- state model and outputs named after A2A (6.1), agent interface as a `Protocol` class
- bearer token authentication, declared in the Agent Card
- Docker Compose on the existing Hetzner server, ports bound to localhost, Nginx as reverse proxy and Certbot for the subdomain

Done when: a session runs to completion unattended, the worker can be killed mid-run and the session continues, cost per session is visible in the database, and an A2A client receives status updates and artifacts as a stream.

### Phase 2: callability and observability (a few evenings)

- an **MCP wrapper** exposing the service as a tool to Claude Code and Antigravity
- `TASK_STATE_INPUT_REQUIRED` in use, so the incubator can ask a human mid-debate
- push notification configuration for clients that disconnect
- Langfuse or equivalent tracing, cost tracking
- a watchdog for stuck sessions and a `CancelTask` path

### Phase 3: only if needed

Browser UI and the Firebase path (5.1), circuit breaker, Redlock, horizontal scaling, GIN indexes. None of these is necessary until the metrics say so. The plan presents them as phase 1 requirements, which is its second systematic problem after the first (not validating the premise).

## 8. Open decisions

These need deciding before phase 1, but not before phase 0:

1. **Agent line-up.** Does Mistral stay as the critic, or is it replaced with a stronger model? Phase 0 answers this empirically.
2. **Who does the synthesis?** Recommendation: a fourth role, outside the debate.
3. **Is there a human in the loop?** The current plan is fully autonomous. A variant where the user can steer between rounds, or veto an approval, is probably more useful and cheaper than full automation.
4. **Does this need to be an application at all?** This is the most important open question. There are three options, not two: a web product, a personal workflow built on CLI subagents, or a callable service published as an A2A agent with no UI (6.1). Both the Antigravity CLI and Claude Code already offer subagents, hooks, skills and scheduled tasks, and both run several different models in parallel. A significant part of the planned orchestration therefore already exists as a feature of the tools. If the goal is a personal workflow for producing better architecture documents, a three-subagent configuration takes an evening and delivers much of the benefit with no database, queue or budget ceilings. If the goal is a hosted product with a web UI, user accounts and shareable sessions, build that, but knowing that you are building it for the UI and the sharing, not for the orchestration. Phase 0 answers this too.
5. **Tool choice is a separate question from architecture.** Phase 0 is about 150 lines of Python, so the implementation tool does not affect the outcome. Antigravity's only genuinely relevant advantage in this project is its built-in browser and visual verification, which helps the real-time conversation view in phase 2. That is the right place to try it, because failing there costs nothing.
6. **What is the output?** An `architecture.md` in cloud storage, a file committed straight to a repository, or a specification to feed to Claude Code? This determines the phase 2 integrations.
