-- Add colmenas_con_reina column to mon_colmenas
-- The UI collects this data but the column was missing from the table
ALTER TABLE mon_colmenas ADD COLUMN IF NOT EXISTS colmenas_con_reina integer NOT NULL DEFAULT 0;
