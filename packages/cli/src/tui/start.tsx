import { render } from "ink";
import { App, type AppProps } from "./App.js";

export async function startTui(props: AppProps): Promise<void> {
  const app = render(<App {...props} />, { exitOnCtrlC: false });
  await app.waitUntilExit();
}
