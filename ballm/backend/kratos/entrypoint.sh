#!/bin/sh
set -eu

# Kratos v26 does not expand ${VAR} inside every config field, so the template is rendered here.
# Values are escaped for sed's replacement side because passwords contain / + = and similar.
escape() {
  printf '%s' "$1" | sed -e 's/[\\/&|]/\\&/g'
}

render() {
  key="$1"
  value="$2"
  sed -e "s|\\\${${key}}|$(escape "$value")|g"
}

TEMPLATE=/etc/config/kratos/kratos.yml.template
CONFIG=/etc/config/kratos/kratos.yml

cp "$TEMPLATE" "$CONFIG"
COOKIE_SECURE="${COOKIE_SECURE:-true}"
for key in DSN SERVE_PUBLIC_BASE_URL SERVE_ADMIN_BASE_URL COURIER_SMTP_CONNECTION_URI LOG_LEVEL COOKIE_SECURE; do
  eval "value=\${$key-}"
  [ -n "$value" ] || continue
  tmp="$CONFIG.tmp"
  render "$key" "$value" < "$CONFIG" > "$tmp"
  mv "$tmp" "$CONFIG"
done

kratos migrate sql -e --yes -c "$CONFIG"
exec kratos serve -c "$CONFIG" --watch-courier
