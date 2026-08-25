/**
 * Compatibility endpoint for workshop components generated before the generic
 * RecordInsightGenerator contract. New components import RecordInsightGenerator.
 */
public with sharing class OpportunityInsightGenerator {
    @AuraEnabled(cacheable=false)
    public static String generateInsight(String rowJson) {
        try {
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
            return 'Unable to generate insight. Please retry.';
        }
    }
}
