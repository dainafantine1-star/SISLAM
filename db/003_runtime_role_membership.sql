-- Non-superuser role creators in PostgreSQL 16+ receive ADMIN but not SET.
-- Permit the connection owner to assume the existing restricted runtime role.
-- Do not inherit its grants implicitly or change its RLS attributes/policies.
DO $$ BEGIN
  EXECUTE format('GRANT sislam_runtime TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END $$;
