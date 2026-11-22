-- Preserve existing event hashes. New writers use normalized JSON and bind the
-- serialization version to the hash; version 1 remains explicitly verifiable.
ALTER TABLE audit_events ADD COLUMN serialization_version integer NOT NULL DEFAULT 1
  CHECK (serialization_version IN (1, 2));
