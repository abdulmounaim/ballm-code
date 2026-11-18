export function submitForm(id: string) {
  const element = document.getElementById(id)
  if (element instanceof HTMLFormElement) element.requestSubmit()
}
