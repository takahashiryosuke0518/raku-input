# SDD ledger — plan: docs/superpowers/plans/2026-10-01-legacy-form-autofill.md

Pre-flight: Task 1 produces profile keys consumed by Tasks 2–4; Task 2 produces semantic hints consumed by Tasks 3–4; Task 3 produces segment/event helpers consumed by Tasks 4–5; Task 6 consumes all prior profile and autofill behavior. No interface conflicts found.

Ruling: Do not create or switch to a Git worktree/branch and do not commit — the user explicitly forbids branch operations and retains all Git operations. Work in the authorized current workspace; cost if wrong: concurrent workspace edits could overlap.

Ruling: The stock `npm.cmd test` / `node --test` crashes in this Windows environment before loading test cases (exit `3221225477`); direct `require()` of local project files also crashes, while Node inline code and `node:test` smoke tests work. Use a temporary VM-based CommonJS loader to execute the unchanged actual test files and their `node:test` assertions, and report this runner limitation — cost if wrong: a discrepancy in loader behavior could hide a stock-runner-only issue.

Baseline: VM test runner — 81 passed, 0 failed (all existing test files).

Task 1: complete — added the five normalized string fields and popup controls; targeted storage/popup tests 20 passed, full VM suite 81 passed.

Task 2: complete — added kana/contact classification and constrained nearby/dt/dd/th/td metadata; autofill tests 56 passed, full VM suite 84 passed.

Task 3: complete — added birthDate year/month/day components and distinct graduation/enrollment/laboratory year/month select handling; autofill tests 57 passed, full VM suite 85 passed.
