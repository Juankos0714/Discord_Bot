require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Discord (si tienes discord.js instalado)
let client = null;
if (process.env.DISCORD_TOKEN) {
    try {
        const { Client, GatewayIntentBits } = require('discord.js');
        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        client.login(process.env.DISCORD_TOKEN)
            .then(() => console.log('✅ Bot de Discord conectado exitosamente'))
            .catch(err => console.error('❌ Error conectando Discord:', err.message));
    } catch (error) {
        console.log('⚠️ Discord.js no encontrado o error en configuración:', error.message);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Función para crear resumen corto para Discord
function createDiscordSummary(responses, inputText, maxLength = 1900) {
    let summary = `📝 **Pregunta:** ${inputText.substring(0, 200)}${inputText.length > 200 ? '...' : ''}\n\n`;
    summary += "📊 **Comparación de Respuestas:**\n\n";
    
    // Calcular espacio disponible
    const headerSpace = summary.length + 100; // Buffer
    const availableSpace = maxLength - headerSpace;
    const spacePerResponse = Math.floor(availableSpace / 3) - 50; // Margen de seguridad
    
    if (responses.gemini?.success) {
        const truncated = responses.gemini.text.length > spacePerResponse ? 
            responses.gemini.text.substring(0, spacePerResponse) + '...' : 
            responses.gemini.text;
        summary += `🔷 **Gemini:**\n${truncated}\n\n`;
    } else if (responses.gemini?.error) {
        summary += `🔷 **Gemini:** ❌ Error\n\n`;
    }
    
    if (responses.cohere?.success) {
        const truncated = responses.cohere.text.length > spacePerResponse ? 
            responses.cohere.text.substring(0, spacePerResponse) + '...' : 
            responses.cohere.text;
        summary += `🟠 **Cohere:**\n${truncated}\n\n`;
    } else if (responses.cohere?.error) {
        summary += `🟠 **Cohere:** ❌ Error\n\n`;
    }
    
    if (responses.mistral?.success) {
        const truncated = responses.mistral.text.length > spacePerResponse ? 
            responses.mistral.text.substring(0, spacePerResponse) + '...' : 
            responses.mistral.text;
        summary += `🟣 **Mistral:**\n${truncated}\n\n`;
    } else if (responses.mistral?.error) {
        summary += `🟣 **Mistral:** ❌ Error\n\n`;
    }
    
    if (summary.length > maxLength - 100) {
        summary += "*Respuestas truncadas para Discord.*";
    }
    
    return summary;
}

// Función para enviar a Discord
async function sendToDiscord(responses, inputText) {
    if (!client || !process.env.DISCORD_CHANNEL_ID) {
        console.log('⚠️ Discord no configurado, saltando envío');
        return;
    }

    try {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (!channel) {
            console.error('❌ Canal de Discord no encontrado');
            return;
        }

        const summary = createDiscordSummary(responses, inputText);
        
        // Verificar longitud final antes de enviar
        if (summary.length > 2000) {
            console.warn(`⚠️ Mensaje aún muy largo: ${summary.length} caracteres`);
            // Enviar versión ultra-corta como respaldo
            const shortSummary = `📝 **Pregunta:** ${inputText.substring(0, 100)}...\n\n` +
                                `🤖 Respuestas generadas por Gemini, Cohere y Mistral.\n` +
                                `💻 Ver detalles completos en la interfaz web.`;
            await channel.send(shortSummary);
        } else {
            await channel.send(summary);
        }
        
        console.log('✅ Mensaje enviado a Discord exitosamente');
        
    } catch (error) {
        console.error('❌ Error enviando a Discord:', error.message);
    }
}

// Endpoint para obtener las respuestas de las IAs
app.post('/api/query', async (req, res) => {
    const { inputText } = req.body;
    
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const cohereApiKey = process.env.COHERE_API_KEY;
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!inputText || !inputText.trim()) {
        return res.status(400).json({ error: 'Por favor, proporciona un texto válido.' });
    }

    if (!geminiApiKey || !cohereApiKey || !mistralApiKey) {
        return res.status(500).json({ error: 'Faltan claves API necesarias. Verifica tu archivo .env' });
    }

    try {
        const geminiPromise = fetchGeminiResponse(inputText, geminiApiKey);
        const coherePromise = fetchCohereResponse(inputText, cohereApiKey);
        const mistralPromise = fetchMistralResponse(inputText, mistralApiKey);
        
        const [geminiResponse, cohereResponse, mistralResponse] = await Promise.all([
            geminiPromise, 
            coherePromise, 
            mistralPromise
        ]);
        
        const responseData = {
            gemini: geminiResponse,
            cohere: cohereResponse,
            mistral: mistralResponse
        };
        
        // Enviar a Discord (no bloquear la respuesta HTTP)
        sendToDiscord(responseData, inputText).catch(err => {
            console.error('Error en envío a Discord:', err);
        });
        
        res.json(responseData);
    } catch (error) {
        console.error("Error en las solicitudes:", error);
        res.status(500).json({ error: 'Error al conectar con las APIs' });
    }
});

async function fetchGeminiResponse(inputText, apiKey) {
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const requestBody = {
        "contents": [
            {
                "parts": [
                    {
                        "text": inputText
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error en la API de Gemini:", errorData);
            return {
                success: false,
                error: `Error: ${response.status} - ${errorData.error?.message || 'Error desconocido'}`
            };
        }

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            return {
                success: true,
                text: data.candidates[0].content.parts[0].text
            };
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
            return {
                success: false,
                error: `Solicitud bloqueada: ${data.promptFeedback.blockReason}. Razón: ${data.promptFeedback.blockReasonMessage || 'No se proporcionó un mensaje específico.'}`
            };
        } else {
            console.log("Respuesta completa de la API Gemini:", data);
            return {
                success: false,
                error: "No se recibió contenido en la respuesta o la estructura es inesperada."
            };
        }
    } catch (error) {
        console.error("Error en la solicitud a Gemini:", error);
        return {
            success: false,
            error: "Error al conectar con la API de Gemini."
        };
    }
}

async function fetchCohereResponse(inputText, apiKey) {
    const API_URL = "https://api.cohere.ai/v1/generate";

    const requestBody = {
        "model": "command",
        "prompt": inputText,
        "max_tokens": 300,
        "temperature": 0.7,
        "k": 0,
        "stop_sequences": [],
        "return_likelihoods": "NONE"
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error en la API de Cohere:", errorData);
            return {
                success: false,
                error: `Error: ${response.status} - ${errorData.message || 'Error desconocido'}`
            };
        }

        const data = await response.json();

        if (data.generations && data.generations.length > 0 && data.generations[0].text) {
            return {
                success: true,
                text: data.generations[0].text.trim()
            };
        } else {
            console.log("Respuesta completa de la API Cohere:", data);
            return {
                success: false,
                error: "No se recibió contenido en la respuesta o la estructura es inesperada."
            };
        }
    } catch (error) {
        console.error("Error en la solicitud a Cohere:", error);
        return {
            success: false,
            error: "Error al conectar con la API de Cohere."
        };
    }
}

async function fetchMistralResponse(inputText, apiKey) {
    const API_URL = "https://api.mistral.ai/v1/chat/completions";

    const requestBody = {
        "model": "mistral-small-latest",
        "messages": [
            {
                "role": "user",
                "content": inputText
            }
        ],
        "max_tokens": 300,
        "temperature": 0.7
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error en la API de Mistral:", errorData);
            return {
                success: false,
                error: `Error: ${response.status} - ${errorData.error?.message || 'Error desconocido'}`
            };
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            return {
                success: true,
                text: data.choices[0].message.content
            };
        } else {
            console.log("Respuesta completa de la API Mistral:", data);
            return {
                success: false,
                error: "No se recibió contenido en la respuesta o la estructura es inesperada."
            };
        }
    } catch (error) {
        console.error("Error en la solicitud a Mistral:", error);
        return {
            success: false,
            error: "Error al conectar con la API de Mistral."
        };
    }
}

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});