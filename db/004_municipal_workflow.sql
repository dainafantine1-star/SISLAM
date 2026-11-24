-- Preserve historical cases and their frozen rules. Adoption is explicit and audited.
ALTER TABLE cases ADD COLUMN workflow_step text,
  ADD COLUMN workflow_snapshot jsonb,
  ADD COLUMN workflow_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT cases_workflow_pair CHECK ((workflow_step IS NULL) = (workflow_snapshot IS NULL));

-- A technical draft becomes visible to the applicant only after administrative dispatch.
CREATE POLICY applicant_dispatched_notices ON notices AS RESTRICTIVE FOR SELECT TO sislam_runtime
  USING (current_setting('sislam.role',true)<>'applicant' OR status IN ('dispatched_demo','acknowledged_demo','answered'));

CREATE FUNCTION preserve_workflow_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.workflow_snapshot IS NOT NULL AND NEW.workflow_snapshot IS DISTINCT FROM OLD.workflow_snapshot THEN
    RAISE EXCEPTION 'Roteiro congelado: a versão original deve ser preservada';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_workflow_immutable BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION preserve_workflow_snapshot();

ALTER TABLE opinions DROP CONSTRAINT opinions_conclusion_check;
ALTER TABLE opinions ADD CONSTRAINT opinions_conclusion_check CHECK (conclusion IN ('favorable','favorable_reservations','unfavorable','complement'));
