begin;

-- Phase 10O changes only the current migration role's defaults for objects
-- created in the future. Existing objects and their grants are untouched.
-- PostgreSQL's implicit PUBLIC EXECUTE default for functions is global, so it
-- must be revoked globally in addition to the explicit public-schema revokes.
alter default privileges revoke execute on functions from public;

alter default privileges in schema public revoke all privileges on tables from public;
alter default privileges in schema public revoke all privileges on tables from anon;
alter default privileges in schema public revoke all privileges on tables from authenticated;

alter default privileges in schema public revoke all privileges on sequences from public;
alter default privileges in schema public revoke all privileges on sequences from anon;
alter default privileges in schema public revoke all privileges on sequences from authenticated;

alter default privileges in schema public revoke all privileges on functions from public;
alter default privileges in schema public revoke all privileges on functions from anon;
alter default privileges in schema public revoke all privileges on functions from authenticated;

commit;
