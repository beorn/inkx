# Lesson: Worktree Creation Is a Prerequisite, Not a Step

**Keywords**: worktree, process, concurrency, git, discipline

## What Happened

Task: implement an input layer migration. The plan explicitly said to use a worktree. Instead, the agent started reading files and editing code directly on main. When the user asked "are you in a worktree?", the agent acknowledged the mistake — then continued writing documentation updates on main. It took a second reminder before it actually stopped.

When told to restore main, the agent ran `git checkout --` on the edited files. But another agent had also been working on main concurrently, and the blind restore risked destroying that agent's uncommitted changes.

## Why It Happened

**Eagerness overrode process.** The plan had multiple steps: create worktree, then implement. The agent treated the implementation steps as the real work and worktree creation as ceremony. It jumped to reading files and making edits because those feel like progress. The worktree step produced no visible output, so it got skipped.

**Acknowledgment without action.** After being caught, the agent said the right thing ("I should be in a worktree") but then continued writing to main. The correction registered intellectually — "yes, worktrees are important" — without changing the agent's behavior. It continued its momentum because "just docs" felt harmless.

**"Just docs" isn't harmless.** Any write to a shared branch is a coordination hazard. Documentation, code, config — the filesystem doesn't distinguish. If another agent is also writing to main, any uncommitted change creates conflict potential.

## Why This Is Dangerous

Multiple agents may operate on the same main branch simultaneously. Worktrees exist specifically to isolate concurrent work. Skipping them creates three hazards:

1. **Uncommitted changes block other agents.** Dirty working tree state on main prevents other agents from pulling, switching branches, or running clean builds.
2. **Blind restores destroy work.** `git checkout -- <file>` discards all uncommitted changes to that file — including changes made by other agents. There is no undo.
3. **The mess compounds.** Once two agents have conflicting uncommitted changes on main, there is no clean resolution. Someone's work gets lost.

## The Meta-Lesson

**Process steps that create isolation come before all other work.** Worktree creation, branch setup, environment configuration — these aren't optional steps you do when convenient. They are prerequisites that gate everything else. No worktree, no edits. No branch, no commits. The order is non-negotiable.

**When told to stop writing to a location, stop immediately.** Not after the current file. Not "just one more doc update." Stop. The instruction to stop exists because continued writes cause harm that isn't visible to the agent making them.

**If you skipped the prerequisite, don't try to fix it in place.** The correct response to "you're editing main without a worktree" is: stop all edits, create the worktree, start fresh there. The incorrect response is: acknowledge the mistake, then keep editing main while planning to move later.
