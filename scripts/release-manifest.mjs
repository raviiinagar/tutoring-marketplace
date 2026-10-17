import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  readdir,
  lstat,
  readlink,
  realpath,
  mkdir,
} from "node:fs/promises";
import { resolve, relative, join, dirname, isAbsolute, sep } from "node:path";
const files = [
  "package.json",
  "package-lock.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
  "lovable-ui/package.json",
  "lovable-ui/package-lock.json",
  "scripts/release-manifest.mjs",
  "scripts/deployment-budget.mjs",
];
const directories = [
  "apps/api/dist",
  "apps/api/migrations",
  "packages/contracts/dist",
  "lovable-ui/.output",
  "deployment",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, path) => path === root || path.startsWith(root + sep);
async function entry(root, path) {
  const name = relative(root, path).split(sep).join("/"),
    info = await lstat(path);
  if (info.isSymbolicLink()) {
    if (!inside(root, await realpath(path)))
      throw new Error("Release symlink leaves artifact root");
    return { path: name, symlink: await readlink(path) };
  }
  if (!info.isFile()) throw new Error("Unsupported release entry");
  return { path: name, sha256: hash(await readFile(path)) };
}
async function walk(root, path) {
  const entries = [];
  for (const name of await readdir(path)) {
    const child = join(path, name),
      info = await lstat(child);
    if (info.isDirectory() && !info.isSymbolicLink())
      entries.push(...(await walk(root, child)));
    else entries.push(await entry(root, child));
  }
  return entries;
}
async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "write") {
    if (!arg || !/^[a-zA-Z0-9._-]{4,100}$/.test(arg))
      throw new Error("Supply a reviewed release ID");
    const root = await realpath(resolve(".")),
      entries = [];
    for (const name of files) entries.push(await entry(root, join(root, name)));
    for (const name of directories)
      entries.push(...(await walk(root, join(root, name))));
    const value = {
      version: 1,
      release_id: arg,
      created_at: new Date().toISOString(),
      files: entries.sort((a, b) => a.path.localeCompare(b.path)),
    };
    await writeFile(join(root, "release.json"), JSON.stringify(value, null, 2));
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/release-files.txt",
      ["release.json", ...value.files.map((f) => f.path)].join("\n") + "\n",
    );
    console.log("Release manifest created: " + value.files.length + " files");
    return;
  }
  if (command !== "verify" || !arg)
    throw new Error("Usage: write <release-id> | verify <artifact-root>");
  const root = await realpath(resolve(arg)),
    value = JSON.parse(await readFile(join(root, "release.json"), "utf8"));
  if (
    value.version !== 1 ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    (process.env.RELEASE_ID && value.release_id !== process.env.RELEASE_ID)
  )
    throw new Error("Release identity mismatch");
  for (const file of value.files) {
    if (
      typeof file.path !== "string" ||
      isAbsolute(file.path) ||
      /[\r\n\0]/.test(file.path) ||
      file.path.split(/[\\/]/).includes("..")
    )
      throw new Error("Invalid artifact path");
    const path = resolve(root, file.path);
    if (!inside(root, path))
      throw new Error("Artifact path leaves release root");
    const actual = await entry(root, path);
    if (actual.sha256 !== file.sha256 || actual.symlink !== file.symlink)
      throw new Error("Artifact checksum mismatch");
  }
  console.log(
    "Verified release " + value.release_id + "; files: " + value.files.length,
  );
}
main().catch(() => {
  console.error(
    "Release verification failed. Check trusted artifact source, release identity, complete files and checksums.",
  );
  process.exitCode = 1;
});
