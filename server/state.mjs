import os from "node:os";
import path from "node:path";

export function stateDirectory(
  env = process.env,
  homeDirectory = os.homedir(),
) {
  return env.LAN_READER_STATE_DIR
    ? path.resolve(env.LAN_READER_STATE_DIR)
    : path.join(homeDirectory, ".lan-library-reader");
}

export const DEFAULT_STATE_DIRECTORY = stateDirectory();
