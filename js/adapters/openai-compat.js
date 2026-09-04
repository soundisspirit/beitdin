/**
 * OpenAI-yhteensopiva adapteri
 * Kattaa: OpenAI, Mistral, Groq, Together, OpenRouter, lokaalit (Ollama, LM Studio)
 */

export async function* call(slotConfig, systemPrompt, userPrompt, jsonSchema, signal) {
  const { baseUrl, apiKey, selectedModel } = slotConfig;
  
  // Varmistetaan /chat/completions suffix
  const endpoint = baseUrl.endsWith('/chat/completions') 
    ? baseUrl 
    : baseUrl.replace(/\/$/, '') + '/chat/completions';

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = {
    model: selectedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true,
    // Pakotetaan JSON jos schema on annettu (ja palvelin tukee)
    ...(jsonSchema ? { response_format: { type: "json_object" } } : {})
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      yield { type: 'error', code: 'ABORTED', message: 'request aborted by user.' };
      return;
    }
    yield { type: 'error', code: 'NETWORK', message: `network or cors error: ${error.message}` };
    return;
  }

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.error?.message || errorMsg;
    } catch (e) {
      // Ignore JSON parse error if response is not JSON
    }
    
    if (response.status === 401 || response.status === 403) {
      yield { type: 'error', code: 'AUTH_ERROR', message: `authentication error (${response.status}): ${errorMsg}` };
    } else if (response.status === 429) {
      yield { type: 'error', code: 'RATE_LIMIT', message: `Rate limit (429): ${errorMsg}` };
    } else {
      yield { type: 'error', code: 'SERVER_ERROR', message: `HTTP ${response.status}: ${errorMsg}` };
    }
    return;
  }

  // Read stream MDN style
  // Lähde: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#reading_the_stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  
  let fullText = "";
  const startTime = performance.now();
  let tokensIn = 0; // Jos provider lähettää nämä streamissa
  let tokensOut = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // Parsitaan SSE-chunkit: "data: {...}\n\n"
      let chunkEnd = buffer.indexOf('\n\n');
      while (chunkEnd !== -1) {
        const chunk = buffer.substring(0, chunkEnd).trim();
        buffer = buffer.substring(chunkEnd + 2);
        
        if (chunk.startsWith('data: ')) {
          const dataStr = chunk.substring(6);
          if (dataStr === '[DONE]') {
            // Striimi päättyi OpenAI-standardin mukaisesti
            break;
          }
          
          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              yield { type: 'delta', text: content };
            }
            
            // Joillain providereilla on usage-tieto striimin lopussa
            if (parsed.usage) {
              tokensIn = parsed.usage.prompt_tokens || 0;
              tokensOut = parsed.usage.completion_tokens || 0;
            }
          } catch (e) {
            console.warn("Invalid JSON in SSE chunk:", dataStr);
          }
        }
        chunkEnd = buffer.indexOf('\n\n');
      }
    }
    
    // Viimeinen decode ilman stream-lippua
    buffer += decoder.decode();
    // (Jätetään puskuriin mahdollisesti jäänyt vajaa rivi huomioimatta tässä yksinkertaistetussa versiossa)
    
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
 * Model discovery funktio
 */
export async function getModels(baseUrl, apiKey) {
  const endpoint = baseUrl.replace(/\/chat\/completions$/, '').replace(/\/$/, '') + '/models';
  
  const headers = {
    'Accept': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, { headers });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Vastaus ei sisältänyt odotettua data-taulukkoa.');
  }
  
  return data.data.map(model => model.id);
}
