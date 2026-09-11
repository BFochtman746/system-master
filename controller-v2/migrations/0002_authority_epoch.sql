CREATE TABLE controller_meta (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  store_id TEXT NOT NULL,
  authority_epoch INTEGER NOT NULL CHECK(authority_epoch >= 1),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
) STRICT;

CREATE TRIGGER controller_meta_store_id_immutable
BEFORE UPDATE OF store_id ON controller_meta
WHEN NEW.store_id IS NOT OLD.store_id
BEGIN
  SELECT RAISE(ABORT, 'controller store_id is immutable');
END;

CREATE TRIGGER controller_meta_epoch_monotonic
BEFORE UPDATE OF authority_epoch ON controller_meta
WHEN NEW.authority_epoch != OLD.authority_epoch + 1
BEGIN
  SELECT RAISE(ABORT, 'authority epoch must increment by exactly one');
END;

ALTER TABLE controller_events ADD COLUMN authority_epoch INTEGER NOT NULL DEFAULT 1 CHECK(authority_epoch >= 1);
ALTER TABLE projection_state ADD COLUMN authority_epoch INTEGER NOT NULL DEFAULT 1 CHECK(authority_epoch >= 1);
