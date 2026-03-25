# EmbassyWatch

[![Frontend on Quay.io](https://img.shields.io/badge/quay.io-frontend%20%7C%20latest-ee0000?logo=red-hat-open-shift&logoColor=white)](https://quay.io/repository/tknessmi-rh/embassywatch-frontend)
[![Backend on Quay.io](https://img.shields.io/badge/quay.io-backend%20%7C%20latest-ee0000?logo=red-hat-open-shift&logoColor=white)](https://quay.io/repository/tknessmi-rh/embassywatch-backend)

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
├── scripts/
│   └── setup-webhook.sh     Auto-creates/updates GitHub webhook for current cluster
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
oc new-project embassywatch
```

### Step 2 — Build and Push Container Images

Build from the repo root and push to a public registry (e.g., Quay.io). Make sure you are logged into the registry (`podman login quay.io`).

```bash
IMAGE_REGISTRY=quay.io/your-org

# Backend
podman build -t $IMAGE_REGISTRY/embassywatch-backend:latest \
  -f apps/backend/Containerfile .
podman push $IMAGE_REGISTRY/embassywatch-backend:latest

# Frontend (includes nginx proxy for /api/ to backend service)
podman build -t $IMAGE_REGISTRY/embassywatch-frontend:latest \
  -f apps/frontend/Containerfile .
podman push $IMAGE_REGISTRY/embassywatch-frontend:latest
```

> **Note:** The frontend Containerfile configures nginx to listen on port 8080 (OpenShift runs containers as non-root random UIDs). The nginx.conf proxies `/api/*` requests to the `embassywatch-backend` service on port 4000, so the frontend and backend share a single Route.

Ensure the image repositories are set to **Public** on Quay.io, or create an image pull secret:
```bash
oc create secret docker-registry quay-pull \
  --docker-server=quay.io \
  --docker-username=<user> \
  --docker-password=<token> \
  -n embassywatch
oc secrets link default quay-pull --for=pull
```

### Step 3 — Deploy PostgreSQL

The RHEL PostgreSQL image uses `POSTGRESQL_*` env vars. After the pod starts, you must manually create the database.

```bash
# Create secret, PVC, Deployment, Service
oc create secret generic postgres-secret \
  --from-literal=POSTGRES_USER=postgres \
  --from-literal=POSTGRES_PASSWORD='<strong-password>' \
  --from-literal=POSTGRES_DB=embassywatch \
  -n embassywatch

# Deploy PostgreSQL (use registry.redhat.io/rhel9/postgresql-16:latest)
# See deploy/base/postgres/ for the full manifest, or apply directly:
# oc apply -f deploy/base/postgres/ -n embassywatch

# After the pod is Running, create the database:
oc exec deployment/postgres -n embassywatch -- \
  psql -U postgres -c "CREATE DATABASE embassywatch;"
```

### Step 4 — Deploy Redis

```bash
# Deploy Redis (use registry.redhat.io/rhel9/redis-7:latest)
# Set REDIS_PASSWORD as an env var on the container
# See deploy/base/redis/ for the full manifest
```

### Step 5 — Deploy the Backend

Create the ConfigMap and Secrets, then the Deployment. Key details:

- Set `REDIS_URL` to `redis://:PASSWORD@redis:6379` (password in the URL)
- Set `NODE_ENV=development` on first deploy so TypeORM auto-creates tables
- After tables exist, switch to `NODE_ENV=production`

```bash
# Create ConfigMap with non-sensitive vars
oc create configmap backend-config \
  --from-literal=NODE_ENV=development \
  --from-literal=PORT=4000 \
  --from-literal=DB_HOST=postgres \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_USERNAME=postgres \
  --from-literal=DB_PASSWORD='<db-password>' \
  --from-literal=DB_DATABASE=embassywatch \
  --from-literal=REDIS_HOST=redis \
  --from-literal=REDIS_PORT=6379 \
  --from-literal=USE_MOCK_DATA=true \
  --from-literal=LOG_LEVEL=info \
  -n embassywatch

# Create Secret for sensitive vars
oc create secret generic backend-secret \
  --from-literal=JWT_SECRET='<random-256-bit-key>' \
  --from-literal=REDIS_PASSWORD='<redis-password>' \
  -n embassywatch

# Set REDIS_URL on the deployment (password must be in the URL)
oc set env deployment/embassywatch-backend \
  REDIS_URL="redis://:<redis-password>@redis:6379" \
  -n embassywatch

# Deploy (image: quay.io/your-org/embassywatch-backend:latest, port 4000)
# Readiness/liveness probes: GET /healthz on port 4000
```

### Step 6 — Seed the Database and Switch to Production

```bash
# Wait for backend pod to be Running (TypeORM creates tables on startup)
oc get pods -n embassywatch -w

# Seed the database
oc exec deployment/embassywatch-backend -n embassywatch -- \
  node apps/backend/dist/seeds/seed.js

# Switch to production mode (disables auto-sync of DB schema)
oc set env deployment/embassywatch-backend NODE_ENV=production -n embassywatch
```

This creates 53 embassy locations, an admin user (`admin@embassywatch.gov` / `demo-password`), and an analyst user (`analyst@embassywatch.gov` / `demo-password`).

### Step 7 — Deploy the Frontend and Create the Route

```bash
# Deploy (image: quay.io/your-org/embassywatch-frontend:latest, port 8080)
# Readiness probe: GET / on port 8080

# Create the Route (targetPort MUST be 8080, not 80)
oc create route edge embassywatch \
  --service=embassywatch-frontend \
  --port=8080 \
  --insecure-policy=Redirect \
  -n embassywatch
```

> **Important:** The Route `targetPort` must be `8080` since the frontend container runs nginx as non-root on port 8080. Using port 80 will result in a 503 error.

### Step 8 — Verify

```bash
# All pods should be 1/1 Running
oc get pods -n embassywatch

# Get the application URL
oc get route embassywatch -n embassywatch -o jsonpath='{.spec.host}'

# Test backend health (from inside the cluster)
oc exec deployment/embassywatch-backend -n embassywatch -- \
  wget -qO- http://localhost:4000/healthz
# Expected: {"status":"ok"}

# Open the URL in your browser and log in
```

---

## Setting Up Tekton CI/CD

Tekton automates building and deploying images on every push to `main`.

### Step 1 — Install OpenShift Pipelines Operator

Via the OpenShift web console: **OperatorHub → search "OpenShift Pipelines" → Install**

Verify it's running:
```bash
oc get pods -n openshift-pipelines
```

### Step 2 — Install Catalog Tasks

The pipelines require `git-clone` and `buildah` tasks from the Tekton catalog:

```bash
# git-clone (clones the repo)
oc apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml -n embassywatch

# buildah (builds and pushes container images)
oc apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/buildah/0.8/buildah.yaml -n embassywatch
```

### Step 3 — Grant Pipeline Service Account Permissions

The `pipeline` service account needs the `privileged` SCC for buildah container builds and RBAC to restart deployments:

```bash
# Grant privileged SCC for buildah (container-in-container builds)
oc adm policy add-scc-to-user privileged -z pipeline -n embassywatch

# Grant permission to restart deployments (for auto-rollout after build)
oc apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pipeline-deployer
  namespace: embassywatch
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch", "update"]
  - apiGroups: ["apps"]
    resources: ["deployments/scale"]
    verbs: ["get", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pipeline-deployer
  namespace: embassywatch
subjects:
  - kind: ServiceAccount
    name: pipeline
    namespace: embassywatch
roleRef:
  kind: Role
  name: pipeline-deployer
  apiGroup: rbac.authorization.k8s.io
EOF
```

### Step 4 — Create Registry Push Secret

The pipeline needs credentials to push images to Quay.io:

```bash
oc create secret docker-registry quay-auth \
  --docker-server=quay.io \
  --docker-username=<your-quay-username> \
  --docker-password=<your-quay-password> \
  -n embassywatch

oc secrets link pipeline quay-auth -n embassywatch
```

### Step 5 — Apply Custom Tasks and Pipelines

```bash
# Custom tasks (npm-install, npm-lint, npm-test, npm-build, rollout-restart)
oc apply -f pipelines/tasks/ -n embassywatch

# Pipelines (build-backend, build-frontend, promote-env)
oc apply -f pipelines/build-backend.yaml -n embassywatch
oc apply -f pipelines/build-frontend.yaml -n embassywatch
oc apply -f pipelines/promote-env.yaml -n embassywatch
```

Each pipeline runs: **git-clone → npm-install → npm-lint + npm-test → npm-build → buildah-build+push → rollout-restart**

### Step 6 — Set Up Triggers and EventListener

```bash
oc apply -f pipelines/triggers/ -n embassywatch

# Verify the EventListener pod is running
oc get pods -n embassywatch -l app.kubernetes.io/managed-by=EventListener

# Get the webhook URL
oc get route -n embassywatch -l app.kubernetes.io/part-of=embassywatch \
  -o jsonpath='{.items[?(@.spec.to.name=="el-embassywatch-webhook")].spec.host}'
```

Both pipelines trigger on any push to `main`.

### Step 7 — Connect the GitHub Webhook

Use the provided setup script to auto-create/update the GitHub webhook:

```bash
./scripts/setup-webhook.sh
```

This script auto-detects the EventListener route URL and creates/updates the GitHub webhook. Works across cluster migrations — just re-run on the new cluster.

**Manual setup:** Go to **GitHub repo Settings → Webhooks → Add webhook**, set Payload URL to the EventListener route (use `http://`, not `https://`), content type `application/json`, and select "Just the push event".

### Step 8 — Test with a Manual PipelineRun

```bash
# Backend pipeline
oc create -f pipelines/pipelinerun-backend.yaml -n embassywatch

# Frontend pipeline
oc create -f pipelines/pipelinerun-frontend.yaml -n embassywatch

# Watch progress
oc get pipelineruns -n embassywatch -w
```

> **Note:** PipelineRuns use `volumeClaimTemplate` to create a shared PVC for all tasks. If you start a pipeline from the OpenShift console instead of these YAML files, make sure to select "VolumeClaimTemplate" (not "EmptyDir") for the workspace — EmptyDir doesn't persist between tasks.

---

## Configuring ArgoCD GitOps

ArgoCD watches the `deploy/` directory in Git and automatically syncs cluster state to match.

### Step 1 — Install OpenShift GitOps Operator

Via the OpenShift web console: **OperatorHub → search "OpenShift GitOps" → Install**

Verify it's running:
```bash
oc get pods -n openshift-gitops
```

### Step 2 — Grant ArgoCD Access to the Namespace

```bash
# Give ArgoCD's application controller admin access to the embassywatch namespace
oc create rolebinding argocd-admin \
  --clusterrole=admin \
  --serviceaccount=openshift-gitops:openshift-gitops-argocd-application-controller \
  -n embassywatch

oc create rolebinding argocd-appset \
  --clusterrole=admin \
  --serviceaccount=openshift-gitops:openshift-gitops-applicationset-controller \
  -n embassywatch
```

### Step 3 — Create ArgoCD Applications

```bash
# Create Applications in the openshift-gitops namespace
# Each watches a path in the Git repo and syncs to the embassywatch namespace
oc apply -f deploy/argocd/ -n openshift-gitops
```

This creates Applications with sync-wave ordering:
- **Wave 0 — Infrastructure:** PostgreSQL + Redis (deploys first)
- **Wave 1 — Backend:** Express API
- **Wave 2 — Frontend:** Nginx SPA

Dev and staging Applications use automated sync with prune + selfHeal. Production requires manual sync.

### Step 4 — Get the ArgoCD Dashboard

```bash
# Get the ArgoCD URL
oc get route openshift-gitops-server -n openshift-gitops -o jsonpath='{.spec.host}'

# Get the admin password
oc get secret openshift-gitops-cluster -n openshift-gitops \
  -o jsonpath='{.data.admin\.password}' | base64 -d
```

Open the URL and log in with username `admin` and the decoded password. You should see the `embassywatch-*` applications.

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
