import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { Brand } from "@opencode/schema/brand"
import { writeClipboard } from "@opencode/session-ui/copy"
import { useDialog } from "@opencode/ui/context/dialog"
import { Logo } from "@opencode/ui/logo"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ExternalLink } from "@/runtime/platform/external-link"
import { showToast } from "@/shell/notifications/toast"
import {
  INITIAL_ABOUT_COPY_STATE,
  selectAboutCopyView,
  transitionAboutCopy,
  type AboutCopyEffect,
  type AboutCopyEvent,
} from "./machine"

export function SettingsAbout(props: { active: boolean }) {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const [copyState, setCopyState] = createSignal(INITIAL_ABOUT_COPY_STATE)
  const copy = createMemo(() => selectAboutCopyView(copyState()))
  const version = () => platform.version ?? language.t("settings.about.devVersion")
  const versionLabel = () => language.t("settings.about.version", { version: version() })
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  const dispatchCopy = (event: AboutCopyEvent) =>
    untrack(() => {
      const previous = copyState()
      const next = transitionAboutCopy(previous, event)

      if (next.state !== previous) setCopyState(next.state)
      next.effects.forEach(runCopyEffect)
    })

  function runCopyEffect(effect: AboutCopyEffect) {
    if (effect.type === "timer.clear") return clearTimeout(copyTimer)

    if (effect.type === "timer.schedule") {
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => dispatchCopy({ type: effect.event, attempt: effect.attempt }), effect.delayMs)

      return
    }

    if (effect.type === "toast.failed")
      return showToast({ variant: "error", title: language.t("settings.about.copyVersionFailed") })

    const attempt = effect.attempt
    void Promise.try(() =>
      platform.writeClipboardText
        ? platform.writeClipboardText(effect.text).then(() => true)
        : writeClipboard(effect.text),
    ).then(
      (written) => dispatchCopy({ type: written ? "copy.succeeded" : "copy.failed", attempt }),
      () => dispatchCopy({ type: "copy.failed", attempt }),
    )
  }

  createEffect(() => {
    if (!props.active) dispatchCopy({ type: "hidden" })
  })
  onCleanup(() => dispatchCopy({ type: "disposed" }))

  const showNotices = async () => {
    const loaded = await import("./notices/dialog").catch(() => undefined)

    if (!loaded) {
      showToast({ variant: "error", title: language.t("settings.about.notices.loadFailed") })

      return
    }

    void dialog.show(() => <loaded.default />)
  }

  return (
    <div class="settings-about-content">
      <div class="settings-about-intro">
        <div class="settings-about-version-line">
          <Tooltip
            value={language.t(copy().copied ? "common.copied" : "ui.message.copy")}
            placement="top"
            forceOpen={copy().forceOpen}
          >
            <button
              type="button"
              class="settings-about-version"
              disabled={copy().disabled}
              aria-label={language.t(copy().copied ? "common.copied" : "ui.message.copy")}
              onClick={() => dispatchCopy({ type: "copy.requested", text: versionLabel() })}
            >
              <span>
                {language.rich("settings.about.version", {
                  version: <bdi dir="ltr">{version()}</bdi>,
                })}
              </span>
            </button>
          </Tooltip>
        </div>
        <p>{language.t("settings.about.license")}</p>
      </div>

      <Logo class="settings-about-wordmark" />

      <div class="settings-about-credits">
        <p>{Brand.attribution.notice}</p>
        <p>
          <ExternalLink href={Brand.attribution.url}>github.com/anomalyco/opencode</ExternalLink>
        </p>
      </div>

      <div class="settings-about-details">
        <p>
          {Brand.name} is the internal coding agent for {Brand.legalName}. Models, policy, and usage are managed by the
          Ballm control plane.
        </p>
        <p>
          <ExternalLink href={Brand.website}>{Brand.website.replace(/^https?:\/\//, "")}</ExternalLink>
        </p>
        <p>
          <ExternalLink href={Brand.docs}>Documentation</ExternalLink>
          {" · "}
          <ExternalLink href={Brand.support}>Support</ExternalLink>
        </p>
        <p>
          <button type="button" class="settings-about-link" onClick={() => void showNotices()}>
            {language.t("settings.about.notices.title")}
          </button>
        </p>
      </div>

      <p>{Brand.copyright}</p>
    </div>
  )
}
