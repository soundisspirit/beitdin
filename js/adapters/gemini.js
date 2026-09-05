/**
 * Google Gemini adapter
 */

// The stream is scraped with a regex rather than parsed, so the captured text is
// still JSON-escaped. Wrapping it in quotes and letting JSON.parse decode it
// handles every escape the spec defines, not just the three we thought of.
function unescapeJsonString(raw) {
  try {
    return JSON.parse('"' + raw + '"');
  } catch {
    // A chunk can split mid-escape; fall back to the raw text rather than lose it.
    return raw;
  }
}

export async function* call(slotConfig, systemPrompt, userPrompt, jsonSchema, signal) {
  const { baseUrl, apiKey, selectedModel } = slotConfig;
  
  if (!apiKey) {
    yield { type: 'error', code: 'AUTH_ERROR', message: 'Gemini requires an API key.' };
    return;
  }

  // Gemini REST streaming endpoint
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${selectedModel}:streamGenerateContent?key=${apiKey}`;

  // Gemini request body format
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ]
  };

  if (systemPrompt) {
    body.systemInstruction = {
      role: "user",
      parts: [{ text: systemPrompt }]
    };
  }

  if (jsonSchema) {
    body.generationConfig = {
      responseMimeType: "application/json"
    };
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      yield { type: 'error', code: 'ABORTED', message: 'Request aborted by the user.' };
      return;
    }
    yield { type: 'error', code: 'NETWORK', message: `Network error: ${error.message}` };
    return;
  }

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.error?.message || errorMsg;
    } catch (e) {}
    
    if (response.status === 400 && errorMsg.includes("API key not valid")) {
      yield { type: 'error', code: 'AUTH_ERROR', message: 'Invalid Gemini API key.' };
    } else {
      yield { type: 'error', code: 'SERVER_ERROR', message: `HTTP ${response.status}: ${errorMsg}` };
    }
    return;
  }

  // Gemini returns a JSON array (an array of objects rather than Server-Sent Events), though the stream is often chunked JSON.
  // Gemini's streamGenerateContent actually returns an array of chunks like:
  // [
  //   { "candidates": [ { "content": { "parts": [ { "text": "..." } ] } } ] },
  //   ...
  // ]
  // But sent incrementally. We need to parse valid JSON out of the growing buffer.
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  const startTime = performance.now();
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Gemini streams JSON array progressively. This is a naive parser for the stream format.
      // Easiest robust way for this without a complex tokenizer is to look for "text": "..." 
      // or try to parse objects within the array.
      // Since Gemini sends valid JSON objects separated by commas, we can try matching `{...}` blocks.
      // For simplicity in this implementation, we will use a regex to extract text blocks.
      const textMatches = [...buffer.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
      
      if (textMatches.length > 0) {
        // Find texts we haven't yielded yet.
        // This is a hacky but functional approach for Gemini's specific stream format
        // where we reconstruct the full string and yield the difference.
        
        let newFullText = "";
        for (const match of textMatches) {
           // Let JSON do the unescaping. The previous hand-rolled chain ran \n
           // before \\, so an escaped backslash followed by n turned into a
           // backslash plus a real newline, and \t, \r and \uXXXX were never
           // decoded at all.
           newFullText += unescapeJsonString(match[1]);
        }
        
        if (newFullText.length > fullText.length) {
          const delta = newFullText.substring(fullText.length);
          fullText = newFullText;
          yield { type: 'delta', text: delta };
        }
      }
    }
    
    // Dig usageMetadata out of the whole buffer: Gemini attaches it to the last chunk
    try {
      // Clean up the JSON array syntax to parse it fully
      const completeJson = JSON.parse(buffer.trim().replace(/^,\s*/, ''));
      const lastItem = Array.isArray(completeJson) ? completeJson[completeJson.length - 1] : completeJson;
      if (lastItem && lastItem.usageMetadata) {
        tokensIn = lastItem.usageMetadata.promptTokenCount || 0;
        tokensOut = lastItem.usageMetadata.candidatesTokenCount || 0;
      }
    } catch(e) {}

    const latencyMs = Math.round(performance.now() - startTime);
    yield { 
      type: 'done', 
      text: fullText, 
      tokensIn, 
      tokensOut, 
      model: selectedModel,
      latencyMs 
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      yield { type: 'error', code: 'ABORTED', message: 'request aborted by user.' };
    } else {
      yield { type: 'error', code: 'STREAM_ERROR', message: `error reading stream: ${error.message}` };
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Model discovery
 */
export async function getModels(baseUrl, apiKey) {
  if (!apiKey) throw new Error("Gemini requires an API key.");
  
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models?key=${apiKey}`;
  
  const response = await fetch(endpoint);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.models || !Array.isArray(data.models)) {
    throw new Error('Response did not contain the expected models array.');
  }
  
  // Gemini returns ids like "models/gemini-1.5-pro"; strip the prefix
  return data.models
    .filter(m => m.supportedGenerationMethods.includes("generateContent"))
    .map(model => model.name.replace('models/', ''));
}
