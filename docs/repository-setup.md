# Repository setup

One-time settings for the GitHub repository. These are not stored in the repo.

## General

- Merge button: allow **squash merging** only; default commit message: PR title and description.
- Automatically delete head branches.

## Ruleset: `main`

Target: default branch.

- Restrict deletions; block force pushes
- Require linear history
- Require a pull request before merging
  - Required approvals: 0 for a solo maintainer, otherwise 1
  - Require review from Code Owners
  - Dismiss stale approvals on new commits
- Require status checks to pass: **`check`** (the aggregate job in `ci.yml`)
  - Require branches to be up to date before merging

## Ruleset: release tags

Target: tags matching `@clerkhand/*@*`.

- Restrict creations, updates and deletions. Bypass: the **GitHub Actions** app (always), so the release workflow can create release tags.

## Actions

- Workflow permissions: read repository contents by default.
- Allow GitHub Actions to create and approve pull requests: on (needed later for the changesets version PR).
