#!/usr/bin/env bash
# setup-webhook.sh — Create or update the GitHub webhook to point at the
# current cluster's Tekton EventListener route.
#
# Prerequisites:
#   - oc CLI logged into the target OpenShift cluster
#   - gh CLI authenticated with repo access
#   - Tekton EventListener deployed in the embassywatch namespace
#
# Usage:
#   ./scripts/setup-webhook.sh                        # auto-detect everything
#   ./scripts/setup-webhook.sh --namespace my-ns      # custom namespace
#   ./scripts/setup-webhook.sh --repo org/repo        # custom repo
#   ./scripts/setup-webhook.sh --delete               # remove the webhook

set -euo pipefail

NAMESPACE="embassywatch"
REPO="NotAMorningSpartan/embassywatch"
EL_NAME="embassywatch-webhook"
DELETE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --repo)      REPO="$2"; shift 2 ;;
    --delete)    DELETE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--namespace NS] [--repo OWNER/REPO] [--delete]"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== EmbassyWatch Webhook Setup ==="
echo "  Namespace: $NAMESPACE"
echo "  Repo:      $REPO"
echo ""

# --- Get the EventListener route URL ---
EL_ROUTE=$(oc get route "el-${EL_NAME}" -n "$NAMESPACE" -o jsonpath='{.spec.host}' 2>/dev/null || true)

if [[ -z "$EL_ROUTE" ]]; then
  echo "ERROR: EventListener route 'el-${EL_NAME}' not found in namespace '$NAMESPACE'."
  echo "       Make sure Tekton triggers are deployed first."
  exit 1
fi

WEBHOOK_URL="http://${EL_ROUTE}"
echo "  EventListener URL: $WEBHOOK_URL"
echo ""

# --- Find existing webhook ---
EXISTING_HOOK_ID=$(gh api "repos/${REPO}/hooks" --jq ".[] | select(.config.url | contains(\"el-${EL_NAME}\")) | .id" 2>/dev/null || true)

# Also check for any webhook pointing to a different cluster's EL
ALL_EW_HOOKS=$(gh api "repos/${REPO}/hooks" --jq '.[] | select(.config.url | contains("el-embassywatch-webhook")) | .id' 2>/dev/null || true)

if $DELETE; then
  if [[ -n "$ALL_EW_HOOKS" ]]; then
    for hook_id in $ALL_EW_HOOKS; do
      echo "Deleting webhook $hook_id..."
      gh api "repos/${REPO}/hooks/${hook_id}" --method DELETE
      echo "  Deleted."
    done
  else
    echo "No EmbassyWatch webhooks found to delete."
  fi
  exit 0
fi

if [[ -n "$EXISTING_HOOK_ID" ]]; then
  echo "Found existing webhook (ID: $EXISTING_HOOK_ID). Updating URL..."
  gh api "repos/${REPO}/hooks/${EXISTING_HOOK_ID}" --method PATCH \
    --field "config[url]=${WEBHOOK_URL}" \
    --field "config[content_type]=json" \
    --field "config[insecure_ssl]=0" \
    --field "active=true" \
    --jq '{ id: .id, url: .config.url, active: .active }' 2>&1
  echo ""
  echo "Webhook updated."
elif [[ -n "$ALL_EW_HOOKS" ]]; then
  # Found a webhook for a different cluster — update it
  OLD_HOOK_ID=$(echo "$ALL_EW_HOOKS" | head -1)
  echo "Found webhook from a different cluster (ID: $OLD_HOOK_ID). Updating to new cluster..."
  gh api "repos/${REPO}/hooks/${OLD_HOOK_ID}" --method PATCH \
    --field "config[url]=${WEBHOOK_URL}" \
    --field "config[content_type]=json" \
    --field "config[insecure_ssl]=0" \
    --field "active=true" \
    --jq '{ id: .id, url: .config.url, active: .active }' 2>&1
  echo ""
  echo "Webhook updated to new cluster."
else
  echo "No existing webhook found. Creating new one..."
  gh api "repos/${REPO}/hooks" --method POST \
    --field "name=web" \
    --field "active=true" \
    --field "config[url]=${WEBHOOK_URL}" \
    --field "config[content_type]=json" \
    --field "config[insecure_ssl]=0" \
    --field "events[]=push" \
    --jq '{ id: .id, url: .config.url, active: .active }' 2>&1
  echo ""
  echo "Webhook created."
fi

echo ""
echo "=== Sending test ping ==="
HOOK_ID=$(gh api "repos/${REPO}/hooks" --jq ".[] | select(.config.url == \"${WEBHOOK_URL}\") | .id")
if [[ -n "$HOOK_ID" ]]; then
  gh api "repos/${REPO}/hooks/${HOOK_ID}/pings" --method POST 2>/dev/null
  echo "Ping sent. Check the EventListener pod logs to confirm receipt:"
  echo "  oc logs -l app.kubernetes.io/managed-by=EventListener -n $NAMESPACE --tail=10"
else
  echo "Could not find hook to ping."
fi

echo ""
echo "=== Done ==="
echo "GitHub will POST to: $WEBHOOK_URL"
echo "Triggers fire on push to main when apps/backend/ or apps/frontend/ change."
