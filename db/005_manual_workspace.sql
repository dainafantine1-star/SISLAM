-- Keep sample originals and audit chains intact while removing them from normal
-- lists, counts, downloads and mutations. Only explicit maintenance marks samples.
CREATE TABLE workspace_initializations (
  municipality_id uuid PRIMARY KEY REFERENCES municipalities(id),
  mode text NOT NULL CHECK(mode='manual'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE archived_samples (
  municipality_id uuid NOT NULL REFERENCES municipalities(id),
  entity_type text NOT NULL CHECK(entity_type IN ('organizations','establishments','cases','rule_versions','documents','opinions','licenses','conditions','notices','complaints','complaint_contacts','inspections','holidays')),
  entity_id uuid NOT NULL,
  reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(municipality_id,entity_type,entity_id)
);
ALTER TABLE archived_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_samples FORCE ROW LEVEL SECURITY;
CREATE POLICY archive_tenant ON archived_samples FOR SELECT TO sislam_runtime
  USING(municipality_id::text=(SELECT current_setting('sislam.tenant',true)));
GRANT SELECT ON archived_samples TO sislam_runtime;
REVOKE ALL ON workspace_initializations FROM PUBLIC,sislam_runtime;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations','establishments','cases','rule_versions','documents','opinions','licenses','conditions','notices','complaints','complaint_contacts','inspections','holidays'] LOOP
    EXECUTE format('CREATE POLICY sample_archive ON %I AS RESTRICTIVE FOR ALL TO sislam_runtime USING (NOT EXISTS (SELECT 1 FROM archived_samples s WHERE s.municipality_id=%I.municipality_id AND s.entity_type=%L AND s.entity_id=%I.id)) WITH CHECK (NOT EXISTS (SELECT 1 FROM archived_samples s WHERE s.municipality_id=%I.municipality_id AND s.entity_type=%L AND s.entity_id=%I.id))',table_name,table_name,table_name,table_name,table_name,table_name,table_name);
  END LOOP;
END $$;
ALTER TABLE establishments ADD COLUMN capacity_unit text NOT NULL DEFAULT '' CHECK(length(capacity_unit)<=60);
