## I. Core principles

What actually makes a prompt effective is not the number of sections, but three things:

1. **Verifiable goals.** Don't write unverifiable phrasing like "make it right" or "figure it out". Write outcomes whose completion is obvious, such as "after the change, the process boots normally" or "produce a doc explaining how field X is parsed".
2. **Give paths and source text for materials, not paraphrases.** Mark files/directories with `@path` so the agent can locate them in one step. Paste raw materials — review comments, error logs — verbatim. Paraphrasing loses the kind of "who said what on which line" detail that is essential when mapping items to fixes.
3. **Write only non-default requirements.** The agent already reads code and reports results by default; don't write those. Write what it would not do by default: known sources of deviation, whether to scan for similar issues beyond the listed task, whether to pause for confirmation before editing files.

## II. Template body

Two sections are required (`goal` and `materials`); add the rest only when they have content, and delete the section entirely otherwise (this is the opposite of the old "write 'none' when missing" convention — empty sections are just noise).

```markdown
## User goal

One or two sentences: in what scenario (migration / investigation / review follow-up / research...), what verifiable outcome to achieve.

## Reference context

- Target: `@specific path` (the file/directory/config repo to change or analyze)
- References: `@path` (repo-wiki, prior research docs, validated samples from other teams)
- Known info: sources of deviation the user already knows, pitfalls encountered, directions confirmed as not worth checking
- Raw materials: review comments / error logs / issue lists, pasted verbatim

## Task list
> Optional — only needed when the goal cannot be stated in one sentence

1. Action 1 (each item is a verifiable deliverable, not a vague intent)
2. Action 2
- Scope note: whether the task stops at the list above (e.g. "review comments may not cover all similar issues; a full scan is required" must be stated explicitly, otherwise the agent only handles the listed items)
- Division of labor: which steps the agent completes and which the user runs manually (e.g. "actual testing is done by the user; you only produce the operation doc")

## Deliverables
> Optional — only when there are format/location requirements for the output

- Document save path, naming convention
- Content requirements: whether a reusable principle-level explanation is needed (not just a one-off operation record); whether findings beyond the task scope go in a separate section

## Constraints
> Optional — pick from the snippet library below as needed, or write task-specific red lines

## Checkpoint
> Optional — only needed when manual confirmation is required before irreversible actions like editing files or touching production
```

## III. Common constraint snippets

The following snippets have been validated across many real tasks. Copy them into the Constraints/Checkpoint section as needed — do not include them all by default. Each constraint carries an attention cost; three precise constraints beat eight generic ones.

**Verify first (fits config-driven systems where you reflexively look up field types)**

> Prefer tools or source code reads over assumptions. Any conclusion about "why it failed" or "how to configure a field" must first be verified by reading source code / config samples / logs — not guessed from experience. Problems like "the field name is similar but does not exist in the proto" must be checked item by item.

**Investigate in parallel, execute serially (fits tasks with a wide investigation surface)**

> When the investigation surface is broad, split it across background agents for parallel research; but file-editing actions must converge on a single thread and run only after the plan is confirmed. Parallel edits are not allowed.

**Mark uncertainty (fits research whose conclusions will be reused by later tasks)**

> Conclusions not directly verified must explicitly state the inference basis and confidence level, and must not be mixed with verified facts. If no direct evidence is found, say so honestly.

**Plan before executing (fits tasks with edit actions)**

> For any file-editing action, first present a complete plan (change list + the rationale for each + diff) and wait for user confirmation before landing it. Items in the plan that "do not affect correctness but involve style trade-offs", and similar issues found during investigation that the raw materials did not cover, must be surfaced as standalone questions in the plan stage — never decided unilaterally or mentioned only after the fact.

**Script re-verification (fits tasks whose correctness conditions can be verified programmatically)**

> After execution, any programmatically checkable correctness condition (full coverage of required fields, no duplicate mappings, etc.) must be re-run with a script, and the result included in the completion report — never concluded from an impression after reading the text.

## IV. LLM optimization guide: how to optimize a prompt against this template

When the user gives a rough prompt and asks you to optimize it against this template, follow these steps.

**Step 1: Classify the task type, decide which sections to keep**

- Pure research / analysis task -> goal + materials, usually enough; add the "mark uncertainty" constraint if conclusions will be reused
- Config/code change task -> goal + materials + task list + the "plan before executing" checkpoint; add "script re-verification" if it can be verified by a script
- Documentation task -> goal + materials + deliverables (with explicit save path and the "principle-level explanation" requirement)
- Mixed task -> stack the above, but watch for section bloat: if the optimized prompt is more than twice as long as the original, first check whether you are also writing out default behaviors

**Step 2: Audit the original prompt item by item; fix every defect you find**

| Check item | Defect signs | Fix |
|------------|--------------|-----|
| Goal verifiability | "optimize it a bit", "confirm it's fine" | Rewrite as a verifiable end state: "passes the boot check", "produces doc X that answers question Y" |
| Material locatability | "that click config file", "the research doc from last time" | Ask the user for the exact path; write it as `@path`; if not found, mark "path needs user input" |
| Raw material completeness | Paraphrased review/error ("the review said the field name is wrong") | Require a verbatim paste, preserving reviewer, location, and original wording |
| Known info front-loaded | Known deviations the user has not written down | Ask "what causes do you already know / which directions have you ruled out", and write them into the materials section — saving the agent the round of rediscovering them from scratch |
| Task boundary | Unclear whether to scan for similar issues beyond the list | State explicitly: "stop at the list" or "full scan required" — pick one |
| Human-agent division of labor | Unclear which steps the user runs manually | State the division explicitly, e.g. "testing is done by the user manually; you only produce the doc" |
| Constraint redundancy | A pile of generic constraints unrelated to the task | Keep only the snippets whose fit scenario matches this task's risks (see Section III) |
| Missing checkpoint | Has file-edit actions but no confirmation step | Add "plan before executing" |

**Step 3: Output**

- Output the optimized prompt following the section structure in Section II; delete empty sections
- If information gaps found during the audit (paths, source text, known info) cannot be filled by you, list them as a "needs user input" list at the end of the refined draft instead of fabricating placeholder content
