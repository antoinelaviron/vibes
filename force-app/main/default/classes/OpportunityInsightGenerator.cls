/**
 * OpportunityInsightGenerator — DF26 Workshop
 *
 * @AuraEnabled entry point used by the vibeTable LWC (Build 3) to generate
 * a short AI narrative about a single opportunity row.
 *
 * Signature contract (locked; see specbox 06-pre-baked-apex.md):
 *   String generateInsight(String rowJson)
 *
 * LWC-side call:
 *   import generateInsight from '@salesforce/apex/OpportunityInsightGenerator.generateInsight';
 *   const narrative = await generateInsight({ rowJson: JSON.stringify(row) });
 *
 * This class ships in the workshop repo AND is pre-deployed to the workshop org
 * (tmp-df26-workshop). Attendees never modify it — they just call it from Vibes.
 */
public with sharing class OpportunityInsightGenerator {

    private static final String MODEL_NAME =
        'sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet';

    /**
     * Generate a 2-4 sentence narrative about a single opportunity row.
     * The row can contain any subset of these keys (no field coupling):
     *   Account, Stage, Close_Date, Type, Amount, Account_Id
     * The LLM prompt injects the row as data — it doesn't care about missing fields.
     *
     * @param rowJson  JSON.stringify of the row object.
     * @return         Plain-text narrative, or a graceful fallback error string.
     */
    @AuraEnabled(cacheable=false)
    public static String generateInsight(String rowJson) {
        aiplatform.ModelsAPI modelsAPI = new aiplatform.ModelsAPI();

        aiplatform.ModelsAPI.createGenerations_Request request =
            new aiplatform.ModelsAPI.createGenerations_Request();
        request.modelName = MODEL_NAME;

        aiplatform.ModelsAPI_GenerationRequest body =
            new aiplatform.ModelsAPI_GenerationRequest();
        request.body = body;

        body.prompt = buildPrompt(rowJson);

        try {
            aiplatform.ModelsAPI.createGenerations_Response resp =
                modelsAPI.createGenerations(request);
            if (
                resp != null
                && resp.Code200 != null
                && resp.Code200.generation != null
                && resp.Code200.generation.generatedText != null
            ) {
                return resp.Code200.generation.generatedText;
            }
            return 'No insight generated. Please retry.';
        } catch (aiplatform.ModelsAPI.createGenerations_ResponseException e) {
            System.debug('Models API error ' + e.responseCode + ': ' + e);
            return 'Unable to generate insight (code ' + e.responseCode + '). Please retry.';
        }
    }

    /**
     * Build the LLM prompt from the row JSON.
     * Kept factored out so the prompt is easy to tune during dry-run.
     */
    private static String buildPrompt(String rowJson) {
        String payload = String.isBlank(rowJson) ? '{}' : rowJson;
        return
            'You are a senior sales analyst. Analyze this single opportunity and '
            + 'provide a 2-4 sentence narrative that a sales rep could read in '
            + '10 seconds. Focus on:\n'
            + '- The deal\'s likely trajectory (progressing, stalled, at risk)\n'
            + '- One concrete next action if relevant\n\n'
            + 'Answer using ONLY the row data below. Do not invent facts. Do not '
            + 'use bullet points or headers — just plain prose.\n\n'
            + 'OPPORTUNITY_DATA_JSON:\n'
            + payload;
    }
}
