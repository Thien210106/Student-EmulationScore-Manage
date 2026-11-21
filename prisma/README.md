# Database setup

## Migrations

The initial migration creates the schema and adds PostgreSQL checks, triggers, and
exclusion constraints for rules Prisma Schema Language cannot express. Apply it
to a configured PostgreSQL database with:

```powershell
npm run prisma:migrate:dev -- --name init
```

Use `npm run prisma:migrate:deploy` to apply committed migrations in a deployment
environment without creating new migrations.

The migration requires permission to install PostgreSQL's `btree_gist` extension.
It enforces:

- Academic-year date order, non-negative criterion/point values, and valid point bounds.
- Monday-to-Sunday competition weeks, exactly seven days long, with no overlapping
  weeks in the same classroom.
- Non-overlapping team-membership periods per student and non-overlapping leader
  periods per team, while retaining historical membership rows.
- Non-overlapping active classification intervals. `minScore` is inclusive and
  `maxScore` is exclusive; a null maximum is unbounded.
- Matching point and criterion types, rejection of point edits in closed weeks,
  active homeroom-teacher authorization for adjustments, and immutable adjustment
  and point-record history at the database layer.

The API must still perform authentication, authorization, and transaction handling.
The database constraints provide an integrity backstop, not a substitute for guards.
For an adjustment, insert its audit row and then update the point record in the same
transaction; the deferred constraint verifies the final value at commit. To reopen a
week, an authorized workflow must set `isClosed` to false before editing.

## Bootstrap seed

No sample criterion data is seeded because the official 11 criteria workbook has
not been supplied. The seed can create a configured academic year, classroom, a
homeroom-teacher account, and its membership. Set all `SEED_*` values documented
in `.env.example`; `SEED_TEACHER_PASSWORD_HASH` must already be a bcrypt or Argon2
hash, never a plain-text password. Then run:

```powershell
npm run prisma:seed
```

The seed is idempotent and does not overwrite existing account, year, or classroom
details. Existing teacher membership with a different role is rejected.

## Criteria workbook

Create a blank workbook template with:

```powershell
npm run prisma:criteria-template -- criteria-template.xlsx
```

The importer reads the first worksheet and expects these headers in its first row:
`code`, `name`, `type`, `defaultPoint`, `minPoint`, `maxPoint`, `description`,
`sortOrder`. `type` must be `BONUS` or `PENALTY`; point values allow at most two
decimal places. The workbook is validated before any rows are inserted. Existing
criterion codes are rejected rather than overwritten, preserving the meaning of
historical point records.

After mapping the official workbook columns to this contract, import it with:

```powershell
npm run prisma:import-criteria -- criteria.xlsx <classroom-uuid>
```

The repository currently has no official criteria workbook, so no criterion names
or values have been invented.

Run the workbook parser tests without a database with:

```powershell
npm run test:criteria-import
```

## Stage-three backend

Before starting the API, copy `.env.example` to `.env`, set the database connection,
and replace both JWT secret placeholders with different random secrets of at least
32 characters. For example, generate each value locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Apply the migrations, then start the API:

```powershell
npm run prisma:migrate:dev
npm run build
npm start
```

Swagger is available at `/api/docs`. Registration creates an account but deliberately
does not grant a classroom role. The account that creates a classroom is assigned
`HOMEROOM_TEACHER`; student accounts and their `STUDENT` classroom membership are
created together by that class's homeroom teacher. Access tokens last 15 minutes;
refresh tokens last 7 days, are stored only as SHA-256 hashes, and rotate on refresh.
Logout revokes the active session immediately.
Passwords must be 12-72 UTF-8 bytes because bcrypt truncates longer inputs.

