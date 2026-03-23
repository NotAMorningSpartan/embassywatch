# EmbassyWatch

A threat-monitoring and situational-awareness platform for U.S. embassies and consulates worldwide. EmbassyWatch aggregates data from news feeds, weather services, and travel advisories, then uses an AI inference endpoint (OpenShift AI / vLLM) to generate per-embassy threat assessments with confidence scores, key factors, and recommendations. Analysts can browse an interactive world map, build personalized watchlists, track threat-level trends over time, and receive alerts when conditions change.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Requirements](#requirements)
3. [Repository Layout](#repository-layout)
4. [Local Development](#local-development)
5. [Building Container Images](#building-container-images)
6. [Deploying to OpenShift](#deploying-to-openshift)
7. [Setting Up Tekton CI/CD](#setting-up-tekton-cicd)
8. [Configuring ArgoCD GitOps](#configuring-argocd-gitops)
9. [Environment Promotion](#environment-promotion)
10. [Environment Variables](#environment-variables)

---

## Architecture

```
                         +-----------------------------------------+
                         |            OpenShift Cluster             |
                         |                                         |
  GitHub ----webhook---> |  +-------------+    +-----------------+ |
                         |  |   Tekton    |--->| Image Registry  | |
                         |  | Pipelines   |    | (built images)  | |
                         |  +-------------+    +--------+--------+ |
                         |                              |          |
                         |  +---------------------------v--------+ |
                         |  |             ArgoCD (GitOps)         | |
                         |  +--+----------+----------+----------++ |
                         |     |          |          |          |  |
                         |     v          v          v          v  |
                         |  +------+  +-------+  +------+  +----+ |
                         |  |Nginx |  |Express|  |Postgr|  |Redi| |
  Users ---HTTPS-------->|  |Front |  |Back   |  |  SQL |  |  s | |
                         |  | end  |  | end   |  | 16   |  | 7  | |
                         |  +--+---+  +---+---+  +--+---+  +-+--+ |
                         |     |          |          |        |    |
                         |     |   /api/* |   TypeORM|  JWT + |    |
                         |     +--------->+--------->+ Rate   |    |
                         |                |          | Limit  |    |
                         |                |          +--------+    |
                         |                |                        |
                         |                v                        |
                         |  +-----------------------------------+  |
                         |  |         OpenShift AI / vLLM        | |
                         |  |   (OpenAI-compatible /v1/chat)     | |
                         |  +-----------------------------------+  |
                         |                                         |
                         |  External Data Sources (mock or live):  |
                         |    - NewsAPI.org                        |
                         |    - OpenWeatherMap                     |
                         |    - State Dept Travel Advisories       |
                         +-----------------------------------------+

  +--------------------------------------------------------------+
  |                    Component Breakdown                        |
  +--------------------------------------------------------------+
  | Frontend (Nginx)                                              |
  |   React 18 + TypeScript + Vite                                |
  |   USWDS-styled layout (dark/light theme)                     |
  |   Leaflet world map with marker clustering                   |
  |   Pages: Dashboard, Embassy List, Embassy Detail,            |
  |           Watchlist, Admin Panel, Settings, Login             |
  +--------------------------------------------------------------+
  | Backend (Express)                                             |
  |   Node.js 20 + TypeScript + Express 5                        |
  |   JWT auth with refresh tokens (Redis blacklist)             |
  |   REST API: /api/auth, /api/embassies, /api/users,          |
  |             /api/admin, /api/threats                          |
  |   Data aggregation service (news, weather, advisories)       |
  |   AI threat analysis via OpenAI-compatible endpoint          |
  |   Cron: aggregation every 30min, analysis every 6hr          |
  +--------------------------------------------------------------+
  | PostgreSQL 16                                                 |
  |   Entities: Embassy, User, ThreatAssessment,                 |
  |             DataSource, RawEvent                              |
  +--------------------------------------------------------------+
  | Redis 7                                                       |
  |   JWT refresh-token blacklist, rate limiting                  |
  +--------------------------------------------------------------+
```

---

## Requirements

### Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x LTS | Runtime for frontend build and backend server |
| npm | 10.x+ | Package manager (ships with Node 20) |
| TypeScript | 6.x | Type checking (installed per workspace) |
| Podman or Docker | 4.x+ / 24.x+ | Building container images |
| PostgreSQL | 16.x | Primary database |
| Redis | 7.x | Token blacklist and rate limiting |
| oc (OpenShift CLI) | 4.x | Cluster management |
| kubectl | 1.25+ | Kubernetes resource management |
| kustomize | 5.x+ | Manifest generation (bundled with kubectl) |
| Tekton CLI (tkn) | 0.35+ | Pipeline management |
| ArgoCD CLI | 2.x | GitOps management |
| Git | 2.x | Source control |

### Platform

- **Target:** Red Hat OpenShift 4.x (Kubernetes 1.25+)
- **AI Inference:** OpenShift AI / vLLM serving an OpenAI-compatible endpoint (`/v1/chat/completions`)
- **Image Registry:** OpenShift internal registry or any OCI-compliant registry (Quay, GHCR, etc.)
- **DNS/TLS:** OpenShift Routes with TLS edge termination

### Local Development

- Any OS with Node.js 20 (Windows, macOS, Linux)
- PostgreSQL 16 and Redis 7 running locally (or via Podman/Docker containers)
- No API keys required for local dev — set `USE_MOCK_DATA=true` to use built-in mock data generators

---

## Repository Layout

```
embassywatch/
├── apps/
│   ├── frontend/            React 18 + Vite SPA
│   │   ├── src/
│   │   │   ├── components/  USWDSLayout, EmbassyMap, ProtectedRoute
│   │   │   ├── hooks/       React Query hooks (embassies, users, watchlist)
│   │   │   ├── pages/       Dashboard, Embassies, Detail, Watchlist, Admin, Login
│   │   │   ├── services/    Axios API client with JWT interceptor
│   │   │   ├── stores/      Zustand (auth, preferences/theme)
│   │   │   └── styles/      USWDS-based CSS with light/dark themes
│   │   ├── Containerfile    Multi-stage: node:20 build -> nginx:alpine serve
│   │   ├── nginx.conf       SPA fallback, gzip, security headers
│   │   └── vite.config.ts
│   └── backend/             Express 5 REST API
│       ├── src/
│       │   ├── config/      Database connection (TypeORM)
│       │   ├── entities/    Embassy, User, ThreatAssessment, DataSource, RawEvent
│       │   ├── middleware/   Auth (JWT), role check, rate limit, validation, errors
│       │   ├── routes/      auth, embassies, users, admin, threats
│       │   ├── services/    AI client, threat analysis, data aggregation, adapters
│       │   └── seeds/       50+ real embassy locations, default admin user
│       ├── Containerfile    Multi-stage: node:20 build -> node:20 slim runtime
│       └── .env.example
├── deploy/
│   ├── base/                Kustomize base manifests
│   │   ├── frontend/        Deployment, Service, Route
│   │   ├── backend/         Deployment, Service, Route, HPA, ConfigMap, Secret, SA
│   │   ├── postgres/        StatefulSet, Service, Secret (16-alpine, 10Gi PVC)
│   │   ├── redis/           StatefulSet, Service, Secret (7-alpine, 1Gi PVC)
│   │   └── ai-config/       ConfigMap for AI endpoint settings
│   ├── overlays/
│   │   ├── dev/             1 replica, mock data, debug logging, 1Gi PVCs
│   │   ├── staging/         2 replicas, real APIs, info logging, 5Gi PVCs
│   │   └── prod/            3 replicas, PDBs, anti-affinity, NetworkPolicy, 20Gi PVCs
│   ├── argocd/              App-of-apps + per-environment Application CRDs
│   └── README.md            Deployment-specific docs
├── pipelines/
│   ├── build-frontend.yaml  Tekton Pipeline: clone -> install -> test -> build -> push -> update-manifest
│   ├── build-backend.yaml   Tekton Pipeline: clone -> install -> lint -> test -> build -> push -> update-manifest
│   ├── promote-env.yaml     Tekton Pipeline: copy image tag between overlays
│   ├── tasks/               Custom Tekton Tasks (npm-install, npm-test, npm-build, etc.)
│   ├── triggers/            EventListener, TriggerBindings, TriggerTemplates
│   └── README.md            Pipeline-specific docs
├── package.json             Workspaces: apps/*
├── tsconfig.base.json       Shared TypeScript compiler options
└── .gitignore
```

---

## Local Development

### 1. Prerequisites

Start PostgreSQL and Redis. Using Podman:

```bash
podman run -d --name ew-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=embassywatch \
  -p 5432:5432 postgres:16-alpine

podman run -d --name ew-redis \
  -p 6379:6379 redis:7-alpine
```

### 2. Install Dependencies

```bash
git clone https://github.com/NotAMorningSpartan/embassywatch.git
cd embassywatch
npm install
```

This installs all workspace dependencies (frontend and backend) from the root.

### 3. Configure the Backend

```bash
cp apps/backend/.env.example apps/backend/.env
```

The defaults work out of the box with the Podman containers above. `USE_MOCK_DATA=true` is set so no external API keys are needed.

### 4. Seed the Database

```bash
cd apps/backend
npx tsx src/seeds/seed.ts
```

This creates:
- 53 real U.S. embassy/consulate locations with coordinates across all 6 regions
- Admin user: `admin@embassywatch.gov` / `demo-password`
- Analyst user: `analyst@embassywatch.gov` / `demo-password`
- Sample data sources, events, and threat assessments

### 5. Start Development Servers

From the repo root, run each in a separate terminal:

```bash
# Terminal 1 — Backend (port 4000)
cd apps/backend
npm run dev

# Terminal 2 — Frontend (port 3000)
cd apps/frontend
npm run dev
```

Open http://localhost:3000 and log in with the seeded credentials.

---

## Building Container Images

Both apps have multi-stage Containerfiles. Build from the repo root so workspace files are available to the build context.

```bash
# Frontend — builds with Node 20, serves with Nginx
podman build -t embassywatch-frontend:latest \
  -f apps/frontend/Containerfile .

# Backend — builds with Node 20, runs with Node 20 as non-root
podman build -t embassywatch-backend:latest \
  -f apps/backend/Containerfile .
```

### Push to a Registry

```bash
IMAGE_REGISTRY=quay.io/your-org  # or image-registry.openshift-image-registry.svc:5000/embassywatch-dev

podman tag embassywatch-frontend:latest $IMAGE_REGISTRY/embassywatch-frontend:v1.0.0
podman tag embassywatch-backend:latest  $IMAGE_REGISTRY/embassywatch-backend:v1.0.0

podman push $IMAGE_REGISTRY/embassywatch-frontend:v1.0.0
podman push $IMAGE_REGISTRY/embassywatch-backend:v1.0.0
```

---

## Deploying to OpenShift

### Step 1 — Create the Namespace

```bash
oc new-project embassywatch-dev
```

### Step 2 — Update Secrets

Edit the base secrets with real values before deploying. **Do not commit real secrets to Git.** Use `oc create secret` or an external secret manager.

```bash
# Database password
oc create secret generic embassywatch-backend-secret \
  --from-literal=DB_PASSWORD='<strong-password>' \
  --from-literal=JWT_SECRET='<random-256-bit-key>' \
  --from-literal=AI_API_KEY='' \
  --from-literal=NEWSAPI_KEY='' \
  --from-literal=OPENWEATHER_KEY='' \
  -n embassywatch-dev

oc create secret generic embassywatch-postgres-secret \
  --from-literal=POSTGRES_PASSWORD='<same-db-password>' \
  --from-literal=POSTGRES_DB='embassywatch' \
  -n embassywatch-dev

oc create secret generic embassywatch-redis-secret \
  --from-literal=REDIS_PASSWORD='' \
  -n embassywatch-dev
```

### Step 3 — Update Image References

Edit `deploy/overlays/dev/kustomization.yaml` to point to your registry:

```yaml
images:
  - name: embassywatch-frontend
    newName: quay.io/your-org/embassywatch-frontend
    newTag: v1.0.0
  - name: embassywatch-backend
    newName: quay.io/your-org/embassywatch-backend
    newTag: v1.0.0
```

### Step 4 — Validate the Manifests

```bash
kustomize build deploy/overlays/dev/ | oc apply --dry-run=server -f -
```

### Step 5 — Deploy

```bash
kustomize build deploy/overlays/dev/ | oc apply -f -
```

### Step 6 — Verify

```bash
# Watch pods come up
oc get pods -w -n embassywatch-dev

# Check backend health
oc get route embassywatch-backend -n embassywatch-dev -o jsonpath='{.spec.host}'
curl https://<backend-route>/healthz

# Check frontend
oc get route embassywatch-frontend -n embassywatch-dev -o jsonpath='{.spec.host}'
```

### Step 7 — Seed the Database (First Deploy Only)

```bash
BACKEND_POD=$(oc get pod -l app=embassywatch-backend -o jsonpath='{.items[0].metadata.name}' -n embassywatch-dev)
oc exec -it $BACKEND_POD -n embassywatch-dev -- node apps/backend/dist/seeds/seed.js
```

---

## Setting Up Tekton CI/CD

Tekton automates building images on every push to `main` and updating the Kustomize overlays so ArgoCD can deploy them.

### Step 1 — Install Tekton on the Cluster

If not already installed via the OpenShift Pipelines Operator:

```bash
# Via OperatorHub (recommended on OpenShift)
# Navigate to: OperatorHub -> search "OpenShift Pipelines" -> Install

# Or via CLI
oc apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
oc apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
```

### Step 2 — Apply Custom Tasks

```bash
oc apply -f pipelines/tasks/ -n embassywatch-dev
```

This installs 6 custom tasks: `npm-install`, `npm-test`, `npm-build`, `npm-lint`, `update-manifest`, `promote-image`.

### Step 3 — Apply Pipelines

```bash
oc apply -f pipelines/build-frontend.yaml -n embassywatch-dev
oc apply -f pipelines/build-backend.yaml -n embassywatch-dev
oc apply -f pipelines/promote-env.yaml -n embassywatch-dev
```

### Step 4 — Create Pipeline Workspace PVC

```bash
oc apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: embassywatch-pipeline-pvc
  namespace: embassywatch-dev
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Gi
EOF
```

### Step 5 — Set Up GitHub Webhook Triggers

```bash
# Apply triggers
oc apply -f pipelines/triggers/ -n embassywatch-dev

# Get the EventListener route
oc get route el-embassywatch-listener -n embassywatch-dev -o jsonpath='{.spec.host}'
```

Then in your GitHub repo settings:
1. Go to **Settings > Webhooks > Add webhook**
2. **Payload URL:** `https://<event-listener-route>`
3. **Content type:** `application/json`
4. **Events:** select "Just the push event"
5. **Active:** checked

Pushes to `apps/frontend/` on `main` trigger the frontend pipeline. Pushes to `apps/backend/` trigger the backend pipeline. CEL filters in the TriggerTemplates handle path-based routing.

### Step 6 — Test with a Manual Run

```bash
# Frontend pipeline
tkn pipeline start embassywatch-build-frontend \
  -p git-url=https://github.com/NotAMorningSpartan/embassywatch.git \
  -p git-revision=main \
  -p image-registry=quay.io/your-org \
  -w name=shared-workspace,claimName=embassywatch-pipeline-pvc \
  -n embassywatch-dev

# Watch progress
tkn pipelinerun logs -f -n embassywatch-dev
```

---

## Configuring ArgoCD GitOps

ArgoCD watches the `deploy/` directory in Git and automatically syncs cluster state to match.

### Step 1 — Install ArgoCD

```bash
# Via OperatorHub (recommended on OpenShift)
# Navigate to: OperatorHub -> search "OpenShift GitOps" -> Install

# Verify
oc get pods -n openshift-gitops
```

### Step 2 — Grant ArgoCD Access to Namespaces

```bash
for NS in embassywatch-dev embassywatch-staging embassywatch-prod; do
  oc create namespace $NS --dry-run=client -o yaml | oc apply -f -
  oc label namespace $NS argocd.argoproj.io/managed-by=openshift-gitops
done
```

### Step 3 — Add the Git Repository

```bash
argocd repo add https://github.com/NotAMorningSpartan/embassywatch.git
```

### Step 4 — Deploy the App-of-Apps

```bash
oc apply -f deploy/argocd/app-of-apps.yaml -n openshift-gitops
```

This creates a root Application that discovers and deploys the child Applications:
- `infra-dev.yaml` — deploys `deploy/overlays/dev/` to `embassywatch-dev` (auto-sync)
- `infra-staging.yaml` — deploys `deploy/overlays/staging/` to `embassywatch-staging` (auto-sync)
- `infra-prod.yaml` — deploys `deploy/overlays/prod/` to `embassywatch-prod` (manual sync)

Sync-wave ordering ensures infrastructure (PostgreSQL, Redis) deploys first (wave 0), then backend (wave 1), then frontend (wave 2).

### Step 5 — Verify in ArgoCD UI

```bash
# Get the ArgoCD route
oc get route openshift-gitops-server -n openshift-gitops -o jsonpath='{.spec.host}'
```

Open the URL. You should see the `embassywatch` app-of-apps with child applications for each environment.

---

## Environment Promotion

The pipeline flow is: **dev -> staging -> prod**.

### Automatic (via Tekton)

After a successful build pipeline, the `update-manifest` task commits the new image tag to `deploy/overlays/dev/kustomization.yaml`. ArgoCD detects the change and auto-syncs dev.

### Promote to Staging

```bash
tkn pipeline start embassywatch-promote-env \
  -p source-env=dev \
  -p target-env=staging \
  -p git-url=https://github.com/NotAMorningSpartan/embassywatch.git \
  -w name=shared-workspace,claimName=embassywatch-pipeline-pvc \
  -n embassywatch-dev
```

This copies the image tags from the dev overlay to the staging overlay and commits. ArgoCD auto-syncs staging.

### Promote to Production

```bash
tkn pipeline start embassywatch-promote-env \
  -p source-env=staging \
  -p target-env=prod \
  -p git-url=https://github.com/NotAMorningSpartan/embassywatch.git \
  -w name=shared-workspace,claimName=embassywatch-pipeline-pvc \
  -n embassywatch-dev
```

Production requires a **manual sync** in ArgoCD:

```bash
argocd app sync embassywatch-infra-prod
```

### Rollback

```bash
# Option 1 — ArgoCD history
argocd app history embassywatch-infra-prod
argocd app rollback embassywatch-infra-prod <history-id>

# Option 2 — Git revert
git revert <commit-sha>
git push origin main
# ArgoCD picks up the reverted manifest automatically
```

---

## Environment Variables

### Backend (`apps/backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL hostname |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_DATABASE` | `embassywatch` | Database name |
| `DB_LOGGING` | `false` | Enable TypeORM query logging |
| `PORT` | `4000` | Express server port |
| `NODE_ENV` | `development` | Environment (`development`, `staging`, `production`) |
| `JWT_SECRET` | (required) | Secret for signing JWTs |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `USE_MOCK_DATA` | `true` | Use mock data generators instead of real APIs |
| `AGGREGATION_CRON` | `*/30 * * * *` | Data aggregation schedule |
| `AGGREGATE_ON_STARTUP` | `true` | Run aggregation on server start |
| `AI_ENDPOINT_URL` | (empty) | OpenAI-compatible inference URL |
| `AI_MODEL_NAME` | `default` | Model name for the inference endpoint |
| `AI_API_KEY` | (empty) | API key for the inference endpoint |
| `AI_TEMPERATURE` | `0.3` | Model temperature |
| `AI_MAX_TOKENS` | `2048` | Max response tokens |
| `AI_TIMEOUT` | `60` | Request timeout in seconds |
| `ANALYSIS_CRON` | `0 */6 * * *` | AI analysis schedule |
| `NEWSAPI_KEY` | (empty) | NewsAPI.org key (optional) |
| `OPENWEATHER_KEY` | (empty) | OpenWeatherMap key (optional) |

### Frontend (`apps/frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | Backend API base URL |
