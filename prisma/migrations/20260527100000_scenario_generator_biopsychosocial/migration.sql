-- CreateEnum
CREATE TYPE "ScenarioContextType" AS ENUM (
  'MEDICAL_FAMILY_THERAPY',
  'DOCTOR_HANDOFF',
  'PEDIATRIC_PARENT_CHILD',
  'INDIVIDUAL',
  'COUPLES',
  'FAMILY'
);

-- AlterTable
ALTER TABLE "Scenario"
ADD COLUMN "contextType" "ScenarioContextType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN "caseWriteup" JSONB,
ADD COLUMN "ageGroup" TEXT NOT NULL DEFAULT 'adult',
ADD COLUMN "acuityLevel" TEXT NOT NULL DEFAULT 'moderate',
ADD COLUMN "referralSource" TEXT,
ADD COLUMN "sessionParticipants" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "generationSettings" JSONB,
ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SessionReview"
ADD COLUMN "learnerConclusions" TEXT,
ADD COLUMN "learnerWhatILearned" TEXT,
ADD COLUMN "learnerInterventionRationale" TEXT;

-- CreateIndex
CREATE INDEX "Scenario_contextType_idx" ON "Scenario"("contextType");

-- CreateIndex
CREATE INDEX "Scenario_difficulty_idx" ON "Scenario"("difficulty");