| API | Access |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` | Public |
| `GET /api/auth/me`, `POST /api/auth/logout`, `GET/PATCH /api/users/me` | Authenticated |
| `GET/POST /api/academic-years` | Authenticated; list active years or create one for classroom setup |
| `GET /api/classrooms` | Authenticated; returns only memberships |
| `POST /api/classrooms` | Authenticated; creator becomes that classroom's teacher |
| `GET /api/classrooms/:id` | Any active member of that classroom |
| `GET /api/classrooms/:classroomId/students`, `GET /api/classrooms/:classroomId/teams` | Teacher: all; team leader: own team; student: own profile/team only |
| `PATCH/DELETE /api/classrooms/:id` | Homeroom teacher; delete is a soft delete |
| `POST /api/classrooms/:classroomId/students`, `PATCH /api/students/:id` | Homeroom teacher |
| `GET /api/students/:id` | Teacher: enrolled students; team leader: own team members; student: own profile |
| `POST /api/classrooms/:classroomId/teams`, `PATCH /api/teams/:id`, team membership and leader changes | Homeroom teacher |

Team changes preserve historical membership and leader periods; no API deletes those
records. The migration and seed require a reachable PostgreSQL database before the
API can be used.

## Stage-four scoring

Only a classroom homeroom teacher can manage criteria and weeks, enter point records,
or adjust a point. Criteria are deactivated rather than deleted, and a criterion's
BONUS/PENALTY type cannot be changed after it has point history. A week must run
Monday through Sunday; closing it prevents point entry and changes until a teacher
reopens it.

| API | Access |
| --- | --- |
| `GET/POST /api/classrooms/:classroomId/criteria`, `PATCH/DELETE /api/criteria/:id` | Any member reads; homeroom teacher manages; DELETE deactivates |
| `GET/POST /api/classrooms/:classroomId/weeks` | Any member reads; homeroom teacher creates |
| `GET /api/weeks/:id` | Any active classroom member |
| `POST /api/weeks/:id/close`, `POST /api/weeks/:id/reopen` | Homeroom teacher |
| `GET /api/classrooms/:classroomId/points?weekId=<uuid>` | Teacher: all; team leader: own team; student: own points |
| `GET /api/points/:id`, `GET /api/students/:studentId/points` | Scoped to the current classroom role; student point history |
| `POST /api/classrooms/:classroomId/points` | Homeroom teacher |
| `GET/POST /api/points/:pointRecordId/adjustments` | Accessible member reads history; homeroom teacher adjusts with an immutable audit entry |
| `DELETE /api/points/:id` | Homeroom teacher; voids without deleting history |
| `GET /api/classrooms/:classroomId/weeks/:weekId/rankings` | Teacher: all teams; other members: their current team only |
| `GET /api/classrooms/:classroomId/weeks/:weekId/rankings/teams` | Explicit team leaderboard; teacher: all teams, other members: current team |
| `GET /api/classrooms/:classroomId/weeks/:weekId/rankings/students` | Individual weekly ranking; results are role-scoped while ranks reflect the full class |

Point adjustments and point-value updates execute in one transaction to satisfy
the database audit constraints. Weekly team scores are net points (BONUS minus
PENALTY), attributed to the team the student belonged to when the point was entered.
`TOTAL_SCORE` sums those values; `AVERAGE_SCORE` divides the total by the distinct
members who served on the team during any part of that week. Rankings use competition
rank positions, so equal scores share a rank and later ranks may skip numbers.

Run the scoring unit tests with:

```powershell
npm run test:phase4
```

## Stage-five classifications and reports

Classification ranges are configured per classroom; the system does not seed or
assume official thresholds. Each active interval includes `minScore` and excludes
`maxScore`; a null maximum is open-ended. Active intervals must not overlap. Rules
are deactivated rather than deleted; reports apply the classroom's current active
rules to the selected week's results.

| API | Access |
| --- | --- |
| `GET/POST /api/classrooms/:classroomId/classifications` | Any member reads; homeroom teacher manages |
| `PATCH/DELETE /api/classifications/:id` | Homeroom teacher; DELETE deactivates instead of deleting history |
| `GET /api/classrooms/:classroomId/reports/weeks/:weekId/students` | Teacher: class; team leader: own team; student: own results |
| `GET /api/classrooms/:classroomId/reports/weeks/:weekId/students/export` | Same role-scoped report as an Excel workbook |

## Supporting modules

The API also exposes `GET /api/academic-years` and `GET /api/academic-years/:id`
for active academic years, and `GET /api/classrooms/:classroomId/memberships` for
homeroom teachers to inspect classroom membership roles and active status.

Weekly student reports show bonus points, penalty points, net score, competition
rank, and the matching active classification. Equal net scores share rank positions.
The Excel export contains the same rows and scope as the JSON endpoint.

Run classification and report tests with:

```powershell
npm run test:phase5
```
