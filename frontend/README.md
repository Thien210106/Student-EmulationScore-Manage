# CLASS POINT frontend

The frontend is a React, TypeScript, and Vite application. It uses the NestJS API under `/api`.

## Run locally

1. Configure the backend `.env` from the root `.env.example`. Set a reachable
   PostgreSQL `DATABASE_URL` and two distinct JWT secrets of at least 32 characters.
   PostgreSQL must be running and the migrations applied before signing in:

   ```powershell
   npm run prisma:migrate:deploy
   ```

   For a new local database with unapplied migrations, use
   `npm run prisma:migrate:dev` instead.

2. Start the backend:

   ```powershell
   npm run start:dev
   ```

   This builds the NestJS API before starting it; rerun the command after backend
   source changes. The API should respond at `http://localhost:3000/api/docs`.

3. In another terminal, run the frontend:

   ```powershell
   cd frontend
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

Set `VITE_API_URL` in `frontend/.env` if the API is not at `http://localhost:3000/api`.
For a different frontend origin, add it to the comma-separated `FRONTEND_ORIGINS` setting
in the backend `.env`.

Teachers can open **Nhập từ Excel** in the classroom sidebar to preview and import
the team roster and signed point criteria from the supplied multi-sheet `.xlsx`
workbook format. Historical scores are intentionally not imported. New student
accounts receive random temporary passwords; download the one-time credentials
file after importing if those students need to sign in.

## Production build

```powershell
cd frontend
npm run build
```
