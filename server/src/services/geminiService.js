import fs from 'fs';
import path from 'path';

/**
 * Predefined scenarios for offline / hackathon demo mode.
 * Guarantees zero friction if no Gemini API key is provided,
 * while accurately simulating real multimodal vision response.
 */
export const DEMO_PRESETS = {
  pothole: {
    issueType: 'pothole',
    categoryLabel: 'Pothole / Road Damage',
    suggestedDepartmentId: 'DEMO-ROADS',
    confidence: 0.94,
    severity: 'high',
    safetyScore: 82,
    description: 'Severe surface depression and fractured asphalt layer with visible loose aggregate and aggregate detachment. High hazard for two-wheelers and night commuters.',
    observations: [
      'Depression depth estimated > 65mm with jagged edges',
      'Directly on main vehicular lane',
      'Rainwater ponding risk in depression'
    ],
    recommendedAction: 'Immediate cold/hot bitumen patching and barricade placement within 24h.'
  },
  garbage: {
    issueType: 'garbage',
    categoryLabel: 'Solid Waste & Garbage Accumulation',
    suggestedDepartmentId: 'DEMO-SWM',
    confidence: 0.91,
    severity: 'medium',
    safetyScore: 68,
    description: 'Unmanaged solid waste accumulation overflowing beyond municipal dump boundary. High concentration of plastic packaging, domestic refuse, and sanitary risk.',
    observations: [
      'Overflow radius exceeds 4 meters',
      'Stray animal scavenging observed',
      'Obstruction of pedestrian footpath'
    ],
    recommendedAction: 'Dispatch mechanical tipper truck and sanitation spray team.'
  },
  broken_streetlight: {
    issueType: 'broken_streetlight',
    categoryLabel: 'Broken / Faulty Streetlight',
    suggestedDepartmentId: 'DEMO-LIGHT',
    confidence: 0.89,
    severity: 'medium',
    safetyScore: 64,
    description: 'Damaged luminaire housing with unlit 70W LED street lamp and potentially exposed wiring at the lower pole junction box.',
    observations: [
      'Total illumination failure creating dark street corridor',
      'Inspection flap unlatched with internal wires visible',
      'Structural pole intact without leaning'
    ],
    recommendedAction: 'Lineman inspection, luminaire module replacement, and junction seal.'
  },
  waterlogging: {
    issueType: 'waterlogging',
    categoryLabel: 'Waterlogging & Clogged Drainage',
    suggestedDepartmentId: 'DEMO-DRAIN',
    confidence: 0.93,
    severity: 'high',
    safetyScore: 88,
    description: 'Extensive standing stormwater accumulation across multiple road lanes due to blocked roadside catch-basins and curb inlets.',
    observations: [
      'Water depth approximately 12–18cm covering road crown',
      'Submerged road markings and pedestrian islands',
      'Slow-moving traffic bottleneck'
    ],
    recommendedAction: 'Deploy high-capacity dewatering suction pump and clear catch-basin grates.'
  }
};

/**
 * Analyzes an image either via live Gemini API or via labelled demo fallback.
 * @param {Object} params
 * @param {string} params.filePath - Path to uploaded image file
 * @param {string} [params.mimeType] - MIME type of the image
 * @param {string} [params.hintScenario] - Optional preset scenario selected by user
 * @param {string} [params.customApiKey] - Optional runtime API key supplied by user
 */
export async function analyzeIssueImage({ filePath, mimeType = 'image/jpeg', hintScenario, customApiKey }) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  // 1. If hint scenario is selected and no API key, use labelled demo preset
  if (!apiKey && hintScenario && DEMO_PRESETS[hintScenario]) {
    const preset = DEMO_PRESETS[hintScenario];
    return {
      ...preset,
      analysisMode: 'demo',
      demoReason: 'Hackathon Demo Mode: deterministic preset activated because GEMINI_API_KEY is not configured.',
      analyzedAt: new Date().toISOString()
    };
  }

  // 2. If API Key is available and file exists, attempt real Gemini Vision call
  if (apiKey && filePath && fs.existsSync(filePath)) {
    try {
      const base64Data = fs.readFileSync(filePath).toString('base64');
      const prompt = `You are CivicSathi AI, an expert municipal civil engineer analyzing citizen-reported civic infrastructure photos in Ahmedabad/Indian cities.
Analyze the provided image and return ONLY a valid JSON object (no markdown backticks, no markdown code block wrapper, just raw JSON) matching this structure:
{
  "issueType": "pothole" | "garbage" | "broken_streetlight" | "waterlogging" | "other_civic",
  "categoryLabel": "human friendly name of issue",
  "suggestedDepartmentId": "DEMO-ROADS" | "DEMO-SWM" | "DEMO-LIGHT" | "DEMO-DRAIN",
  "confidence": number between 0.0 and 1.0,
  "severity": "low" | "medium" | "high",
  "safetyScore": number between 10 and 100,
  "description": "clear factual 2-3 sentence civil inspection note",
  "observations": ["observation 1", "observation 2", "observation 3"],
  "recommendedAction": "recommended municipal action"
}
Map:
- potholes, broken pavement, asphalt cracks -> DEMO-ROADS
- uncollected garbage, open dumping, overflowing bins -> DEMO-SWM
- streetlights, dark roads, dangling electrical wires -> DEMO-LIGHT
- waterlogging, blocked gutters, sewage overflow -> DEMO-DRAIN`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('Gemini API call failed, falling back to labelled demo mode:', errText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const result = await response.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          ...parsed,
          analysisMode: 'live',
          modelUsed: 'gemini-1.5-flash',
          analyzedAt: new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn('Live Gemini analysis failed, using fallback:', err.message);
    }
  }

  // 3. Fallback: Intelligent heuristic or default scenario labelled as DEMO
  let fallbackKey = hintScenario || 'pothole';
  if (!DEMO_PRESETS[fallbackKey]) {
    fallbackKey = 'pothole';
  }
  const preset = DEMO_PRESETS[fallbackKey];

  return {
    ...preset,
    analysisMode: 'demo',
    demoReason: apiKey
      ? 'Live Gemini vision fallback triggered (using labelled demo analysis).'
      : 'Labelled Demo Mode: running offline with verified municipal mock presets.',
    analyzedAt: new Date().toISOString()
  };
}
