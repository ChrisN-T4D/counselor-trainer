-- AlterTable
ALTER TABLE "Message" ADD COLUMN "speaker" TEXT;

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "participantsConfig" JSONB;
