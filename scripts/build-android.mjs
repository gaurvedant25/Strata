/**
 * Builds the Android app end to end, in one of two shapes:
 *
 *   npm run apk    a debug APK, for sideloading onto your own phone
 *   npm run aab    a signed release bundle, for uploading to Play
 *
 * The JDK and Android SDK live in a self-contained folder outside the project
 * (see TOOLS below) rather than being installed system-wide, so nothing here
 * depends on JAVA_HOME or ANDROID_HOME already being set on the machine. If you
 * do have your own SDK on PATH, exporting those two variables wins.
 *
 * The debug APK is signed with the keystore Android generates on first use.
 * That is enough to sideload, but Play refuses it: a release build is signed
 * with your own keystore, described in `android/keystore.properties`, which is
 * deliberately not in the repository. See `keystore.properties.example`.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = join(homedir(), ".androidbuild");
const win = platform() === "win32";

/** `aab` builds the signed bundle Play wants; anything else builds the APK. */
const release = process.argv.includes("--release");

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

const android = join(ROOT, "android");

/*
 * A release build that quietly falls back to the debug key would be the worst
 * possible outcome: it builds, it uploads, and Play rejects it minutes later
 * with a message about the certificate. Better to stop here and say what is
 * missing, while the fix is still one file away.
 */
const keystoreProps = join(android, "keystore.properties");
if (release) {
  if (!existsSync(keystoreProps)) {
    console.error(
      "No signing config. Copy android/keystore.properties.example to " +
        "android/keystore.properties and fill in your keystore's path and passwords.",
    );
    process.exit(1);
  }
  // A blank value is worse than a missing file: Gradle gets far enough in to
  // fail with an error that reads like the keystore itself is broken.
  const props = readFileSync(keystoreProps, "utf8");
  const blank = ["storeFile", "storePassword", "keyAlias", "keyPassword"].filter(
    // Horizontal whitespace only: `\s` would match the newline and happily
    // find the *next* line's value, so a blank password would look filled in.
    (k) => !new RegExp(`^${k}[ \\t]*=[ \\t]*\\S`, "m").test(props),
  );
  if (blank.length) {
    console.error("android/keystore.properties has nothing set for: " + blank.join(", "));
    process.exit(1);
  }
}

// CAP_BUILD drops the service worker: inside the app every asset is already
// local, so a precache would only risk serving a stale bundle after an update.
const env = { ...process.env, JAVA_HOME, ANDROID_HOME, CAP_BUILD: "1" };
const run = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, env, stdio: "inherit", shell: win });

/*
 * Every build gets a fresh versionCode.
 *
 * Android decides whether a build is an upgrade or the same thing again by this
 * number, not by its contents. Leaving it at 1 forever means a rebuilt APK can
 * be refused, or install and leave you staring at the old app wondering why
 * nothing changed. Play is stricter still: it rejects an upload whose
 * versionCode it has already seen, even for a track you later deleted.
 */
const gradle = join(android, "app", "build.gradle");
const before = readFileSync(gradle, "utf8");
const code = Number(/versionCode\s+(\d+)/.exec(before)?.[1] ?? 0) + 1;
writeFileSync(gradle, before.replace(/versionCode\s+\d+/, `versionCode ${code}`));
console.log("· versionCode " + code);

console.log("\n· building web assets");
run("npm", ["run", "build"]);

console.log("\n· syncing into the android project");
run("npx", ["cap", "sync", "android"]);

console.log(release ? "\n· bundling the signed aab" : "\n· assembling the apk");
// An absolute path, because cmd does not search the working directory for the
// wrapper the way a POSIX shell finds ./gradlew.
run(
  join(android, win ? "gradlew.bat" : "gradlew"),
  [release ? "bundleRelease" : "assembleDebug", "--no-daemon"],
  android,
);

const built = release
  ? join(android, "app", "build", "outputs", "bundle", "release", "app-release.aab")
  : join(android, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!existsSync(built)) {
  console.error("\nbuild finished but nothing at " + built);
  process.exit(1);
}

// Copied out to one fixed name you can keep handing to a phone or to Play.
// Handing someone a copy from deep inside the build tree invites installing a
// stale one later, because a rebuild replaces the original and not the copy.
const out = join(ROOT, release ? "strata.aab" : "strata.apk");
copyFileSync(built, out);
console.log(`\n${release ? "AAB" : "APK"}: ${out}  (versionCode ${code})`);
