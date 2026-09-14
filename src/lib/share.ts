import { Capacitor } from "@capacitor/core";

/**
 * Getting a file off the phone.
 *
 * Three ways out, in order of how well they land: the native share sheet on
 * Android, the Web Share sheet on an iPhone, and a plain download anywhere
 * else. The caller does not care which — it gets back what happened, and
 * "cancelled" is one of the things that can happen rather than a failure.
 *
 * This is deliberately **not** an `async function`. On WebKit `navigator.share`
 * has to be reached on the first tick of the tap that asked for it: put any
 * await in front of it — even one that resolves immediately — and the user
 * activation is gone and the call rejects with `NotAllowedError`. So the web
 * path is written as a plain promise chain, and anything slow (drawing the
 * card, encoding the PNG) has to have happened already.
 */

export type ShareOutcome = "shared" | "saved" | "cancelled" | "failed";

export function shareFile(file: File, title?: string): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) return shareNative(file);

  if (navigator.canShare?.({ files: [file] })) {
    // Files only, with no `text` alongside. Instagram's iOS extension will
    // sometimes take a share carrying text as a *text* share and quietly drop
    // the image, which is the one failure here nobody would think to look for.
    return navigator
      .share({ files: [file], title })
      .then(() => "shared" as const)
      .catch((e: unknown) => {
        // Backing out of the sheet is a decision, not an error. The JSON
        // backup used to treat it as one and silently start a download.
        if (e instanceof Error && e.name === "AbortError") return "cancelled";
        return download(file);
      });
  }
  return Promise.resolve(download(file));
}

/**
 * Android, through the bridge.
 *
 * `Share.share` wants a file that exists, so the PNG is written to the cache
 * directory first and shared by its `content://` URI. The FileProvider that
 * turns one into the other is already declared in the manifest, and already
 * has the cache directory open to it.
 */
async function shareNative(file: File): Promise<ShareOutcome> {
  try {
    const [{ Share }, { Filesystem, Directory }] = await Promise.all([
      import("@capacitor/share"),
      import("@capacitor/filesystem"),
    ]);
    const data = await base64(file);
    const { uri } = await Filesystem.writeFile({
      path: file.name,
      data,
      directory: Directory.Cache,
    });
    await Share.share({ files: [uri] });
    return "shared";
  } catch (e) {
    if (e instanceof Error && /cancel/i.test(e.message)) return "cancelled";
    return "failed";
  }
}

function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    // readAsDataURL gives "data:<type>;base64,<payload>" and the bridge wants
    // only the payload.
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(file);
  });
}

function download(file: File): ShareOutcome {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
