import { showBootError } from "./lib/bootError";

declare global {
  interface Window {
    elysiaBrowserStorageMigration?: Promise<void>;
  }
}

// Bundled dev can move UI code into shared chunks. Load it only after this
// entry runs the React refresh preamble, and catch failures before React mounts.
void Promise.resolve()
  .then(() => {
    if (!window.elysiaBrowserStorageMigration) {
      throw new Error("Could not load the browser storage migration.");
    }
    return window.elysiaBrowserStorageMigration;
  })
  .then(() => import("./main"))
  .then(({ startup }) => startup)
  .catch(showBootError);
