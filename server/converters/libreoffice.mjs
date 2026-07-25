import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const OFFICE_EXTENSIONS = new Set([".doc", ".docx", ".ppt", ".pptx"]);
const CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  "soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
].filter(Boolean);

async function findBinary() {
  for (const candidate of CANDIDATES) {
    try {
      await run(candidate, ["--version"], { timeout: 5_000 });
      return candidate;
    } catch {
      // Try the next common installation path.
    }
  }
  return null;
}

export async function createLibreOfficeConverter() {
  const binary = await findBinary();
  const cacheRoot = path.join(os.tmpdir(), "lan-library-reader", "office-cache");

  return {
    id: "libreoffice",
    available: Boolean(binary),
    supports(filePath) {
      return OFFICE_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase());
    },
    async convert(sourcePath) {
      if (!binary) throw new Error("LibreOffice is not available");
      if (!this.supports(sourcePath)) throw new Error("Unsupported Office document");

      const stats = await fs.stat(sourcePath);
      const cacheKey = createHash("sha256")
        .update(`${sourcePath}:${stats.size}:${stats.mtimeMs}`)
        .digest("hex");
      const cachedPdf = path.join(cacheRoot, `${cacheKey}.pdf`);
      try {
        await fs.access(cachedPdf);
        return cachedPdf;
      } catch {
        // Continue with conversion.
      }

      await fs.mkdir(cacheRoot, { recursive: true });
      const jobDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lan-reader-office-"));
      try {
        await run(
          binary,
          [
            "--headless",
            "--nologo",
            "--nodefault",
            "--nolockcheck",
            "--convert-to",
            "pdf",
            "--outdir",
            jobDirectory,
            sourcePath,
          ],
          { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        );
        const outputName = `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`;
        const outputPath = path.join(jobDirectory, outputName);
        await fs.copyFile(outputPath, cachedPdf);
        return cachedPdf;
      } finally {
        await fs.rm(jobDirectory, { recursive: true, force: true });
      }
    },
  };
}
