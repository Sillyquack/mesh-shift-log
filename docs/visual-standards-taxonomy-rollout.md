# Visual Standards taxonomy/detail rollout

Status: production database reconciled and verified on 21 August 2026. PR #26
remains unmerged; its web application and Edge Function changes remain
undeployed, and no production photo was published during reconciliation.

## Change boundary

Production already contained this accidental ledger entry with only SQL
comments and no schema-changing statement:

`supabase/migrations/20260821124543_visual_standard_details_and_taxonomy.sql`

The entry was preserved and represented locally as a no-op. The exact reviewed
SQL from the former `20260821115700` file was moved without content changes to
the newly generated forward-only recovery migration:

`supabase/migrations/20260821125127_recover_visual_standard_details_and_taxonomy.sql`

The recovery file retains SHA-256
`44ba4a05fcb87fc0e286a16bff9783f25c9cc900f10b1251894edf14831ca752`.

It preserves the existing private bucket and immutable primary assets. It adds
`visual_standards.is_visible`, four explicit legacy aliases, detail metadata on
the existing audit table, ordered detail slots, and manager-only detail
publish/restore RPCs. The four legacy rows and any history remain retained but
are hidden from active lists. No migration repair or ledger rewrite was used.

The repository also restores the 34 exact migration files for the production
ledger versions from 2–16 August. Their byte counts and MD5 hashes match the SQL
stored in production. This makes the linked migration history fully aligned.

## Reconciliation record

1. Read-only inspection confirmed the pre-PR26 schema, ten existing standards,
   no taxonomy/detail objects, and the comment-only accidental ledger entry.
2. Preservation fingerprints were captured for the ten existing standards,
   version history, Storage object names and two Workbar fridge rows.
3. A linked dry-run selected only
   `20260821125127_recover_visual_standard_details_and_taxonomy.sql`.
4. The recovery migration was applied once with `db push`; no seed or role file
   ran, and `migration repair` was not used.
5. Read-only verification confirmed exactly nine visible Self-Service rows,
   four retained hidden legacy rows, four aliases, three awaiting Cabinet
   detail slots, expected RLS/grants and all four secured RPCs.
6. The preservation fingerprints remained unchanged; there were still zero
   image versions and zero private Storage objects.
7. The final linked migration comparison matched every local and remote version,
   and the final dry-run reported the production database up to date with no
   pending migrations.

The application and Edge Function depend on the reconciled column/table. Their
rollout remains intentionally pending. Only after PR #26 is approved:

1. Confirm a fresh database dry-run remains empty. Stop if any migration appears.
2. Deploy only `visual-standard-image` with the same intentionally configured
   gateway setting as the existing function:
   `npx --yes supabase@2.115.0 functions deploy visual-standard-image --no-verify-jwt`.
3. Run active-primary, active-detail, manager-history, staff denial, and direct
   private-Storage denial smoke checks before deploying the web application.
4. Deploy the approved web application through the normal release process.
5. On an iPhone-width device, open Manager Dashboard → Default Standards →
   Self-Service Station, select the overview row, take a non-sensitive test
   photo, confirm the local preview, and press Save.
6. Confirm immutable upload, audited version creation, active-row readback,
   signed image refresh, immediate row thumbnail update, and ordinary-staff
   active-only visibility.
7. Only after the smoke test succeeds, manually publish the real overview and
    any optional cabinet details through Manager Dashboard.

## Rollback boundary

Before any manager publication, the web application and Edge Function may be
rolled back while leaving the additive schema in place. After publication,
leave the migration, audit rows and private immutable objects intact; roll back
the clients only. Do not delete versions or repair the migration ledger.

If upload or publish fails during the smoke test, stop. The previously active
image should remain unchanged. Record any orphan-cleanup warning for manager
follow-up, but do not manually remove an object that appears in version history.
