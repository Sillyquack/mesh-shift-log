-- Canonical Routine Engine catalog contract. Deparsing is deliberately pinned
-- to pg_catalog so regclass/regprocedure identities never depend on a caller's
-- ambient search_path.
set local search_path = pg_catalog;

with routine_relations as (
  select relation.oid, relation.relname, relation.relkind, relation.relowner,
    relation.relrowsecurity, relation.relforcerowsecurity, relation.relpersistence,
    relation.relreplident, relation.relacl, namespace.nspname
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname like 'routine_%'
    and relation.relkind in ('r','p','v','S')
), routine_functions as (
  select procedure.*, namespace.nspname, language.lanname
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_language language on language.oid = procedure.prolang
  where namespace.nspname = 'public'
    and (procedure.proname like '%routine%' or procedure.proname like '%double_shift%')
), records as (
  select 'schema'::text category, namespace.nspname::text identity,
    jsonb_build_object(
      'owner', pg_get_userbyid(namespace.nspowner),
      'comment', obj_description(namespace.oid, 'pg_namespace')
    ) fields
  from pg_catalog.pg_namespace namespace
  where namespace.nspname in ('public','storage')

  union all
  select 'relation', relation.nspname || '.' || relation.relname,
    jsonb_build_object(
      'kind', relation.relkind,
      'persistence', relation.relpersistence,
      'replica_identity', relation.relreplident,
      'rls_enabled', relation.relrowsecurity,
      'rls_forced', relation.relforcerowsecurity,
      'owner', pg_get_userbyid(relation.relowner),
      'comment', obj_description(relation.oid, 'pg_class')
    )
  from routine_relations relation

  union all
  select 'column', relation.nspname || '.' || relation.relname || '.' || attribute.attname,
    jsonb_build_object(
      'table', relation.nspname || '.' || relation.relname,
      'ordinal_position', attribute.attnum,
      'data_type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'domain', case when type_row.typtype = 'd' then type_namespace.nspname || '.' || type_row.typname else null end,
      'nullable', not attribute.attnotnull,
      'default_expression', pg_get_expr(default_value.adbin, default_value.adrelid, true),
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'collation', case when attribute.attcollation = 0 then null else collation_namespace.nspname || '.' || collation_row.collname end,
      'storage', attribute.attstorage,
      'compression', nullif(attribute.attcompression::text, ''),
      'comment', col_description(attribute.attrelid, attribute.attnum)
    )
  from routine_relations relation
  join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
  join pg_catalog.pg_type type_row on type_row.oid = attribute.atttypid
  join pg_catalog.pg_namespace type_namespace on type_namespace.oid = type_row.typnamespace
  left join pg_catalog.pg_attrdef default_value
    on default_value.adrelid = attribute.attrelid and default_value.adnum = attribute.attnum
  left join pg_catalog.pg_collation collation_row on collation_row.oid = attribute.attcollation
  left join pg_catalog.pg_namespace collation_namespace on collation_namespace.oid = collation_row.collnamespace
  where attribute.attnum > 0 and not attribute.attisdropped

  union all
  select 'constraint', relation.nspname || '.' || relation.relname || '|' || constraint_row.conname,
    jsonb_build_object(
      'table', relation.nspname || '.' || relation.relname,
      'name', constraint_row.conname,
      'type', constraint_row.contype,
      'definition', pg_get_constraintdef(constraint_row.oid, true),
      'references', case when constraint_row.confrelid = 0 then null else constraint_row.confrelid::regclass::text end,
      'deferrable', constraint_row.condeferrable,
      'initially_deferred', constraint_row.condeferred,
      'validated', constraint_row.convalidated,
      'no_inherit', constraint_row.connoinherit,
      'owner', pg_get_userbyid(relation.relowner),
      'comment', obj_description(constraint_row.oid, 'pg_constraint')
    )
  from pg_catalog.pg_constraint constraint_row
  join routine_relations relation on relation.oid = constraint_row.conrelid

  union all
  select 'index', index_namespace.nspname || '.' || index_relation.relname,
    jsonb_build_object(
      'table', table_namespace.nspname || '.' || table_relation.relname,
      'name', index_relation.relname,
      'definition', pg_get_indexdef(index_relation.oid),
      'predicate', pg_get_expr(index_row.indpred, index_row.indrelid, true),
      'unique', index_row.indisunique,
      'primary', index_row.indisprimary,
      'exclusion', index_row.indisexclusion,
      'valid', index_row.indisvalid,
      'ready', index_row.indisready,
      'access_method', access_method.amname,
      'owner', pg_get_userbyid(index_relation.relowner),
      'comment', obj_description(index_relation.oid, 'pg_class')
    )
  from pg_catalog.pg_index index_row
  join pg_catalog.pg_class index_relation on index_relation.oid = index_row.indexrelid
  join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
  join pg_catalog.pg_class table_relation on table_relation.oid = index_row.indrelid
  join pg_catalog.pg_namespace table_namespace on table_namespace.oid = table_relation.relnamespace
  join pg_catalog.pg_am access_method on access_method.oid = index_relation.relam
  where table_namespace.nspname = 'public' and table_relation.relname like 'routine_%'

  union all
  select 'type', namespace.nspname || '.' || type_row.typname,
    jsonb_build_object(
      'kind', type_row.typtype,
      'category', type_row.typcategory,
      'preferred', type_row.typispreferred,
      'defined', type_row.typisdefined,
      'delimiter', type_row.typdelim,
      'collation', case when type_row.typcollation = 0 then null else type_row.typcollation::regcollation::text end,
      'enum_labels', coalesce((
        select jsonb_agg(jsonb_build_object('label', enum_row.enumlabel, 'order', enum_row.enumsortorder::text)
          order by enum_row.enumsortorder)
        from pg_catalog.pg_enum enum_row where enum_row.enumtypid = type_row.oid
      ), '[]'::jsonb),
      'domain_base_type', case when type_row.typtype = 'd' then pg_catalog.format_type(type_row.typbasetype, type_row.typtypmod) else null end,
      'domain_not_null', case when type_row.typtype = 'd' then type_row.typnotnull else null end,
      'domain_default', case when type_row.typtype = 'd' then type_row.typdefault else null end,
      'owner', pg_get_userbyid(type_row.typowner),
      'comment', obj_description(type_row.oid, 'pg_type')
    )
  from pg_catalog.pg_type type_row
  join pg_catalog.pg_namespace namespace on namespace.oid = type_row.typnamespace
  where namespace.nspname = 'public' and type_row.typname like 'routine_%'

  union all
  select 'function', procedure.oid::regprocedure::text,
    jsonb_build_object(
      'identity_arguments', pg_get_function_identity_arguments(procedure.oid),
      'argument_names', coalesce(to_jsonb(procedure.proargnames), '[]'::jsonb),
      'return_type', pg_get_function_result(procedure.oid),
      'kind', procedure.prokind,
      'language', procedure.lanname,
      'volatility', procedure.provolatile,
      'strict', procedure.proisstrict,
      'leakproof', procedure.proleakproof,
      'parallel', procedure.proparallel,
      'security_definer', procedure.prosecdef,
      'config', coalesce(to_jsonb(procedure.proconfig), '[]'::jsonb),
      'body_sha256', encode(extensions.digest(convert_to(procedure.prosrc, 'UTF8'), 'sha256'), 'hex'),
      'definition_sha256', encode(extensions.digest(convert_to(pg_get_functiondef(procedure.oid), 'UTF8'), 'sha256'), 'hex'),
      'owner', pg_get_userbyid(procedure.proowner),
      'comment', obj_description(procedure.oid, 'pg_proc')
    )
  from routine_functions procedure

  union all
  select 'trigger', relation.nspname || '.' || relation.relname || '|' || trigger_row.tgname,
    jsonb_build_object(
      'table', relation.nspname || '.' || relation.relname,
      'name', trigger_row.tgname,
      'enabled', trigger_row.tgenabled,
      'definition', pg_get_triggerdef(trigger_row.oid, true),
      'called_function', trigger_row.tgfoid::regprocedure::text,
      'owner', pg_get_userbyid(relation.relowner),
      'comment', obj_description(trigger_row.oid, 'pg_trigger')
    )
  from pg_catalog.pg_trigger trigger_row
  join routine_relations relation on relation.oid = trigger_row.tgrelid
  where not trigger_row.tgisinternal

  union all
  select 'policy', policy.schemaname || '.' || policy.tablename || '|' || policy.policyname,
    jsonb_build_object(
      'table', policy.schemaname || '.' || policy.tablename,
      'name', policy.policyname,
      'command', policy.cmd,
      'permissive', policy.permissive,
      'roles', to_jsonb(policy.roles),
      'using', policy.qual,
      'with_check', policy.with_check,
      'owner', pg_get_userbyid(table_relation.relowner)
    )
  from pg_catalog.pg_policies policy
  join pg_catalog.pg_namespace table_namespace on table_namespace.nspname = policy.schemaname
  join pg_catalog.pg_class table_relation on table_relation.relnamespace = table_namespace.oid and table_relation.relname = policy.tablename
  where (policy.schemaname = 'public' and policy.tablename like 'routine_%')
     or (policy.schemaname = 'storage' and policy.policyname like 'routine_%')

  union all
  select 'relation_acl', relation.nspname || '.' || relation.relname,
    jsonb_build_object(
      'owner', pg_get_userbyid(relation.relowner),
      'raw_acl', coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(relation.relacl) acl), '[]'::jsonb),
      'effective_acl', coalesce((select jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(privilege.grantor),
        'grantee', case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      ) order by pg_get_userbyid(privilege.grantor),
        case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        privilege.privilege_type, privilege.is_grantable)
      from aclexplode(coalesce(relation.relacl, acldefault((case when relation.relkind = 'S' then 'S' else 'r' end)::"char", relation.relowner))) privilege), '[]'::jsonb)
    )
  from routine_relations relation

  union all
  select 'function_acl', procedure.oid::regprocedure::text,
    jsonb_build_object(
      'owner', pg_get_userbyid(procedure.proowner),
      'raw_acl', coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(procedure.proacl) acl), '[]'::jsonb),
      'effective_acl', coalesce((select jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(privilege.grantor),
        'grantee', case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      ) order by pg_get_userbyid(privilege.grantor),
        case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        privilege.privilege_type, privilege.is_grantable)
      from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege), '[]'::jsonb)
    )
  from routine_functions procedure

  union all
  select 'schema_acl', namespace.nspname,
    jsonb_build_object(
      'owner', pg_get_userbyid(namespace.nspowner),
      'raw_acl', coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(namespace.nspacl) acl), '[]'::jsonb),
      'effective_acl', coalesce((select jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(privilege.grantor),
        'grantee', case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      ) order by pg_get_userbyid(privilege.grantor),
        case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        privilege.privilege_type, privilege.is_grantable)
      from aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) privilege), '[]'::jsonb)
    )
  from pg_catalog.pg_namespace namespace where namespace.nspname in ('public','storage')

  union all
  select 'default_acl', pg_get_userbyid(default_acl.defaclrole) || '|' || coalesce(namespace.nspname, '<global>') || '|' || default_acl.defaclobjtype::text,
    jsonb_build_object(
      'owner', pg_get_userbyid(default_acl.defaclrole),
      'schema', namespace.nspname,
      'object_type', default_acl.defaclobjtype::text,
      'raw_acl', coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(default_acl.defaclacl) acl), '[]'::jsonb),
      'effective_acl', coalesce((select jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(privilege.grantor),
        'grantee', case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      ) order by pg_get_userbyid(privilege.grantor),
        case when privilege.grantee = 0 then 'PUBLIC' else pg_get_userbyid(privilege.grantee) end,
        privilege.privilege_type, privilege.is_grantable)
      from aclexplode(default_acl.defaclacl) privilege), '[]'::jsonb)
    )
  from pg_catalog.pg_default_acl default_acl
  left join pg_catalog.pg_namespace namespace on namespace.oid = default_acl.defaclnamespace
  where namespace.nspname in ('public','storage') or default_acl.defaclnamespace = 0

  union all
  select 'storage_bucket', bucket.id,
    jsonb_build_object(
      'name', bucket.name,
      'public', bucket.public,
      'file_size_limit', bucket.file_size_limit,
      'allowed_mime_types', to_jsonb(bucket.allowed_mime_types)
    )
  from storage.buckets bucket where bucket.id = 'routine-reference-images'

  union all
  select 'publication', publication.pubname,
    jsonb_build_object(
      'owner', pg_get_userbyid(publication.pubowner),
      'all_tables', publication.puballtables,
      'insert', publication.pubinsert,
      'update', publication.pubupdate,
      'delete', publication.pubdelete,
      'truncate', publication.pubtruncate,
      'via_partition_root', publication.pubviaroot
    )
  from pg_catalog.pg_publication publication where publication.pubname = 'supabase_realtime'

  union all
  select 'realtime_membership', publication_table.pubname || '|' || publication_table.schemaname || '.' || publication_table.tablename,
    jsonb_build_object(
      'publication', publication_table.pubname,
      'table', publication_table.schemaname || '.' || publication_table.tablename,
      'columns', to_jsonb(publication_table.attnames),
      'row_filter', publication_table.rowfilter
    )
  from pg_catalog.pg_publication_tables publication_table
  where publication_table.pubname = 'supabase_realtime' and publication_table.tablename like 'routine_%'
)
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'transaction_read_only', current_setting('transaction_read_only'),
  'record_count', (select count(*) from records),
  'records', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'identity', identity, 'fields', fields)
    order by category collate "C", identity collate "C"), '[]'::jsonb) from records)
) as catalog;
