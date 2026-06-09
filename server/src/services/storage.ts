import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";

export async function ensureUploadDirs() {
  await fs.mkdir(config.photoStoragePath, { recursive: true });
  await fs.mkdir(path.join(config.photoStoragePath, "photos"), { recursive: true });
  await fs.mkdir(path.join(config.photoStoragePath, "resumes"), { recursive: true });
  await fs.mkdir(path.join(config.photoStoragePath, "external-certs"), { recursive: true });
}

export function photoPath(filename: string) {
  return path.join(config.photoStoragePath, "photos", filename);
}

export function resumePath(filename: string) {
  return path.join(config.photoStoragePath, "resumes", filename);
}

export function externalCertPath(filename: string) {
  return path.join(config.photoStoragePath, "external-certs", filename);
}
