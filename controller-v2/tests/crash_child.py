import os
import sqlite3
import sys

path = sys.argv[1]
mode = sys.argv[2]

con = sqlite3.connect(path, timeout=5.0, isolation_level=None)
con.execute("PRAGMA foreign_keys=ON")
con.execute("PRAGMA synchronous=FULL")

if mode == "committed":
    con.execute("BEGIN IMMEDIATE")
    con.execute(
        "INSERT INTO projection_state(projection_name,destination,last_event_seq,last_event_id,published_at_ms,status,last_error_code) "
        "VALUES('crash-test','test',0,NULL,NULL,'NEVER_PUBLISHED',NULL)"
    )
    con.execute("COMMIT")
    os._exit(0)

if mode == "uncommitted":
    con.execute("BEGIN IMMEDIATE")
    con.execute(
        "INSERT INTO projection_state(projection_name,destination,last_event_seq,last_event_id,published_at_ms,status,last_error_code) "
        "VALUES('crash-test-uncommitted','test',0,NULL,NULL,'NEVER_PUBLISHED',NULL)"
    )
    os._exit(99)

raise SystemExit(2)
