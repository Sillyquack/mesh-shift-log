# Visual Standards taxonomy/detail rollout

Status: prepared locally on 21 August 2026; not applied to the remote database,
not deployed, and no production photo has been published.

## Change boundary

The forward-only migration is:

`supabase/migrations/20260821115700_visual_standard_details_and_taxonomy.sql`

It preserves the existing private bucket and immutable primary assets. It adds
`visual_standards.is_visible`, four explicit legacy aliases, detail metadata on
the existing audit table, ordered detail slots, and manager-only detail
publish/restore RPCs. The four legacy rows and any history remain retained but
are hidden from active lists. No migration repair or ledger rewrite is needed.

The application and Edge Function depend on the new column/table. Roll out in
this order only after the pull request and all verification are approved:

1. Confirm the linked Supabase project and review migration history read-only.
2. Run `npx --yes supabase@2.115.0 db push --linked --dry-run` and confirm that
   `20260821115700_visual_standard_details_and_taxonomy.sql` is the only pending
   migration. Stop if any other migration appears.
3. Apply that one forward migration with the normal approved production change
   process. Do not use migration repair and do not edit either migration file.
4. Verify read-only that there are exactly nine visible Self-Service rows, four
   hidden legacy rows, four aliases, and three awaiting backstock detail slots.
5. Deploy only `visual-standard-image` with the same intentionally configured
   gateway setting as the existing function:
   `npx --yes supabase@2.115.0 functions deploy visual-standard-image --no-verify-jwt`.
6. Run active-primary, active-detail, manager-history, staff denial, and direct
   private-Storage denial smoke checks before deploying the web application.
7. Deploy the approved web application through the normal release process.
8. On an iPhone-width device, open Manager Dashboard → Default Standards →
   Self-Service Station, select the overview row, take a non-sensitive test
   photo, confirm the local preview, and press Save.
9. Confirm immutable upload, audited version creation, active-row readback,
   signed image refresh, immediate row thumbnail update, and ordinary-staff
   active-only visibility.
10. Only after the smoke test succeeds, manually publish the real overview and
    any optional cabinet details through Manager Dashboard.

## Rollback boundary

Before any manager publication, the web application and Edge Function may be
rolled back while leaving the additive schema in place. After publication,
leave the migration, audit rows and private immutable objects intact; roll back
the clients only. Do not delete versions or repair the migration ledger.

If upload or publish fails during the smoke test, stop. The previously active
image should remain unchanged. Record any orphan-cleanup warning for manager
follow-up, but do not manually remove an object that appears in version history.
