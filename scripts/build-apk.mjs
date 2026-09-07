/**
 * Builds the Android debug APK end to end:
 *
 *   npm run apk
 *
 * The JDK and Android SDK live in a self-contained folder outside the project
 * (see TOOLS below) rather than being installed system-wide, so nothing here
 * depends on JAVA_HOME or ANDROID_HOME already being set on the machine. If you
 * do have your own SDK on PATH, exporting those two variables wins.
 *
 * The output is signed with the debug keystore Android generates on first use.
 * That is enough to sideload onto your own phone, but not to publish — a Play
 * Store build needs a release keystore you generate and keep.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = join(homedir(), ".androidbuild");
const win = platform() === "win32";

/** The bundled JDK, picked by prefix so a point release does not break this. */
function bundledJdk() {
  if (!existsSync(TOOLS)) return null;
  const hit = readdirSync(TOOLS).find((d) => d.startsWith("jdk-21"));
  return hit ? join(TOOLS, hit) : null;
}

const JAVA_HOME = process.env.JAVA_HOME || bundledJdk();
const ANDROID_HOME = process.env.ANDROID_HOME || join(TOOLS, "android-sdk");

if (!JAVA_HOME || !existsSync(JAVA_HOME)) {
  console.error(
    "No JDK 21 found. Set JAVA_HOME, or unpack Temurin 21 into " + join(TOOLS, "jdk-21..."),
  );
  process.exit(1);
}
if (!existsSync(ANDROID_HOME)) {
  console.error("No Android SDK found. Set ANDROID_HOME, or install one into " + ANDROID_HOME);
  process.exit(1);
}

// CAP_BUILD drops the service worker: inside the APK every asset is already
// local, so a precache would only risk serving a stale bundle after an update.
const env = { ...process.env, JAVA_HOME, ANDROID_HOME, CAP_BUILD: "1" };
const run = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, env, stdio: "inherit", shell: win });

/*
 * Every build gets a fresh versionCode.
 *
 * Android decides whether an APK is an upgrade or the same thing again by this
 * number, not by its contents. Leaving it at 1 forever means a rebuilt APK can
 * be refused, or install and leave you staring at the old app wondering why
 * nothing changed.
 */
const gradle = join(ROOT, "android", "app", "build.gradle");
const before = readFileSync(gradle, "utf8");
const code = Number(/versionCode\s+(\d+)/.exec(before)?.[1] ?? 0) + 1;
writeFileSync(gradle, before.replace(/versionCode\s+\d+/, `versionCode ${code}`));
console.log("· versionCode " + code);

console.log("\n· building web assets");
run("npm", ["run", "build"]);

console.log("\n· syncing into the android project");
run("npx", ["cap", "sync", "android"]);

console.log("\n· assembling the apk");
// An absolute path, because cmd does not search the working directory for the
// wrapper the way a POSIX shell finds ./gradlew.
const android = join(ROOT, "android");
run(join(android, win ? "gradlew.bat" : "gradlew"), ["assembleDebug", "--no-daemon"], android);

const apk = join(ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!existsSync(apk)) {
  console.error("\nbuild finished but no APK at " + apk);
  process.exit(1);
}

// Copied out to one fixed name you can keep sending to your phone. Handing
// someone a copy from deep inside the build tree invites installing a stale one
// later, because a rebuild replaces the original and not the copy.
const out = join(ROOT, "gym-log.apk");
copyFileSync(apk, out);
console.log(`\nAPK: ${out}  (versionCode ${code})`);

