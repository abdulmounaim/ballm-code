import { render } from "solid-js/web"
import { App } from "./app"
import { ToastProvider } from "./components/toast"
import { SessionProvider } from "./session"
import "./styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("Console root element is missing")

render(
  () => (
    <SessionProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </SessionProvider>
  ),
  root,
)
