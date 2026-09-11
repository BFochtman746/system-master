ALTER TABLE leases ADD COLUMN authority_epoch INTEGER NOT NULL DEFAULT 1 CHECK(authority_epoch >= 1);

CREATE TRIGGER leases_epoch_current
BEFORE INSERT ON leases
WHEN NEW.authority_epoch != (SELECT authority_epoch FROM controller_meta WHERE singleton=1)
BEGIN
  SELECT RAISE(ABORT, 'lease authority epoch must equal current controller epoch');
END;
