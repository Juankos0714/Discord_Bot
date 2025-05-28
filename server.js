require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Discord
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Función para detectar si debe enviar a Discord
function shouldSendToDiscord(inputText) {
    const discordKeywords = ['discord', 'enviar', 'mandar', 'send to discord', 'enviar a discord', 'mandar a discord'];
    const lowerText = inputText.toLowerCase();
    return discordKeywords.some(keyword => lowerText.includes(keyword));
}

// Función para crear resumen para Discord
function createDiscordSummary(responses, inputText, maxLength = 1900) {
    let summary = `📝 **Pregunta:** ${inputText.substring(0, 200)}${inputText.length > 200 ? '...' : ''}\n\n`;
    summary += "📊 **Comparación de Respuestas:**\n\n";
    
    const headerSpace = summary.length + 100;
    const availableSpace = maxLength - headerSpace;
    const spacePerResponse = Math.floor(availableSpace / 3) - 50;
    
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
async function sendToDiscord(content, inputText = null) {
    if (!client || !process.env.DISCORD_CHANNEL_ID) {
        console.log('⚠️ Discord no configurado');
        return { sent: false, message: 'Discord no configurado' };
    }

    try {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (!channel) {
            console.error('❌ Canal de Discord no encontrado');
            return { sent: false, message: 'Canal no encontrado' };
        }

        let messageToSend;
        
        if (typeof content === 'string') {
            // Mensaje directo
            messageToSend = content;
        } else {
            // Resumen de respuestas de IA
            messageToSend = createDiscordSummary(content, inputText);
        }
        
        // Verificar longitud
        if (messageToSend.length > 2000) {
            console.warn(`⚠️ Mensaje muy largo: ${messageToSend.length} caracteres, truncando...`);
            if (typeof content === 'string') {
                messageToSend = messageToSend.substring(0, 1950) + '...\n*[Mensaje truncado]*';
            } else {
                messageToSend = `📝 **Pregunta:** ${inputText.substring(0, 100)}...\n\n` +
                              `🤖 Respuestas generadas por Gemini, Cohere y Mistral.\n` +
                              `💻 Ver detalles completos en la interfaz web.`;
            }
        }
        
        await channel.send(messageToSend);
        console.log('✅ Mensaje enviado a Discord exitosamente');
        return { sent: true, message: 'Mensaje enviado exitosamente a Discord' };
        
    } catch (error) {
        console.error('❌ Error enviando a Discord:', error.message);
        return { sent: false, message: `Error: ${error.message}` };
    }
}

// Endpoint principal para consultas a las IAs
app.post('/api/query', async (req, res) => {
    const { inputText } = req.body;
    
    if (!inputText || !inputText.trim()) {
        return res.status(400).json({ error: 'Por favor, proporciona un texto válido.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const cohereApiKey = process.env.COHERE_API_KEY;
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (!geminiApiKey || !cohereApiKey || !mistralApiKey) {
        return res.status(500).json({ error: 'Faltan claves API necesarias. Verifica tu archivo .env' });
    }

    try {
        console.log(`🤖 Procesando consulta: "${inputText.substring(0, 50)}..."`);
        
        // Ejecutar consultas a las IAs en paralelo
        const [geminiResponse, cohereResponse, mistralResponse] = await Promise.all([
            fetchGeminiResponse(inputText, geminiApiKey),
            fetchCohereResponse(inputText, cohereApiKey),
            fetchMistralResponse(inputText, mistralApiKey)
        ]);
        
        const responseData = {
            gemini: geminiResponse,
            cohere: cohereResponse,
            mistral: mistralResponse
        };
        
        // Verificar si debe enviar a Discord
        let discordStatus = null;
        if (shouldSendToDiscord(inputText)) {
            console.log('📤 Enviando a Discord...');
            discordStatus = await sendToDiscord(responseData, inputText);
        }
        
        // Incluir estado de Discord en la respuesta
        if (discordStatus) {
            responseData.discord = discordStatus;
        }
        
        res.json(responseData);
        
    } catch (error) {
        console.error("❌ Error en las solicitudes:", error);
        res.status(500).json({ error: 'Error al conectar con las APIs' });
    }
});

// Endpoint específico para Discord
app.post('/api/discord', async (req, res) => {
    const { message } = req.body;
    
    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Por favor, proporciona un mensaje válido.' });
    }

    try {
        console.log(`📤 Enviando mensaje directo a Discord: "${message.substring(0, 50)}..."`);
        const result = await sendToDiscord(message);
        res.json({ success: result.sent, message: result.message });
    } catch (error) {
        console.error('❌ Error en endpoint de Discord:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// Funciones para las APIs de IA
async function fetchGeminiResponse(inputText, apiKey) {
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const requestBody = {
        contents: [{
            parts: [{ text: inputText }]
        }]
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
                success: false,
                error: `Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`
            };
        }

        const data = await response.json();

        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return {
                success: true,
                text: data.candidates[0].content.parts[0].text
            };
        } else if (data.promptFeedback?.blockReason) {
            return {
                success: false,
                error: `Solicitud bloqueada: ${data.promptFeedback.blockReason}`
            };
        } else {
            return {
                success: false,
                error: "Respuesta inesperada de la API"
            };
        }
    } catch (error) {
        console.error("Error Gemini:", error.message);
        return {
            success: false,
            error: "Error de conexión con Gemini"
        };
    }
}

async function fetchCohereResponse(inputText, apiKey) {
    const API_URL = "https://api.cohere.ai/v1/generate";

    const requestBody = {
        model: "command",
        prompt: inputText,
        max_tokens: 300,
        temperature: 0.7
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
            const errorData = await response.json().catch(() => ({}));
            return {
                success: false,
                error: `Error ${response.status}: ${errorData.message || 'Error desconocido'}`
            };
        }

        const data = await response.json();

        if (data.generations?.[0]?.text) {
            return {
                success: true,
                text: data.generations[0].text.trim()
            };
        } else {
            return {
                success: false,
                error: "Respuesta inesperada de la API"
            };
        }
    } catch (error) {
        console.error("Error Cohere:", error.message);
        return {
            success: false,
            error: "Error de conexión con Cohere"
        };
    }
}

async function fetchMistralResponse(inputText, apiKey) {
    const API_URL = "https://api.mistral.ai/v1/chat/completions";

    const requestBody = {
        model: "mistral-small-latest",
        messages: [{
            role: "user",
            content: inputText
        }],
        max_tokens: 300,
        temperature: 0.7
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
            const errorData = await response.json().catch(() => ({}));
            return {
                success: false,
                error: `Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`
            };
        }

        const data = await response.json();

        if (data.choices?.[0]?.message?.content) {
            return {
                success: true,
                text: data.choices[0].message.content
            };
        } else {
            return {
                success: false,
                error: "Respuesta inesperada de la API"
            };
        }
    } catch (error) {
        console.error("Error Mistral:", error.message);
        return {
            success: false,
            error: "Error de conexión con Mistral"
        };
    }
}

// Manejo de errores
app.use((err, req, res, next) => {
    console.error('Error del servidor:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`📁 Sirviendo archivos desde: ${__dirname}`);
    
    // Verificar configuración
    const requiredEnvVars = ['GEMINI_API_KEY', 'COHERE_API_KEY', 'MISTRAL_API_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.warn(`⚠️ Variables de entorno faltantes: ${missingVars.join(', ')}`);
    }
    
    if (process.env.DISCORD_TOKEN && process.env.DISCORD_CHANNEL_ID) {
        console.log('✅ Discord configurado correctamente');
    } else {
        console.log('⚠️ Discord no configurado (opcional)');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});
