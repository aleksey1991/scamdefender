import { Result, Env, AnalysisResult } from './types';

/**
 * Gemini API response structure
 */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Parsed AI response structure
 */
interface ParsedAIResponse {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  redFlags: string[];
  verdict: string;
  score: number;
}

/**
 * Validates parsed AI response has required fields
 */
function isValidParsedResponse(data: unknown): data is ParsedAIResponse {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.riskLevel === 'string' &&
    ['low', 'medium', 'high', 'critical'].includes(obj.riskLevel) &&
    typeof obj.confidence === 'number' &&
    obj.confidence >= 0 &&
    obj.confidence <= 100 &&
    Array.isArray(obj.redFlags) &&
    obj.redFlags.every((flag: unknown) => typeof flag === 'string') &&
    typeof obj.verdict === 'string' &&
    typeof obj.score === 'number' &&
    obj.score >= 0 &&
    obj.score <= 100
  );
}

/**
 * Extracts JSON from AI response text
 * Handles cases where AI wraps JSON in markdown code blocks or extra text
 */
function extractJSON(text: string): unknown {
  // Try to find JSON wrapped in markdown code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Continue to other parsing methods
    }
  }

  // Try to find raw JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Continue to next method
    }
  }

  // Try to parse the entire response as JSON
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Analyzes a domain using Gemini AI
 *
 * @param env - Environment variables with GEMINI_API_KEY
 * @param domain - Domain name to analyze
 * @param signals - Signal data for the domain
 * @returns Promise<Result<AnalysisResult>> - Analysis result or error
 */
export async function analyzeWithAI(
  env: Env,
  domain: string,
  signals: object
): Promise<Result<AnalysisResult>> {
  try {
    // Construct detailed prompt
    const prompt = `Analyze this domain for scam/fraud risk:

Domain: ${domain}

Signals: ${JSON.stringify(signals, null, 2)}

Respond in valid JSON format with these exact fields:
- riskLevel: "low" | "medium" | "high" | "critical"
- confidence: number (0-100, your confidence in this assessment)
- redFlags: string[] (array of specific concerns or observations)
- verdict: string (2-3 sentence detailed explanation of the risk)
- score: number (0-100, higher = more risky)

Return ONLY the JSON object, no additional text or markdown formatting.`;

    // Create abort controller with 30 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      // Check for HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          success: false,
          error: `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      // Parse Gemini response
      const geminiData: unknown = await response.json();

      // Extract text from Gemini response
      const geminiResponse = geminiData as GeminiResponse;
      const responseText =
        geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        return {
          success: false,
          error: 'No text content in Gemini API response',
        };
      }

      // Extract and parse JSON from response
      const parsedJSON = extractJSON(responseText);

      if (!parsedJSON) {
        return {
          success: false,
          error: 'Failed to extract JSON from AI response',
        };
      }

      // Validate parsed response structure
      if (!isValidParsedResponse(parsedJSON)) {
        return {
          success: false,
          error: 'AI response missing required fields or invalid format',
        };
      }

      // Build and return analysis result
      const result: AnalysisResult = {
        domain,
        riskLevel: parsedJSON.riskLevel,
        confidence: parsedJSON.confidence,
        redFlags: parsedJSON.redFlags,
        verdict: parsedJSON.verdict,
        score: parsedJSON.score,
        cachedAt: Date.now(),
      };

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Gemini API request timeout (30 seconds exceeded)',
        };
      }

      // Handle network errors
      if (error instanceof Error) {
        return {
          success: false,
          error: `Failed to analyze domain: ${error.message}`,
        };
      }

      return {
        success: false,
        error: 'Unknown error occurred during analysis',
      };
    }
  } catch (error) {
    // Catch any unexpected errors during prompt construction or setup
    if (error instanceof Error) {
      return {
        success: false,
        error: `Analysis setup error: ${error.message}`,
      };
    }

    return {
      success: false,
      error: 'Unexpected error during analysis',
    };
  }
}
