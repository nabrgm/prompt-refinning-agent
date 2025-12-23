import { OverridableNode } from '@/types/polaris';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    id: string;
    traceData?: any; // For agentReasoning
}

export interface ChatResponse {
    text: string;
    question: string;
    chatId: string;
    chatMessageId: string;
    sessionId: string;
    memoryType: string;
    agentReasoning?: any[];
}

// Send chat request to a specific agent's API URL
export async function sendChatRequest(
    apiUrl: string,
    message: string,
    chatId?: string,
    overrideConfig?: any
): Promise<ChatResponse> {

    const payload: any = {
        question: message,
    };

    if (chatId) {
        payload.chatId = chatId;
    }

    if (overrideConfig) {
        payload.overrideConfig = overrideConfig;
    }

    console.log('=== POLARIS API REQUEST ===');
    console.log('API URL:', apiUrl);
    console.log('Payload structure:', {
        question: payload.question?.substring(0, 50) + '...',
        chatId: payload.chatId,
        hasOverrideConfig: !!payload.overrideConfig,
        overrideConfigKeys: payload.overrideConfig ? Object.keys(payload.overrideConfig) : [],
        systemMessagePromptNodes: payload.overrideConfig?.systemMessagePrompt ? Object.keys(payload.overrideConfig.systemMessagePrompt) : []
    });
    console.log('Full payload:', JSON.stringify(payload, null, 2).substring(0, 2000));

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            // Try to get error details from response body
            let errorDetails = '';
            try {
                const errorBody = await response.text();
                errorDetails = errorBody;
                console.error('API Error Response Body:', errorBody);
            } catch (e) {
                // Ignore if we can't read the body
            }
            throw new Error(`API request failed with status ${response.status}: ${errorDetails}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Chat API Error:', error);
        throw error;
    }
}

// Validate a Polaris API URL format
export function validatePolarisUrl(url: string): { valid: boolean; error?: string } {
    try {
        const parsed = new URL(url);

        // Check for valid Polaris domains
        const validDomains = ['polaris.invoca.net', 'polaris.invocadev.com'];
        if (!validDomains.some(domain => parsed.hostname === domain)) {
            return {
                valid: false,
                error: `Invalid domain. Expected one of: ${validDomains.join(', ')}`
            };
        }

        // Check for prediction path
        if (!parsed.pathname.includes('/api/v1/prediction/')) {
            return {
                valid: false,
                error: 'URL must include /api/v1/prediction/ path'
            };
        }

        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format' };
    }
}

// Extract UUID from a Polaris URL
export function extractUuidFromUrl(url: string): string | null {
    const match = url.match(/\/prediction\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
}
