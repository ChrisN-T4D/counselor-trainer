-- AlterTable: add client affect state (Ekman-7 emotion vector + expressivity profile)
ALTER TABLE "ClientCase"
ADD COLUMN "emotionState" JSONB,
ADD COLUMN "expressivityProfile" JSONB;
