// src/lib/ai.ts
// Обращение к моделям через подписку opencode.ai zen.
//
// Ключ кладётся в OPENCODE_ZEN_API_KEY. Если его нет, вызывающий код
// должен уметь работать без AI — у разбора заказов для этого есть слой
// регулярок.

export type AITask = "parse_order";

// Подписка Go живёт на отдельном пути: zen/go/v1, а не zen/v1.
// Старый адрес с ключом Go отвечает 401 CreditsError.
const API_URL = "https://opencode.ai/zen/go/v1/chat/completions";

// Разбор заявки — короткая задача со строгим форматом ответа.
// Дорогие модели тут не нужны, а reasoning-модели вредны: они тратят
// бюджет токенов на размышления и возвращают пустой content.
const MODELS = ["deepseek-v4-flash", "glm-5.2", "kimi-k2.7-code"];

const TIMEOUT_MS = 45_000;

// Билдер подставляет эту строку вместо переменной, которой нет
// в настройках проекта. Проверка на пустоту не сработает — строка
// непустая, поэтому сверяем явно.
const ENV_STUB = "auto-generated-stub-for-build";

export function hasAIKey(): boolean {
  const raw = process.env.OPENCODE_ZEN_API_KEY ?? "";
  return !!raw && raw !== ENV_STUB;
}

export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const key = process.env.OPENCODE_ZEN_API_KEY ?? "";
  if (!key || key === ENV_STUB) {
    throw new Error("OPENCODE_ZEN_API_KEY не задан в настройках проекта");
  }

  let lastError: Error | null = null;

  for (const model of MODELS) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        signal: ctrl.signal,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 1200,
        }),
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`${model}: не-JSON ответ (${text.slice(0, 160)})`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;

      if (!res.ok) {
        const msg = d?.error?.message || d?.error || `HTTP ${res.status}`;
        const flat = typeof msg === "string" ? msg : JSON.stringify(msg);
        // Кончились кредиты — перебор моделей ничего не изменит
        if (/insufficient balance|credits/i.test(flat)) {
          throw Object.assign(new Error(`${model}: ${flat}`), { fatal: true });
        }
        throw new Error(`${model}: ${flat}`);
      }

      const choice = d?.choices?.[0];
      const content: string = (choice?.message?.content ?? "").trim();

      if (!content) {
        // reasoning_content — это размышления модели, а не результат.
        // Подставлять их вместо ответа нельзя.
        const hadReasoning = !!choice?.message?.reasoning_content;
        throw new Error(
          `${model}: пустой content` + (hadReasoning ? " (ушла в reasoning)" : "")
        );
      }

      console.log(`[AI] parse_order ← ${model} за ${Date.now() - started}мс`);
      return content;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const why = e?.name === "AbortError" ? `таймаут ${TIMEOUT_MS / 1000}с` : e?.message;
      console.warn(`[AI] ${model} не сработала (${why})`);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (e?.fatal) throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Ни одна модель не ответила");
}
