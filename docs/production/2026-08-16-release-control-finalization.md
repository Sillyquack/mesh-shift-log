# Release-control finalization — 16 August 2026

**Scope:** GitHub Actions reliability, dependency-security triage, and release metadata only.

**Accepted application head before this infrastructure-only pass:** `af308ed3c1560dc5091f7a6cefd8d7ed97c8f8c5`.

The authoritative final release head is the exact `REVIEWED_SHA` recorded by the successful split Release review workflow and in PR #17. Embedding a commit's own SHA inside that same commit is not stable, so this repository record identifies the accepted application head and requires the final workflow/PR metadata to identify its exact infrastructure-only successor.

## Run #8 failure classification

[Release review run #8](https://github.com/Sillyquack/mesh-shift-log/actions/runs/31908476987) reviewed PR head `af308ed3c1560dc5091f7a6cefd8d7ed97c8f8c5` through GitHub's pull-request merge ref.

- Checkout succeeded.
- Node 24 setup succeeded.
- `npm ci` succeeded in three seconds.
- `npx playwright install --with-deps chromium webkit` began at `2026-08-15T21:05:53Z`, entered Ubuntu apt mirror provisioning, and did not complete.
- The 60-minute whole-job timeout cancelled browser provisioning at `2026-08-15T22:05:55Z`.
- The PostgreSQL pull, all production/migration/application verifiers, all four browser matrices, and the build were skipped.
- The `always()` artifact step succeeded, but that artifact is not evidence that any skipped browser matrix ran.

Run #8 was an infrastructure-provisioning cancellation, not a test failure and not a successful release review.

## Deterministic workflow architecture

The Release review workflow is split into two independent, read-only jobs. Both check out `github.event.pull_request.head.sha` for pull requests (or `github.sha` for a manual dispatch), compare `git rev-parse HEAD` with that value, and record the exact reviewed SHA in the GitHub job summary.

### Core release verification

The Ubuntu core job performs the locked dependency install, pinned disposable PostgreSQL image pull, migration plan and full-reapply verification, production/Mesh/Event/Inventory/Millum/content/manager/employee/history verification, production build, and `git diff --check`. It never invokes Playwright browser or operating-system dependency installation.

### Chromium and WebKit browser review

The browser job runs inside the official Playwright Noble image matching the exact lockfile version:

- npm package: `playwright@1.62.1`
- container tag: `mcr.microsoft.com/playwright:v1.62.1-noble`
- pinned amd64 manifest: `sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac`
- complete image reference: `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac`

The job preserves Node 24, runs `npm ci`, proves the installed Playwright package version matches `1.62.1`, and confirms the container's Chromium and WebKit executables are present and executable. It does not invoke `playwright install`.

All four required Chromium/WebKit matrices must pass before the workflow checks that each evidence directory contains a screenshot generated after the browser job began. Only then can the artifact step run. The artifact name contains the exact reviewed SHA, and a manifest inside the artifact records the SHA, Playwright version, and pinned container image. The artifact URL and SHA-256 digest are written to the job summary.

The workflow declares only `contents: read`. It contains no production credentials, deployment step, write permission, or production action.

## Dependency-security triage

Read-only audit on 16 August 2026:

| Check | Result |
|---|---|
| `npm audit --json` | One high-severity development-tooling finding |
| `npm audit --omit=dev --json` | Zero vulnerabilities |

Finding:

- affected package: `nanoid`
- installed version: `3.3.16`
- advisory: [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), “custom generators can loop indefinitely when size is zero”
- vulnerable range: `<3.3.18`
- dependency path: `vite@6.4.3` → `postcss@8.5.25` → `nanoid@3.3.16`
- classification: dev-only; `package-lock.json` marks the chain as development dependencies and the production-only audit excludes it
- bundle reachability: absent from the generated production bundle; application source does not import Nano ID
- behavior reachability: PostCSS calls `nanoid(6)` for an internal CSS input identifier and does not call the vulnerable zero-size custom-generator path
- fix availability: npm reports a fix is available; PostCSS's `^3.3.16` range can accept a patched Nano ID 3.x release, so no direct application dependency or breaking major upgrade is indicated
- decision: amber tooling finding; no dependency or lockfile change in this release-control task

No `npm audit fix` command was run, and the remaining finding must not be described as “no vulnerabilities.”

## Protected release metadata

- draft provider: `mesh-routine-content@1.5R`
- 1.5R canonical pack hash: `710c9412eabc8f2e9c5a6488499ac4654cd7c94b62138eaed9563ab5f0203c9c`
- 1.5R file SHA-256: `6254ae1e961bf2cd30e831ea3d7a31be19c841128649d3f6266fa6902f73a2a4`
- Phase 10Y SQL SHA-256: `31118f78b22271f6cce6259b8af44931da18a4506cca0852d39784dc9b89d1ac`
- Phase 10Z SQL SHA-256: `caaf7c10970a97a5bc5928df967cd7683cff98a0f208888f6d162bdcd9f4fdab`
- portable migration fingerprint: `3bd0a3227b56a64a4f4b5a3ccc3e810c74758458e426d30ddbc8a8a0053d7024`
- historical 1.4R SHA-256: `a69042a4e8f25d07e952821a0fdcadb24a8f1cb55a4e53044b6f28909ea8fba4`
- pending migration order: Phase 10W → Phase 10X → Phase 10Y → Phase 10Z

These values and all application, inventory, routine, Event, Stock Count, Millum, and physical-location semantics are unchanged by release-control finalization.

## Remaining approval-gated work

Express Shelf still requires the manager to enter the real shelf product quantities/order and upload a current setup image through separately approved production actions. Fire/evacuation and Shopbox content remain unresolved and unchanged.

No merge, deployment, production write, Supabase migration, migration-ledger repair, content installation, publication, image upload, Routine Engine mode change, or UI release-stage change is authorized or performed by this record.
