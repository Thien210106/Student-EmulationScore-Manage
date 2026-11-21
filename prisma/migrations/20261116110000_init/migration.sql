-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClassRole" AS ENUM ('HOMEROOM_TEACHER', 'TEAM_LEADER', 'STUDENT');

-- CreateEnum
CREATE TYPE "RankingMode" AS ENUM ('TOTAL_SCORE', 'AVERAGE_SCORE');

-- CreateEnum
CREATE TYPE "CriterionType" AS ENUM ('BONUS', 'PENALTY');

-- CreateEnum
CREATE TYPE "PointType" AS ENUM ('BONUS', 'PENALTY');

-- CreateEnum
CREATE TYPE "PointStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "ClassificationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "avatarUrl" VARCHAR(2048),
    "phone" VARCHAR(30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "academicYearId" UUID NOT NULL,
    "rankingMode" "RankingMode" NOT NULL DEFAULT 'TOTAL_SCORE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMembership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "role" "ClassRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClassMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "studentCode" VARCHAR(40) NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "dateOfBirth" DATE,
    "gender" VARCHAR(30),
    "phone" VARCHAR(30),
    "address" VARCHAR(500),

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassStudent" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClassStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "classroomId" UUID NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "classStudentId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(6),
    "isLeader" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "type" "CriterionType" NOT NULL,
    "defaultPoint" DECIMAL(8,2) NOT NULL,
    "maxPoint" DECIMAL(8,2),
    "minPoint" DECIMAL(8,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionWeek" (
    "id" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CompetitionWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointRecord" (
    "id" UUID NOT NULL,
    "classStudentId" UUID NOT NULL,
    "criterionId" UUID NOT NULL,
    "weekId" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "type" "PointType" NOT NULL,
    "point" DECIMAL(8,2) NOT NULL,
    "description" TEXT,
    "status" "PointStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PointRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointAdjustment" (
    "id" UUID NOT NULL,
    "pointRecordId" UUID NOT NULL,
    "adjustedById" UUID NOT NULL,
    "oldPoint" DECIMAL(8,2) NOT NULL,
    "newPoint" DECIMAL(8,2) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationRule" (
    "id" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "minScore" DECIMAL(8,2) NOT NULL,
    "maxScore" DECIMAL(8,2),
    "description" TEXT,
    "status" "ClassificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClassificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_name_key" ON "AcademicYear"("name");

-- CreateIndex
CREATE INDEX "AcademicYear_isActive_idx" ON "AcademicYear"("isActive");

-- CreateIndex
CREATE INDEX "Classroom_academicYearId_idx" ON "Classroom"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_academicYearId_code_key" ON "Classroom"("academicYearId", "code");

-- CreateIndex
CREATE INDEX "ClassMembership_classroomId_role_isActive_idx" ON "ClassMembership"("classroomId", "role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClassMembership_userId_classroomId_key" ON "ClassMembership"("userId", "classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentCode_key" ON "Student"("studentCode");

-- CreateIndex
CREATE INDEX "ClassStudent_classroomId_isActive_idx" ON "ClassStudent"("classroomId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClassStudent_studentId_classroomId_key" ON "ClassStudent"("studentId", "classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassStudent_id_classroomId_key" ON "ClassStudent"("id", "classroomId");

-- CreateIndex
CREATE INDEX "Team_classroomId_idx" ON "Team"("classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_classroomId_code_key" ON "Team"("classroomId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Team_id_classroomId_key" ON "Team"("id", "classroomId");

-- CreateIndex
CREATE INDEX "TeamMembership_classStudentId_leftAt_idx" ON "TeamMembership"("classStudentId", "leftAt");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_leftAt_isLeader_idx" ON "TeamMembership"("teamId", "leftAt", "isLeader");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_teamId_classStudentId_joinedAt_key" ON "TeamMembership"("teamId", "classStudentId", "joinedAt");

-- CreateIndex
CREATE INDEX "Criterion_classroomId_isActive_sortOrder_idx" ON "Criterion"("classroomId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Criterion_classroomId_code_key" ON "Criterion"("classroomId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Criterion_id_classroomId_key" ON "Criterion"("id", "classroomId");

-- CreateIndex
CREATE INDEX "CompetitionWeek_classroomId_startDate_endDate_idx" ON "CompetitionWeek"("classroomId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionWeek_classroomId_startDate_key" ON "CompetitionWeek"("classroomId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionWeek_classroomId_endDate_key" ON "CompetitionWeek"("classroomId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionWeek_id_classroomId_key" ON "CompetitionWeek"("id", "classroomId");

-- CreateIndex
CREATE INDEX "PointRecord_weekId_status_idx" ON "PointRecord"("weekId", "status");

-- CreateIndex
CREATE INDEX "PointRecord_classStudentId_createdAt_idx" ON "PointRecord"("classStudentId", "createdAt");

-- CreateIndex
CREATE INDEX "PointRecord_criterionId_idx" ON "PointRecord"("criterionId");

-- CreateIndex
CREATE INDEX "PointRecord_createdById_idx" ON "PointRecord"("createdById");

-- CreateIndex
CREATE INDEX "PointAdjustment_pointRecordId_createdAt_idx" ON "PointAdjustment"("pointRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "PointAdjustment_adjustedById_idx" ON "PointAdjustment"("adjustedById");

-- CreateIndex
CREATE INDEX "ClassificationRule_classroomId_status_sortOrder_idx" ON "ClassificationRule"("classroomId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationRule_classroomId_name_key" ON "ClassificationRule"("classroomId", "name");

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassStudent" ADD CONSTRAINT "ClassStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassStudent" ADD CONSTRAINT "ClassStudent_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_classStudentId_fkey" FOREIGN KEY ("classStudentId") REFERENCES "ClassStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionWeek" ADD CONSTRAINT "CompetitionWeek_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_classStudentId_classroomId_fkey" FOREIGN KEY ("classStudentId", "classroomId") REFERENCES "ClassStudent"("id", "classroomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_criterionId_classroomId_fkey" FOREIGN KEY ("criterionId", "classroomId") REFERENCES "Criterion"("id", "classroomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_weekId_classroomId_fkey" FOREIGN KEY ("weekId", "classroomId") REFERENCES "CompetitionWeek"("id", "classroomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAdjustment" ADD CONSTRAINT "PointAdjustment_pointRecordId_fkey" FOREIGN KEY ("pointRecordId") REFERENCES "PointRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAdjustment" ADD CONSTRAINT "PointAdjustment_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationRule" ADD CONSTRAINT "ClassificationRule_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL-only constraints for temporal overlap and cross-row business rules.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "AcademicYear"
    ADD CONSTRAINT "AcademicYear_date_order_check"
    CHECK ("startDate" < "endDate");

ALTER TABLE "Criterion"
    ADD CONSTRAINT "Criterion_point_bounds_check"
    CHECK (
        "defaultPoint" >= 0
        AND ("minPoint" IS NULL OR "minPoint" >= 0)
        AND ("maxPoint" IS NULL OR "maxPoint" >= 0)
        AND ("minPoint" IS NULL OR "maxPoint" IS NULL OR "minPoint" <= "maxPoint")
        AND ("minPoint" IS NULL OR "defaultPoint" >= "minPoint")
        AND ("maxPoint" IS NULL OR "defaultPoint" <= "maxPoint")
    );

ALTER TABLE "CompetitionWeek"
    ADD CONSTRAINT "CompetitionWeek_monday_to_sunday_check"
    CHECK (
        EXTRACT(ISODOW FROM "startDate") = 1
        AND "endDate" = "startDate" + 6
    );

ALTER TABLE "CompetitionWeek"
    ADD CONSTRAINT "CompetitionWeek_no_overlap"
    EXCLUDE USING gist (
        "classroomId" WITH =,
        (daterange("startDate", "endDate", '[]')) WITH &&
    );

ALTER TABLE "TeamMembership"
    ADD CONSTRAINT "TeamMembership_date_order_check"
    CHECK ("leftAt" IS NULL OR "leftAt" > "joinedAt");

ALTER TABLE "TeamMembership"
    ADD CONSTRAINT "TeamMembership_student_no_overlap"
    EXCLUDE USING gist (
        "classStudentId" WITH =,
        (tstzrange("joinedAt", "leftAt", '[)')) WITH &&
    );

ALTER TABLE "TeamMembership"
    ADD CONSTRAINT "TeamMembership_leader_no_overlap"
    EXCLUDE USING gist (
        "teamId" WITH =,
        (tstzrange("joinedAt", "leftAt", '[)')) WITH &&
    )
    WHERE ("isLeader");

ALTER TABLE "PointRecord"
    ADD CONSTRAINT "PointRecord_non_negative_check"
    CHECK ("point" >= 0);

ALTER TABLE "PointAdjustment"
    ADD CONSTRAINT "PointAdjustment_values_check"
    CHECK (
        "oldPoint" >= 0
        AND "newPoint" >= 0
        AND "oldPoint" <> "newPoint"
        AND length(btrim("reason")) > 0
    );

ALTER TABLE "ClassificationRule"
    ADD CONSTRAINT "ClassificationRule_range_check"
    CHECK ("maxScore" IS NULL OR "maxScore" > "minScore");

ALTER TABLE "ClassificationRule"
    ADD CONSTRAINT "ClassificationRule_no_active_overlap"
    EXCLUDE USING gist (
        "classroomId" WITH =,
        (numrange("minScore", "maxScore", '[)')) WITH &&
    )
    WHERE ("status" = 'ACTIVE');

CREATE FUNCTION "validate_team_membership_classroom"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    team_classroom_id UUID;
    student_classroom_id UUID;
BEGIN
    SELECT "classroomId" INTO team_classroom_id
    FROM "Team"
    WHERE "id" = NEW."teamId";

    SELECT "classroomId" INTO student_classroom_id
    FROM "ClassStudent"
    WHERE "id" = NEW."classStudentId";

    IF team_classroom_id IS NOT NULL
       AND student_classroom_id IS NOT NULL
       AND team_classroom_id <> student_classroom_id THEN
        RAISE EXCEPTION 'Team and student must belong to the same classroom';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "TeamMembership_validate_classroom"
BEFORE INSERT OR UPDATE ON "TeamMembership"
FOR EACH ROW
EXECUTE FUNCTION "validate_team_membership_classroom"();

CREATE FUNCTION "guard_criterion_type_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."type" IS DISTINCT FROM OLD."type"
       AND EXISTS (
           SELECT 1
           FROM "PointRecord"
           WHERE "criterionId" = OLD."id"
       ) THEN
        RAISE EXCEPTION 'A criterion type cannot change after point records exist';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Criterion_guard_type_change"
BEFORE UPDATE OF "type" ON "Criterion"
FOR EACH ROW
EXECUTE FUNCTION "guard_criterion_type_change"();

CREATE FUNCTION "guard_point_record_history"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    week_is_closed BOOLEAN;
    criterion_type "CriterionType";
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Point records are historical; void the record instead of deleting it';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD."classStudentId" IS DISTINCT FROM NEW."classStudentId"
           OR OLD."criterionId" IS DISTINCT FROM NEW."criterionId"
           OR OLD."weekId" IS DISTINCT FROM NEW."weekId"
           OR OLD."classroomId" IS DISTINCT FROM NEW."classroomId"
           OR OLD."createdById" IS DISTINCT FROM NEW."createdById"
           OR OLD."type" IS DISTINCT FROM NEW."type" THEN
            RAISE EXCEPTION 'Point record ownership and classification fields are immutable';
        END IF;
    END IF;

    SELECT week."isClosed", criterion."type"
    INTO week_is_closed, criterion_type
    FROM "CompetitionWeek" AS week
    JOIN "Criterion" AS criterion
      ON criterion."id" = NEW."criterionId"
     AND criterion."classroomId" = NEW."classroomId"
    WHERE week."id" = NEW."weekId"
      AND week."classroomId" = NEW."classroomId"
    FOR UPDATE OF week;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF week_is_closed THEN
        RAISE EXCEPTION 'Points in a closed competition week cannot be changed';
    END IF;

    IF NEW."type" <> criterion_type THEN
        RAISE EXCEPTION 'Point type must match its criterion type';
    END IF;

    IF TG_OP = 'INSERT' AND NOT EXISTS (
        SELECT 1
        FROM "ClassMembership"
        WHERE "userId" = NEW."createdById"
          AND "classroomId" = NEW."classroomId"
          AND "role" = 'HOMEROOM_TEACHER'
          AND "isActive"
    ) THEN
        RAISE EXCEPTION 'Only an active homeroom teacher may create point records';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW."point" IS DISTINCT FROM OLD."point"
       AND NOT EXISTS (
           SELECT 1
           FROM "PointAdjustment"
           WHERE "pointRecordId" = OLD."id"
             AND "oldPoint" = OLD."point"
             AND "newPoint" = NEW."point"
       ) THEN
        RAISE EXCEPTION 'A point change requires a matching adjustment record in the same transaction';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "PointRecord_guard_history"
BEFORE INSERT OR UPDATE OR DELETE ON "PointRecord"
FOR EACH ROW
EXECUTE FUNCTION "guard_point_record_history"();

CREATE FUNCTION "validate_point_adjustment"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    current_point DECIMAL(8, 2);
    current_status "PointStatus";
    classroom_id UUID;
    week_is_closed BOOLEAN;
BEGIN
    SELECT record."point", record."status", record."classroomId", week."isClosed"
    INTO current_point, current_status, classroom_id, week_is_closed
    FROM "PointRecord" AS record
    JOIN "CompetitionWeek" AS week
      ON week."id" = record."weekId"
     AND week."classroomId" = record."classroomId"
    WHERE record."id" = NEW."pointRecordId"
    FOR UPDATE OF record, week;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Point record for adjustment does not exist';
    END IF;

    IF current_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Voided point records cannot be adjusted';
    END IF;

    IF week_is_closed THEN
        RAISE EXCEPTION 'Points in a closed competition week cannot be adjusted';
    END IF;

    IF NEW."oldPoint" <> current_point THEN
        RAISE EXCEPTION 'Adjustment oldPoint must match the current point value';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "ClassMembership"
        WHERE "userId" = NEW."adjustedById"
          AND "classroomId" = classroom_id
          AND "role" = 'HOMEROOM_TEACHER'
          AND "isActive"
    ) THEN
        RAISE EXCEPTION 'Only an active homeroom teacher may adjust points';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "PointAdjustment_validate_insert"
BEFORE INSERT ON "PointAdjustment"
FOR EACH ROW
EXECUTE FUNCTION "validate_point_adjustment"();

CREATE FUNCTION "verify_point_adjustment_committed"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    final_point DECIMAL(8, 2);
BEGIN
    SELECT "point" INTO final_point
    FROM "PointRecord"
    WHERE "id" = NEW."pointRecordId";

    IF NOT FOUND OR final_point <> NEW."newPoint" THEN
        RAISE EXCEPTION 'An adjustment must update its point record in the same transaction';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PointAdjustment_require_point_update"
AFTER INSERT ON "PointAdjustment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "verify_point_adjustment_committed"();

CREATE FUNCTION "prevent_point_adjustment_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Point adjustment history is immutable';
END;
$$;

CREATE TRIGGER "PointAdjustment_prevent_mutation"
BEFORE UPDATE OR DELETE ON "PointAdjustment"
FOR EACH ROW
EXECUTE FUNCTION "prevent_point_adjustment_mutation"();
