import { useNavigate } from "@solidjs/router"
import { createSignal, onMount } from "solid-js"
import { describeError } from "../api"
import { Button } from "../components/button"
import { Field, TextInput } from "../components/field"
import { PageHeader } from "../components/ui"
import { useSession } from "../session"

export function NewWorkspacePage() {
  const session = useSession()
  const navigate = useNavigate()
  const [name, setName] = createSignal("")
  const [slug, setSlug] = createSignal("")
  const [slugEdited, setSlugEdited] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [saving, setSaving] = createSignal(false)

  onMount(() => {
    document.title = "New workspace · Ballm Code"
  })

  const onName = (value: string) => {
    setName(value)
    if (slugEdited()) return
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40),
    )
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      const org = await session.request<{ id: string; slug: string; name: string }>("/api/console/orgs", {
        body: { name: name().trim(), slug: slug().trim() },
      })
      await session.switchOrg(org.id)
      navigate("/", { replace: true })
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="mx-auto max-w-xl">
      <PageHeader
        title="Create a workspace"
        description="Shared models, policy, members, and usage for a team. You can create as many as you need."
      />
      <form class="mt-6 space-y-4 rounded-xl border border-line bg-surface p-5" onSubmit={submit}>
        <Field label="Workspace name" for="workspace-name" required>
          <TextInput
            id="workspace-name"
            name="name"
            placeholder="Acme Engineering"
            value={name()}
            onInput={(event) => onName(event.currentTarget.value)}
            required
            autofocus
          />
        </Field>
        <Field
          label="Workspace URL"
          for="workspace-slug"
          required
          hint="Lowercase letters, numbers, and hyphens. Used in links and CLI output."
        >
          <TextInput
            id="workspace-slug"
            name="slug"
            placeholder="acme"
            value={slug()}
            invalid={Boolean(error())}
            onInput={(event) => {
              setSlugEdited(true)
              setSlug(event.currentTarget.value.toLowerCase())
            }}
            required
          />
        </Field>
        {error() ? (
          <p class="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12.5px] text-danger" role="alert">
            {error()}
          </p>
        ) : null}
        <div class="flex items-center gap-2 pt-1">
          <Button type="submit" variant="primary" loading={saving()} disabled={!name().trim() || !slug().trim()}>
            Create workspace
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
