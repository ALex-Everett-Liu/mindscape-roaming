# Agent Instructions for Mindscape Roaming

## Git Workflow

- **Do NOT run `git commit`, `git push`, `git tag`, or any git mutation automatically.**
- After making edits, always show the user the diff and ask them to review, check, and test the changes.
- You MAY suggest a commit message and/or version tag, but the user must execute the commit manually.

## PowerShell Environment

This project runs on **Windows PowerShell**. Multi-line `git commit` messages must use PowerShell's backtick-newline syntax (`` `n ``), **not** bash-style `\n` or PowerShell block strings with literal newlines. For example:

```powershell
git commit -m "first line`n`nsecond paragraph`n  - bullet"
```

The agent must always present commit commands in this PowerShell-compatible format.
