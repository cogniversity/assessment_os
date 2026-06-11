-- Multi-role RBAC: replace single role column with roles array

ALTER TABLE "User" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY['candidate']::"Role"[];

UPDATE "User" SET "roles" = ARRAY["role"]::"Role"[];

ALTER TABLE "User" DROP COLUMN "role";
