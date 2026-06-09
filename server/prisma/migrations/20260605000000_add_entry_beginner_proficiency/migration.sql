-- Migration part 1: add the two new enum values.
-- Must be committed before the values can be used in DML (Postgres restriction).
ALTER TYPE "Proficiency" ADD VALUE IF NOT EXISTS 'entry';
ALTER TYPE "Proficiency" ADD VALUE IF NOT EXISTS 'beginner';
