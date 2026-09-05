/**
 * OpenAI-compatible adapter
 * Covers: OpenAI, Mistral, Groq, Together, OpenRouter, and local servers (Ollama, LM Studio)
 */

export async function* call(slotConfig, systemPrompt, userPrompt, jsonSchema, signal) {
  const { baseUrl, apiKey, selectedModel } = slotConfig;
  
  // Make sure the /chat/completions suffix is present
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
    // Force JSON when a schema is given, if the server supports it
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
  // Source: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#reading_the_stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  
  let fullText = "";
  const startTime = performance.now();
  let tokensIn = 0; // Populated only if the provider sends usage in the stream
  let tokensOut = 0;

  try {
    // Labelled so [DONE] can leave the read loop as well. Breaking only out of
    // the chunk loop sent control back to reader.read(), where a server that
    // keeps the connection open after [DONE] left the lane running forever.
    readLoop:
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // Parse SSE chunks of the form "data: {...}\n\n"
      let chunkEnd = buffer.indexOf('\n\n');
      while (chunkEnd !== -1) {
        const chunk = buffer.substring(0, chunkEnd).trim();
        buffer = buffer.substring(chunkEnd + 2);
        
        if (chunk.startsWith('data: ')) {
          const dataStr = chunk.substring(6);
          if (dataStr === '[DONE]') {
            // Stream finished per the OpenAI convention
            break readLoop;
          }
          
          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              yield { type: 'delta', text: content };
            }
            
            // Some providers put usage data at the end of the stream
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
    
    // Final decode without the stream flag
    buffer += decoder.decode();
    // Any trailing partial line left in the buffer is intentionally ignored
    
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
    throw new Error('Response did not contain the expected data array.');
  }
  
  return data.data.map(model => model.id);
}
