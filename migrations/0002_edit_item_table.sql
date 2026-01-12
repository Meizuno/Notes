PRAGMA foreign_keys = OFF;

CREATE TABLE items_tmp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    parent_id INTEGER,
    FOREIGN KEY (parent_id)
      REFERENCES items_tmp(id)
      ON DELETE CASCADE 
);

INSERT INTO items_tmp (id, label, type, content, parent_id)
SELECT id, label, type, content, parent_id
FROM items;

DROP TABLE items;

ALTER TABLE items_tmp RENAME TO items;

PRAGMA foreign_keys = ON;
