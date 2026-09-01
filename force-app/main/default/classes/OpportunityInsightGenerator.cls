/**
 * Compatibility endpoint for workshop components generated before the generic
 * RecordInsightGenerator contract. New bundles import RecordInsightGenerator;
 * this class only adapts legacy flat Opportunity rows to its generic envelope.
 */
public with sharing class OpportunityInsightGenerator {
    private static final Integer MAX_LEGACY_PAYLOAD_LENGTH = 12000;
    private static final String FALLBACK_MESSAGE =
        'Unable to generate insight. Please retry.';

    @AuraEnabled(cacheable=false)
    public static String generateInsight(String rowJson) {
        try {
            if (rowJson != null && rowJson.length() > MAX_LEGACY_PAYLOAD_LENGTH) {
                return FALLBACK_MESSAGE;
            }
            Map<String, Object> legacy = (Map<String, Object>) JSON.deserializeUntyped(
                String.isBlank(rowJson) ? '{}' : rowJson
            );
            List<String> keys = new List<String>(legacy.keySet());
            keys.sort();
            List<Object> fields = new List<Object>();
            for (String key : keys) {
                fields.add(new Map<String, Object>{
                    'role' => key,
                    'label' => key.replace('_', ' '),
                    'value' => legacy.get(key)
                });
            }
            Map<String, Object> envelope = new Map<String, Object>{
                'schemaVersion' => 1,
                'entityLabel' => 'Opportunity',
                'insightGoal' => 'Summarize risk and suggest one supported next action.',
                'subject' => new Map<String, Object>{
                    'role' => 'opportunity',
                    'label' => 'Opportunity',
                    'value' => legacy.get('Opportunity_Id')
                },
                'fields' => fields
            };
            return RecordInsightGenerator.generateInsight(JSON.serialize(envelope));
        } catch (Exception error) {
            return FALLBACK_MESSAGE;
        }
    }
}
