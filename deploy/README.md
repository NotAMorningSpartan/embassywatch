# EmbassyWatch Deployment

Kubernetes/OpenShift deployment using Kustomize overlays and ArgoCD GitOps.

## Directory Structure

```
deploy/
  base/              # Base manifests (shared across environments)
    frontend/        # Deployment, Service, Route
    backend/         # Deployment, Service, Route, HPA, ConfigMap, Secret, SA
    postgres/        # StatefulSet, headless Service, Secret
    redis/           # StatefulSet, headless Service, Secret
    ai-config/       # AI model endpoint ConfigMap
  overlays/
    dev/             # 1 replica, mock data, debug logging, small PVCs
    staging/         # 2 replicas, real APIs, info logging, moderate PVCs
    prod/            # 3 replicas, PDBs, anti-affinity, NetworkPolicies, large PVCs
  argocd/            # ArgoCD Application manifests
```

## Prerequisites

- OpenShift 4.x cluster (or Kubernetes 1.25+)
- ArgoCD installed in the `argocd` namespace
- `oc` or `kubectl` CLI configured
- Container images built and pushed to a registry

## Building Images

```bash
# Frontend
podman build -t <registry>/embassywatch-frontend:latest -f apps/frontend/Containerfile apps/frontend/

# Backend
podman build -t <registry>/embassywatch-backend:latest -f apps/backend/Containerfile apps/backend/

# Push
podman push <registry>/embassywatch-frontend:latest
podman push <registry>/embassywatch-backend:latest
```

## Bootstrap ArgoCD

1. Install ArgoCD (if not already present):
   ```bash
   oc new-project argocd
   oc apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```

2. Create the app-of-apps (root Application):
   ```bash
   oc apply -f deploy/argocd/app-of-apps.yaml
   ```

   This creates a root Application that watches `deploy/argocd/` and automatically creates child Applications for each environment.

3. ArgoCD will detect the child Application manifests and deploy:
   - **dev**: auto-sync enabled (deploys immediately)
   - **staging**: auto-sync enabled (deploys immediately)
   - **prod**: manual sync (requires explicit approval)

## Deploying to an Environment

### Dev (automatic)
Push to `main` branch. ArgoCD auto-syncs within ~3 minutes.

### Staging (automatic)
Same as dev - auto-syncs from `main`. Staging uses real API keys (configure in secrets).

### Production (manual)
1. Verify staging is healthy
2. In ArgoCD UI or CLI, sync the prod Application:
   ```bash
   argocd app sync embassywatch-infra-prod
   ```
3. Monitor rollout:
   ```bash
   oc -n embassywatch-prod rollout status deployment/embassywatch-backend
   oc -n embassywatch-prod rollout status deployment/embassywatch-frontend
   ```

## Promoting Between Environments

All environments deploy from the same `main` branch using different Kustomize overlays. To promote:

1. Merge changes to `main`
2. Dev and staging auto-sync
3. Verify in staging
4. Manually sync prod in ArgoCD

For image-specific promotions, update the image tag in the overlay:
```bash
cd deploy/overlays/prod
kustomize edit set image embassywatch-backend=<registry>/embassywatch-backend:<tag>
kustomize edit set image embassywatch-frontend=<registry>/embassywatch-frontend:<tag>
git commit -am "Promote <tag> to prod" && git push
```

## Rollback

### Using ArgoCD
```bash
# View sync history
argocd app history embassywatch-infra-prod

# Rollback to previous revision
argocd app rollback embassywatch-infra-prod <revision-id>
```

### Using kubectl/oc
```bash
# Rollback deployment
oc -n embassywatch-prod rollout undo deployment/embassywatch-backend
oc -n embassywatch-prod rollout undo deployment/embassywatch-frontend

# Rollback to specific revision
oc -n embassywatch-prod rollout undo deployment/embassywatch-backend --to-revision=<N>
```

### Using Git
```bash
git revert <commit-sha>
git push origin main
# ArgoCD will auto-sync dev/staging; manually sync prod
```

## Updating Secrets

Secrets contain placeholder values. Update them per environment:

```bash
# Update backend secrets
oc -n embassywatch-prod create secret generic embassywatch-backend-secrets \
  --from-literal=DB_PASSWORD='<real-password>' \
  --from-literal=JWT_SECRET='<real-secret>' \
  --from-literal=AI_API_KEY='<real-key>' \
  --dry-run=client -o yaml | oc apply -f -

# Update postgres secret
oc -n embassywatch-prod create secret generic embassywatch-postgres-secret \
  --from-literal=POSTGRES_DB=embassywatch \
  --from-literal=POSTGRES_PASSWORD='<real-password>' \
  --dry-run=client -o yaml | oc apply -f -
```

## Sync Waves

ArgoCD deploys resources in order using sync-wave annotations:
- **Wave 0**: Infrastructure (PostgreSQL, Redis, ConfigMaps, Secrets)
- **Wave 1**: Backend (Deployment, Service, HPA)
- **Wave 2**: Frontend (Deployment, Service, Route)

## Validating Manifests

```bash
# Validate base
kustomize build deploy/base/

# Validate an overlay
kustomize build deploy/overlays/dev/
kustomize build deploy/overlays/staging/
kustomize build deploy/overlays/prod/
```
