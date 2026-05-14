UPDATE equipment_catalog SET popularity=0;
ALTER TABLE equipment_catalog ALTER COLUMN popularity SET DEFAULT 0;
