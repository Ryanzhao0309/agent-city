import type { DatabaseSync } from "node:sqlite";

export function installTestModelProfile(
  db: DatabaseSync,
  saveSecret: (key: string, value: string) => void,
  options: { id: string; secretRef: string; protocol?: "openai-chat" | "openai-responses"; model?: string },
): void {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO model_profile
    (id,name,template,protocol,base_url,model,secret_ref,temperature,max_tokens,extra_body_json,
     enabled,is_default,validation_status,validated_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,0,'verified',?,?,?)`)
    .run(options.id, "Test Model", "custom", options.protocol ?? "openai-chat", "https://model.invalid/v1",
      options.model ?? "test-model", options.secretRef, 0, null, "{}", now, now, now);
  saveSecret(options.secretRef, "test-secret");
}
