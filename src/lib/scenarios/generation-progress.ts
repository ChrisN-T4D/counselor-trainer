export type ScenarioGenerationStage = "drafting" | "parsing" | "saving";

export type ScenarioGenerationProgress = {
  percent: number;
  stage: ScenarioGenerationStage;
};

export function estimateDraftProgress(charCount: number, maxTokens: number): number {
  const expectedChars = Math.max(maxTokens * 3.5, 3_000);
  return Math.min(85, 5 + Math.round((charCount / expectedChars) * 80));
}
