-- Authentication sessions and additional history required by the API modules.
ALTER TABLE "Classroom"
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthSession_tokenHash_length_check" CHECK (length("tokenHash") = 64),
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

CREATE TABLE "TeamLeaderHistory" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "classStudentId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TeamLeaderHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeamLeaderHistory_date_order_check"
        CHECK ("endedAt" IS NULL OR "endedAt" > "startedAt"),
    CONSTRAINT "TeamLeaderHistory_teamId_fkey" FOREIGN KEY ("teamId")
        REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamLeaderHistory_classStudentId_fkey" FOREIGN KEY ("classStudentId")
        REFERENCES "ClassStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TeamLeaderHistory_classStudentId_startedAt_idx"
    ON "TeamLeaderHistory"("classStudentId", "startedAt");
CREATE INDEX "TeamLeaderHistory_teamId_startedAt_idx"
    ON "TeamLeaderHistory"("teamId", "startedAt");
CREATE UNIQUE INDEX "TeamLeaderHistory_one_current_leader_per_team"
    ON "TeamLeaderHistory"("teamId")
    WHERE "endedAt" IS NULL;
ALTER TABLE "TeamLeaderHistory"
    ADD CONSTRAINT "TeamLeaderHistory_no_overlapping_leader_periods"
    EXCLUDE USING gist (
        "teamId" WITH =,
        (tstzrange("startedAt", "endedAt", '[)')) WITH &&
    );

CREATE FUNCTION "validate_team_leader_history"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    team_classroom_id UUID;
    student_classroom_id UUID;
    membership_record "TeamMembership"%ROWTYPE;
BEGIN
    SELECT "classroomId" INTO team_classroom_id
    FROM "Team"
    WHERE "id" = NEW."teamId";

    SELECT "classroomId" INTO student_classroom_id
    FROM "ClassStudent"
    WHERE "id" = NEW."classStudentId";

    IF team_classroom_id IS NULL
       OR student_classroom_id IS NULL
       OR team_classroom_id <> student_classroom_id THEN
        RAISE EXCEPTION 'Team and leader must belong to the same classroom';
    END IF;

    SELECT * INTO membership_record
    FROM "TeamMembership"
    WHERE "teamId" = NEW."teamId"
      AND "classStudentId" = NEW."classStudentId"
      AND "joinedAt" <= NEW."startedAt"
      AND ("leftAt" IS NULL OR "leftAt" >= COALESCE(NEW."endedAt", NEW."startedAt"))
    ORDER BY "joinedAt" DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A team leader must be an active member of the team';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "TeamLeaderHistory_validate_membership"
BEFORE INSERT OR UPDATE ON "TeamLeaderHistory"
FOR EACH ROW
EXECUTE FUNCTION "validate_team_leader_history"();

CREATE FUNCTION "prevent_team_leader_history_rewrite"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Team leader history cannot be deleted';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."teamId" IS DISTINCT FROM OLD."teamId"
       OR NEW."classStudentId" IS DISTINCT FROM OLD."classStudentId"
       OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
       OR OLD."endedAt" IS NOT NULL
       OR NEW."endedAt" IS NULL THEN
        RAISE EXCEPTION 'Team leader history is immutable except for closing an active period';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "TeamLeaderHistory_prevent_rewrite"
BEFORE UPDATE OR DELETE ON "TeamLeaderHistory"
FOR EACH ROW
EXECUTE FUNCTION "prevent_team_leader_history_rewrite"();

CREATE FUNCTION "guard_team_membership_leader_end"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."leftAt" IS NULL AND NEW."leftAt" IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM "TeamLeaderHistory"
           WHERE "teamId" = OLD."teamId"
             AND "classStudentId" = OLD."classStudentId"
             AND "endedAt" IS NULL
       ) THEN
        RAISE EXCEPTION 'Close the active team leader history before ending team membership';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "TeamMembership_guard_leader_end"
BEFORE UPDATE OF "leftAt" ON "TeamMembership"
FOR EACH ROW
EXECUTE FUNCTION "guard_team_membership_leader_end"();
