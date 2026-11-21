# Deploy CLASS POINT to Google Cloud Run

This setup runs the Vite frontend and NestJS API in one Cloud Run service. The
frontend calls `/api` on the same origin. PostgreSQL remains on the existing Neon
project; do not create a temporary Render database for production data.

## Before deploying

- Install the Google Cloud CLI and sign in with an account that has access to the
  Google Cloud project.
- Link a billing account to that project. Cloud Run has a free usage allowance,
  but usage beyond the allowance is billable. A maximum instance count limits
  scale-out; it is not a hard monthly spending cap.
- Keep the existing Neon pooled connection string and two JWT secrets private.
  Add them to Google Secret Manager as `class-point-database-url`,
  `class-point-jwt-access`, and `class-point-jwt-refresh`.
- The existing database should have migrations applied. If new migration files
  are added later, review them and run `npm.cmd run prisma:migrate:deploy` before
  deploying the new image.

Do not put `.env` files or secret values in the source repository or Docker image.
The root `.dockerignore` excludes them.

## Create the service

In PowerShell, set the active project and enable the APIs once:

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

Create the three secrets in **Google Cloud Console → Security → Secret Manager**.
Paste each value directly into its secret editor; do not paste secret values into
chat or commit them to files. Grant the Cloud Run service identity the
`Secret Manager Secret Accessor` role for these secrets if deployment asks for it.

Deploy from the project root:

```powershell
gcloud run deploy class-point `
  --source . `
  --region us-east4 `
  --allow-unauthenticated `
  --port 8080 `
  --cpu 1 `
  --memory 1Gi `
  --concurrency 30 `
  --min 0 `
  --max 2 `
  --set-env-vars NODE_ENV=production,SERVE_FRONTEND=true `
  --set-secrets DATABASE_URL=class-point-database-url:latest,JWT_ACCESS_SECRET=class-point-jwt-access:latest,JWT_REFRESH_SECRET=class-point-jwt-refresh:latest
```

The `us-east4` region keeps the API relatively close to the current Neon
`us-east-2` database. The app will be reachable at the `run.app` URL printed by
the deploy command. Open that URL for the web app and append `/api/docs` for
Swagger.

This starting configuration allows at most two 1-vCPU instances with up to 30
in-flight requests each. It is a bounded starting point for a class-sized burst,
not a promise that 60 simultaneous registrations will complete quickly. Measure
with test accounts against a separate staging database before inviting the class.

## Costs and registrations

Cloud Run's free allowance is usage based. The `--max 2` setting does not stop
charges after the allowance is consumed. Create a billing budget and alerts in
Google Cloud Billing and watch Cloud Run, Cloud Build, Artifact Registry, and
network egress usage.

The public `/api/auth/register` endpoint creates standalone accounts; it does not
automatically enroll them in a classroom. For the current product flow, the
homeroom teacher creates/imports student accounts and distributes the generated
credentials. Do not announce open self-registration as a way to join a class
until a classroom invite/join flow is implemented. Consider disabling or
rate-limiting public account creation after the initial teacher account exists.
