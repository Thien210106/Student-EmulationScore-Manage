CREATE OR REPLACE FUNCTION "guard_point_record_history"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    week_is_closed BOOLEAN;
    week_end_date DATE;
    criterion_type "CriterionType";
    criterion_default_point DECIMAL(8, 2);
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

        IF OLD."point" IS DISTINCT FROM NEW."point" THEN
            RAISE EXCEPTION 'Point values are fixed by their criterion and cannot be adjusted';
        END IF;
    END IF;

    SELECT week."isClosed", week."endDate", criterion."type", criterion."defaultPoint"
    INTO week_is_closed, week_end_date, criterion_type, criterion_default_point
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

    IF week_is_closed OR week_end_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Points in a closed or past competition week cannot be changed';
    END IF;

    IF NEW."type"::TEXT <> criterion_type::TEXT THEN
        RAISE EXCEPTION 'Point type must match its criterion type';
    END IF;

    IF TG_OP = 'INSERT' AND NEW."point" <> criterion_default_point THEN
        RAISE EXCEPTION 'Point value must match the criterion default point';
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

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "validate_point_adjustment"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Point values are fixed by their criterion and cannot be adjusted';
END;
$$;
