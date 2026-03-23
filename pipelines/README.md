# EmbassyWatch Tekton Pipelines

CI/CD pipelines for building, testing, and deploying EmbassyWatch on OpenShift.

## Architecture

```
GitHub Push (main) ──> EventListener ──> CEL Filter ──> TriggerTemplate ──> PipelineRun
                                          │                                      │
                              (apps/frontend/*?)                    build-frontend pipeline
                              (apps/backend/*?)                     build-backend pipeline
                                                                         │
                                                                    git-clone
                                                                    npm-install
                                                                    npm-lint (backend only)
                                                                    npm-test
                                                                    npm-build
                                                                    buildah-build
                                                                    push-image
                                                                    update-manifest ──> ArgoCD syncs dev
```

### Promotion Flow

```
dev ──(promote-env)──> staging ──(promote-env)──> prod
```

The `promote-env` pipeline copies the image tag from the source environment's
`kustomization.yaml` to the target environment's, commits the change, and
ArgoCD picks up the new tag and syncs.

## Pipelines

| Pipeline | Purpose | Trigger |
|---|---|---|
| `build-frontend` | Build and deploy frontend | Push to `apps/frontend/` on main |
| `build-backend` | Build and deploy backend (includes lint) | Push to `apps/backend/` on main |
| `promote-env` | Promote image between environments | Manual |

## Custom Tasks

| Task | Description |
|---|---|
| `npm-install` | Run `npm ci` in an app directory |
| `npm-test` | Run `npm test` in an app directory |
| `npm-build` | Run `npm run build` in an app directory |
| `npm-lint` | Run `npm run lint` in an app directory |
| `update-manifest` | Update image tag in a Kustomize overlay and push |
| `promote-image` | Copy image tag between overlay environments |

ClusterTasks used: `git-clone`, `buildah`.

## Setup

### Prerequisites

- OpenShift cluster with Tekton Pipelines operator installed
- Tekton Triggers operator installed
- `buildah` and `git-clone` ClusterTasks available
- `pipeline` ServiceAccount with push access to the image registry

### Install Tasks and Pipelines

```bash
# Apply custom tasks
oc apply -f pipelines/tasks/

# Apply pipelines
oc apply -f pipelines/build-frontend.yaml
oc apply -f pipelines/build-backend.yaml
oc apply -f pipelines/promote-env.yaml

# Apply triggers
oc apply -f pipelines/triggers/
```

### Configure GitHub Webhook

1. Get the webhook URL:
   ```bash
   oc get route embassywatch-webhook -o jsonpath='{.spec.host}'
   ```

2. In GitHub repo Settings > Webhooks > Add webhook:
   - **Payload URL**: `https://<route-host>`
   - **Content type**: `application/json`
   - **Secret**: Match the value in `github-webhook-secret`
   - **Events**: Just the push event

3. Update the webhook secret:
   ```bash
   oc create secret generic github-webhook-secret \
     --from-literal=secret=YOUR_ACTUAL_SECRET \
     --dry-run=client -o yaml | oc apply -f -
   ```

## Manual Triggers

### Build frontend manually

```bash
oc create -f pipelines/pipelinerun-frontend.yaml
```

### Build backend manually

```bash
oc create -f pipelines/pipelinerun-backend.yaml
```

### Promote between environments

Edit `pipelines/pipelinerun-promote.yaml` to set the desired `APP_NAME`,
`SOURCE_ENV`, and `TARGET_ENV`, then:

```bash
# Promote frontend from dev to staging
oc create -f pipelines/pipelinerun-promote.yaml

# Or use tkn CLI directly
tkn pipeline start promote-env \
  -p APP_NAME=frontend \
  -p SOURCE_ENV=dev \
  -p TARGET_ENV=staging \
  -w name=shared-workspace,volumeClaimTemplateFile=pipelines/pvc-template.yaml
```

### Promote to production

```bash
tkn pipeline start promote-env \
  -p APP_NAME=frontend \
  -p SOURCE_ENV=staging \
  -p TARGET_ENV=prod \
  -w name=shared-workspace,volumeClaimTemplateFile=pipelines/pvc-template.yaml
```

Production ArgoCD apps use manual sync, so after the commit lands you must
sync manually in the ArgoCD UI or via:

```bash
argocd app sync embassywatch-frontend-prod
```

## Adding a New Service

1. Create a new pipeline YAML following the `build-frontend.yaml` pattern.
2. Create a `TriggerTemplate` for the new service in `pipelines/triggers/`.
3. Add a new trigger entry in the `EventListener` with a CEL filter matching
   the service's source path (e.g., `apps/my-service/`).
4. Create a manual `PipelineRun` YAML for ad-hoc builds.
5. Apply all new resources: `oc apply -f pipelines/`

## Monitoring

```bash
# List recent pipeline runs
tkn pipelinerun list

# Watch a running pipeline
tkn pipelinerun logs build-frontend-abc123 -f

# Check trigger status
tkn eventlistener list
```
