import { GoogleGenAI } from '@google/genai'
import type { Tool, GenerateContentConfig } from '@google/genai'

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter((k): k is string => !!k)

// 수혜주 분석: 품질 우선 (2.5-flash → 2.0-flash-lite 폴백)
export const MODELS_ANALYSIS = ['gemini-2.5-flash']

// 일반 Q&A / 종목명 추출
export const MODELS_LITE = ['gemini-2.5-flash']

/** Google Search Grounding 도구 */
export const googleSearchTool: Tool = { googleSearch: {} }

/**
 * Key Rotation을 지원하는 Gemini generateContent 호출.
 * models 파라미터로 사용할 모델 우선순위를 지정 (기본: MODELS_LITE).
 */
export async function geminiGenerateWithRotation(
  prompt: string,
  tools?: Tool[],
  systemInstruction?: string,
  models: string[] = MODELS_LITE
): Promise<{ text: string; keyIndex: number }> {
  let lastError: unknown

  for (const model of models) {
    for (let i = 0; i < API_KEYS.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEYS[i] })
        const config: GenerateContentConfig = {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(tools ? { tools } : {}),
        }

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        })

        const text = response.text ?? ''
        return { text, keyIndex: i }
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status
        if (status === 429 || status === 400) {
          lastError = err
          continue
        }
        throw err
      }
    }
  }

  throw lastError
}

/**
 * 멀티파트 contents(PDF inline data 등)를 받는 Key Rotation generateContent.
 */
export async function geminiGenerateWithContentsRotation(
  contents: object[],
  systemInstruction?: string,
  models: string[] = MODELS_ANALYSIS
): Promise<{ text: string; keyIndex: number }> {
  let lastError: unknown

  for (const model of models) {
    for (let i = 0; i < API_KEYS.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEYS[i] })
        const config: GenerateContentConfig = {
          ...(systemInstruction ? { systemInstruction } : {}),
        }

        const response = await ai.models.generateContent({
          model,
          contents: contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
          config,
        })

        const text = response.text ?? ''
        return { text, keyIndex: i }
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status
        if (status === 429 || status === 400) {
          lastError = err
          continue
        }
        throw err
      }
    }
  }

  throw lastError
}

/**
 * 스트리밍 + Key Rotation.
 * models 파라미터로 사용할 모델 우선순위를 지정 (기본: MODELS_LITE).
 */
export async function geminiStreamWithRotation(
  prompt: string,
  tools?: Tool[],
  systemInstruction?: string,
  models: string[] = MODELS_LITE
): Promise<ReadableStream<string>> {
  let lastError: unknown

  for (const model of models) {
    for (let i = 0; i < API_KEYS.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEYS[i] })
        const config: GenerateContentConfig = {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(tools ? { tools } : {}),
        }

        const streamResult = await ai.models.generateContentStream({
          model,
          contents: prompt,
          config,
        })

        return new ReadableStream<string>({
          async start(controller) {
            for await (const chunk of streamResult) {
              const text = chunk.text ?? ''
              if (text) controller.enqueue(text)
            }
            controller.close()
          },
        })
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status
        if (status === 429 || status === 400) {
          lastError = err
          continue
        }
        throw err
      }
    }
  }

  throw lastError
}
